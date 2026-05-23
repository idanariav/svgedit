/* globals svgEditor */

const template = document.createElement('template')
template.innerHTML = `
  <style>
  #logo {
    height: 18px;
    width: 18px;
  }
  #block {
    height: 17px;
    width: 14px;
    float: right;
    background-color: #ffffff;
    border: 1px solid #555;
    cursor: pointer;
    position: relative;
  }
  #picker {
    background: var(--input-color);
    height: 23px;
    line-height: 23px;
    border-radius: 3px;
    width: 52px;
    display: flex;
    align-items: center;
    margin-right: 4px;
    margin-top: 1px;
    justify-content: space-evenly;
    cursor: pointer;
  }
  #color_input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  </style>
  <div id="picker" title="Background Color">
    <img src="" alt="icon" id="logo">
    <div id="block">
      <input type="color" id="color_input" value="#ffffff" />
    </div>
  </div>
`

/**
 * @class SeBgColorPicker
 * Lightweight background color picker that matches the se-colorpicker visual style.
 */
export class SeBgColorPicker extends HTMLElement {
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$logo = this._shadowRoot.getElementById('logo')
    this.$block = this._shadowRoot.getElementById('block')
    this.$colorInput = this._shadowRoot.getElementById('color_input')
    this.$picker = this._shadowRoot.getElementById('picker')
    this.imgPath = svgEditor.configObj.curConfig.imgPath
  }

  static get observedAttributes () {
    return ['src', 'label', 'color']
  }

  attributeChangedCallback (name, oldValue, newValue) {
    if (oldValue === newValue) return
    switch (name) {
      case 'src':
        this.$logo.setAttribute('src', this.imgPath + '/' + newValue)
        break
      case 'label':
        this.$picker.setAttribute('title', newValue)
        break
      case 'color':
        this.setColor(newValue)
        break
    }
  }

  get color () {
    return this.$colorInput.value
  }

  /**
   * Set the displayed block color (hex string, e.g. '#ff0000').
   * Skips 'chessboard' and other non-hex values.
   */
  setColor (hex) {
    if (hex && hex !== 'chessboard' && /^#[0-9a-fA-F]{3,6}$/.test(hex)) {
      this.$colorInput.value = hex
      this.$block.style.backgroundColor = hex
    }
  }

  connectedCallback () {
    // Clicking anywhere on the picker opens the native color chooser
    svgEditor.$click(this.$picker, () => {
      this.$colorInput.click()
    })

    this.$colorInput.addEventListener('input', (e) => {
      const color = e.target.value
      this.$block.style.backgroundColor = color
      this.dispatchEvent(new CustomEvent('change', { detail: { color } }))
    })
  }
}

customElements.define('se-bg-colorpicker', SeBgColorPicker)
