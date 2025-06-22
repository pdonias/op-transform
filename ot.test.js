const Client = require('./src/Client')
const Component = require('./src/Component')
const Document = require('./src/Document')
const Operation = require('./src/Operation')
const Server = require('./src/Server')
const { getMessageType, serialize, deserialize } = require('./src/_message')

const makeOp = (...components) => new Operation({ components })
const ret = n => new Component({ type: 'ret', value: n })
const ins = s => new Component({ type: 'ins', value: s.split('') })
const del = s => new Component({ type: 'del', value: s.split('') })

describe('document and operation', () => {
  let doc, doc2
  beforeEach(() => {
    doc = new Document({ content: 'abc'.split('') })
    doc2 = new Document({ content: 'abc'.split('') })
  })

  it('compresses an operation', () => {
    const op0 = makeOp()._compress()
    expect(op0.components.length).toBe(0)

    const op1 = makeOp(ret(1), ret(2), ret(1), ins('a'))._compress()
    expect(op1.components.length).toBe(2)
    expect(op1.get(0).value).toBe(4)

    const op2 = makeOp(ret(1), ins('a'))._compress()
    expect(op2.components.length).toBe(2)
  })

  it('applies an insert operation', () => {
    doc.applyOperation(makeOp(ret(1), ins('x'), ret(2)))
    expect(doc.text).toBe('axbc')
  })

  it('applies a delete operation', () => {
    doc.applyOperation(makeOp(ret(1), del('b'), ret(1)))
    expect(doc.text).toBe('ac')
  })

  it('throws on deleting the wrong elements', () => {
    const nonTextDoc = new Document({
      content: [{ letter: 'a' }, { letter: 'b' }, { letter: 'c' }],
    })

    // 1st operation works
    nonTextDoc.applyOperation(
      new Operation({
        components: [
          new Component({ type: 'ret', value: 1 }),
          new Component({ type: 'del', value: [{ letter: 'b' }] }),
          new Component({ type: 'ret', value: 1 }),
        ],
      }),
      (c1, c2) => c1.letter === c2.letter
    )
    expect(nonTextDoc.array).toEqual([{ letter: 'a' }, { letter: 'c' }])

    // 2nd operation throws
    expect(() => {
      nonTextDoc.applyOperation(
        // deleting d instead of c
        new Operation({
          components: [
            new Component({ type: 'ret', value: 1 }),
            new Component({ type: 'del', value: [{ letter: 'd' }] }),
          ],
        }),
        (c1, c2) => c1.letter === c2.letter
      )
    }).toThrow('Trying to delete unexpected elements.')
    expect(nonTextDoc.array).toEqual([{ letter: 'a' }, { letter: 'c' }])
  })

  it('throws if the operation is too short', () => {
    expect(() => doc.applyOperation(makeOp())).toThrow(
      'The operation is too short.'
    )
    expect(doc.text).toBe('abc')
    expect(() => doc.applyOperation(makeOp(ins('a')))).toThrow(
      'The operation is too short.'
    )
    expect(doc.text).toBe('abc')
  })

  it('throws if the operation is too long', () => {
    expect(() => doc.applyOperation(makeOp(ret(4)))).toThrow(
      'Trying to retain beyond the end of the document.'
    )
    expect(doc.text).toBe('abc')
    expect(() => doc.applyOperation(makeOp(ret(3), ins('x'), ret(1)))).toThrow(
      'Trying to retain beyond the end of the document.'
    )
    expect(doc.text).toBe('abc')
    expect(() => doc.applyOperation(makeOp(del('abcd')))).toThrow(
      'Trying to delete beyond the end of the document.'
    )
    expect(doc.text).toBe('abc')
  })

  it('applies multiple insert and delete operations', () => {
    doc.applyOperation(makeOp(ret(1), ins('xy'), del('bc'), ins('z')))
    expect(doc.text).toBe('axyz')
  })

  it('reverses an operation', () => {
    const op = makeOp(ret(1), ins('xy'), del('bc'))

    doc.applyOperation(op)
    expect(doc.text).toBe('axy')

    doc.applyOperation(op.reverse())
    expect(doc.text).toBe('abc')
  })

  it('splits a component', () => {
    let [comp1, comp2] = ret(3).split(0)
    expect(comp1).toBe(undefined)
    expect(comp2.type).toBe('ret')
    expect(comp2.length).toBe(3)
    ;[comp1, comp2] = ins('abc').split(1)
    expect(comp1.length).toBe(1)
    expect(comp2.length).toBe(2)
    expect(comp1.value).toEqual(['a'])
    expect(comp2.value).toEqual(['b', 'c'])
  })

  it('composes 2 trivial operations', () => {
    const op1 = makeOp()
    const op2 = makeOp()

    const op12 = op1.compose(op2)

    expect(op12.length).toBe(0)
  })

  it('composes 2 operations: insertion then deletion', () => {
    const op1 = makeOp(ret(1), ins('x'), ret(2)) // → axbc
    const op2 = makeOp(ret(1), del('xb'), ins('y'), ret(1)) // → ayc

    const op12 = op1.compose(op2)
    doc.applyOperation(op12)
    expect(doc.text).toBe('ayc')
  })

  it('composes 2 operations and the 2nd one can keep inserting at the end', () => {
    const op1 = makeOp(ins('xy'), ret(2), del('c')) // → xyab
    const op2 = makeOp(ret(4), ins('z')) // → xyabz

    const op12 = op1.compose(op2)
    doc.applyOperation(op12)
    expect(doc.text).toBe('xyabz')
  })

  it('transforms 2 trivial operations', () => {
    const op1 = makeOp()
    const op2 = makeOp()

    const [op1prime, op2prime] = op1.transform(op2)

    expect(op1prime.length).toBe(0)
    expect(op2prime.length).toBe(0)
  })

  it('transforms 2 operations and gives priority to first operation', () => {
    const op1 = makeOp(ret(1), ins('x'), ret(2)) // → axbc
    const op2 = makeOp(ret(1), ins('y'), ret(2)) // → aybc

    // op1 (strong one) should take the priority on the xy conflict and write first
    const [op1prime, op2prime] = op1.transform(op2)

    doc.applyOperation(op1)
    doc2.applyOperation(op2)
    doc.applyOperation(op2prime)
    doc2.applyOperation(op1prime)

    expect(doc.text).toBe(doc2.text)
    expect(doc.text).toBe('axybc')
  })

  it('transforms 2 operations and gives priority to operation that writes first', () => {
    const op1 = makeOp(ret(2), ins('xy'), ret(1)) // → abxyc
    const op2 = makeOp(ret(1), ins('12'), del('bc')) // → a12

    // op2 (weak one) should take the priority because it started to write earlier
    const [op1prime, op2prime] = op1.transform(op2)

    doc.applyOperation(op1)
    doc2.applyOperation(op2)
    doc.applyOperation(op2prime)
    doc2.applyOperation(op1prime)

    expect(doc.text).toBe(doc2.text)
    expect(doc.text).toBe('a12xy')
  })

  it('applies an operation on a position', () => {
    const op = makeOp(del('ab'), ins('x'), ret(2), ins('y'))
    expect(op.getNewPosition(0)).toBe(0)
    expect(makeOp().getNewPosition(0)).toBe(0)
    expect(op.getNewPosition(3)).toBe(2) // abc|d → xc|dy
    expect(op.getNewPosition(4)).toBe(3) // abcd| → xcd|y
    expect(() => op.getNewPosition(5)).toThrow()
  })

  it('serializes an operation', () => {
    let op = new Operation({ components: [], id: 'foo' })
    let { metadata, data } = op.serialize()
    expect(metadata).toBe('o-foo-undefined-undefined-')
    expect(data).toEqual([])

    op = new Operation({
      components: [ret(1), del('bc'), ins('x')],
      id: 'foo',
      author: 'bar',
      parent: 'baz',
    })
    ;({ metadata, data } = op.serialize())
    expect(metadata).toBe('o-foo-bar-baz-r1-d2-i1')
    expect(data).toEqual(['b', 'c', 'x'])
  })

  it('deserializes an operation', () => {
    let op = Operation.deserialize({ metadata: 'o-foo-undefined-null-', data: [] })
    expect(op.components.length).toBe(0)
    expect(op.id).toBe('foo')
    expect(op.parent).toBe(null)

    op = Operation.deserialize({
      metadata: 'o-foo-bar-baz-r1-d2-i1',
      data: ['b', 'c', 'x'],
    })
    expect(op.id).toBe('foo')
    expect(op.author).toBe('bar')
    expect(op.parent).toBe('baz')
    expect(op.components.length).toBe(3)
    expect(op.components[1].type).toBe('del')
    expect(op.components[1].value).toEqual(['b', 'c'])
  })
})

