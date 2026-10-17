// svgSourceDialog.ts — View/edit raw SVG source
import svgSourceDialogHTML from './svgSourceDialog.html'
import { requireOwnerEditor } from '../domScope.ts'
import { $click } from '@svgedit/svgcanvas/core/dom-utils.ts'
import { syncDialogTheme } from '../themeUtil.ts'
import { dialogSkin } from './dialogSkin.css.js'

const template = document.createElement('template')
template.innerHTML = `<style>${dialogSkin('#svg_source_container')}</style>${svgSourceDialogHTML}`
/**
 * @class SeSvgSourceEditorDialog
 */
export class SeSvgSourceEditorDialog extends HTMLElement {
  _shadowRoot: ShadowRoot
  $dialog: HTMLDialogElement
  $copyBtn: HTMLButtonElement
  $saveBtn: HTMLButtonElement
  $cancelBtn: HTMLButtonElement
  $sourceTxt: HTMLTextAreaElement
  $copySec: HTMLDivElement
  $applySec: HTMLDivElement
  $toggleDynamic: HTMLInputElement

  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dialog = (this._shadowRoot.querySelector('#svg_source_editor') as HTMLDialogElement)
    this.$copyBtn = (this._shadowRoot.querySelector('#copy_save_done') as HTMLButtonElement)
    this.$saveBtn = (this._shadowRoot.querySelector('#tool_source_save') as HTMLButtonElement)
    this.$cancelBtn = (this._shadowRoot.querySelector('#tool_source_cancel') as HTMLButtonElement)
    this.$sourceTxt = (this._shadowRoot.querySelector('#svg_source_textarea') as HTMLTextAreaElement)
    this.$copySec = (this._shadowRoot.querySelector('#save_output_btns') as HTMLDivElement)
    this.$applySec = (this._shadowRoot.querySelector('#tool_source_back') as HTMLDivElement)
    this.$toggleDynamic = (this._shadowRoot.querySelector('#tool_source_dynamic') as HTMLInputElement)
    this.$toggleDynamic.checked = requireOwnerEditor(this).configObj.curConfig.dynamicOutput
  }

  /** @function init */
  init (i18next: import('i18next').i18n): void {
    this.setAttribute('tools-source_save', i18next.t('tools.source_save'))
    this.setAttribute('common-cancel', i18next.t('common.cancel'))
    this.setAttribute('notification-source_dialog_note', i18next.t('notification.source_dialog_note'))
    this.setAttribute('config-done', i18next.t('config.done'))
  }

  /**
   * @function observedAttributes
 * @returns observed
   */
  static get observedAttributes (): string[] {
    return ['dialog', 'value', 'applysec', 'copysec', 'tools-source_save', 'common-cancel', 'notification-source_dialog_note', 'config-done']
  }

  /** @function attributeChangedCallback */
  attributeChangedCallback (name: string, oldValue: string, newValue: string): void {
    if (oldValue === newValue) return
    let node
    switch (name) {
      case 'dialog':
        if (newValue === 'open') {
          // showModal() auto-focuses the first focusable descendant (the Save
          // button, here) — explicitly re-focus the textarea after so typing
          // can start immediately, same intent as before.
          syncDialogTheme(this)
          this.$dialog.showModal()
          this.$sourceTxt.focus()
        } else {
          this.$dialog.close()
          this.$sourceTxt.blur()
        }
        break
      case 'applysec':
        if (newValue === 'false') {
          this.$applySec.style.display = 'none'
        } else {
          this.$applySec.style.display = 'block'
        }
        break
      case 'copysec':
        if (newValue === 'false') {
          this.$copySec.style.display = 'none'
        } else {
          this.$copySec.style.display = 'block'
        }
        break
      case 'value':
        this.$sourceTxt.value = newValue
        break
      case 'tools-source_save':
        this.$saveBtn.textContent = newValue
        break
      case 'common-cancel':
        this.$cancelBtn.textContent = newValue
        break
      case 'notification-source_dialog_note':
        node = (this._shadowRoot.querySelector('#copy_save_note') as HTMLParagraphElement)
        if (node) node.textContent = newValue
        break
      case 'config-done':
        this.$copyBtn.textContent = newValue
        break
      default:
        break
    }
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
  get value (): any {
    return this.getAttribute('value')
  }

  /** @function set */
  set value (value) {
    this.setAttribute('value', value)
  }

  /** @function get */
  get applysec (): any {
    return this.getAttribute('applysec')
  }

  /** @function set */
  set applysec (value) {
    this.setAttribute('applysec', value)
  }

  /** @function get */
  get copysec (): any {
    return this.getAttribute('copysec')
  }

  /** @function set */
  set copysec (value) {
    this.setAttribute('copysec', value)
  }

  /** @function connectedCallback */
  connectedCallback (): void {
    const onCancelHandler = () => {
      const closeEvent = new CustomEvent('change', {
        detail: {
          dialog: 'closed'
        }
      })
      this.dispatchEvent(closeEvent)
    }
    const onCopyHandler = () => {
      const closeEvent = new CustomEvent('change', {
        detail: {
          copy: 'click',
          value: this.$sourceTxt.value
        }
      })
      this.dispatchEvent(closeEvent)
    }
    const onSaveHandler = () => {
      const closeEvent = new CustomEvent('change', {
        detail: {
          value: this.$sourceTxt.value,
          dialog: 'close'
        }
      })
      this.dispatchEvent(closeEvent)
    }
    const onToggleDynamicHandler = () => {
      const closeEvent = new CustomEvent('change', {
        detail: {
          dynamic: this.$toggleDynamic.checked,
          dialog: 'dynamic'
        }
      })
      this.dispatchEvent(closeEvent)
    }
    $click(this.$copyBtn, onCopyHandler)
    $click(this.$saveBtn, onSaveHandler)
    $click(this.$cancelBtn, onCancelHandler)
    $click(this.$toggleDynamic, onToggleDynamicHandler)
    this.$dialog.addEventListener('close', onCancelHandler)
  }
}

// Register
customElements.define('se-svg-source-editor-dialog', SeSvgSourceEditorDialog)
