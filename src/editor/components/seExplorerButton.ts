// seExplorerButton.ts — `<se-explorerbutton>` — toolbar button that opens a library explorer (the shape library, through its `lib` attribute)
import { tooltipText } from '../Hotkeys.ts'
import { getIconDataUri } from '../images/iconRegistry.ts'
import { closestRoot, requireOwnerEditor } from '../domScope.ts'
import { error as logError } from '@svgedit/svgcanvas/common/logger.ts'
import { $click } from '@svgedit/svgcanvas/core/dom-utils.ts'

/**
 * @class ExplorerButton
 */
export class ExplorerButton extends HTMLElement {
  imgPath: any
  template: any
  _shadowRoot: ShadowRoot
  $button: HTMLDivElement
  $overall: HTMLDivElement
  $img: HTMLElement
  $menu: HTMLDivElement
  $handle: HTMLDivElement
  $lib: HTMLDivElement
  files: never[]
  request: XMLHttpRequest

  /** shape key → path data of the open library */ data: Record<string, string> = {}
  currentAction: HTMLElement | null = null

  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    // create the shadowDom and insert the template
    this.imgPath = requireOwnerEditor(this).configObj.curConfig.imgPath
    this.template = this.createTemplate(this.imgPath)
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(this.template.content.cloneNode(true))
    // locate the component
    this.$button = (this._shadowRoot.querySelector('.menu-button') as HTMLDivElement)
    this.$overall = (this._shadowRoot.querySelector('.overall') as HTMLDivElement)
    this.$img = (this._shadowRoot.querySelector('.menu-button img') as HTMLElement)
    this.$menu = (this._shadowRoot.querySelector('.menu') as HTMLDivElement)
    this.$handle = (this._shadowRoot.querySelector('.handle') as HTMLDivElement)
    this.$lib = (this._shadowRoot.querySelector('.image-lib') as HTMLDivElement)
    this.files = []
    this.request = new XMLHttpRequest()
    this.imgPath = requireOwnerEditor(this).configObj.curConfig.imgPath