describe('server', () => {
  let server, client
  beforeEach(() => {
    server = new Server({ document: 'abc'.split('') })
    client = new Client({ onEvent: jest.fn(), onMessage: jest.fn() })
  })

  it('creates a server', () => {
    expect(server.document.join('')).toBe('abc')
  })

  it('adds a client and removes it', () => {
    const clientInterface = server.addClient({
      onMessage: message => client.message(message),
    })
    client.onMessage = message => clientInterface.message(message)
    client.reset()

    expect(server._clients.size).toBe(1)

    clientInterface.remove()
    expect(server._clients.size).toBe(0)
  })

  it('sends error message when invalid operation is applied', () => {
    const clientInterface = server.addClient({
      onMessage: message => client.message(message),
    })
    const op = makeOp(ret(4))
    op.id = 'opid'
    server._applyOperation(op, clientInterface)
    expect(client.onEvent).toHaveBeenCalledWith({
      type: 'error',
      code: 'CLIENT_OP_INVALID_ON_SERVER',
      reason: `could not apply operation opid on server`,
      status: 'detached',
    })
  })

  it('resets a client for initialization', () => {
    const ci = server.addClient({
      onMessage: jest.fn(message => {
        client.message(message)
      }),
    })
    client.onMessage = jest.fn(message => ci.message(message))
    client.onEvent = jest.fn()

    client.reset()

    expect(client.onMessage.mock.calls.length).toBe(1)
    expect(ci.onMessage.mock.calls.length).toBe(1)
    expect(client.onEvent.mock.calls.length).toBe(2) // info + reset
    expect(client.document.join('')).toBe('abc')
  })

  it('broadcasts an operation', () => {
    const emitterIf = server.addClient()
    const emitter = new Client({
      onEvent: jest.fn(),
      onMessage: message => emitterIf.message(message),
    })
    emitterIf.onMessage = message => emitter.message(message)
    emitter.reset()

    const clientIf = server.addClient({
      onMessage: message => client.message(message),
    })
    client.onMessage = message => clientIf.message(message)
    client.reset()

    emitter.operation(makeOp(ret(1), ins('x'), ret(2))) // axbc

    expect(client.document.join('')).toBe('axbc')
    expect(emitter.document.join('')).toBe('axbc')

    // Clients' histories start at 1, server's history starts at 0
    expect(client._history[1].author).toBe(emitter.id)
    expect(emitter._history[1].author).toBe(emitter.id)
    expect(server._history[0].author).toBe(emitter.id)
  })

  it('transforms concurrent operations', () => {
    const c1 = new Client({
      onEvent: jest.fn(),
      onMessage: message => ci1.message(message),
    })
    const c2 = new Client({
      onEvent: jest.fn(),
      onMessage: message => ci2.message(message),
    })
    const c3 = new Client({
      onEvent: jest.fn(),
      onMessage: message => ci3.message(message),
    })

    ci1 = server.addClient({ onMessage: message => c1.message(message) })
    ci2 = server.addClient({ onMessage: message => c2.message(message) })
    ci3 = server.addClient({ onMessage: message => c3.message(message) })

    c1.reset()
    c2.reset()
    c3.reset()

    const clientIf = server.addClient({
      onMessage: message => client.message(message),
    })
    client.onMessage = message => clientIf.message(message)
    client.reset()

    // Introduce a big latency: c2 and c3 can't receive messages any more
    ci2.onMessage = ci3.onMessage = jest.fn()

    c1.operation(makeOp(ret(1), ins('x'), ret(2))) // axbc
    c2.operation(makeOp(ret(1), ins('y'), ret(2))) // aybc
    expect(client.document.join('')).toBe('ayxbc')

    c3.operation(makeOp(del('ab'), ret(1))) // c
    expect(client.document.join('')).toBe('yxc')
  })
})

