// cmenuLayersDialog.ts — `<se-cmenu-layers>` — right-click menu of the Layers panel
import cMenuLayersDialog from './cmenuLayersDialog.html'
import { positionContextMenu } from './positionContextMenu.ts'
import { closestRoot } from '../domScope.ts'
import { syncDialogTheme } from '../themeUtil.ts'
import { $click } from '@svgedit/svgcanvas/core/dom-utils.ts'

const template = document.createElement('template')
template.innerHTML = cMenuLayersDialog
/**
 * @class SeCMenuLayerDialog
 */
export class SeCMenuLayerDialog extends HTMLElement {
  _shadowRoot: ShadowRoot
  source: string
  _workarea: HTMLElement | null | undefined
  $sidePanels: HTMLElement | null
  $dialog: HTMLUListElement
  $duplicateLink: HTMLAnchorElement
  $deleteLink: HTMLAnchorElement
  $mergeDownLink: HTMLAnchorElement
  $mergeAllLink: HTMLAnchorElement

  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.source = ''
    // Resolved in connectedCallback once attached (see domScope.js); the
    // element isn't in the DOM yet at construction time.
    this._workarea = undefined
    this.$sidePanels = null
    this.$dialog = (this._shadowRoot.querySelector('#cmenu_layers') as HTMLUListElement)
    this.$duplicateLink = (this._shadowRoot.querySelector('#se-dupe') as HTMLAnchorElement)
    this.$deleteLink = (this._shadowRoot.querySelector('#se-layer-delete') as HTMLAnchorElement)
    this.$mergeDownLink = (this._shadowRoot.querySelector('#se-merge-down') as HTMLAnchorElement)
    this.$mergeAllLink = (this._shadowRoot.querySelector('#se-merge-all') as HTMLAnchorElement)
  }

  /** @function init */
  init (i18next: import('i18next').i18n): void {
    this.setAttribute('layers-dupe', i18next.t('layers.dupe'))
    this.setAttribute('layers-del', i18next.t('layers.del'))
    this.setAttribute('layers-merge_down', i18next.t('layers.merge_down'))
    this.setAttribute('layers-merge_all', i18next.t('layers.merge_all'))
  }

  /**
   * @function observedAttributes
 * @returns observed
   */
  static get observedAttributes (): any {
    return ['value', 'leftclick', 'layers-dupe', 'layers-del', 'layers-merge_down', 'layers-merge_all']
  }

  /** @function attributeChangedCallback */
  attributeChangedCallback (name: string, oldValue: string, newValue: string): void {
    if (oldValue === newValue) return
    switch (name) {
      case 'value':
        this.source = newValue
        // The DOM lookup is deferred to connectedCallback (the menu element may
        // not be attached yet, and a global getElementById would pick another
        // editor's element when several are open).
        if (this.isConnected && newValue !== '' && newValue !== undefined) {
          this._workarea = (closestRoot(this).querySelector(`[id="${CSS.escape(this.source)}"]`) as HTMLElement | null)
        }
        break
      case 'layers-dupe':
        this.$duplicateLink.textContent = newValue
        break
      case 'layers-del':
        this.$deleteLink.textContent = newValue
        break
      case 'layers-merge_down':
        this.$mergeDownLink.textContent = newValue
        break
      case 'layers-merge_all':
        this.$mergeAllLink.textContent = newValue
        break
      default:
      // super.attributeChangedCallback(name, oldValue, newValue);
        break
    }
  }

  /** @function get */
  get value (): any {
    return this.getAttribute('value')
  }

  /** @function set */
  set value (value) {
    this.setAttribute('value', value)
  }

  /** @function get */
  get leftclick (): any {
    return this.getAttribute('leftclick')
  }

  /** @function set */
  set leftclick (value) {
    this.setAttribute('leftclick', value)
  }

  /** @function connectedCallback */
  connectedCallback (): void {
    const current = this
    // Now attached: resolve this editor's own elements (see domScope.js).
    if (this.source) {
      this._workarea = (closestRoot(this).querySelector(`[id="${CSS.escape(this.source)}"]`) as HTMLElement | null)
    }
    this.$sidePanels = closestRoot(this).querySelector('[id="sidepanels"]')
    const onMenuOpenHandler = (e: MouseEvent) => {
      e.preventDefault()
      syncDialogTheme(current)
      positionContextMenu(current.$dialog, e.clientX, e.clientY, -126)
    }
    const onMenuCloseHandler = (e: MouseEvent) => {
      if (e.button !== 2) {
        current.$dialog.style.display = 'none'
      }
    }
    const onMenuClickHandler = (e: Event, action: string, id: string) => {
      const triggerEvent = new CustomEvent('change', {
        detail: {
          trigger: action,
          source: id
        }
      })
      this.dispatchEvent(triggerEvent)
      current.$dialog.style.display = 'none'
    }
    if (this._workarea !== undefined) {
      this._workarea?.addEventListener('contextmenu', onMenuOpenHandler)
      if (this.getAttribute('leftclick') === 'true') {
        if (this._workarea) $click(this._workarea, (onMenuOpenHandler as EventListener))
      }
      this._workarea?.addEventListener('mousedown', onMenuCloseHandler)
      this.$sidePanels?.addEventListener('mousedown', onMenuCloseHandler)
    }
    $click(this.$duplicateLink, (evt) => onMenuClickHandler(evt, 'dupe', this.source))
    $click(this.$deleteLink, (evt) => onMenuClickHandler(evt, 'delete', this.source))
    $click(this.$mergeDownLink, (evt) => onMenuClickHandler(evt, 'merge_down', this.source))
    $click(this.$mergeAllLink, (evt) => onMenuClickHandler(evt, 'merge_all', this.source))
  }
}

// Register
customElements.define('se-cmenu-layers', SeCMenuLayerDialog)
