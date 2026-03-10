A JavaScript implementation of the Operational Transformation algorithm that lets multiple clients edit the same in-cloud document at the same time.

## Introduction

Your code needs to handle the editor in the client, the communication layer between the client and the server and, optionally, the storage of the document in the server. This library handles the synchronization and coherence of all the documents' versions (server and clients). Therefore, your code needs to communicate with it on 7 occasions:

- In the client:
  - `Client#operation`: when you tell the engine that the document changed in the editor (e.g.: user input)
  - `Client#onMessage`: when the engine tells you to send a message to the server
  - `Client#message`: when you tell the engine that a message has been received from the server
  - `Client#onEvent`: when the engine tells you that you need to change the document
- In the server:
  - `ClientInterface#message`: when you tell the engine that a message has been received from the client
  - `ClientInterface#onMessage`: when the engine tells you to send a message to the client
  - `Server#onEvent`: when the engine tells you to update the DB (optional)

(NB: `operation` doesn't exist in the server because you can't write on the server's document directly, it needs to go through a client instance. A client instance may be hosted on the server, though.)

```
Document             Client                          Server
 editor             instance                        instance           Database
    | ---> operation() >|                               |                  |
    |                   |> onMessage() ----> message() >|                  |
    |                   |< message() <---- onMessage() <|> onEvent() ----> |
    | <----- onEvent() <|                               |                  |
```

## API

### Component

A Component is one block of an Operation.
It's either a *retain*, *insert* or *delete* Component.

#### `type: "ret"|"ins"|"del"`

> Type of the Component: retain, insert or delete

### Operation

An Operation is an object that represents an edition of a whole document.

#### `ret(n: Number): Operation`

> Pushes a retain Component to the current Operation.

#### `ins(a: Element[]): Operation`

> Pushes an insert Component to the current Operation.

#### `del(a: Element[]): Operation`

> Pushes a delete Component to the current Operation.

#### `push(...components: { type: "ret"|"ins"|"del", value: Number|Element[] }): Operation`

> Takes any number of objects that describe components and pushes the corresponding Components to the current Operation

This method is equivalent to calling `ret()`, `ins()` and `del()` but may be more convenient depending on how you build Operations.

#### `components: Component[]`

> Array of Components representing the whole Operation

#### `id: String`

> Operation unique identifier

#### `author: String?`

> ID of the Operation's author

#### `parent: [String|null]?`

> ID of the parent Operation

### Message

A Message is an object that needs to be sent on the wire either from server to client or from client to server. It contains 2 properties:

#### `metadata`

`metadata` is a simple string. You don't need to understand what it contains and it needs to be kept as is in the object.

#### `data`

 `data` is an array that contains individual items of your document (e.g. characters). If they need to be serialized or transformed, you can manipulate that array. On the other end of the wire, you need to properly deserialize them so that the other part of the engine is able to interpret them. If you're only using items that are supported by JSON, you can simplify `JSON.stringify` and `JSON.parse` the whole object: `myTransport.send(JSON.stringify(message))`.

### Element

These are the atomical elements that you provide to build the document. In most cases, for text based documents, they're simple characters (`'a'`, `'b'`, `'c'`, ...) but for a more complex kind of document, they could be anything, as long as they can be handled by JavaScript. They aren't even necessarily the same type in the clients and the server, as long as you translate them consistently when the messages are sent between the client and the server. For instance, they could be DOM nodes in browser based clients, instances of a custom class in the server and something else in native apps. Your job is to handle the translation when messages are sent and to provide a `areEqual` function to compare them when necessary.

### Client

#### `new Client({ onEvent: Function?, onMessage: Function?, areEqual: Function? })`

All the client's options can be assigned after its instanciation. e.g.:
```
const client = new Client()
// ...
client.onMessage = handleMessage
```

- `onEvent({ type: String, status: String, operation: Operation?, document: Element[] })`

> The function that will be called when an event needs to be handled by the local editor.

- type `reset`: the client is being reset with a fresh version of the document. The editor should be assigned the `document` parameter.
- type `operation`: an Operation needs to be applied on the editor. The new document is also passed for convenience.
- type `error`: a non-recoverable error occurred. The client is now `detached` and `reset()` must be called to resync.
- type `info`: an internal state change occurred (e.g. transition to `sync`). No document change is needed.

- `onMessage(clientToServerMessage: Message)`

> The function that will be called when a message needs to be sent to the server.

When this function is called, send the message to the server and pass it to the `ClientInterface#message` method.

- `areEqual(e1: Element, e2: Element): Boolean`

> An optional function used to compare 2 elements of the Document

If your document contains elements that cannot be compared with `===`, then you need to provide this comparison function. If you don't provide it, elements will be compared with a `===` equality.

#### `document: Element[]`

> The current version of the document.

#### `status: "sync"|"pending"|"detached"`

> The current status of the client

- `"detached"`: the client doesn't know anything about the server. This status requires to call `reset()` on the client.
- `"pending"`: the client is currently awaiting for an operation it sent earlier. In the mean time, the client can receive and apply other operations from the server and it can buffer other operations from the client.
- `"sync"`: the client is fully synchronized with the server.

#### `static createOperation(): Operation`

> Creates and returns a new empty Operation. Use this to build operations before passing them to `client.operation()`.

#### `operation(operation: Operation)`

> Apply a new operation on top of the current state.

#### `message(serverToClientMessage: Message)`

> Pass a message coming from the server to the client's local engine.

#### `reset()`

> Request the full document from the server. Also used to initialize.

This should trigger a `reset` event once the client has received the document from the server.

#### `reverseOperation(n: Number = 1): Operation`

> Returns a new Operation that, if applied, would undo the nth-most-recent operation (1-indexed). Throws if the history is too short.

### Server

#### `new Server({ document: Element[], onEvent: Function?, areEqual: Function? })`

- `document`

> The initial document.

The document is an array of arbitrary types. The array items need to be serializable via `JSON.stringify`. If not passed, the server will be initialized with an empty document.

- `onEvent({ type: String, operation: Operation, document: Element[] })`

> Optionally subscribe to operations.

Will be called everytime that an operation has been applied. This is useful to keep a database synced. `type` will always be `operation`. The full document is also passed for convenience.

You can assign it later with: `server.onEvent = handleEvent`

- `areEqual(c1: Component, c2: Component): Boolean`

Same as Client's `areEqual`

#### `document: Element[]`

> The current version of the document.

#### `addClient({ id: String?, onMessage: Function? }): ClientInterface`

> Returns a new `ClientInterface`.

- `id`

> ID of the client

This ID will be used to identify Operations authors. If not provided, a random ID will be assigned to the client.

- `onMessage(serverToClientMessage: Message)`

> The function that will be called when a message needs to be sent to the client.

When this function is called, send the message to the client and pass it to the `Client#message` method.

You can assign it later with: `clientInterface.onMessage = handleMessage`

### Client Interface

#### `message(clientToServerMessage: Message)`

> Pass a message coming from the client to the server's local engine.

## Example with WebSockets

### In the server:

```js
const server = new Server({
  document: db.getDocument() || [],
  // Server -> Database
  onEvent: event => {
    if (event.type === 'operation') {
      db.update(event.operation)
    }
  }
})

io.on('connection', socket => {
  // Server -> Client
  const clientInterface = server.addClient({
    onMessage: message => {
      socket.emit('serverToClientMessage', message)
    }
  })

  // Client -> Server
  socket.on('clientToServerMessage', message => {
    clientInterface.message(message)
  })
})
```

### In the client:

```js
const editor = new MyEditor()

socket.on('connection', () => {
  const client = new Client({
    // Client -> Editor
    onEvent: event => {
      if (event.type === 'reset') {
        editor.setContent(event.document)
      } else if (event.type === 'operation') {
        editor.applyOperation(event.operation)
      }
    },
    // Client -> Server
    onMessage: message => {
      socket.emit('clientToServerMessage', JSON.stringify(message))
    }
  })

  // Editor -> Client
  editor.on('keypress', (position, key) => {
    const op = Client.createOperation()

    if (isBackSpace(key)) {
      op
        .ret(position - 1)
        .del(editor.slice(position - 1, position))
    } else {
      op
        .ret(position)
        .ins([key])
    }
    op.ret(editor.contentLength - position)

    client.operation(op)
  })

  // Server -> Client
  socket.on('serverToClientMessage', message => {
    client.message(JSON.parse(message))
  })

  // Notify the server that the client is ready to receive events
  client.reset()
})
```
