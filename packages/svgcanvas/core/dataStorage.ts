/**
 * A storage solution aimed at replacing jQuery's data function.
 * Implementation Note: Elements are stored in a [WeakMap](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap).
 * This makes sure the data is garbage collected when the node is removed.
 *
 * @module dataStorage
 * @license MIT
 */
type Key = object

class DataStorage {
  #storage = new WeakMap<Key, Map<string, unknown>>()

  /** Checks if the provided element is a valid WeakMap key. */
  #isValidKey = (element: unknown): element is Key => {
    return element !== null && (typeof element === 'object' || typeof element === 'function')
  }

  /** Stores data associated with an element. */
  put (element: Key, key: string, obj: unknown): void {
    if (!this.#isValidKey(element)) {
      return
    }
    let elementMap = this.#storage.get(element)
    if (!elementMap) {
      elementMap = new Map()
      this.#storage.set(element, elementMap)
    }
    elementMap.set(key, obj)
  }

  /** Retrieves data associated with an element, or undefined if not found. Values are heterogeneous; callers know what they stored. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get (element: Key, key: string): any {
    if (!this.#isValidKey(element)) {
      return undefined
    }
    return this.#storage.get(element)?.get(key)
  }

  /** Checks if an element has data stored under a specific key. */
  has (element: Key, key: string): boolean {
    if (!this.#isValidKey(element)) {
      return false
    }
    return this.#storage.get(element)?.has(key) === true
  }

  /** Removes data associated with an element; true if it was removed. */
  remove (element: Key, key: string): boolean {
    if (!this.#isValidKey(element)) {
      return false
    }
    const elementMap = this.#storage.get(element)
    if (!elementMap) {
      return false
    }
    const ret = elementMap.delete(key)
    if (elementMap.size === 0) {
      this.#storage.delete(element)
    }
    return ret
  }
}

// Export singleton instance for backward compatibility
const dataStorage = new DataStorage()
export default dataStorage
