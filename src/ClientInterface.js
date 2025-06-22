const { getMessageType, serialize, deserialize } = require('./_message')

module.exports = class ClientInterface {
  constructor({
    id = Math.random().toString(36).slice(2),
    server,
    onMessage,
  } = {}) {
    this.onMessage = onMessage
    this._server = server
    this.id = id
  }

  remove() {
    this._server.removeClient(this)
  }

  // Server -> Client message
  _message(message) {
    if (typeof this.onMessage === 'function') {
      return this.onMessage(serialize(message))
    } else {
      console.error(
        `The server could not send a message to client ${this.id} because the onMessage callback is not a function. Message:`,
        message
      )
    }
  }

  // Client -> Server message
  message({ metadata, data }) {
    if (typeof metadata !== 'string' || !Array.isArray(data)) {
      throw new Error(
        'ClientInterface#message takes { metadata, data } where metadata is a string and data an array of elements'
      )
    }
    // Shallow copy in case it's the same reference as the client
    data = data.slice(0)

    const message = deserialize({ metadata, data })

    // Start request
    if (message.type === 'start') {
      const history = this._server._history
      this._server._clients.add(this) // May already exist but it's fine
      this._message({
        type: 'reset',
        clientId: this.id,
        headId: (history.length > 0 && history[history.length - 1].id) || '',
        document: this._server._document,
      })
      return
    }

    // Operation
    if (message.type === 'operation') {
      const operation = message.operation
      operation.author = this.id
      this._server._operation(operation, this)
      return
    }

    throw new Error(`Cannot handle message of type ${message.type} here`)
  }
}
