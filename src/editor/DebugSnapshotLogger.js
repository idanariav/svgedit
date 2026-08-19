/**
 * @file DebugSnapshotLogger.js
 *
 * Polls a snapshot function (svgCanvas.getDebugSnapshot()) and forwards it
 * to a host-provided sink whenever it changes, instead of rendering it in a
 * UI panel (see Editor.js's setDebugLogger()). Kept dependency-free so it
 * can be unit-tested without importing the rest of the editor.
 *
 * @license MIT
 */

const POLL_MS = 400

export default class DebugSnapshotLogger {
  /**
   * @param {() => object} getSnapshot Returns the current debug snapshot.
   */
  constructor (getSnapshot) {
    this._getSnapshot = getSnapshot
    this._sink = null
    this._timer = null
    this._lastJSON = null
  }

  /**
   * @param {((event: string, detail?: object) => void)|null} sink Pass
   * `null`/omit to stop polling.
   * @returns {void}
   */
  start (sink) {
    this._sink = typeof sink === 'function' ? sink : null
    if (!this._sink) {
      this.stop()
      return
    }
    this._lastJSON = null
    this._poll()
    if (!this._timer) this._timer = setInterval(() => this._poll(), POLL_MS)
  }

  /**
   * @returns {void}
   */
  stop () {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
    this._sink = null
    this._lastJSON = null
  }

  /**
   * @returns {void}
   */
  _poll () {
    if (!this._sink) return
    let snapshot
    try {
      snapshot = this._getSnapshot()
    } catch (err) {
      return
    }
    const json = JSON.stringify(snapshot)
    if (json === this._lastJSON) return
    this._lastJSON = json
    this._sink('debug-snapshot', snapshot)
  }
}
