/* globals svgEditor */
import { fetchSvgEl } from './svgIconLoader.js'

/**
 * @class SeSettingsPopover
 * Base class for the toolbar-button-plus-popover settings components
 * (se-grid-settings, se-repeat-settings,
 * se-offset-settings, se-taper-settings,
 * se-canvas-settings, se-smooth-path-settings). Provides the shared
 * shadow-DOM wiring, icon loading, open/close/toggle lifecycle,
 * viewport-aware positioning, and light-dismiss (outside click / Escape)
 * behavior every one of them reimplemented identically.
 *
 * Light-dismiss and top-layer stacking are delegated to the native Popover
 * API (`$popup` carries `popover="auto"`) rather than a hand-rolled
 * document click/keydown listener pair, matching the pattern `seMenu.js`
 * already uses for its hamburger menu. Positioning stays manual
 * (`positionPopup()`) rather than CSS anchor positioning: it already
 * accounts for embedders (e.g. the Obsidian plugin) placing this component
 * inside a transformed/scaled ancestor, which anchor positioning doesn't
 * solve for.
 *
 * Subclasses supply their own full shadow-root markup (including their own
 * `<style>` block — CSS is not shared, only behavior) via the constructor,
 * following the same contract every existing popover already uses:
 *  - a `.trigger` button containing `<span id="icon">`
 *  - a `#options-container` element (the popup itself)
 * Subclasses query their own field elements after calling `super()`, and
 * typically override `open()` to seed field values before calling
 * `super.open()` to perform the shared display/position/aria work. A
 * subclass that needs to run its own logic when the popover closes (e.g.
 * reverting an un-applied preview) overrides `close()` the same way — this
 * still runs for browser-driven closes (outside click, Escape, another
 * popover opening), not just explicit `this.close()` calls.
 */
export class SeSettingsPopover extends HTMLElement {
  static get observedAttributes () {
    return ['src', 'title']
  }

  /**
   * @param {string} templateHTML - Full shadow-root markup for this popover.
   */
  constructor (templateHTML) {
    super()
    this._skipToggleSync = false
    this.handleToggle = this.handleToggle.bind(this)

    this._shadowRoot = this.attachShadow({ mode: 'open' })
    const template = document.createElement('template')
    template.innerHTML = templateHTML
    this._shadowRoot.append(template.content.cloneNode(true))

    this.imgPath = svgEditor.configObj.curConfig.imgPath
    this.$icon = this._shadowRoot.querySelector('#icon')
    this.$trigger = this._shadowRoot.querySelector('.trigger')
    this.$popup = this._shadowRoot.querySelector('#options-container')

    // Promote to a native "auto" popover for top-layer rendering plus
    // built-in light-dismiss (outside click / Escape). The UA popover
    // stylesheet otherwise imposes its own inset/size defaults that fight
    // positionPopup()'s explicit left/top; neutralize them once here so
    // every subclass's own #options-container CSS keeps working unchanged.
    this.$popup.setAttribute('popover', 'auto')
    this.$popup.style.margin = '0'
    this.$popup.style.inset = 'auto'
    this.$popup.addEventListener('toggle', this.handleToggle)

    this.$trigger.addEventListener('click', e => {
      e.stopPropagation()
      this.toggle()
    })
  }

  /**
   * `src` is set via `setAttribute` after `document.createElement` by several
   * callers (ext-repeat, ext-taper), which happens after
   * the constructor has already run — reading `getAttribute('src')` there
   * missed it entirely, leaving the trigger button iconless. Observing the
   * attribute catches both that case and the markup-attribute case (e.g.
   * ext-grid), where this fires once right after construction.
   * @param {string} name
   * @param {string|null} oldValue
   * @param {string|null} newValue
   * @returns {void}
   */
  attributeChangedCallback (name, oldValue, newValue) {
    if (name === 'src' && newValue && newValue !== oldValue) {
      this._loadIcon(newValue)
    } else if (name === 'title' && newValue && newValue !== oldValue) {
      this.$trigger.setAttribute('title', newValue)
    }
  }

