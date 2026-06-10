/* globals svgEditor */
import Paint from '@svgedit/svgcanvas/core/paint.js'
import PaintBox from './PaintBox.js'
import { t } from '../locale.js'
import { fetchSvgEl } from './svgIconLoader.js'
import { closestRoot } from '../domScope.js'
import './colorPicker/index.js'

const template = document.createElement('template')
template.innerHTML = `
  <style>
  /* ── Framed swatch button ─────────────────────────────────── */
  #picker {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    flex-shrink: 0;
  }
  #logo {
    height: 18px;
    width: 18px;
    display: block;
    color: var(--icon, #4B5563);
    flex-shrink: 0;
  }
  #logo svg,
  #logo img {
    width: 18px;
    height: 18px;
    display: block;
  }
  /* The framed color chip */
  #swatch {
    position: relative;
    width: 30px;
    height: 24px;
    border-radius: 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1.5px solid var(--swatch-border, #C3C8D1);
    background-color: var(--swatch-bg, #FFFFFF);
    /* Faint checkerboard overlay for transparent/gradient chips */
    background-image:
      linear-gradient(45deg, var(--checker, rgba(0,0,0,0.07)) 25%, transparent 25%),
      linear-gradient(-45deg, var(--checker, rgba(0,0,0,0.07)) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--checker, rgba(0,0,0,0.07)) 75%),
      linear-gradient(-45deg, transparent 75%, var(--checker, rgba(0,0,0,0.07)) 75%);
    background-size: 8px 8px;
    background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
    box-shadow: var(--swatch-shadow, 0 1px 2px rgba(20,25,35,0.08));
    transition: border-color 0.12s, transform 0.1s;
    cursor: pointer;
    flex-shrink: 0;
  }
  #swatch:hover {
    border-color: var(--swatch-border-hover, #2962FF);
    transform: translateY(-1px);
  }
  /* Inner chip — fills the full swatch interior */
  #block {
    position: absolute;
    inset: 0;
    border-radius: 5px;
    overflow: hidden;
    box-shadow: inset 0 0 0 1px var(--swatch-inset, rgba(0,0,0,0.18));
    pointer-events: none;
  }
  /* PaintBox injects a fixed-size <svg> — make it fill the block.
     The SVG has no viewBox so the inner rect also needs 100% dimensions. */
  #block svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  #block svg rect {
    width: 100%;
    height: 100%;
  }
  /* Stroke swatch variant — hollow band */
  :host([type="stroke"]) #block {
    background: var(--swatch-bg, #FFFFFF) !important;
    border: 3.5px solid currentColor;
    box-shadow: none;
  }
  /* Hidden label (keep for tooltip/accessibility) */
  #label {
    display: none;
  }
  </style>
  <div id="picker" title="">
    <span id="logo"></span>
    <label for="color" title="" id="label"></label>
    <div id="swatch">
      <div id="block"></div>
    </div>
  </div>
`
/**
 * @class SeColorPicker
 */
export class SeColorPicker extends HTMLElement {
  /**
   * @function constructor
   */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$logo = this._shadowRoot.getElementById('logo')
    this.$label = this._shadowRoot.getElementById('label')
    this.$block = this._shadowRoot.getElementById('block')
    this.$swatch = this._shadowRoot.getElementById('swatch')
    this.paintBox = null
    this.i18next = null
    this.$picker = this._shadowRoot.getElementById('picker')
    this.imgPath = svgEditor.configObj.curConfig.imgPath
  }

  async _loadIcon (src) {
    if (!src) return
    const url = `${this.imgPath}/${src}`
    const svgEl = await fetchSvgEl(url)
    if (svgEl) {
      this.$logo.replaceChildren(svgEl)
    } else {
      const img = document.createElement('img')
      img.src = url
      img.alt = 'icon'
      img.style.cssText = 'width:18px;height:18px;display:block;'
      this.$logo.replaceChildren(img)
    }
  }

  /**
   * @function init
   * @param {any} name
   * @returns {void}
   */
  init (i18next) {
    this.i18next = i18next
    this.setAttribute('config-change_xxx_color', t('config.change_xxx_color'))
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['label', 'src', 'type', 'config-change_xxx_color']
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
    switch (name) {
      case 'src':
        this._loadIcon(newValue)
        break
      case 'label':
        this.setAttribute('title', t(newValue))
        break
      case 'type':
        this.$label.setAttribute('title', 'config.pick_paint_opavity')
        break
      case 'config-change_xxx_color':
        this.$label.setAttribute('title', newValue)
        break
      default:
        console.error(`unknown attribute: ${name}`)
        break
    }
  }

  /**
   * @function get
   * @returns {any}
   */
  get label () {
    return this.$label.getAttribute('title')
  }

  /**
   * @function set
   * @returns {void}
   */
  set label (value) {
    this.setAttribute('label', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get type () {
    return this.getAttribute('type')
  }

  /**
   * @function set
   * @returns {void}
   */
  set type (value) {
    this.setAttribute('type', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get src () {
    return this.getAttribute('src')
  }

  /**
   * @function set
   * @returns {void}
   */
  set src (value) {
    this.setAttribute('src', value)
  }

  /**
   * Open the <se-color-dialog> modal for this swatch.
   */
  openColorDialog () {
    const root = closestRoot(this) // keep the dialog within this editor (see domScope.js)
    // Remove any existing dialog
    root.querySelector('se-color-dialog')?.remove()
    const dialog = document.createElement('se-color-dialog')
    dialog.paint = this.paintBox.paint
    dialog.type = this.type
    dialog.i18next = this.i18next
    ;(root.body ?? root).appendChild(dialog)
    dialog.addEventListener('change', (evt) => {
      const paint = new Paint({ copy: evt.detail.paint })
      this.setPaint(paint)
      this.dispatchEvent(new CustomEvent('change', { detail: { paint } }))
    }, { once: true })
  }

  /**
   * @param {PlainObject} svgCanvas
   * @param {PlainObject} selectedElement
   * @param {bool} apply
   * @returns {void}
   */
  update (svgCanvas, selectedElement, apply) {
    const paint = this.paintBox.update(svgCanvas, selectedElement)
    if (paint && apply) {
      this.setPaint(paint)
      this.dispatchEvent(new CustomEvent('change', { detail: { paint } }))
    }
  }

  /**
   * @param {PlainObject} paint
   * @returns {void}
   */
  setPaint (paint) {
    this.paintBox.setPaint(paint)
  }

  /**
   * @function connectedCallback
   * @returns {void}
   */
  connectedCallback () {
    this.paintBox = new PaintBox(this.$block, this.type)
    svgEditor.$click(this.$picker, () => {
      this.openColorDialog()
    })
  }
}

// Register
customElements.define('se-colorpicker', SeColorPicker)
