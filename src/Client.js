const Document = require('./Document')
const Operation = require('./Operation')
const { getMessageType, serialize, deserialize } = require('./_message')

module.exports = class Client {
  constructor({ onEvent, onMessage, areEqual } = {}) {
    this.onEvent = onEvent
    this.onMessage = onMessage
    this.areEqual = areEqual
    this._document = new Document()
    this._buffer = null // Operation
    this._pending = null // Operation
    this._history = undefined // Array of Operations: copy of the known server history
    this.status = 'detached'
  }

  get document() {
    return this._document.array
  }

  static createOperation() {
    return new Operation()
  }

  _onEvent(event) {
    if (typeof this.onEvent === 'function') {
      return this.onEvent(event)
    } else {
      console.error(
        'An event happened but the onEvent callback is not a function',
        event
      )
    }
  }

  // Client -> Server
  _message(message) {
    if (typeof this.onMessage === 'function') {
      this.onMessage(serialize(message))
    } else {
      console.error(
        'The client could not send a message to the server because onMessage is not a function. Message:',
        message
      )
    }
  }

  // Editor -> Client
  operation(op) {
    if (!(op instanceof Operation)) {
      throw new Error('Client#operation takes an Operation. Got: ' + op)
    }
    if (this.status === 'detached') {
      throw new Error('Cannot apply an operation on a detached client')
    }

    op.author = this.id
    this._document.applyOperation(op, this.areEqual) // Let it throw synchronously

    if (this._pending !== null) {
      // If we're already waiting for an acknowledgment, push it to the buffer
      this._buffer = this._buffer === null ? op : this._buffer.compose(op)
      if (this._buffer.isNoOp()) {
        this._buffer = null
      }
    } else {
      // Otherwise, send it to the server
      op.parent = this._history[this._history.length - 1].id
      this._pending = op
      this.status = 'pending'
      this._message({ type: 'operation', operation: op })
    }
  }

  // Returns a new operation which, if it were to be applied on the document,
  // would cancel the effects of the nth most recent operation (1-indexed)
  reverseOperation(n = 1) {
    const history = this._history.slice(-n) // duplicate the useful part only
    if (this._pending !== null) {
      history.push(this._pending)
    }
    if (this._buffer !== null) {
      history.push(this._buffer)
    }
    const op = history[history.length - n]
    // Either undefined (history is too short) or stub first operation
    if (!(op instanceof Operation)) {
      throw new Error(`Operation #${n} cannot be found`)
    }

    let reversedOp = op.reverse()
    if (n > 1) {
      for (const op of history.slice(-n + 1)) {
        ;[reversedOp] = reversedOp.transform(op)
      }
    }

    return reversedOp
  }

  // Server -> Client
  message({ metadata, data }) {
    if (typeof metadata !== 'string' || !Array.isArray(data)) {
      throw new Error(
        'Client#message takes { metadata, data } where metadata is a string and data an array of elements'
      )
    }
    // Shallow copy in case it's the same reference as the server
    data = data.slice(0)

    const message = deserialize({ metadata, data })

    // Error
    if (message.type === 'error') {
      this._onEvent({
        type: 'error',
        code: message.code,
        reason: message.reason,
        status: (this.status = 'detached'),
      })
      return
    }

    // Reset
    if (message.type === 'reset') {
      this.id = message.clientId
      this._document = message.document
      this._buffer = null
      this._pending = null
      this._history = [{ id: message.headId || null }]

      this._onEvent({
        type: 'reset',
        document: this.document,
        status: (this.status = 'sync'),
      })
      return
    }

    // Operation
    if (message.type === 'operation') {
      if (this.status === 'detached') {
        console.warn(
          'Client#message: Document is detached, ignoring operation. Call reset() to reattach Document.'
        )
        return // Ignore all incoming operations if the client is detached
      }

      let op = message.operation

      this._history.push(op)
      // Garbage Collect
      if (this._history.length > 2000) {
        this._history = this._history.slice(-1000)
      }

      const { _pending, _buffer } = this
      if (_pending !== null && op.id === _pending.id) {
        // Acknowledge the pending operation and flush the buffer
        this._pending = _buffer
        this._buffer = null
        if (_buffer !== null) {
          _buffer.parent = op.id
          this._message({ type: 'operation', operation: _buffer })
        } else {
          this._onEvent({ type: 'info', status: (this.status = 'sync') })
        }
      } else {
        try {
          // Apply the (transformed) incoming operation and update the bridge
          if (_pending !== null) {
            ;[this._pending, op] = _pending.transform(op)
            if (_buffer !== null) {
              ;[this._buffer, op] = _buffer.transform(op)
            }
          }

          this._document.applyOperation(op, this.areEqual)
        } catch (err) {
          // The server operation couldn't be applied on the client
          console.error(err)
          this._onEvent({
            type: 'error',
            code: 'SERVER_OP_INVALID_ON_CLIENT',
            reason: `the operation ${op.id} could not be applied on the internal document: ${err.message}`,
            status: (this.status = 'detached'),
          })
          return
        }

        this._onEvent({
          type: 'operation',
          operation: op,
          document: this.document,
          status: this.status,
        })
      }
      return
    }

    throw new Error(`Cannot handle message of type ${message.type} here`)
  }

  reset() {
    this._onEvent({ type: 'info', status: (this.status = 'detached') })
    this._message({ type: 'start' })
  }
}