  async _loadIcon (src) {
    const url = `${this.imgPath}/${src}`
    const svgEl = await fetchSvgEl(url)
    if (svgEl) {
      svgEl.style.cssText = 'width:18px;height:18px;display:block;'
      this.$icon.replaceChildren(svgEl)
    } else {
      const img = document.createElement('img')
      img.src = url
      img.alt = 'icon'
      img.style.cssText = 'width:18px;height:18px;display:block;'
      this.$icon.replaceChildren(img)
    }
  }

  get isOpen () {
    return this.$popup.matches(':popover-open')
  }

  toggle () {
    if (this.isOpen) {
      this.close()
    } else {
      this.open()
    }
  }

  /**
   * Subclasses that need to seed field values on open should override this,
   * do their seeding, then call `super.open()` to perform the shared
   * display/position/aria work.
   * @returns {void}
   */
  open () {
    if (!this.isOpen) {
      // Passing `source` registers $trigger as this popover's invoker, so
      // the native light-dismiss algorithm doesn't treat clicking it again
      // (to toggle closed) as an outside click, and Escape returns focus to
      // it — matching the previous manual handleKeyDown behavior.
      this.$popup.showPopover({ source: this.$trigger })
    }
    this.$popup.style.display = 'flex'
    this.$trigger.setAttribute('aria-expanded', 'true')
    this.positionPopup()
  }

  close () {
    // Set before hidePopover() so handleToggle's resulting 'toggle' event
    // (fired synchronously) doesn't re-enter close() while it's already
    // running.
    this._skipToggleSync = true
    if (this.isOpen) {
      this.$popup.hidePopover()
    }
    this._skipToggleSync = false
    this.$popup.style.display = 'none'
    this.$trigger.setAttribute('aria-expanded', 'false')
  }

  /**
   * Position the popover just below the trigger, flipping above it when
   * there isn't room below, clamped to the viewport. `left`/`top` are
   * viewport coordinates, but a `position: fixed` element is resolved
   * against the nearest ancestor that establishes a containing block (any
   * transform/filter/contain/perspective/will-change). Embedders such as
   * Obsidian — or their themes — routinely set those on a pane, which would
   * otherwise fling this popup far off the trigger. Re-measure and correct
   * by the delta so it lands under the trigger regardless of the containing
   * block; a scaled ancestor makes one delta over/undershoot, so iterate
   * until the residual is sub-pixel (converges in a couple of rounds).
   * @returns {void}
   */
  positionPopup () {
    const btn = this.$trigger.getBoundingClientRect()
    const pop = this.$popup.getBoundingClientRect()
    const gap = 6
    const margin = 8

    let left = btn.left
    if (left + pop.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - pop.width - margin)
    }

    let top = btn.bottom + gap
    if (top + pop.height > window.innerHeight - margin) {
      const aboveTop = btn.top - gap - pop.height
      top = aboveTop >= margin
        ? aboveTop
        : Math.max(margin, window.innerHeight - pop.height - margin)
    }

    let styleLeft = left
    let styleTop = top
    for (let i = 0; i < 4; i++) {
      this.$popup.style.left = `${styleLeft}px`
      this.$popup.style.top = `${styleTop}px`
      const after = this.$popup.getBoundingClientRect()
      const dx = left - after.left
      const dy = top - after.top
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break
      styleLeft += dx
      styleTop += dy
    }
  }

  /**
   * Browser-driven closes (outside click, Escape, or another auto popover
   * opening) call `$popup.hidePopover()` directly, bypassing `close()`
   * above. Route those back through the (possibly overridden) `close()` so
   * subclasses with close-time side effects still run.
   * @param {ToggleEvent} e
   * @returns {void}
   */
  handleToggle (e) {
    if (e.newState === 'closed' && !this._skipToggleSync) {
      this.close()
    }
  }
}
