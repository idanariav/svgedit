/* globals svgEditor */
/**
 * SeFontSelect — <se-font-select> web component.
 *
 * A Google-Fonts-style replacement for the plain font-family <se-select>. The
 * trigger shows the active font rendered in its own typeface; clicking it opens
 * a themed popover with a search box and a scrollable list where every font is
 * previewed in its own face, so you can see how it looks before choosing it.
 *
 * Drop-in compatible with the old <se-select> font dropdown:
 *   - `src`     attribute → toolbar icon (loaded via svgIconLoader)
 *   - `options` attribute → comma-separated locale keys (labels)
 *   - `values`  attribute → "::"-separated font-family values
 *   - `value`   get/set    → currently selected font-family
 *   - `addOption(value, text)` → inject a downloaded/custom font
 *   - `change` event { detail: { value } } → fired on pick
 *
 * @license MIT
 */

import { t } from '../locale.js'
import { fetchSvgEl } from './svgIconLoader.js'

const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.5-3.5"/></svg>'
const CHEVRON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M6 9l6 6 6-6"/></svg>'
const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M20 6L9 17l-5-5"/></svg>'

const CSS = `
:host { display: inline-flex; align-items: center; }

.wrap {
  display: inline-flex; align-items: center; gap: 5px;
  height: 36px; padding: 0 6px 0 8px;
  background: var(--group-bg, #F6F7F9);
  border: 1px solid var(--group-border, #E6E8EC);
  border-radius: 10px;
}
.icon-wrap {
  width: 18px; height: 18px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--icon, #4B5563);
}
.icon-wrap svg, .icon-wrap img { width: 18px; height: 18px; display: block; }

.trigger {
  appearance: none; cursor: pointer; font-family: var(--ui-font, inherit);
  display: inline-flex; align-items: center; gap: 6px;
  height: 26px; min-width: 124px; max-width: 168px; padding: 0 6px 0 9px;
  background: var(--field-bg, #FFFFFF);
  color: var(--fg, #1B1F24);
  border: 1px solid var(--field-border, #DDE1E7);
  border-radius: 7px;
  transition: border-color .12s, box-shadow .12s;
}
.trigger:hover { border-color: var(--accent-border, #C7D7FF); }
.trigger.is-open {
  border-color: var(--accent, #2962FF);
  box-shadow: 0 0 0 3px var(--cp-focus-ring, rgba(41,98,255,.18));
}
.trigger-label {
  flex: 1; min-width: 0; text-align: left;
  font-size: 13px; font-weight: 500; line-height: 1;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.trigger-chevron { color: var(--muted, #6B7280); display: flex; flex-shrink: 0; }

.fl-popover {
  position: fixed; z-index: 9999;
  width: 268px; max-height: 380px;
  background: var(--chrome-bg, #FFF);
  border: 1px solid var(--chrome-border, #E6E8EC);
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 20px 50px -10px rgba(0,0,0,.22);
  display: flex; flex-direction: column; overflow: hidden;
  font-family: var(--ui-font, system-ui, sans-serif);
}
.fl-head {
  display: flex; align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--chrome-border, #E6E8EC);
  flex-shrink: 0;
}
.fl-search {
  flex: 1; display: inline-flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 10px;
  background: var(--field-bg, #FFF); border: 1px solid var(--field-border, #DDE1E7);
  border-radius: 8px;
}
.fl-search-icon { color: var(--muted, #6B7280); display: flex; flex-shrink: 0; }
.fl-search input {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: 12.5px; color: var(--fg, #1B1F24); font-family: inherit;
}
.fl-search input::placeholder { color: var(--muted, #6B7280); }

.fl-list { overflow-y: auto; padding: 6px; flex: 1; }
.fl-item {
  appearance: none; width: 100%; text-align: left; cursor: pointer;
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border: 1px solid transparent; border-radius: 9px;
  background: transparent; color: var(--fg, #1B1F24); font-family: inherit;
}
.fl-item:hover { background: var(--icon-hover-bg, #EEF1F5); }
.fl-item.is-active {
  background: var(--accent-soft, #E8EFFF);
  border-color: var(--accent-border, #C7D7FF);
}
.fl-item-preview {
  flex: 1; min-width: 0; font-size: 18px; line-height: 1.3;
  color: var(--fg, #1B1F24);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.fl-check { color: var(--accent, #2962FF); display: flex; flex-shrink: 0; visibility: hidden; }
.fl-item.is-active .fl-check { visibility: visible; }

.fl-empty { padding: 28px 16px; text-align: center; font-size: 12.5px; color: var(--muted, #6B7280); }
.trigger:focus-visible, .fl-item:focus-visible {
  outline: none; box-shadow: 0 0 0 3px var(--cp-focus-ring, rgba(41,98,255,.18));
}
`

