import SePlainAlertDialog from './SePlainAlertDialog.js'
import { error as logError } from '@svgedit/svgcanvas/common/logger.js'
/**
 * @class SePromptDialog
 */
export class SePromptDialog extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this.dialog = new SePlainAlertDialog()
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['title', 'close']
  }

  /**
   * @function attributeChangedCallback
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   * @returns {void}
   */
  attributeChangedCallback (name, oldValue, newValue) {
    switch (name) {
      case 'title':
        if (this.dialog.opened) {
          this.dialog.close()
        }
        this.dialog.textContent = newValue
        this.dialog.choices = ['Cancel']
        this.dialog.open()
        break
      case 'close':
        if (this.dialog.opened) {
          this.dialog.close()
        } else {
          this.dialog.open()
        }
        break
      default:
        logError(`unknown attr for: ${name}, newValue = ${newValue}`, undefined, 'sePromptDialog')
        break
    }
  }

  /**
   * @function get
   * @returns {any}
   */
  get title () {
    return this.getAttribute('title')
  }

  /**
   * @function set
   * @returns {void}
   */
  set title (value) {
    this.setAttribute('title', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get close () {
    return this.getAttribute('close')
  }

  /**
   * @function set
   * @returns {void}
   */
  set close (value) {
    // boolean value => existence = true
    if (value) {
      this.setAttribute('close', 'true')
    } else {
      this.removeAttribute('close')
    }
  }
}

// Register
customElements.define('se-prompt-dialog', SePromptDialog)
