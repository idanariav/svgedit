import editorPreferencesDialog from './editorPreferencesDialog.html'
import { $click } from '@svgedit/svgcanvas/core/dom-utils.js'
import { syncDialogTheme } from '../themeUtil.js'
import { dialogSkin } from './dialogSkin.css.js'
const template = document.createElement('template')
template.innerHTML = `<style>${dialogSkin('#svg_prefs_container')}</style>${editorPreferencesDialog}`
/**
 * @class SeEditPrefsDialog
 */
export class SeEditPrefsDialog extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dialog = this._shadowRoot.querySelector('#svg_prefs')
    this.$saveBtn = this._shadowRoot.querySelector('#tool_prefs_save')
    this.$cancelBtn = this._shadowRoot.querySelector('#tool_prefs_cancel')
    this.$showRulers = this._shadowRoot.querySelector('#show_rulers')
    this.$baseUnit = this._shadowRoot.querySelector('#base_unit')
    this.$theme = this._shadowRoot.querySelector('#theme_select')
    this.$scrub = this._shadowRoot.querySelector('#scrub_fields')
    this.$selectSame = this._shadowRoot.querySelector('#select_same_tolerance')
    this.$pencilStabilization = this._shadowRoot.querySelector('#pencil_stabilization')
    this.$pencilFidelity = this._shadowRoot.querySelector('#pencil_fidelity')
  }

  /**
   * @function init
   * @param {any} name
   * @returns {void}
   */
  init (i18next) {
    this.setAttribute('common-ok', i18next.t('common.ok'))
    this.setAttribute('common-cancel', i18next.t('common.cancel'))
    this.setAttribute('config-editor_prefs', i18next.t('config.editor_prefs'))
    this.setAttribute('config-theme', i18next.t('config.theme'))
    this.setAttribute('config-show_rulers', i18next.t('config.show_rulers'))
    this.setAttribute('config-base_unit', i18next.t('config.base_unit'))
    this.setAttribute('config-scrub_fields', i18next.t('config.scrub_fields'))
    this.setAttribute('config-select_same_tolerance', i18next.t('config.select_same_tolerance'))
    this.setAttribute('config-pencil_stabilization', i18next.t('config.pencil_stabilization'))
    this.setAttribute('config-pencil_fidelity', i18next.t('config.pencil_fidelity'))
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    // eslint-disable-next-line max-len
    return ['dialog', 'showrulers', 'baseunit', 'theme', 'common-ok', 'common-cancel', 'config-editor_prefs', 'config-theme', 'config-show_rulers', 'config-base_unit', 'config-scrub_fields', 'config-select_same_tolerance', 'config-pencil_stabilization', 'config-pencil_fidelity']
  }

  /**
   * @function attributeChangedCallback
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   * @returns {void}
   */
  attributeChangedCallback (name, oldValue, newValue) {
    if (oldValue === newValue) return
    let node
    switch (name) {
      case 'dialog':
        if (newValue === 'open') {
          // Mirror the editor's theme onto the host (svgedit.css lists this element
          // in its token blocks; the dialog is mounted outside `.svg_editor`).
          syncDialogTheme(this)
          this.$dialog.showModal()
        } else {
          this.$dialog.close()
        }
        break
      case 'showrulers':
        if (newValue === 'true') {
          this.$showRulers.checked = true
        } else if (newValue === 'false') {
          this.$showRulers.checked = false
        }
        break
      case 'baseunit':
        this.$baseUnit.value = newValue
        break
      case 'common-ok':
        this.$saveBtn.textContent = newValue
        break
      case 'common-cancel':
        this.$cancelBtn.textContent = newValue
        break
      case 'config-editor_prefs':
        node = this._shadowRoot.querySelector('#svginfo_editor_prefs')
        node.textContent = newValue
        break
      case 'theme':
        this.$theme.value = newValue
        break
      case 'config-theme':
        node = this._shadowRoot.querySelector('#svginfo_theme')
        node.textContent = newValue
        break
      case 'config-show_rulers':
        node = this._shadowRoot.querySelector('#svginfo_rulers_onoff')
        node.textContent = newValue
        break
      case 'config-base_unit':
        node = this._shadowRoot.querySelector('#svginfo_unit')
        node.textContent = newValue
        break
      case 'config-select_same_tolerance':
        node = this._shadowRoot.querySelector('#svginfo_select_same')
        node.textContent = newValue
        break
      case 'config-pencil_stabilization':
        node = this._shadowRoot.querySelector('#svginfo_pencil_stabilization')
        node.textContent = newValue
        break
      case 'config-pencil_fidelity':
        node = this._shadowRoot.querySelector('#svginfo_pencil_fidelity')
        node.textContent = newValue
        break
      case 'config-scrub_fields':
        node = this._shadowRoot.querySelector('#svginfo_scrub')
        node.textContent = newValue
        break
      default:
        super.attributeChangedCallback(name, oldValue, newValue)
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
   * @function get
   * @returns {any}
   */
  get showrulers () {
    return this.getAttribute('showrulers')
  }

  /**
   * @function set
   * @returns {void}
   */
  set showrulers (value) {
    this.setAttribute('showrulers', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get baseunit () {
    return this.getAttribute('baseunit')
  }

  /**
   * @function set
   * @returns {void}
   */
  set baseunit (value) {
    this.setAttribute('baseunit', value)
  }

  /**
   * Whether dragging a numeric field's label changes it (the checkbox; set on open, so a
   * cancelled edit never leaves a stale tick).
   * @param {boolean} on
   * @returns {void}
   */
  set scrubFields (on) {
    this.$scrub.checked = Boolean(on)
  }

  get scrubFields () {
    return this.$scrub.checked
  }

  /**
   * "Select same" colour tolerance shown in the field (0 = exact).
   * @param {number} value
   * @returns {void}
   */
  set selectSameTolerance (value) {
    this.$selectSame.value = String(Number.isFinite(Number(value)) ? value : 0)
  }

  get selectSameTolerance () {
    const value = parseFloat(this.$selectSame.value)
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
  }

  /**
   * Pencil stabilisation shown in the field, in percent (0-95).
   * @param {number} value
   * @returns {void}
   */
  set pencilStabilization (value) {
    this.$pencilStabilization.value = String(Number.isFinite(Number(value)) ? value : 30)
  }

  get pencilStabilization () {
    const value = parseFloat(this.$pencilStabilization.value)
    return Number.isFinite(value) ? Math.min(95, Math.max(0, value)) : 30
  }

  /**
   * Pencil fidelity shown in the field, in user units (0.5-10).
   * @param {number} value
   * @returns {void}
   */
  set pencilFidelity (value) {
    this.$pencilFidelity.value = String(Number.isFinite(Number(value)) ? value : 2)
  }

  get pencilFidelity () {
    const value = parseFloat(this.$pencilFidelity.value)
    return Number.isFinite(value) ? Math.min(10, Math.max(0.5, value)) : 2
  }

  /**
   * @function connectedCallback
   * @returns {void}
   */
  connectedCallback () {
    const onCancelHandler = () => {
      const closeEvent = new CustomEvent('change', {
        detail: {
          dialog: 'closed'
        }
      })
      this.dispatchEvent(closeEvent)
    }
    const onSaveHandler = () => {
      const closeEvent = new CustomEvent('change', {
        detail: {
          dialog: 'close',
          showrulers: this.$showRulers.checked,
          baseunit: this.$baseUnit.value,
          theme: this.$theme.value,
          scrubfields: this.$scrub.checked,
          selectsametolerance: this.selectSameTolerance,
          pencilstabilization: this.pencilStabilization,
          pencilfidelity: this.pencilFidelity
        }
      })
      this.dispatchEvent(closeEvent)
    }
    $click(this.$saveBtn, onSaveHandler)
    $click(this.$cancelBtn, onCancelHandler)
    this.$dialog.addEventListener('close', onCancelHandler)
  }
}

// Register
customElements.define('se-edit-prefs-dialog', SeEditPrefsDialog)