describe('client', () => {
  let server, client, clientInterface
  beforeEach(() => {
    server = new Server({ document: 'abc'.split('') })
    client = new Client({ onEvent: jest.fn() })
    clientInterface = server.addClient({
      onMessage: message => client.message(message),
    })
    client.onMessage = message => clientInterface.message(message)
  })

  it('reverts an operation', () => {
    client.reset()
    client.operation(makeOp(ret(2), ins('x'), ret(1))) // abxc
    expect(() => client.reverseOperation(2)).toThrow(
      'Operation #2 cannot be found'
    )
    expect(client.reverseOperation(1).components).toMatchObject([
      { type: 'ret', value: 2 },
      { type: 'del', value: ['x'] },
      { type: 'ret', value: 1 },
    ])
    client.onMessage = jest.fn() // force use of buffer
    // _history + _pending + _buffer = local history
    client.operation(makeOp(ret(1), del('b'), ret(2))) // axc
    expect(client.reverseOperation(1).components).toMatchObject([
      { type: 'ret', value: 1 },
      { type: 'ins', value: ['b'] },
      { type: 'ret', value: 2 },
    ])
    expect(client.reverseOperation(2).components).toMatchObject([
      { type: 'ret', value: 1 },
      { type: 'del', value: ['x'] },
      { type: 'ret', value: 1 },
    ])
  })

  it('cancels no-op buffers', () => {
    client.reset()
    client.onMessage = jest.fn() // force use of buffer
    client.operation(makeOp(ret(3), ins('x'))) // -> pending
    client.operation(makeOp(ret(4), ins('y'))) // -> buffer
    expect(client._buffer).not.toBe(null)
    client.operation(makeOp(ret(4), del('y'))) // -> cancels buffer
    expect(client._buffer).toBe(null)
  })

  it('saves the client ID', () => {
    client.reset()
    expect(typeof clientInterface.id).toBe('string')
    expect(clientInterface.id).not.toBe('')
    expect(client.id).toBe(clientInterface.id)
  })
})

