const Document = require('./Document')
const Operation = require('./Operation')

const CHAR_TO_TYPE = {
  e: 'error',
  o: 'operation',
  i: 'info',
  s: 'start',
  r: 'reset',
}

// error: e-<code>-<reason>
// operation: o-<id>-<author>-<parent>-<comp1>-<comp2>... + elements
// start: s
// reset: r-<clientId>-<headId> + document
const MESSAGE_TYPES = {
  error: {
    serialize: ({ code, reason }) => ({ metadata: `e-${code}-${reason}` }),
    deserialize: ({ metadata }) => {
      const [, code, ...reason] = metadata.split('-')
      return { code, reason: reason.join('-') }
    },
  },
  operation: {
    serialize: ({ operation }) => operation.serialize(),
    deserialize: ({ metadata, data }) => ({
      operation: Operation.deserialize({ metadata, data }),
    }),
  },
  start: {
    serialize: () => ({ metadata: 's' }),
  },
  reset: {
    serialize: ({ clientId, headId, document }) => ({
      metadata: `r-${clientId}-${headId}`,
      data: document.array,
    }),
    deserialize: ({ metadata, data }) => {
      const [, clientId, headId] = metadata.split('-')
      return { clientId, headId, document: new Document({ content: data }) }
    },
  },
}

function getMessageType({ metadata }) {
  if (!(typeof metadata === 'string')) {
    throw new Error('Metadata must be a string. Got:', metadata)
  }

  const [type] = metadata.split('-')
  if (!(type in CHAR_TO_TYPE)) {
    throw new Error('Metadata malformed: ' + metadata)
  }

  return CHAR_TO_TYPE[type]
}

function serialize({ type, ...props }) {
  const tools = MESSAGE_TYPES[type]

  if (tools === undefined || tools.serialize === undefined) {
    throw new Error('Cannot serialize message of type: ' + type)
  }

  // Default metadata is more explicit if something goes wrong
  // Empty data array by default
  return {
    metadata: 'unexpected metadata',
    data: [],
    ...tools.serialize({ ...props }),
  }
}

function deserialize({ metadata, data }) {
  const type = getMessageType({ metadata })
  const tools = MESSAGE_TYPES[type]

  if (tools === undefined) {
    throw new Error('Cannot deserialize message of type: ' + type)
  }

  if (tools.deserialize === undefined) {
    return { type }
  }

  return { type, ...tools.deserialize({ metadata, data }) }
}

module.exports = { getMessageType, serialize, deserialize }
