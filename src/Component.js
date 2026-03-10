// A Component is one block of an Operation
// It's either a retain, insert or delete component
// type: 'ret', 'ins' or 'del'
// value: a number for 'ret', a string or array for 'ins' and 'del'
// An Component is *immutable*
module.exports = class Component {
  constructor({ type, value } = {}) {
    if (!['ret', 'ins', 'del'].includes(type)) {
      throw new Error(
        'A component type is either retain, insert or delete. Got: ' + type
      )
    }
    if (type === 'ret' && !Number.isSafeInteger(value)) {
      throw new Error(
        'A retain component requires a number value. Got: ' + value
      )
    }
    if (type === 'ins' && !Array.isArray(value)) {
      throw new Error(
        'An insert component requires a string value. Got: ' + value
      )
    }
    if (type === 'del' && !Array.isArray(value)) {
      throw new Error(
        'A delete component requires a string value. Got: ' + value
      )
    }

    this.type = type
    this.value = value
  }

  get length() {
    return this.type === 'ret' ? this.value : this.value.length
  }

  isRetain() {
    return this.type === 'ret'
  }

  isInsert() {
    return this.type === 'ins'
  }

  isDelete() {
    return this.type === 'del'
  }

  add(component) {
    return new Component({
      type: this.type,
      value:
        this.type === 'ret'
          ? this.value + component.value
          : this.value.concat(component.value),
    })
  }

  split(i) {
    if (i <= 0) {
      return [undefined, this]
    } else if (i >= this.length) {
      return [this, undefined]
    } else {
      if (this.type === 'ret') {
        return [
          new Component({ type: 'ret', value: i }),
          new Component({ type: 'ret', value: this.length - i }),
        ]
      } else {
        return [
          new Component({ type: this.type, value: this.value.slice(0, i) }),
          new Component({ type: this.type, value: this.value.slice(i) }),
        ]
      }
    }
  }
}