export class SeFontSelect extends HTMLElement {
  constructor () {
    super()
    this._shadow = this.attachShadow({ mode: 'open' })
    this._options = [] // [{ value, label }]
    this._value = ''
    this._open = false
    this._query = ''
    this._outsideClick = null
    this._keyHandler = null
  }

  static get observedAttributes () { return ['src', 'title', 'options', 'values'] }

  attributeChangedCallback (name, oldVal, newVal) {
    if (oldVal === newVal) return
    switch (name) {
      case 'src':
        this._loadIcon(newVal)
        break
      case 'title':
        this._trigger?.setAttribute('title', t(newVal))
        break
      case 'options':
        this._labels = newVal === '' ? [] : newVal.split(',').map(o => t(o))
        this._rebuildOptions()
        break
      case 'values':
        this._values = newVal === '' ? [] : newVal.split('::')
        this._rebuildOptions()
        break
    }
  }

  connectedCallback () {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(CSS)
    this._shadow.adoptedStyleSheets = [sheet]
    this._shadow.innerHTML = `
      <div class="wrap">
        <span class="icon-wrap" aria-hidden="true"></span>
        <button class="trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
          <span class="trigger-label"></span>
          <span class="trigger-chevron">${CHEVRON_ICON}</span>
        </button>
      </div>
      <div class="fl-popover" style="display:none" role="listbox" aria-label="Fonts"></div>
    `
    this._trigger = this._shadow.querySelector('.trigger')
    this._iconWrap = this._shadow.querySelector('.icon-wrap')
    this._popover = this._shadow.querySelector('.fl-popover')
    this._trigger.addEventListener('click', e => { e.stopPropagation(); this._toggle() })

    if (this.getAttribute('src') && !this._iconWrap.firstChild) this._loadIcon(this.getAttribute('src'))
    if (this.getAttribute('title')) this._trigger.setAttribute('title', t(this.getAttribute('title')))
    this._renderTrigger()
  }

  disconnectedCallback () { this._removeListeners() }

  /** Build the option list from parsed labels + values (paired by index). */
  _rebuildOptions () {
    if (!this._values) return
    this._options = this._values.map((value, i) => ({
      value,
      label: (this._labels && this._labels[i]) || value
    }))
    if (!this._value && this._options.length) this._value = this._options[0].value
    this._renderTrigger()
  }

  /**
   * Append a custom font option if not already present.
   * @param {string} value
   * @param {string} [text]
   */
  addOption (value, text = value) {
    if (this._options.some(o => o.value === value)) return
    this._options.push({ value, label: text })
    if (this._open) this._renderList()
  }

  get value () { return this._value }
  set value (v) {
    this._value = v == null ? '' : v
    this._renderTrigger()
    if (this._open) this._renderList()
  }

  _labelFor (value) {
    return this._options.find(o => o.value === value)?.label || value || '—'
  }

  _renderTrigger () {
    if (!this._trigger) return
    const label = this._shadow.querySelector('.trigger-label')
    label.textContent = this._labelFor(this._value)
    label.style.fontFamily = this._value ? `'${this._value.replace(/'/g, '')}', sans-serif` : 'inherit'
  }

  _toggle () { this._open ? this._close() : this._openPopover() }

  _openPopover () {
    this._open = true
    this._query = ''
    this._syncTheme()
    this._trigger.classList.add('is-open')
    this._trigger.setAttribute('aria-expanded', 'true')
    this._renderList()
    this._popover.style.display = ''
    this._position()
    this._attachListeners()
    requestAnimationFrame(() => this._shadow.querySelector('.fl-search input')?.focus())
  }

