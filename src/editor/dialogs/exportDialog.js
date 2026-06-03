/* globals svgEditor */
import './se-elix/define/NumberSpinBox.js'

import exportDialogHTML from './exportDialog.html'
const template = document.createElement('template')
template.innerHTML = exportDialogHTML
/**
 * @class SeExportDialog
 */
export class SeExportDialog extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dialog = this._shadowRoot.querySelector('#export_box')
    this.$okBtn = this._shadowRoot.querySelector('#export_ok')
    this.$cancelBtn = this._shadowRoot.querySelector('#export_cancel')
    this.$exportOption = this._shadowRoot.querySelector('#se-storage-pref')
    this.$region = this._shadowRoot.querySelector('#se-export-region')
    this.$qualityCont = this._shadowRoot.querySelector('#se-quality')
    this.$input = this._shadowRoot.querySelector('#se-quality')
    this.$includeBgLabel = this._shadowRoot.querySelector('#se-include-bg-label')
    this.$includeBg = this._shadowRoot.querySelector('#se-include-bg')
    this.value = 1
  }

  /**
   * @function init
   * @param {any} name
   * @returns {void}
   */
  init (i18next) {
    this.setAttribute('common-ok', i18next.t('common.ok'))
    this.setAttribute('common-cancel', i18next.t('common.cancel'))
    this.setAttribute('ui-export_type_label', i18next.t('ui.export_type_label'))
    this.value = 100
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['dialog', 'common-ok', 'common-cancel', 'ui-export_type_label']
  }

  /**
   * @function attributeChangedCallback
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   * @returns {void}
   */
  attributeChangedCallback (name, oldValue, newValue) {
    let node
    switch (name) {
      case 'dialog':
        if (newValue === 'open') {
          this._populateRegions()
          this.$dialog.open()
        } else {
          this.$dialog.close()
        }
        break
      case 'common-ok':
        this.$okBtn.textContent = newValue
        break
      case 'common-cancel':
        this.$cancelBtn.textContent = newValue
        break
      case 'ui-export_type_label':
        node = this._shadowRoot.querySelector('#export_select')
        node.textContent = newValue
        break
      default:
      // super.attributeChangedCallback(name, oldValue, newValue);
        break
    }
  }

  /**
   * @function get
   * @returns {any}
   */
  get dialog () {
    return this.getAttribute('dialog')
  }

  /**
   * @function set
   * @returns {void}
   */
  set dialog (value) {
    this.setAttribute('dialog', value)
  }

  /**
   * Rebuild the region dropdown from the frames currently on the canvas. Each
   * frame is a `[data-frame]` rect; its label is its `<title>` (fallback
   * "Frame N"). "Whole canvas" (value "") is always first. If a frame is
   * currently selected it is pre-selected.
   * @returns {void}
   */
  _populateRegions () {
    const select = this.$region?.$select
    if (!select) return
    while (select.firstChild) select.removeChild(select.firstChild)
    this.$region.addOption('', 'Whole canvas')

    const canvas = svgEditor?.svgCanvas
    const content = canvas?.getSvgContent?.()
    const frames = content ? content.querySelectorAll('[data-frame]') : []
    frames.forEach((frame, i) => {
      const titleEl = frame.querySelector('title')
      const label = (titleEl && titleEl.textContent.trim()) || `Frame ${i + 1}`
      this.$region.addOption(frame.id, label)
    })

    // Pre-select the currently selected frame, if any.
    const selected = canvas?.getSelectedElements?.()?.[0]
    this.$region.value =
      selected && selected.hasAttribute?.('data-frame') ? selected.id : ''
  }

  /**
   * @function connectedCallback
   * @returns {void}
   */
  connectedCallback () {
    this.$input.addEventListener('change', (e) => {
      e.preventDefault()
      this.value = e.target.value
    })
    svgEditor.$click(this.$input, (e) => {
      e.preventDefault()
      this.value = e.target.value
    })
    const onSubmitHandler = (e, action) => {
      if (action === 'cancel') {
        document.getElementById('se-export-dialog').setAttribute('dialog', 'close')
      } else {
        const triggerEvent = new CustomEvent('change', {
          detail: {
            trigger: action,
            imgType: this.$exportOption.value,
            quality: this.value,
            includeBg: this.$includeBg.checked,
            frameId: this.$region.value
          }
        })
        this.dispatchEvent(triggerEvent)
        document.getElementById('se-export-dialog').setAttribute('dialog', 'close')
      }
    }
    const onChangeHandler = (e) => {
      const isPDF = e.target.value === 'PDF'
      this.$qualityCont.style.display = isPDF ? 'none' : 'block'
      this.$includeBgLabel.style.display = isPDF ? 'none' : 'flex'
    }
    svgEditor.$click(this.$okBtn, (evt) => onSubmitHandler(evt, 'ok'))
    svgEditor.$click(this.$cancelBtn, (evt) => onSubmitHandler(evt, 'cancel'))
    this.$exportOption.addEventListener('change', (evt) => onChangeHandler(evt))
  }
}

// Register
customElements.define('se-export-dialog', SeExportDialog)