    // Closes opened (pressed) lib menu on click on the canvas
    const workarea = closestRoot(this).querySelector('[id="workarea"]')
    workarea?.addEventListener('click', () => {
      this.$menu.classList.remove('open')
      this.$lib.classList.remove('open-lib')
    })
  }

  /**
   * @function createTemplate
 * @returns template
   */

  createTemplate (imgPath: string): any {
    const template = document.createElement('template')
    template.innerHTML = `
    <style>
    :host {
      position:relative;
    }
    .menu-button:hover, se-button:hover, .menu-item:hover
    {
      background-color: var(--icon-hover-bg);
    }
    img {
      border: none;
      width: 24px;
      height: 24px;
      filter: var(--icon-filter, none);
    }
    .overall.pressed .button-icon,
    .overall.pressed,
    .menu-item.pressed {
      background-color: var(--icon-hover-bg) !important;
    }
    .overall.pressed .menu-button {
      background-color: var(--icon-hover-bg) !important;
    }
    .disabled {
      opacity: 0.3;
      cursor: default;
    }
    .menu-button {
      height: 24px;
      width: 24px;
      margin: 2px 1px 4px;
      padding: 3px;
      background-color: var(--icon-bg-color);
      cursor: pointer;
      position: relative;
      border-radius: 3px;
      overflow: hidden;
    }
    .handle {
      height: 8px;
      width: 8px;
      background-image: url("${getIconDataUri('handle.svg') ?? `${imgPath}/handle.svg`}");
      position:absolute;
      bottom: 0px;
      right: 0px;
    }
    .button-icon {
    }
    .menu {
      position: fixed;
      margin-left: 34px;
      background: none !important;
      display:none;
      top: 30%;
      left: 171px;
    }
    .image-lib {
      position: fixed;
      left: 34px;
      top: 30%;
      background: var(--chrome-bg, #E8E8E8);
      display: none;
      flex-wrap: wrap;
      flex-direction: row;
      width: 170px;
    }
    .menu-item {
      line-height: 1em;
      padding: 0.5em;
      border: 1px solid var(--chrome-border, #5a6162);
      background: var(--chrome-bg, #E8E8E8);
      color: var(--fg, inherit);
      margin-bottom: -1px;
      white-space: nowrap;
    }
    .open-lib {
      display: inline-flex;
    }
    .open {
      display: block;
    }
    .overall {
      background: none !important;
    }
    </style>
  
    <div class="overall">
      <div class="menu-button">
        <img class="button-icon" src="explorer.svg" alt="icon">
        <div class="handle"></div>
      </div>
      <div class="image-lib"">
        <se-button></se-button>
     </div>
      <div class="menu">
        <div class="menu-item">menu</div>
     </div>
    </div>`
    return template
  }

  /**
   * @function observedAttributes
 * @returns observed
   */
  static get observedAttributes (): any {
    return ['title', 'pressed', 'disabled', 'lib', 'src']
  }

  /** @function attributeChangedCallback */
  async attributeChangedCallback (name: string, oldValue: string, newValue: string): Promise<void> {
    if (oldValue === newValue) return
    switch (name) {
      case 'title':
        {
          const shortcut = this.getAttribute('shortcut')
          this.$button.setAttribute('title', tooltipText(newValue, shortcut))
        }
        break
      case 'pressed':
        if (newValue) {
          this.$overall.classList.add('pressed')
        } else {
          this.$overall.classList.remove('pressed')
        }
        break
      case 'disabled':
        if (newValue) {
          this.$overall.classList.add('disabled')
        } else {
          this.$overall.classList.remove('disabled')
        }
        break
      case 'lib':
        try {
          const response = await fetch(`${newValue}index.json`)
          const json = await response.json()
          const { lib } = json
          this.$menu.innerHTML = lib.map((menu: string, i: number) => (
          `<div data-menu="${menu}" class="menu-item ${(i === 0) ? 'pressed' : ''} ">${menu}</div>`
          )).join('')
          await this.updateLib(lib[0])
        } catch (error) {
          logError('Failed to load library menu', error, 'seExplorerButton')
        }
        break
      case 'src':
        this.$img.setAttribute('src', this.imgPath + '/' + newValue)
        break
      default:
        logError(`unknown attribute: ${name}`, undefined, 'seExplorerButton')
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
  get pressed (): any {
    return this.hasAttribute('pressed')
  }

  /** @function set */
  set pressed (value) {
    // boolean value => existence = true
    if (value) {
      this.setAttribute('pressed', 'true')
    } else {
      this.removeAttribute('pressed')
    }
  }

  /** @function get */
  get disabled (): any {
    return this.hasAttribute('disabled')
  }

  /** @function set */
  set disabled (value) {
    // boolean value => existence = true
    if (value) {
      this.setAttribute('disabled', 'true')
    } else {
      this.removeAttribute('disabled')
    }
  }

  /** @function connectedCallback */
  connectedCallback (): void {
    // capture click event on the button to manage the logic
    const onClickHandler = (ev: Event) => {
      ev.stopPropagation()
      const target = ev.target as HTMLElement
      switch (target.nodeName) {
        case 'SE-EXPLORERBUTTON':
          this.$menu.classList.toggle('open')
          this.$lib.classList.toggle('open-lib')
          break
        case 'SE-BUTTON':
        // change to the current action
          this.currentAction = target
          this.$img.setAttribute('src', target.getAttribute('src') ?? '')
          this.dataset.draw = this.data[target.dataset.shape ?? '']
          this._shadowRoot.querySelectorAll('.image-lib [pressed]').forEach((b) => { (b as any).pressed = false })
          target.setAttribute('pressed', 'pressed')
          // and close the menu
          this.$menu.classList.remove('open')
          this.$lib.classList.remove('open-lib')
          break
        case 'DIV':
          if (target.classList[0] === 'handle') {
          // this is a click on the handle so let's open/close the menu.
            this.$menu.classList.toggle('open')
            this.$lib.classList.toggle('open-lib')
          } else {
            this._shadowRoot.querySelectorAll('.menu > .pressed').forEach((b) => { b.classList.remove('pressed') })
            target.classList.add('pressed')
            this.updateLib(target.dataset.menu ?? '')
          }
          break
        default:
          logError('unknown nodeName for: ' + target.className, target, 'seExplorerButton')
      }
    }
    // capture event from slots
    $click(this, onClickHandler)
    $click(this.$menu, onClickHandler)
    $click(this.$lib, onClickHandler)
    $click(this.$handle, onClickHandler)
  }

  /** @function updateLib */
  async updateLib (lib: string): Promise<void> {
    const libDir = this.getAttribute('lib')
    try {
      // initialize buttons for all shapes defined for this library
      const response = await fetch(`${libDir}${lib}.json`)
      const json = await response.json()
      this.data = json.data
      const size = json.size ?? 300
      const fill = json.fill ? '#333' : 'none'
      const off = size * 0.05
      const vb = [-off, -off, size + off * 2, size + off * 2].join(' ')
      const stroke = json.fill ? 0 : (size / 30)
      this.$lib.innerHTML = Object.entries(this.data).map(([key, path]) => {
        const encoded = btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
          <svg viewBox="${vb}"><path fill="${fill}" stroke="#f8bb00" stroke-width="${stroke}" d="${path}"></path></svg>
        </svg>`)
        return `<se-button data-shape="${key}" src="data:image/svg+xml;base64,${encoded}"></se-button>`
      }).join('')
    } catch (error) {
      logError(`could not read file:${libDir}${lib}.json`, error, 'seExplorerButton')
    }
  }
}

// Register
customElements.define('se-explorerbutton', ExplorerButton)
