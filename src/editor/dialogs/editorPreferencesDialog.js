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
    return ['dialog', 'lang', 'showrulers', 'baseunit', 'common-ok', 'common-cancel', 'config-editor_prefs', 'config-language', 'config-units_and_rulers', 'config-show_rulers', 'config-base_unit']
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
