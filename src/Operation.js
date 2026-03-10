const Component = require('./Component')
const _compose = require('./_compose')
const _transform = require('./_transform')

const TYPES = { r: 'ret', i: 'ins', d: 'del' }

// An Operation is a group of Components
// It is meant to be applied on an entire Document from beginning to end
// components: array of instances of Component
// parent: ID of the previous operation (may be undefined)
// An Operation is *mutable*
module.exports = class Operation {
  constructor({
    components = [],
    id = Math.random().toString(32).slice(2),
    author,
    parent,
  } = {}) {
    if (
      !Array.isArray(components) ||
      !components.every(comp => typeof comp === 'object')
    ) {
      throw new Error(
        "An operation's components must be an array of objects. Got: " +
          components
      )
    }
    if (author != null && typeof author !== 'string') {
      throw new Error('An Operation requires an author string. Got: ' + author)
    }
    if (parent != null && typeof parent !== 'string') {
      throw new Error('An Operation requires a parent string. Got: ' + parent)
    }

    this.components = components.map(comp =>
      comp instanceof Component
        ? comp
        : new Component({ type: comp.type, value: comp.value })
    )
    this.id = id
    this.author = author
    this.parent = parent
  }

  get length() {
    return this.components.length
  }

  serialize() {
    let serializedComps = []
    const data = []
    this.components.forEach(component => {
      if (component.type !== 'ret') {
        data.push(...component.value)
      }
      serializedComps.push(component.type[0] + component.length)
    })

    return {
      metadata: `o-${this.id}-${this.author}-${
        this.parent
      }-${serializedComps.join('-')}`,
      data,
    }
  }

  static deserialize({ metadata, data }) {
    data = data.slice(0)
    const [, id, _author, _parent, ...comps] = metadata.split('-')
    if (comps[0] === '') {
      comps.shift() // Edge case: no comps
    }
    const author = _author === 'undefined' ? undefined : _author
    const parent =
      _parent === 'null' ? null : _parent === 'undefined' ? undefined : _parent
    const op = new Operation({ id, author, parent })
    let type, length, value
    comps.forEach(chunk => {
      type = chunk[0]
      length = +chunk.slice(1)
      if (!Number.isInteger(length) || !(type in TYPES)) {
        throw new Error('Invalid metadata')
      }
      if (type === 'r') {
        value = length
      } else {
        if (data.length < length) {
          throw new Error('Data is too short')
        }
        value = data.splice(0, length)
      }
      op.components.push(new Component({ type: TYPES[type], value }))
    })

    if (data.length > 0) {
      throw new Error('Data is too long')
    }

    return op
  }

  isNoOp() {
    return this.components.every(component => component.type === 'ret')
  }

  get(i) {
    return this.components[i]
  }

  ret(value) {
    this.components.push(new Component({ type: 'ret', value }))
    return this
  }
  ins(value) {
    this.components.push(new Component({ type: 'ins', value }))
    return this
  }
  del(value) {
    this.components.push(new Component({ type: 'del', value }))
    return this
  }
  push(...comps) {
    if (comps.some(comp => typeof comp !== 'object')) {
      throw new Error(
        'Expected object arguments: { type, value }. Got: ' + comps
      )
    }
    this.components.push.apply(
      this.components,
      comps.map(({ type, value }) => new Component({ type, value }))
    )
    return this
  }

  // Compresses the operation so that no 2 adjacent components are of the same type
  _compress() {
    const components = []
    let acc
    let i = 0
    while ((acc = this.get(i++))) {
      while (this.get(i) && acc.type === this.get(i).type)
        acc = acc.add(this.get(i++))
      components.push(acc)
    }

    return new Operation({ components, parent: this.parent, id: this.id })
  }

  reverse() {
    return new Operation({
      components: this.components.map(component => {
        switch (component.type) {
          case 'ret':
            return component
          case 'ins':
            return new Component({ type: 'del', value: component.value })
          case 'del':
            return new Component({ type: 'ins', value: component.value })
        }
      }),
      // A reverse Operation can only be applied after the original one
      parent: this.id,
    })
  }

  compose(operation) {
    // FIXME: is it necessary to compress the operations?
    return new Operation({
      components: _compose(
        this._compress().components,
        operation._compress().components
      ),
      parent: this.parent,
      id: operation.id,
    })._compress()
  }

  transform(operation) {
    // FIXME: is it necessary to compress the operations?
    const [thisPrimeComponents, operationPrimeComponents] = _transform(
      this._compress().components,
      operation._compress().components
    )

    return [
      new Operation({
        components: thisPrimeComponents,
        parent: operation.id,
        id: this.id,
      })._compress(),
      new Operation({
        components: operationPrimeComponents,
        parent: this.id,
        id: operation.id,
      })._compress(),
    ]
  }

  getNewPosition(pos) {
    if (!Number.isInteger(pos) || pos < 0) {
      throw new Error('Operation#getNewPosition takes a positive integer')
    }

    if (pos === 0) {
      return pos
    }

    let cursor = 0
    for (const { type, length } of this.components) {
      switch (type) {
        case 'ret':
          cursor += length
          break
        case 'ins':
          pos += length
          cursor += length
          break
        case 'del':
          pos = Math.max(cursor, pos - length)
      }

      if (cursor >= pos) {
        return pos
      }
    }

    throw new Error(
      `getNewPosition: given this operation, the position ${pos} is outside of the document`
    )
  }
}
