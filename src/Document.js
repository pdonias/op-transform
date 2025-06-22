const Operation = require('./Operation')
const Component = require('./Component')

const tripleEqual = (a, b) => a === b

module.exports = class Document {
  constructor({ content = [] } = {}) {
    this._content = content
  }

  get length() {
    return this._content.length
  }

  get text() {
    return this._content.join('')
  }

  get array() {
    return this._content
  }

  ret(cursor, n) {
    if (cursor + n > this.length) {
      throw new Error('Trying to retain beyond the end of the document.')
    }
    return cursor + n
  }

  ins(cursor, arr) {
    this._content.splice(cursor, 0, ...arr)
    return cursor + arr.length
  }

  del(cursor, arr, areEqual) {
    if (cursor + arr.length > this.length) {
      throw new Error('Trying to delete beyond the end of the document.')
    }
    for (const i in arr) {
      if (!areEqual(arr[i], this._content[cursor + +i])) {
        throw new Error('Trying to delete unexpected elements.')
      }
    }
    this._content.splice(cursor, arr.length)
    return cursor
  }

  applyOperation(operation, areEqual = tripleEqual) {
    // FIXME: the document might be big so duplicating it is probably a bad
    // idea. A better idea would be to store the components that have been
    // successfully applied and replay them in reverse in case of error.
    const previousContent = this._content.slice(0)
    let cursor = 0

    try {
      operation.components.forEach(component => {
        cursor = this[component.type](cursor, component.value, areEqual)
      })

      if (cursor < this.length) {
        throw new Error('The operation is too short.')
      }
    } catch (err) {
      this._content = previousContent
      throw err
    }
  }
}
