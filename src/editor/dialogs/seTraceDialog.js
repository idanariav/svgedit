/* globals svgEditor */
import traceDialogHTML from './seTraceDialog.html'

const template = document.createElement('template')
template.innerHTML = traceDialogHTML

/**
 * @class SeTraceDialog
 * Options dialog for the "Convert to editable SVG" image-trace feature. Lets the
 * user pick a tracing style preset and a palette size, then emits a `change`
 * event ({ trigger:'ok', preset, numberofcolors }) for the panel handler to run
 * the trace. The handler can drive busy/error state via `setBusy()`/`showError()`.
 */
export class SeTraceDialog extends HTMLElement {
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dialog = this._shadowRoot.querySelector('#trace_box')
    this.$title = this._shadowRoot.querySelector('#trace_title')
    this.$closeBtn = this._shadowRoot.querySelector('#trace_close')
    this.$presetLabel = this._shadowRoot.querySelector('#trace_preset_label')
    this.$preset = this._shadowRoot.querySelector('#trace_preset')
    this.$colorsLabel = this._shadowRoot.querySelector('#trace_colors_label')
    this.$colors = this._shadowRoot.querySelector('#trace_colors')
    this.$colorsVal = this._shadowRoot.querySelector('#trace_colors_val')
    this.$error = this._shadowRoot.querySelector('#trace_error')
    this.$cancelBtn = this._shadowRoot.querySelector('#trace_cancel')
    this.$okBtn = this._shadowRoot.querySelector('#trace_ok')
  }

  /**
   * @param {any} i18next
   * @returns {void}
   */
  init (i18next) {
    this.setAttribute('title', i18next.t('tools.trace_image_title'))
    this.setAttribute('preset-label', i18next.t('tools.trace_style'))
    this.setAttribute('colors-label', i18next.t('tools.trace_colors'))
    this.setAttribute('error-text', i18next.t('tools.trace_error'))
    this.setAttribute('common-ok', i18next.t('tools.trace_convert'))
    this.setAttribute('common-cancel', i18next.t('common.cancel'))
  }

  static get observedAttributes () {
    return ['dialog', 'title', 'preset-label', 'colors-label', 'error-text', 'common-ok', 'common-cancel']
  }

  /**
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   * @returns {void}
   */
  attributeChangedCallback (name, oldValue, newValue) {
    switch (name) {
      case 'dialog':
        if (newValue === 'open') {
          this.reset()
          // Mirror the editor's active theme so the shadow tokens resolve.
          this.classList.toggle('theme-dark', !!document.querySelector('.svg_editor')?.classList.contains('theme-dark'))
          this.$dialog.open()
        } else {
          this.$dialog.close()
        }
        break
      case 'title':
        this.$title.textContent = newValue
        break
      case 'preset-label':
        this.$presetLabel.textContent = newValue
        break
      case 'colors-label':
        this.$colorsLabel.textContent = newValue
        break
      case 'error-text':
        this.$error.textContent = newValue
        break
      case 'common-ok':
        this.$okBtn.textContent = newValue
        break
      case 'common-cancel':
        this.$cancelBtn.textContent = newValue
        break
      default:
        break
    }
  }

  get dialog () {
    return this.getAttribute('dialog')
  }

  set dialog (value) {
    this.setAttribute('dialog', value)
  }

  /**
   * Clear transient state back to a ready-to-convert dialog.
   * @returns {void}
   */
  reset () {
    this.$error.classList.remove('show')
    this.$okBtn.disabled = false
    this.$colorsVal.textContent = this.$colors.value
  }

  /**
   * Toggle the converting/busy state (disables Convert, swaps its label).
   * @param {boolean} busy
   * @returns {void}
   */
  setBusy (busy) {
    this.$okBtn.disabled = busy
    this.$okBtn.textContent = busy
      ? svgEditor.i18next.t('tools.trace_working')
      : svgEditor.i18next.t('tools.trace_convert')
  }

  /**
   * Show an inline error message and re-enable Convert.
   * @param {string} msg
   * @returns {void}
   */
  showError (msg) {
    this.$error.textContent = msg
    this.$error.classList.add('show')
    this.setBusy(false)
  }

  /**
   * @returns {void}
   */
  connectedCallback () {
    const close = () => this.setAttribute('dialog', 'close')

    this.$colors.addEventListener('input', () => {
      this.$colorsVal.textContent = this.$colors.value
    })

    svgEditor.$click(this.$cancelBtn, close)
    svgEditor.$click(this.$closeBtn, close)
    svgEditor.$click(this.$okBtn, () => {
      this.$error.classList.remove('show')
      this.dispatchEvent(new CustomEvent('change', {
        detail: {
          trigger: 'ok',
          preset: this.$preset.value,
          numberofcolors: parseInt(this.$colors.value, 10)
        }
      }))
    })
  }
}

// Register
customElements.define('se-trace-dialog', SeTraceDialog)
