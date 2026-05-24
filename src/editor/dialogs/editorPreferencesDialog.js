/* globals svgEditor */
import editorPreferencesDialog from './editorPreferencesDialog.html'
const template = document.createElement('template')
template.innerHTML = editorPreferencesDialog
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
    this.$langSelect = this._shadowRoot.querySelector('#lang_select')
    this.$gridSnappingOn = this._shadowRoot.querySelector('#grid_snapping_on')
    this.$gridSnappingStep = this._shadowRoot.querySelector('#grid_snapping_step')
    this.$gridColor = this._shadowRoot.querySelector('#grid_color')
    this.$showRulers = this._shadowRoot.querySelector('#show_rulers')
    this.$baseUnit = this._shadowRoot.querySelector('#base_unit')
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
    this.setAttribute('config-language', i18next.t('config.language'))
    this.setAttribute('config-grid', i18next.t('config.grid'))
    this.setAttribute('config-snapping_onoff', i18next.t('config.snapping_onoff'))
    this.setAttribute('config-snapping_stepsize', i18next.t('config.snapping_stepsize'))
    this.setAttribute('config-grid_color', i18next.t('config.grid_color'))
    this.setAttribute('config-units_and_rulers', i18next.t('config.units_and_rulers'))
    this.setAttribute('config-show_rulers', i18next.t('config.show_rulers'))
    this.setAttribute('config-base_unit', i18next.t('config.base_unit'))
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    // eslint-disable-next-line max-len
    return ['dialog', 'lang', 'gridsnappingon', 'gridsnappingstep', 'gridcolor', 'showrulers', 'baseunit', 'common-ok', 'common-cancel', 'config-editor_prefs', 'config-language', 'config-grid', 'config-snapping_onoff', 'config-snapping_stepsize', 'config-grid_color', 'config-units_and_rulers', 'config-show_rulers', 'config-base_unit']
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
          this.$dialog.open()
        } else {
          this.$dialog.close()
        }
        break
      case 'lang':
        this.$langSelect.value = newValue
        break
      case 'gridsnappingon':
        if (newValue === 'true') {
          this.$gridSnappingOn.checked = true
        } else if (newValue === 'false') {
          this.$gridSnappingOn.checked = false
        }
        break
      case 'gridsnappingstep':
        this.$gridSnappingStep.value = newValue
        break
      case 'gridcolor':
        this.$gridColor.value = newValue
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
      case 'config-language':
        node = this._shadowRoot.querySelector('#svginfo_lang')
        node.textContent = newValue
        break
      case 'config-grid':
        node = this._shadowRoot.querySelector('#svginfo_grid_settings')
        node.textContent = newValue
        break
      case 'config-snapping_onoff':
        node = this._shadowRoot.querySelector('#svginfo_snap_onoff')
        node.textContent = newValue
        break
      case 'config-snapping_stepsize':
        node = this._shadowRoot.querySelector('#svginfo_snap_step')
        node.textContent = newValue
        break
      case 'config-grid_color':
        node = this._shadowRoot.querySelector('#svginfo_grid_color')
        node.textContent = newValue
        break
      case 'config-units_and_rulers':
        node = this._shadowRoot.querySelector('#svginfo_units_rulers')
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
      default:
        super.attributeChangedCallback(name, oldValue, newValue)
        break
    }
  }

  /**
   * @function get
   * @returns {any}
   */
  get lang () {
    return this.getAttribute('lang')
  }

  /**
   * @function set
   * @returns {void}
   */
  set lang (value) {
    this.setAttribute('lang', value)
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
  get gridsnappingon () {
    return this.getAttribute('gridsnappingon')
  }

  /**
   * @function set
   * @returns {void}
   */
  set gridsnappingon (value) {
    this.setAttribute('gridsnappingon', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get gridsnappingstep () {
    return this.getAttribute('gridsnappingstep')
  }

  /**
   * @function set
   * @returns {void}
   */
  set gridsnappingstep (value) {
    this.setAttribute('gridsnappingstep', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get gridcolor () {
    return this.getAttribute('gridcolor')
  }

  /**
   * @function set
   * @returns {void}
   */
  set gridcolor (value) {
    this.setAttribute('gridcolor', value)
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
          lang: this.$langSelect.value,
          dialog: 'close',
          gridsnappingon: this.$gridSnappingOn.checked,
          gridsnappingstep: this.$gridSnappingStep.value,
          showrulers: this.$showRulers.checked,
          baseunit: this.$baseUnit.value
        }
      })
      this.dispatchEvent(closeEvent)
    }
    svgEditor.$click(this.$saveBtn, onSaveHandler)
    svgEditor.$click(this.$cancelBtn, onCancelHandler)
    this.$dialog.addEventListener('close', onCancelHandler)
  }
}

// Register
customElements.define('se-edit-prefs-dialog', SeEditPrefsDialog)
