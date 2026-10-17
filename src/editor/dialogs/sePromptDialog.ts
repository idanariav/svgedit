// sePromptDialog.ts — Prompt-style dialog (`se-prompt-dialog`) — used by ext-opensave as a "loading" indicator (title + Cancel), not a real text prompt
import SePlainAlertDialog from './SePlainAlertDialog.ts'
import { error as logError } from '@svgedit/svgcanvas/common/logger.ts'
/**
 * @class SePromptDialog
 */
export class SePromptDialog extends HTMLElement {
  _shadowRoot: ShadowRoot
  dialog: SePlainAlertDialog

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
 * @returns observed
   */
  static get observedAttributes (): any {
    return ['title', 'close']
  }

  /** @function attributeChangedCallback */
  attributeChangedCallback (name: string, oldValue: string, newValue: string): void {
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

  /** @function get */
  get title (): any {
    return this.getAttribute('title')
  }

  /** @function set */
  set title (value) {
    this.setAttribute('title', value)
  }

  /** @function get */
  get close (): any {
    return this.getAttribute('close')
  }

  /** @function set */
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
