// seText.ts — `<se-text>` — themed text label driven by its `text` / `value` attributes
import { t } from '../locale.ts'
import { error as logError } from '@svgedit/svgcanvas/common/logger.ts'
const template = document.createElement('template')
template.innerHTML = `
  <style>
  #layersLabel {
    font-size: 13px;
    line-height: normal;
    font-weight: 700;
  }
  </style>
  <div></div>
`
/**
 * @class SeText
 */
export class SeText extends HTMLElement {
  _shadowRoot: ShadowRoot
  $div: HTMLDivElement & { value: string; }

  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    // locate the component
    this.$div = (this._shadowRoot.querySelector('div') as HTMLDivElement & { value: string })
  }

  /**
   * @function observedAttributes
 * @returns observed
   */
  static get observedAttributes (): string[] {
    return ['text', 'value', 'style', 'title', 'id']
  }

  /** @function attributeChangedCallback */
  attributeChangedCallback (name: string, oldValue: string, newValue: string): void {
    if (oldValue === newValue) return
    switch (name) {
      case 'text':
        this.$div.textContent = t(newValue)
        break
      case 'title':
        this.$div.setAttribute('title', t(newValue))
        break
      case 'style':
        this.$div.style = newValue
        break
      case 'id':
        this.$div.id = newValue
        break
      case 'value':
        this.$div.value = newValue
        // this.$div.setAttribute("value", newValue);
        break
      default:
        logError(`unknown attribute: ${name}`, undefined, 'seText')
        break
    }
  }

  /** @function get */
  get text (): string {
    return this.$div.textContent as string
  }

  /** @function set */
  set text (value: string | number) {
    this.$div.textContent = t(String(value))
  }

  /** @function get */
  get value (): string {
    return this.$div.value
  }

  /** @function set */
  set value (value: string | number) {
    this.$div.value = value as string
  }

  /** @function get */
  get title (): string {
    return this.getAttribute('title') as string
  }

  /** @function set */
  set title (value: string | number) {
    this.setAttribute('title', String(value))
  }

  /** @function connectedCallback */
  connectedCallback (): void {
    // capture shortcuts
  }
}

// Register
customElements.define('se-text', SeText)
