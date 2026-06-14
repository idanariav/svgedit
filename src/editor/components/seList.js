/* globals svgEditor */
import { t } from '../locale.js'
import { fetchSvgEl } from './svgIconLoader.js'

const template = document.createElement('template')
template.innerHTML = `
<style>
:host {
  display: inline-flex;
  align-items: center;
}
label {
  display: none; /* labels hidden in the new compact chrome */
}
#select-container {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--icon, #4B5563);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
#select-container:hover {
  background: var(--icon-hover-bg, #EEF1F5);
  color: var(--icon-hover, #0F172A);
}
#options-container.closed {
  display: none;
}
#options-container {
  position: fixed;
  background: var(--chrome-bg, #FFFFFF);
  border: 1px solid var(--chrome-border, #E6E8EC);
  border-radius: 10px;
  padding: 6px;
  box-shadow: 0 4px 16px -2px rgba(0,0,0,0.12);
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
::slotted(*) {
  padding: 0;
  width: 100%;
}
</style>
  <label>Label</label>
  <div id="select-container" tabindex="0">
    <div id="selected-value"></div>
    <div id="options-container">
      <slot></slot>
    </div>
  </div>
`
/**
 * @class SeList
 */
export class SeList extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dropdown = this._shadowRoot.querySelector('#select-container')
    this.$label = this._shadowRoot.querySelector('label')
    this.$selection = this.$dropdown.querySelector('#selected-value')
    this.items = this.querySelectorAll('se-list-item')
    this.imgPath = svgEditor.configObj.curConfig.imgPath
    this.$optionsContainer = this._shadowRoot.querySelector('#options-container')
    this.$optionsContainer.classList.add('closed')
    this.$selection.addEventListener('click', this.toggleList)
    // When a `src` is set on the list itself, the trigger shows a fixed icon
    // that never changes to the last-picked action (action-menu behavior).
    this.staticIcon = this.hasAttribute('src')
    if (this.staticIcon) {
      this.renderStaticIcon(this.getAttribute('src'))
    } else {
      this.updateSelectedValue(this.items[0].getAttribute('value'))
    }
    this.isDropdownOpen = false
  }

  renderStaticIcon = async (src) => {
    const url = `${this.imgPath}/${src}`
    const svgEl = await fetchSvgEl(url)
    while (this.$selection.firstChild) { this.$selection.removeChild(this.$selection.firstChild) }
    if (svgEl) {
      svgEl.style.cssText = 'height:22px;width:auto;display:block;'
      this.$selection.append(svgEl)
    } else {
      const img = document.createElement('img')
      img.src = url
      img.style.height = '22px'
      this.$selection.append(img)
    }
  }

  toggleList = (e) => {
    if (!this.isDropdownOpen) {
      this.openDropdown()
      this.setDropdownListPosition()
    } else {
      this.closeDropdown()
    }
  }

  updateSelectedValue = async (newValue) => {
    // Static-icon lists keep a fixed trigger face and no item highlight.
    if (this.staticIcon) return
    for (const element of Array.from(this.items)) {
      if (element.getAttribute('value') === newValue) {
        element.setAttribute('selected', true)
        if (element.hasAttribute('src')) {
          // empty current selection children
          while (this.$selection.firstChild) { this.$selection.removeChild(this.$selection.firstChild) }
          const src = element.getAttribute('src')
          const url = `${this.imgPath}/${src}`
          const svgEl = await fetchSvgEl(url)
          if (svgEl) {
            const h = element.getAttribute('img-height') || '22px'
            svgEl.style.cssText = `height:${h};width:auto;display:block;`
            svgEl.setAttribute('title', t(element.getAttribute('title') || ''))
            this.$selection.append(svgEl)
          } else {
            const img = document.createElement('img')
            img.src = url
            img.style.height = element.getAttribute('img-height') || '22px'
            img.setAttribute('title', t(element.getAttribute('title') || ''))
            this.$selection.append(img)
          }
        } else {
          this.$selection.textContent = t(element.getAttribute('option') || '')
        }
      } else {
        element.setAttribute('selected', false)
      }
    }
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['label', 'width', 'height', 'title', 'value']
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
      case 'title':
        this.$dropdown.setAttribute('title', t(newValue))
        break
      case 'label':
        this.$label.textContent = t(newValue)
        break
      case 'height':
        this.$dropdown.style.height = newValue
        break
      case 'width':
        this.$dropdown.style.width = newValue
        break
      case 'value':
        this.updateSelectedValue(newValue)
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
  get title () {
    return this.getAttribute('title')
  }

  /**
   * @function set
   * @returns {void}
   */
  set title (value) {
    this.setAttribute('title', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get label () {
    return this.getAttribute('label')
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
  get width () {
    return this.getAttribute('width')
  }

  /**
   * @function set
   * @returns {void}
   */
  set width (value) {
    this.setAttribute('width', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get height () {
    return this.getAttribute('height')
  }

  /**
   * @function set
   * @returns {void}
   */
  set height (value) {
    this.setAttribute('height', value)
  }

  openDropdown = () => {
    this.isDropdownOpen = true
    this.$optionsContainer.classList.remove('closed')
  }

  closeDropdown = () => {
    this.isDropdownOpen = false
    this.$optionsContainer.classList.add('closed')
  }

  setDropdownListPosition = () => {
    const windowHeight = window.innerHeight
    const selectedContainerPosition = this.$selection.getBoundingClientRect()
    const optionsContainerPosition = this.$optionsContainer.getBoundingClientRect()
    // list is bottom of frame - needs to open from above
    const left = selectedContainerPosition.left
    const top = selectedContainerPosition.bottom + optionsContainerPosition.height > windowHeight
      ? selectedContainerPosition.top - optionsContainerPosition.height
      : selectedContainerPosition.bottom
    // `left`/`top` are viewport coordinates, but a `position: fixed` element is
    // resolved against the nearest ancestor that establishes a containing block
    // (any transform/filter/contain/perspective/will-change). Embedders such as
    // Obsidian — or their themes — routinely set those on a pane, which would
    // otherwise fling this list far off the trigger. Re-measure and correct by
    // the delta so it lands under the trigger regardless of the containing block.
    // A scaled ancestor makes one delta over/undershoot, so iterate until the
    // residual is sub-pixel (converges in a couple of rounds).
    let styleLeft = left
    let styleTop = top
    for (let i = 0; i < 4; i++) {
      this.$optionsContainer.style.left = `${styleLeft}px`
      this.$optionsContainer.style.top = `${styleTop}px`
      const after = this.$optionsContainer.getBoundingClientRect()
      const dx = left - after.left
      const dy = top - after.top
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break
      styleLeft += dx
      styleTop += dy
    }
  }

  /**
   * @function connectedCallback
   * @returns {void}
   */
  connectedCallback () {
    const currentObj = this
    this.$dropdown.addEventListener('selectedindexchange', (e) => {
      if (e?.detail?.selectedItem !== undefined) {
        const value = e.detail.selectedItem
        const closeEvent = new CustomEvent('change', { detail: { value } })
        currentObj.dispatchEvent(closeEvent)
        currentObj.value = value
        currentObj.setAttribute('value', value)
      }
    })

    this.$dropdown.addEventListener('focusout', (e) => {
      this.closeDropdown()
    })

    window.addEventListener('mousedown', e => {
      // When we click on the canvas and if the dropdown is open, then just close the dropdown and stop the event
      if (this.isDropdownOpen) {
        if (!e.target.closest('se-list')) {
          e.stopPropagation()
          this.closeDropdown()
        }
      }
    }, { capture: true })
  }
}

// Register
customElements.define('se-list', SeList)
