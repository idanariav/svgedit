// seInput.ts — `<se-input>` — Text input with icon/label
import { t } from '../locale.ts'
import { attachIdleBlur } from './fieldAutoBlur.ts'
import { error as logError } from '@svgedit/svgcanvas/common/logger.ts'

const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    min-width: 0;
  }
  .top-label {
    display: none; /* shown only when [label] is set */
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--muted, #6B7280);
    margin: 0 0 5px 2px;
    white-space: nowrap;
  }
  .field {
    display: flex;
    align-items: center;
    height: 34px;
    background: var(--field-bg, #F7F8FA);
    border: 1px solid var(--field-border, #E2E5EA);
    border-radius: 8px;
    overflow: hidden;
    transition: border-color .12s, box-shadow .12s, background .12s;
  }
  .field:hover { border-color: var(--field-border-h, #C8CDD6); }
  .field:focus-within {
    border-color: var(--accent, #2962FF);
    background: var(--chrome-bg, #FFFFFF);
    box-shadow: 0 0 0 3px var(--accent-ring, rgba(41,98,255,0.16));
  }
  input {
    background: transparent;
    color: var(--fg, #1B1F24);
    -webkit-text-fill-color: var(--fg, #1B1F24);
    border: none;
    border-radius: 0;
    height: 32px;
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 500;
    font-family: var(--ui-font, inherit);
    padding: 0 8px;
    box-sizing: border-box;
  }
  input:focus { outline: none; }
  </style>
  <label class="top-label"></label>
  <div class="field">
    <input type="text" />
  </div>
`

/**
 * @class SEInput
 */
export class SEInput extends HTMLElement {
  _shadowRoot: ShadowRoot
  $div: HTMLDivElement
  $label: HTMLLabelElement
  $event: CustomEvent<unknown>
  $input: HTMLInputElement

  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    // locate the component
    this.$div = (this._shadowRoot.querySelector('.field') as HTMLDivElement)
    this.$label = (this._shadowRoot.querySelector('.top-label') as HTMLLabelElement)
    this.$event = new CustomEvent('change')
    this.$input = (this._shadowRoot.querySelector('input') as HTMLInputElement)
  }

  /**
   * @function observedAttributes
 * @returns observed
   */
  static get observedAttributes (): string[] {
    return ['value', 'label', 'src', 'size', 'title', 'disabled']
  }

  /** @function attributeChangedCallback */
  attributeChangedCallback (name: string, oldValue: string, newValue: string): void {
    if (oldValue === newValue) return
    switch (name) {
      case 'title':
        this.$div.setAttribute('title', `${t(newValue)}`)
        break
      case 'src':
        // seInput doesn't typically show an icon; silently ignore
        break
      case 'size':
        this.$input.setAttribute('size', newValue)
        break
      case 'label':
        if (newValue) {
          this.$label.textContent = t(newValue)
          this.$label.style.display = 'block'
        } else {
          this.$label.style.display = 'none'
        }
        break
      case 'value':
        this.$input.value = newValue
        break
      case 'disabled':
        this.$input.disabled = newValue !== null
        break
      default:
        logError(`unknown attribute: ${name}`, undefined, 'seInput')
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
  get label (): any {
    return this.getAttribute('label')
  }

  /** @function set */
  set label (value) {
    this.setAttribute('label', value)
  }

  /** @function get */
  get value (): any {
    return this.$input.value
  }

  /** @function set */
  set value (value) {
    this.$input.value = value
  }

  /** Greys the field out and stops it taking input. */
  get disabled (): boolean {
    return this.hasAttribute('disabled')
  }

  set disabled (value: boolean) {
    this.toggleAttribute('disabled', Boolean(value))
  }

  /** @function get */
  get src (): any {
    return this.getAttribute('src')
  }

  /** @function set */
  set src (value) {
    this.setAttribute('src', value)
  }

  /** @function get */
  get size (): any {
    return this.getAttribute('size')
  }

  /** @function set */
  set size (value) {
    this.setAttribute('size', value)
  }

  /** @function connectedCallback */
  connectedCallback (): void {
    this.$input.addEventListener('change', (e) => {
      e.preventDefault()
      this.value = (e.target as HTMLInputElement).value
      this.dispatchEvent(this.$event)
    })
    this.$input.addEventListener('keyup', (e) => {
      e.preventDefault()
      this.value = (e.target as HTMLInputElement).value
      this.dispatchEvent(this.$event)
    })
    // Release focus after a short idle period so tool shortcuts / Delete reach
    // the canvas instead of being swallowed by this field.
    attachIdleBlur(this)
  }
}
// Register
customElements.define('se-input', SEInput)
