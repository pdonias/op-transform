const ClientInterface = require('./ClientInterface')
const Document = require('./Document')

module.exports = class Server {
  constructor({ document = [], onEvent, areEqual } = {}) {
    if (!Array.isArray(document)) {
      throw new Error('document must be an array. Got: ' + document)
    }

    this.onEvent = onEvent
    this.areEqual = areEqual
    this._document = new Document({ content: document }) // Document
    this._clients = new Set() // Set of ClientInterface
    this._history = [] // Array of Operations
  }

  get document() {
    return this._document.array
  }

  // ID of the most recent operation, or null
  get _head() {
    const { _history } = this
    return _history.length > 0 ? _history[_history.length - 1].id : null
  }

  addClient({ id, onMessage } = {}) {
    return new ClientInterface({ id, server: this, onMessage })
  }

  removeClient(client) {
    this._clients.delete(client)
  }

  // Client -> Server
  // Handle operation from client
  _operation(op, client) {
    let _op = op
    if (_op.parent !== this._head) {
      // Transform the operation so that it's appliable on top of head
      const { _history } = this
      const siblingIndex = _history.findIndex(
        ({ parent }) => parent === op.parent
      )
      if (siblingIndex === undefined) {
        this._message({
          type: 'error',
          code: 'DETACHED_OP',
          reason: `could not find parent of operation ${op.id} in server history`,
        })
        return
      }
      for (let i = siblingIndex; i < _history.length; i++) {
        ;[_op] = _op.transform(_history[i])
      }
      // The emitter client needs to recognize its operation when it comes back
      _op.id = op.id
    }
    _op.parent = this._head
    this._applyOperation(_op)
  }

  // Server -> Client
  // Apply operation on the local copy and broadcast to all the clients
  _applyOperation(op, client) {
    try {
      this._document.applyOperation(op, this.areEqual)
    } catch (err) {
      console.error(err)
      client._message({
        type: 'error',
        code: 'CLIENT_OP_INVALID_ON_SERVER',
        reason: `could not apply operation ${op.id} on server`,
      })
      return
    }
    this._history.push(op)
    // Garbage Collect
    if (this._history.length > 20000) {
      this._history = this._history.slice(-10000)
    }
    if (typeof this.onEvent === 'function') {
      this.onEvent({
        type: 'operation',
        operation: op,
        document: this.document,
      })
    }
    for (const client of this._clients) {
      client._message({
        type: 'operation',
        operation: op,
      })
    }
  }
}