describe('_message', () => {
  const doc = new Document({ content: 'abc'.split('') })
  const comps = [ret(1), del('ab')]
  const op = new Operation({
    id: 'opid',
    author: 'author',
    parent: 'parent',
    components: comps,
  })

  it('gets message type from metadata', () => {
    expect(getMessageType({ metadata: 'e-CODE-reason' })).toBe('error')
    expect(getMessageType({ metadata: 'o-r1-d2' })).toBe('operation')
    expect(getMessageType({ metadata: 's' })).toBe('start')
    expect(getMessageType({ metadata: 'r-clientid-headid' })).toBe('reset')
    expect(() => getMessageType({ metadata: 'x-xxx' })).toThrow(
      'Metadata malformed: x-xxx'
    )
  })

  it('serializes messages', () => {
    expect(
      serialize({ type: 'error', code: 'CODE', reason: 'reason' })
    ).toEqual({
      metadata: 'e-CODE-reason',
      data: [],
    })
    expect(serialize({ type: 'operation', operation: op })).toEqual({
      metadata: 'o-opid-author-parent-r1-d2',
      data: ['a', 'b'],
    })
    expect(serialize({ type: 'start' })).toEqual({ metadata: 's', data: [] })
    expect(
      serialize({
        type: 'reset',
        clientId: 'clientid',
        headId: 'headid',
        document: doc,
      })
    ).toEqual({
      metadata: 'r-clientid-headid',
      data: ['a', 'b', 'c'],
    })
    expect(() => serialize({ type: 'x' })).toThrow(
      'Cannot serialize message of type: x'
    )
  })

  it('deserializes messages', () => {
    expect(deserialize({ metadata: 'e-CODE-reason-with-hyphens' })).toEqual({
      type: 'error',
      code: 'CODE',
      reason: 'reason-with-hyphens',
    })
    expect(
      deserialize({ metadata: 'o-opid-author-parent-r1-d2', data: ['a', 'b'] })
    ).toEqual({ type: 'operation', operation: op })
    expect(deserialize({ metadata: 's' })).toEqual({ type: 'start' })
    expect(
      deserialize({ metadata: 'r-clientid-headid', data: ['a', 'b', 'c'] })
    ).toEqual({
      type: 'reset',
      clientId: 'clientid',
      headId: 'headid',
      document: doc,
    })
    expect(() => deserialize({ metadata: 'i-xxx' })).toThrow(
      'Cannot deserialize message of type: info'
    )
  })
})
