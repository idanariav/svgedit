// imagePropertiesDialog.ts — Modal for image element properties
import { requireOwnerEditor } from '../domScope.ts'
import { $click } from '@svgedit/svgcanvas/core/dom-utils.ts'
import imagePropertiesDialogHTML from './imagePropertiesDialog.html'
import { syncDialogTheme } from '../themeUtil.ts'
import { dialogSkin } from './dialogSkin.css.js'

const template = document.createElement('template')
template.innerHTML = `<style>${dialogSkin('#svg_docprops_container')}</style>${imagePropertiesDialogHTML}`
/**
 * @class SeImgPropDialog
 */
export class SeImgPropDialog extends HTMLElement {
  eventlisten: boolean
  _shadowRoot: ShadowRoot
  $saveBtn: HTMLButtonElement
  $cancelBtn: HTMLButtonElement
  $resolution: HTMLSelectElement
  $canvasTitle: HTMLInputElement
  $canvasWidth: HTMLInputElement
  $canvasHeight: HTMLInputElement
  $imageOptEmbed: HTMLInputElement
  $imageOptRef: HTMLInputElement
  $dialog: HTMLDialogElement

  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this.eventlisten = false
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$saveBtn = (this._shadowRoot.querySelector('#tool_docprops_save') as HTMLButtonElement)
    this.$cancelBtn = (this._shadowRoot.querySelector('#tool_docprops_cancel') as HTMLButtonElement)
    this.$resolution = (this._shadowRoot.querySelector('#resolution') as HTMLSelectElement)
    this.$canvasTitle = (this._shadowRoot.querySelector('#canvas_title') as HTMLInputElement)
    this.$canvasWidth = (this._shadowRoot.querySelector('#canvas_width') as HTMLInputElement)
    this.$canvasHeight = (this._shadowRoot.querySelector('#canvas_height') as HTMLInputElement)
    this.$imageOptEmbed = (this._shadowRoot.querySelector('#image_embed') as HTMLInputElement)
    this.$imageOptRef = (this._shadowRoot.querySelector('#image_ref') as HTMLInputElement)
    this.$dialog = (this._shadowRoot.querySelector('#svg_docprops') as HTMLDialogElement)
  }

  /** @function init */
  init (i18next: import('i18next').i18n): void {
    this.setAttribute('common-ok', i18next.t('common.ok'))
    this.setAttribute('common-cancel', i18next.t('common.cancel'))
    this.setAttribute('config-image_props', i18next.t('config.image_props'))
    this.setAttribute('config-doc_title', i18next.t('config.doc_title'))
    this.setAttribute('config-doc_dims', i18next.t('config.doc_dims'))
    this.setAttribute('common-width', i18next.t('common.width'))
    this.setAttribute('common-height', i18next.t('common.height'))
    this.setAttribute('config-select_predefined', i18next.t('config.select_predefined'))
    this.setAttribute('tools-fit-to-content', i18next.t('tools.fitToContent'))
    this.setAttribute('config-included_images', i18next.t('config.included_images'))
    this.setAttribute('config-image_opt_embed', i18next.t('config.image_opt_embed'))
    this.setAttribute('config-image_opt_ref', i18next.t('config.image_opt_ref'))
  }

  /**
   * @function observedAttributes
 * @returns observed
   */
  static get observedAttributes (): any {
    return ['title', 'width', 'height', 'save', 'dialog', 'embed', 'common-ok',
      'common-cancel', 'config-image_props', 'config-doc_title', 'config-doc_dims',
      'common-width', 'common-height', 'config-select_predefined',
      'tools-fit-to-content', 'config-included_images', 'config-image_opt_embed',
      'config-image_opt_ref']
  }

  /** @function attributeChangedCallback */
  attributeChangedCallback (name: string, oldValue: string, newValue: string): void {
    if (oldValue === newValue) return
    let node
    switch (name) {
      case 'title':
        this.$canvasTitle.value = newValue
        break
      case 'width':
        if (newValue === 'fit') {
          this.$canvasWidth.removeAttribute('disabled')
          this.$canvasWidth.value = '100'
          this.$canvasHeight.removeAttribute('disabled')
          this.$canvasHeight.value = '100'
        } else {
          this.$canvasWidth.value = newValue
        }
        break
      case 'height':
        if (newValue === 'fit') {
          this.$canvasWidth.removeAttribute('disabled')
          this.$canvasWidth.value = '100'
          this.$canvasHeight.removeAttribute('disabled')
          this.$canvasHeight.value = '100'
        } else {
          this.$canvasHeight.value = newValue
        }
        break
      case 'dialog':
        if (this.eventlisten) {
          if (newValue === 'open') {
            syncDialogTheme(this)
            this.$dialog.showModal()
          } else {
            this.$dialog.close()
          }
        }
        break
      case 'save':
        if (newValue === 'ref') {
          this.$imageOptEmbed.setAttribute('checked', 'false')
          this.$imageOptRef.setAttribute('checked', 'true')
        } else {
          this.$imageOptEmbed.setAttribute('checked', 'true')
          this.$imageOptRef.setAttribute('checked', 'false')
        }
        break
      case 'embed':
        if (newValue.includes('one')) {
          const data = newValue.split('|')
          if (data.length > 1) {
            ;(this._shadowRoot.querySelector('#image_opt_embed') as HTMLSpanElement).setAttribute('title', data[1])
            ;(this._shadowRoot.querySelector('#image_opt_embed') as HTMLSpanElement).setAttribute('disabled', 'disabled')
            ;(this._shadowRoot.querySelector('#image_opt_embed') as HTMLSpanElement).style.color = '#666'
          }
        }
        break
      case 'common-ok':
        this.$saveBtn.textContent = newValue
        break
      case 'common-cancel':
        this.$cancelBtn.textContent = newValue
        break
      case 'config-image_props':
        node = (this._shadowRoot.querySelector('#svginfo_image_props') as HTMLElement)
        node.textContent = newValue
        break
      case 'config-doc_title':
        node = (this._shadowRoot.querySelector('#svginfo_title') as HTMLSpanElement)
        node.textContent = newValue
        break
      case 'config-doc_dims':
        node = (this._shadowRoot.querySelector('#svginfo_dim') as HTMLElement)
        node.textContent = newValue
        break
      case 'common-width':
        node = (this._shadowRoot.querySelector('#svginfo_width') as HTMLSpanElement)
        node.textContent = newValue
        break
      case 'common-height':
        node = (this._shadowRoot.querySelector('#svginfo_height') as HTMLSpanElement)
        node.textContent = newValue
        break
      case 'config-select_predefined':
        node = (this._shadowRoot.querySelector('#selectedPredefined') as HTMLOptionElement)
        node.textContent = newValue
        break
      case 'tools-fit-to-content':
        node = (this._shadowRoot.querySelector('#fitToContent') as HTMLOptionElement)
        node.textContent = newValue
        break
      case 'config-included_images':
        node = (this._shadowRoot.querySelector('#includedImages') as HTMLElement)
        node.textContent = newValue
        break
      case 'config-image_opt_embed':
        node = (this._shadowRoot.querySelector('#image_opt_embed') as HTMLSpanElement)
        node.textContent = newValue
        break
      case 'config-image_opt_ref':
        node = (this._shadowRoot.querySelector('#image_opt_ref') as HTMLSpanElement)
        node.textContent = newValue
        break
      default:
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
  get width (): any {
    return this.getAttribute('width')
  }

  /** @function set */
  set width (value) {
    this.setAttribute('width', value)
  }

  /** @function get */
  get height (): any {
    return this.getAttribute('height')
  }

  /** @function set */
  set height (value) {
    this.setAttribute('height', value)
  }

  /** @function get */
  get save (): any {
    return this.getAttribute('save')
  }

  /** @function set */
  set save (value) {
    this.setAttribute('save', value)
  }

  /** @function get */
  get dialog (): any {
    return this.getAttribute('dialog')
  }

  /** @function set */
  set dialog (value) {
    this.setAttribute('dialog', value)
  }

  /** @function get */
  get embed (): any {
    return this.getAttribute('embed')
  }

  /** @function set */
  set embed (value) {
    this.setAttribute('embed', value)
  }

  /** @function connectedCallback */
  connectedCallback (): void {
    const onChangeHandler = (ev: Event) => {
      const target = ev.target as HTMLSelectElement
      if (!target.selectedIndex) {
        if (this.$canvasWidth.value === 'fit') {
          this.$canvasWidth.removeAttribute('disabled')
          this.$canvasWidth.value = '100'
          this.$canvasHeight.removeAttribute('disabled')
          this.$canvasHeight.value = '100'
        }
      } else if (target.value === 'content') {
        this.$canvasWidth.setAttribute('disabled', 'disabled')
        this.$canvasWidth.value = 'fit'
        this.$canvasHeight.setAttribute('disabled', 'disabled')
        this.$canvasHeight.value = 'fit'
      } else {
        const dims = target.value.split('x')
        this.$canvasWidth.value = dims[0]
        this.$canvasWidth.removeAttribute('disabled')
        this.$canvasHeight.value = dims[1]
        this.$canvasHeight.removeAttribute('disabled')
      }
    }
    const onSaveHandler = () => {
      let saveOpt = ''
      const w = this.$canvasWidth.value
      const h = this.$canvasHeight.value
      if (w !== 'fit' && !requireOwnerEditor(this).svgCanvas.isValidUnit('width', w)) {
        this.$canvasWidth.parentElement?.classList.add('error')
      } else {
        this.$canvasWidth.parentElement?.classList.remove('error')
      }
      if (h !== 'fit' && !requireOwnerEditor(this).svgCanvas.isValidUnit('height', h)) {
        this.$canvasHeight.parentElement?.classList.add('error')
      } else {
        this.$canvasHeight.parentElement?.classList.remove('error')
      }
      if (this.$imageOptEmbed.getAttribute('checked') === 'true') {
        saveOpt = 'embed'
      }
      if (this.$imageOptRef.getAttribute('checked') === 'true') {
        saveOpt = 'ref'
      }
      const closeEvent = new CustomEvent('change', {
        detail: {
          title: this.$canvasTitle.value,
          w: this.$canvasWidth.value,
          h: this.$canvasHeight.value,
          save: saveOpt,
          dialog: 'close'
        }
      })
      this.$canvasWidth.removeAttribute('disabled')
      this.$canvasHeight.removeAttribute('disabled')
      this.$resolution.selectedIndex = 0
      this.dispatchEvent(closeEvent)
    }
    const onCancelHandler = () => {
      const closeEvent = new CustomEvent('change', {
        detail: {
          dialog: 'closed'
        }
      })
      this.$canvasWidth.removeAttribute('disabled')
      this.$canvasHeight.removeAttribute('disabled')
      this.$resolution.selectedIndex = 0
      this.dispatchEvent(closeEvent)
    }
    this.$resolution.addEventListener('change', onChangeHandler)
    $click(this.$saveBtn, onSaveHandler)
    $click(this.$cancelBtn, onCancelHandler)
    this.$dialog.addEventListener('close', onCancelHandler)
    this.eventlisten = true
  }
}

// Register
customElements.define('se-img-prop-dialog', SeImgPropDialog)
