/* globals svgEditor */
import seTextPromptDialogHTML from './seTextPromptDialog.html'

const template = document.createElement('template')
template.innerHTML = seTextPromptDialogHTML

/**
 * @class SeTextPromptDialog
 * An on-brand replacement for the native browser `prompt()`. Hosts (such as
 * Obsidian/Electron) render `window.prompt` as an ugly, sometimes non-functional
 * browser chrome dialog; this stays inside the editor's themed UI and resolves a
 * promise with the entered text (or `null` when cancelled).
 */
export class SeTextPromptDialog extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dialog = this._shadowRoot.querySelector('#text_prompt_box')
    this.$title = this._shadowRoot.querySelector('#text_prompt_title')
    this.$closeBtn = this._shadowRoot.querySelector('#text_prompt_close')
    this.$message = this._shadowRoot.querySelector('#text_prompt_message')
    this.$input = this._shadowRoot.querySelector('#text_prompt_input')
    this.$cancelBtn = this._shadowRoot.querySelector('#text_prompt_cancel')
    this.$okBtn = this._shadowRoot.querySelector('#text_prompt_ok')
    // resolver for the in-flight prompt() promise
    this._resolve = null
    // default footer labels (overridable via init / prompt options)
    this._okText = 'OK'
    this._cancelText = 'Cancel'
  }

  /**
   * @function init
   * @param {any} i18next
   * @returns {void}
   */
  init (i18next) {
    this._okText = i18next.t('common.ok')
    this._cancelText = i18next.t('common.cancel')
    this.$okBtn.textContent = this._okText
    this.$cancelBtn.textContent = this._cancelText
  }

  /**
   * Open the dialog and resolve with the entered text, or `null` if cancelled.
   * @param {string} message - the label shown above the input
   * @param {string} [value] - the pre-filled / default value
   * @param {{title?: string, okText?: string, cancelText?: string}} [opts]
   * @returns {Promise<string|null>}
   */
  prompt (message, value = '', opts = {}) {
    // Resolve any prior, still-open prompt as cancelled before reusing.
    this._settle(null)
    return new Promise((resolve) => {
      this._resolve = resolve
      this.$title.textContent = opts.title ?? message
      this.$message.textContent = message
      this.$okBtn.textContent = opts.okText ?? this._okText
      this.$cancelBtn.textContent = opts.cancelText ?? this._cancelText
      this.$input.value = value
      // Mirror the editor's active theme onto the host so the shadow CSS tokens
      // resolve to the right palette (the dialog lives outside the themed
      // `.svg_editor` scope).
      this.classList.toggle('theme-dark', !!document.querySelector('.svg_editor')?.classList.contains('theme-dark'))
      this.$dialog.open()
      // Focus + select after the dialog paints.
      setTimeout(() => {
        this.$input.focus()
        this.$input.select()
      }, 0)
    })
  }

  /**
   * Resolve the pending promise once and clear it.
   * @param {string|null} result
   * @returns {void}
   */
  _settle (result) {
    if (this._resolve) {
      const resolve = this._resolve
      this._resolve = null
      resolve(result)
    }
  }

  /**
   * @function connectedCallback
   * @returns {void}
   */
  connectedCallback () {
    const submit = () => {
      const val = this.$input.value
      this.$dialog.close()
      this._settle(val)
    }
    const cancel = () => {
      this.$dialog.close()
      this._settle(null)
    }
    svgEditor.$click(this.$okBtn, submit)
    svgEditor.$click(this.$cancelBtn, cancel)
    svgEditor.$click(this.$closeBtn, cancel)
    this.$input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
    })
    // Closing via backdrop / Esc on the elix dialog itself counts as cancel.
    this.$dialog.addEventListener('close', () => this._settle(null))
  }
}

// Register
customElements.define('se-text-prompt-dialog', SeTextPromptDialog)

/**
 * Promise-based replacement for the native `window.prompt`. Mirrors `seConfirm`
 * / `seAlert`: a global helper that drives the in-editor dialog.
 * @param {string} message
 * @param {string} [value]
 * @param {{title?: string, okText?: string, cancelText?: string}} [opts]
 * @returns {Promise<string|null>}
 */
const sePrompt = (message, value = '', opts = {}) => {
  const el = document.querySelector('se-text-prompt-dialog')
  if (!el) return Promise.resolve(null)
  return el.prompt(message, value, opts)
}

window.sePrompt = sePrompt