  _close () {
    this._open = false
    this._trigger.classList.remove('is-open')
    this._trigger.setAttribute('aria-expanded', 'false')
    this._popover.style.display = 'none'
    this._removeListeners()
  }

  _syncTheme () {
    const isDark = document.querySelector('.svg_editor')?.classList.contains('theme-dark')
    this.classList.toggle('theme-dark', !!isDark)
    this.classList.toggle('theme-light', !isDark)
  }

  _position () {
    const btn = this.getBoundingClientRect()
    const rect = this._popover.getBoundingClientRect()
    const gap = 8
    let left = btn.left
    if (left + rect.width > window.innerWidth - gap) left = Math.max(gap, window.innerWidth - gap - rect.width)
    let top = btn.bottom + gap
    if (top + rect.height > window.innerHeight - gap) top = Math.max(gap, btn.top - gap - rect.height)
    this._popover.style.left = `${left}px`
    this._popover.style.top = `${Math.max(gap, top)}px`
  }

  _visibleOptions () {
    const q = this._query.trim().toLowerCase()
    if (!q) return this._options
    return this._options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
  }

  _renderList () {
    const opts = this._visibleOptions()
    this._popover.innerHTML = `
      <div class="fl-head">
        <div class="fl-search">
          <span class="fl-search-icon">${SEARCH_ICON}</span>
          <input type="text" placeholder="Search fonts…" value="${this._escAttr(this._query)}"
                 autocomplete="off" spellcheck="false" aria-label="Search fonts">
        </div>
      </div>
      <div class="fl-list" role="presentation">
        ${opts.length
          ? opts.map(o => `
            <button class="fl-item${o.value === this._value ? ' is-active' : ''}" role="option"
                    aria-selected="${o.value === this._value}" data-value="${this._escAttr(o.value)}">
              <span class="fl-item-preview" style="font-family:'${this._escAttr(o.value)}', sans-serif">${this._esc(o.label)}</span>
              <span class="fl-check">${CHECK_ICON}</span>
            </button>`).join('')
          : '<div class="fl-empty">No fonts found</div>'}
      </div>
    `

    this._popover.querySelectorAll('.fl-item[data-value]').forEach(btn => {
      btn.addEventListener('click', () => this._pick(btn.dataset.value))
    })

    const input = this._popover.querySelector('.fl-search input')
    input?.addEventListener('input', () => {
      clearTimeout(this._searchTimer)
      this._searchTimer = setTimeout(() => {
        this._query = input.value
        this._renderList()
        this._shadow.querySelector('.fl-search input')?.focus()
      }, 150)
    })
  }

  _pick (value) {
    this.value = value
    this.dispatchEvent(new CustomEvent('change', { detail: { value } }))
    this._close()
  }

  _attachListeners () {
    this._outsideClick = e => {
      const path = e.composedPath()
      if (!path.includes(this)) this._close()
    }
    setTimeout(() => document.addEventListener('click', this._outsideClick, true), 0)
    this._keyHandler = e => { if (e.key === 'Escape') this._close() }
    document.addEventListener('keydown', this._keyHandler)
  }

  _removeListeners () {
    if (this._outsideClick) { document.removeEventListener('click', this._outsideClick, true); this._outsideClick = null }
    if (this._keyHandler) { document.removeEventListener('keydown', this._keyHandler); this._keyHandler = null }
  }

  async _loadIcon (src) {
    if (!src || !this._iconWrap) return
    this.imgPath = this.imgPath || svgEditor?.configObj?.curConfig?.imgPath
    if (!this.imgPath) return
    const url = `${this.imgPath}/${src}`
    const svgEl = await fetchSvgEl(url)
    if (svgEl) {
      this._iconWrap.replaceChildren(svgEl)
    } else {
      const img = document.createElement('img')
      img.src = url
      img.alt = 'icon'
      this._iconWrap.replaceChildren(img)
    }
  }

  _esc (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
  _escAttr (s) { return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
}

if (!customElements.get('se-font-select')) {
  customElements.define('se-font-select', SeFontSelect)
}
