// seZoom.ts — `<se-zoom>` — Zoom percentage selector
import { fetchSvgEl } from './svgIconLoader.ts'
import { requireOwnerEditor } from '../domScope.ts'
import { t } from '../locale.ts'

const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    display: inline-flex;
    align-items: center;
  }
  #tool-wrapper {
    display: inline-flex;
    align-items: center;
    height: 36px;
    gap: 5px;
    padding: 0 8px;
    background: var(--group-bg, #F6F7F9);
    border: 1px solid var(--group-border, #E6E8EC);
    border-radius: 10px;
  }
  #icon {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--icon, #4B5563);
    flex-shrink: 0;
  }
  #icon svg, #icon img {
    width: 18px;
    height: 18px;
    display: block;
  }
  input {
    border: none;
    background: transparent;
    color: var(--fg, #1B1F24);
    min-width: unset;
    width: 40px;
    height: 22px;
    padding: 0 2px;
    font: inherit;
    font-size: 12.5px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    text-align: center;
    box-sizing: border-box;
    outline: none;
  }
  #spinner {
    display: flex;
    flex-direction: row-reverse;
    align-items: center;
    gap: 2px;
  }
  #spinner > div {
    height: 20px;
    width: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    line-height: 1;
    color: var(--muted, #6B7280);
    cursor: pointer;
    user-select: none;
    border-radius: 5px;
  }
  #spinner > div:hover {
    color: var(--accent, #2962FF);
    background: var(--icon-hover-bg, #EEF1F5);
  }
  #pct {
    margin-left: -4px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--muted, #6B7280);
    user-select: none;
  }
  #down {
    width: 18px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted, #6B7280);
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.12s, color 0.12s;
    flex-shrink: 0;
  }
  #down:hover {
    background: var(--icon-hover-bg, #EEF1F5);
    color: var(--icon-hover, #0F172A);
  }
  #down-icon {
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  #down-icon svg, #down-icon img {
    width: 14px;
    height: 14px;
    display: block;
  }
  #options-container {
    position: fixed;
    display: flex;
    flex-direction: column;
    background: var(--chrome-bg, #FFFFFF);
    border: 1px solid var(--chrome-border, #E6E8EC);
    border-radius: 10px;
    padding: 6px;
    box-shadow: 0 4px 16px -2px rgba(0,0,0,0.12);
    z-index: 100;
  }
  ::slotted(*) {
    padding: 6px 10px;
    border-radius: 7px;
    color: var(--fg, #1B1F24);
    font-size: 13px;
    cursor: pointer;
  }
  ::slotted(*:hover) {
    background: var(--icon-hover-bg, #EEF1F5);
  }
  </style>
  <div id="tool-wrapper">
    <span id="icon"></span>
    <div id="spinner">
      <div id="arrow-up" title="Zoom in" aria-label="Zoom in">+</div>
      <span id="pct">%</span>
      <input/>
      <div id="arrow-down" title="Zoom out" aria-label="Zoom out">−</div>
    </div>
    <div id="down">
      <span id="down-icon">▾</span>
    </div>
  </div>
  <div id="options-container" style="display:none">
    <slot></slot>
  </div>
`

/** Display form of a zoom value: "100.0" → "100" (other decimals are kept). */
const showZoom = (v: string) => (/^-?\d+\.0+$/.test(String(v)) ? String(v).replace(/\.0+$/, '') : v)

class SeZoom extends HTMLElement {
  _shadowRoot: ShadowRoot
  slotElement: HTMLSlotElement
  inputElement: HTMLInputElement
  clickArea: HTMLDivElement
  imgPath: unknown
  $icon: HTMLSpanElement
  arrowUp: HTMLDivElement
  arrowDown: HTMLDivElement
  optionsContainer: HTMLElement
  changedTimeout: number | null
  _globalAbort: AbortController | undefined
  options: Element[] | undefined
  selectedValue: string | undefined
  title: string
  incrementHold: boolean | undefined
  decrementHold: boolean | undefined

  constructor () {
    super()

    this.handleMouseDown = this.handleMouseDown.bind(this)
    this.handleMouseUp = this.handleMouseUp.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.initPopup = this.initPopup.bind(this)
    this.handleInput = this.handleInput.bind(this)

    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    // locate the component
    this._shadowRoot.append(template.content.cloneNode(true))

    // prepare the slot element
    this.slotElement = (this._shadowRoot.querySelector('slot') as HTMLSlotElement)
    this.slotElement.addEventListener(
      'slotchange',
      this.handleOptionsChange.bind(this)
    )

    // hookup events for the input box
    this.inputElement = (this._shadowRoot.querySelector('input') as HTMLInputElement)
    this.inputElement.addEventListener('click', this.handleClick.bind(this))
    this.inputElement.addEventListener('change', this.handleInput)
    this.inputElement.addEventListener('keydown', this.handleKeyDown)

    this.clickArea = (this._shadowRoot.querySelector('#down') as HTMLDivElement)
    this.clickArea.addEventListener('click', this.handleClick.bind(this))

    this.imgPath = requireOwnerEditor(this).configObj.curConfig.imgPath
    this.$icon = (this._shadowRoot.querySelector('#icon') as HTMLSpanElement)
    // Load zoom icon
    const srcAttr = this.getAttribute('src')
    if (srcAttr) {
      this._loadIcon(srcAttr, this.$icon, 18)
    }

    // hookup events for arrow buttons
    this.arrowUp = (this._shadowRoot.querySelector('#arrow-up') as HTMLDivElement)
    this.arrowUp.title = this.arrowUp.ariaLabel = t('hotkeys.zoom_in')
    this.arrowUp.addEventListener('click', this.increment.bind(this))
    this.arrowUp.addEventListener('mousedown', e =>
      this.handleMouseDown('up', true)
    )
    this.arrowUp.addEventListener('mouseleave', e => this.handleMouseUp('up'))
    this.arrowUp.addEventListener('mouseup', e => this.handleMouseUp('up'))

    this.arrowDown = (this._shadowRoot.querySelector('#arrow-down') as HTMLDivElement)
    this.arrowDown.title = this.arrowDown.ariaLabel = t('hotkeys.zoom_out')
    this.arrowDown.addEventListener('click', this.decrement.bind(this))
    this.arrowDown.addEventListener('mousedown', e =>
      this.handleMouseDown('down', true)
    )
    this.arrowDown.addEventListener('mouseleave', e =>
      this.handleMouseUp('down')
    )
    this.arrowDown.addEventListener('mouseup', e => this.handleMouseUp('down'))

    this.optionsContainer = (this._shadowRoot.querySelector(
      '#options-container'
    ) as HTMLElement)
    this.changedTimeout = null
  }

  /** @function connectedCallback */
  disconnectedCallback (): void {
    this._globalAbort?.abort()
  }

  connectedCallback () {
    // add an event listener to close the popup
    this._globalAbort = new AbortController()
    document.addEventListener('click', e => this.handleClose(e), { signal: this._globalAbort.signal })
  }

  async _loadIcon (src: string, container: HTMLSpanElement, size = 18) {
    if (!src || !container) return
    const url = `${this.imgPath}/${src}`
    const svgEl = await fetchSvgEl(url)
    if (svgEl) {
      svgEl.style.cssText = `width:${size}px;height:${size}px;display:block;`
      container.replaceChildren(svgEl)
    } else {
      const img = document.createElement('img')
      img.src = url
      img.alt = 'icon'
      img.style.cssText = `width:${size}px;height:${size}px;display:block;`
      container.replaceChildren(img)
    }
  }

  static get observedAttributes () {
    return ['value']
  }

  /** @function get */
  get value (): any {
    return this.getAttribute('value')
  }

  /** @function set */
  set value (value) {
    this.setAttribute('value', value)
  }

  /** @function attributeChangedCallback */
  attributeChangedCallback (name: string, oldValue: string, newValue: string): void {
    if (oldValue === newValue) {
      switch (name) {
        case 'value':
          if (Number.parseInt(this.inputElement.value) !== Number(newValue)) {
            this.inputElement.value = showZoom(newValue)
          }
          break
      }

      return
    }

    switch (name) {
      case 'value':
        this.inputElement.value = showZoom(newValue)
        this.dispatchEvent(
          new CustomEvent('change', { detail: { value: newValue } })
        )
        break
    }
  }

  /** @function handleOptionsChange */
  handleOptionsChange (): void {
    if (this.slotElement.assignedElements().length > 0) {
      this.options = this.slotElement.assignedElements()
      this.selectedValue = this.options[0].textContent

      this.initPopup()

      this.options.forEach(option => {
        option.addEventListener('click', e => this.handleSelect(e))
      })
    }
  }

  /** @function handleClick */
  handleClick (): void {
    this.optionsContainer.style.display = 'flex'
    this.inputElement.select()
    this.initPopup()
  }

  /** @function handleSelect */
  handleSelect (e: Event): void {
    this.value = (e.target as Element).getAttribute('value')
    this.title = (e.target as Element).getAttribute('text') ?? ''
  }

  /**
   * @function handleShow
 * @returns initialises the popup menu position
   */
  initPopup (): void {
    const gap = 4
    const zoomPos = this.getBoundingClientRect()
    const popupPos = this.optionsContainer.getBoundingClientRect()
    // Default to opening downward (zoom lives in the top panel); flip above
    // only when the menu would overflow the bottom of the viewport.
    const below = zoomPos.bottom + gap
    const fitsBelow = below + popupPos.height <= window.innerHeight
    const top = fitsBelow ? below : zoomPos.top - popupPos.height - gap
    const left = zoomPos.left

    this.optionsContainer.style.position = 'fixed'
    this.optionsContainer.style.top = `${top}px`
    this.optionsContainer.style.left = `${left}px`
  }

  /**
   * @function handleClose
 * @returns Close the popup menu
   */
  handleClose (e: Event): void {
    if (e.target !== this) {
      this.optionsContainer.style.display = 'none'
      this.inputElement.blur()
    }
  }

  /** @function handleInput */
  handleInput (): void {
    if (this.changedTimeout) {
      clearTimeout(this.changedTimeout)
    }

    this.changedTimeout = setTimeout(this.triggerInputChanged.bind(this), 500)
  }

  /** @function triggerInputChanged */
  triggerInputChanged (): void {
    const newValue = this.inputElement.value
    this.value = newValue
  }

  /** @function increment */
  increment (): void {
    this.value = parseInt(this.value) + 10
  }

  /** @function decrement */
  decrement (): void {
    if (this.value - 10 <= 0) {
      this.value = 10
    } else {
      this.value = parseInt(this.value) - 10
    }
  }

  /**
   * @function handleMouseDown
 * @returns Increment/Decrement on mouse held down, if its the first call add a delay before starting
   */
  handleMouseDown (dir: string, isFirst: boolean): void {
    if (dir === 'up') {
      this.incrementHold = true
      !isFirst && this.increment()

      setTimeout(
        () => {
          if (this.incrementHold) {
            this.handleMouseDown(dir, false)
          }
        },
        isFirst ? 500 : 50
      )
    } else if (dir === 'down') {
      this.decrementHold = true
      !isFirst && this.decrement()

      setTimeout(
        () => {
          if (this.decrementHold) {
            this.handleMouseDown(dir, false)
          }
        },
        isFirst ? 500 : 50
      )
    }
  }

  /** @function handleMouseUp */
  handleMouseUp (dir: string): void {
    if (dir === 'up') {
      this.incrementHold = false
    } else {
      this.decrementHold = false
    }
  }

  /** @function handleKeyDown */
  handleKeyDown (e: KeyboardEvent): void {
    if (e.key === 'ArrowUp') {
      this.increment()
    } else if (e.key === 'ArrowDown') {
      this.decrement()
    }
  }
}

// Register
customElements.define('se-zoom', SeZoom)

export default SeZoom
