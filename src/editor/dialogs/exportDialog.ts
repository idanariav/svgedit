// exportDialog.ts — Export dialog (region, format, scale 1–4×, quality for JPEG/WebP, output-size preview)
import exportDialogHTML from './exportDialog.html'
import { ownerEditor } from '../domScope.ts'
import { $click } from '@svgedit/svgcanvas/core/dom-utils.ts'
import { syncDialogTheme } from '../themeUtil.ts'
import { dialogSkin } from './dialogSkin.css.js'
import type { SESpinInput } from '../components/seSpinInput.ts'
import type { SeSelect } from '../components/seSelect.ts'
const template = document.createElement('template')
template.innerHTML = `<style>${dialogSkin('#dialog_container')}</style>${exportDialogHTML}`
/**
 * @class SeExportDialog
 */
export class SeExportDialog extends HTMLElement {
  _shadowRoot: ShadowRoot
  $dialog: HTMLDialogElement
  $okBtn: HTMLButtonElement
  $cancelBtn: HTMLButtonElement
  $exportOption: SeSelect
  $region: SeSelect
  $input: SESpinInput
  $includeBg: HTMLInputElement
  $scale: SeSelect
  $qualityRow: HTMLDivElement
  $summary: HTMLParagraphElement
  value: number | string

  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dialog = (this._shadowRoot.querySelector('#export_box') as HTMLDialogElement)
    this.$okBtn = (this._shadowRoot.querySelector('#export_ok') as HTMLButtonElement)
    this.$cancelBtn = (this._shadowRoot.querySelector('#export_cancel') as HTMLButtonElement)
    this.$exportOption = (this._shadowRoot.querySelector('#se-storage-pref') as HTMLElementTagNameMap['se-select'])
    this.$region = (this._shadowRoot.querySelector('#se-export-region') as HTMLElementTagNameMap['se-select'])
    this.$input = (this._shadowRoot.querySelector('#se-quality') as HTMLElementTagNameMap['se-spin-input'])
    this.$includeBg = (this._shadowRoot.querySelector('#se-include-bg') as HTMLInputElement)
    this.$scale = (this._shadowRoot.querySelector('#se-scale') as HTMLElementTagNameMap['se-select'])
    this.$qualityRow = (this._shadowRoot.querySelector('#se-quality-row') as HTMLDivElement)
    this.$summary = (this._shadowRoot.querySelector('#export_summary') as HTMLParagraphElement)
    this.value = 1
  }

  /** @function init */
  init (i18next: import('i18next').i18n): void {
    this.setAttribute('common-ok', i18next.t('common.ok'))
    this.setAttribute('common-cancel', i18next.t('common.cancel'))
    this.setAttribute('ui-export_type_label', i18next.t('ui.export_type_label'))
    this.value = 100
  }

  /**
   * @function observedAttributes
 * @returns observed
   */
  static get observedAttributes (): string[] {
    return ['dialog', 'common-ok', 'common-cancel', 'ui-export_type_label']
  }

  /** @function attributeChangedCallback */
  attributeChangedCallback (name: string, oldValue: string, newValue: string): void {
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
        node = (this._shadowRoot.querySelector('#export_select') as HTMLSpanElement)
        if (node) node.title = newValue
        break
      default:
      // super.attributeChangedCallback(name, oldValue, newValue);
        break
    }
  }

  /** @function get */
  get dialog (): string | null {
    return this.getAttribute('dialog')
  }

  /** @function set */
  set dialog (value: string | number) {
    this.setAttribute('dialog', String(value))
  }

  /**
   * Rebuild the region dropdown from the frames currently on the canvas. Each
   * frame is a `[data-frame]` rect; its label is its `<title>` (fallback
   * "Frame N"). "Whole canvas" (value "") is always first. If a frame is
   * currently selected it is pre-selected.
   */
  _populateRegions (): void {
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

  /** Pixel size of the selected region (a frame's bounds, else the whole canvas). */
  _regionSize (): { w: number, h: number } | null {
    const canvas = ownerEditor(this)?.svgCanvas
    const frameId = this.$region.value
    if (frameId) {
      const frame = canvas?.getSvgContent?.()?.querySelector(`#${CSS.escape(frameId)}`)
      const w = parseFloat(frame?.getAttribute('width') ?? '')
      const h = parseFloat(frame?.getAttribute('height') ?? '')
      if (w > 0 && h > 0) return { w, h }
    }
    const res = canvas?.getResolution?.()
    return res ? { w: res.w, h: res.h } : null
  }

  /**
   * Show Quality only for the lossy formats that use it, and update the
   * "W × H px" output-size summary.
   */
  _refresh (): void {
    const type = this.$exportOption.value
    this.$qualityRow.hidden = !(type === 'JPEG' || type === 'WEBP')
    const size = this._regionSize()
    const scale = Number(this.$scale.value) || 1
    this.$summary.textContent = size
      ? `${Math.round(size.w * scale)} × ${Math.round(size.h * scale)} px`
      : ''
  }

  /** @function connectedCallback */
  connectedCallback (): void {
    ;[this.$exportOption, this.$scale, this.$region].forEach((el) =>
      el.addEventListener('change', () => this._refresh()))
    this.$input.addEventListener('change', (e) => {
      e.preventDefault()
      this.value = (e.target as HTMLInputElement).value
    })
    $click(this.$input, (e) => {
      e.preventDefault()
      this.value = (e.target as HTMLInputElement).value
    })
    const onSubmitHandler = (e: Event, action: string) => {
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
