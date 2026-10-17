// seTraceDialog.ts — `<se-trace-dialog>` — options for tracing a raster image to vector (style, colors) before `traceImageToSvg` runs
import traceDialogHTML from './seTraceDialog.html'
import { requireOwnerEditor } from '../domScope.ts'
import { $click } from '@svgedit/svgcanvas/core/dom-utils.ts'
import { syncDialogTheme } from '../themeUtil.ts'

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
  _shadowRoot: ShadowRoot
  $dialog: HTMLDialogElement
  $title: HTMLParagraphElement
  $closeBtn: HTMLButtonElement
  $presetLabel: HTMLLabelElement
  $preset: HTMLSelectElement
  $colorsLabel: HTMLLabelElement
  $colorsField: HTMLDivElement
  $colors: HTMLInputElement
  $colorsVal: HTMLSpanElement
  $error: HTMLDivElement
  $cancelBtn: HTMLButtonElement
  $okBtn: HTMLButtonElement

  /** the `<image>` to trace (set by `RightPanel.openTraceDialog`) */ _targetImage: Element | undefined

  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dialog = (this._shadowRoot.querySelector('#trace_box') as HTMLDialogElement)
    this.$title = (this._shadowRoot.querySelector('#trace_title') as HTMLParagraphElement)
    this.$closeBtn = (this._shadowRoot.querySelector('#trace_close') as HTMLButtonElement)
    this.$presetLabel = (this._shadowRoot.querySelector('#trace_preset_label') as HTMLLabelElement)
    this.$preset = (this._shadowRoot.querySelector('#trace_preset') as HTMLSelectElement)
    this.$colorsLabel = (this._shadowRoot.querySelector('#trace_colors_label') as HTMLLabelElement)
    this.$colorsField = (this._shadowRoot.querySelector('#trace_colors_field') as HTMLDivElement)
    this.$colors = (this._shadowRoot.querySelector('#trace_colors') as HTMLInputElement)
    this.$colorsVal = (this._shadowRoot.querySelector('#trace_colors_val') as HTMLSpanElement)
    this.$error = (this._shadowRoot.querySelector('#trace_error') as HTMLDivElement)
    this.$cancelBtn = (this._shadowRoot.querySelector('#trace_cancel') as HTMLButtonElement)
    this.$okBtn = (this._shadowRoot.querySelector('#trace_ok') as HTMLButtonElement)
  }

  init (i18next: import('i18next').i18n): void {
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

  attributeChangedCallback (name: string, oldValue: string, newValue: string): void {
    switch (name) {
      case 'dialog':
        if (newValue === 'open') {
          this.reset()
          // Mirror the editor's active theme so the shadow tokens resolve.
          syncDialogTheme(this)
          this.$dialog.showModal()
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
    this.setAttribute('dialog', String(value))
  }

  /** Clear transient state back to a ready-to-convert dialog. */
  reset (): void {
    this.$error.classList.remove('show')
    this.$okBtn.disabled = false
    this.$colorsVal.textContent = this.$colors.value
    this.syncPreset()
  }

  /** The centerline style makes stroked paths in the ink's own colours, so the palette size does not apply. */
  syncPreset (): void {
    this.$colorsField.hidden = this.$preset.value === 'centerline'
  }

  /** Toggle the converting/busy state (disables Convert, swaps its label). */
  setBusy (busy: boolean): void {
    this.$okBtn.disabled = busy
    this.$okBtn.textContent = busy
      ? requireOwnerEditor(this).i18next.t('tools.trace_working')
      : requireOwnerEditor(this).i18next.t('tools.trace_convert')
  }

  /** Show an inline error message and re-enable Convert. */
  showError (msg: string): void {
    this.$error.textContent = msg
    this.$error.classList.add('show')
    this.setBusy(false)
  }

  connectedCallback (): void {
    const close = () => this.setAttribute('dialog', 'close')

    this.$preset.addEventListener('change', () => this.syncPreset())
    this.$colors.addEventListener('input', () => {
      this.$colorsVal.textContent = this.$colors.value
    })

    $click(this.$cancelBtn, close)
    $click(this.$closeBtn, close)
    $click(this.$okBtn, () => {
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
