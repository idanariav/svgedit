import exportDialogHTML from './exportDialog.html'
import { ownerEditor } from '../domScope.js'
import { $click } from '@svgedit/svgcanvas/core/dom-utils.js'
import { syncDialogTheme } from '../themeUtil.js'
import { dialogSkin } from './dialogSkin.css.js'
const template = document.createElement('template')
template.innerHTML = `<style>${dialogSkin('#dialog_container')}</style>${exportDialogHTML}`
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
    this.$input = this._shadowRoot.querySelector('#se-quality')
    this.$includeBg = this._shadowRoot.querySelector('#se-include-bg')
    this.$scale = this._shadowRoot.querySelector('#se-scale')
    this.$qualityRow = this._shadowRoot.querySelector('#se-quality-row')
    this.$summary = this._shadowRoot.querySelector('#export_summary')
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
          this._refresh()
          syncDialogTheme(this)
          this.$dialog.showModal()
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
        // Kept for API compatibility; the Format row now has a fixed short label.
        node = this._shadowRoot.querySelector('#export_select')
        node.title = newValue
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

    const canvas = ownerEditor(this)?.svgCanvas
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
   * Pixel size of the selected region (a frame's bounds, else the whole canvas).
   * @returns {?{w:number, h:number}}
   */
  _regionSize () {
    const canvas = ownerEditor(this)?.svgCanvas
    const frameId = this.$region.value
    if (frameId) {
      const frame = canvas?.getSvgContent?.()?.querySelector(`#${CSS.escape(frameId)}`)
      const w = parseFloat(frame?.getAttribute('width'))
      const h = parseFloat(frame?.getAttribute('height'))
      if (w > 0 && h > 0) return { w, h }
    }
    const res = canvas?.getResolution?.()
    return res ? { w: res.w, h: res.h } : null
  }

  /**
   * Show Quality only for the lossy formats that use it, and update the
   * "W × H px" output-size summary.
   * @returns {void}
   */
  _refresh () {
    const type = this.$exportOption.value
    this.$qualityRow.hidden = !(type === 'JPEG' || type === 'WEBP')
    const size = this._regionSize()
    const scale = Number(this.$scale.value) || 1
    this.$summary.textContent = size
      ? `${Math.round(size.w * scale)} × ${Math.round(size.h * scale)} px`
      : ''
  }

  /**
   * @function connectedCallback
   * @returns {void}
   */
  connectedCallback () {
    ;[this.$exportOption, this.$scale, this.$region].forEach((el) =>
      el.addEventListener('change', () => this._refresh()))
    this.$input.addEventListener('change', (e) => {
      e.preventDefault()
      this.value = e.target.value
    })
    $click(this.$input, (e) => {
      e.preventDefault()
      this.value = e.target.value
    })
    const onSubmitHandler = (e, action) => {
      if (action === 'cancel') {
        this.setAttribute('dialog', 'close')
      } else {
        const triggerEvent = new CustomEvent('change', {
          detail: {
            trigger: action,
            imgType: this.$exportOption.value,
            quality: this.value,
            includeBg: this.$includeBg.checked,
            scale: Number(this.$scale.value) || 1,
            frameId: this.$region.value
          }
        })
        this.dispatchEvent(triggerEvent)
        this.setAttribute('dialog', 'close')
      }
    }
    $click(this.$okBtn, (evt) => onSubmitHandler(evt, 'ok'))
    $click(this.$cancelBtn, (evt) => onSubmitHandler(evt, 'cancel'))
  }
}

// Register
customElements.define('se-export-dialog', SeExportDialog)
