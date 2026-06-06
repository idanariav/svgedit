/**
 * SeFontLibrary — <se-font-library> web component.
 *
 * A toolbar button that opens a popover catalog of Google Fonts. Picking a font
 * downloads it once (cached offline via fontStore), registers it for live canvas
 * rendering, and dispatches a `font-pick` event so the editor can apply it and
 * add it to the font-family dropdown.
 *
 * Attributes:
 *   catalog — URL of the google-fonts-catalog.json file
 *   title   — tooltip for the toolbar button
 *
 * Events (bubbles, composed):
 *   font-pick — { detail: { family } } after the font is downloaded + registered
 */

import { ensureFont, isCached, restoreAll } from '../extensions/ext-fonts/fontStore.js'
// Inlined Google-fonts catalog (bundled at build time) — removes the runtime
// fetch. The `catalog` attribute is still honoured as a fallback.
import googleFontsCatalog from '../extensions/ext-fonts/google-fonts-catalog.json'

const CAT_LABELS = {
  handwriting: 'Handwriting',
  'sans-serif': 'Sans-serif',
  serif: 'Serif',
  display: 'Display',
  monospace: 'Monospace'
}

const FONT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/></svg>'
const SEARCH13 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.5-3.5"/></svg>'

const CSS = `
:host { display: inline-flex; align-items: center; justify-content: center; }
.fl-tool {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid transparent; border-radius: 10px;
  background: transparent; cursor: pointer;
  color: var(--icon, #4B5563);
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.fl-tool:hover { background: var(--icon-hover-bg, #EEF1F5); color: var(--icon-hover, #0F172A); }
.fl-tool.pressed {
  background: var(--accent-soft, #E8EFFF); color: var(--accent, #2962FF);
  border-color: var(--accent-border, #C7D7FF);
}
.fl-tool svg { display: block; }

.fl-popover {
  position: fixed; z-index: 9999;
  width: 320px; max-height: 460px;
  background: var(--chrome-bg, #FFF);
  border: 1px solid var(--chrome-border, #E6E8EC);
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 20px 50px -10px rgba(0,0,0,.22);
  display: flex; flex-direction: column; overflow: hidden;
  font-family: var(--ui-font, system-ui, sans-serif);
}
.fl-head {
  display: flex; align-items: center; gap: 8px;
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

.fl-cats {
  display: flex; align-items: center; flex-wrap: wrap; gap: 4px;
  padding: 8px 12px; border-bottom: 1px solid var(--chrome-border, #E6E8EC);
  flex-shrink: 0;
}
.fl-cat {
  appearance: none; cursor: pointer; font-family: inherit;
  font-size: 11px; font-weight: 500; color: var(--fg, #1B1F24);
  padding: 3px 8px; border-radius: 999px;
  background: var(--field-bg, #FFF); border: 1px solid var(--field-border, #DDE1E7);
}
.fl-cat.is-active {
  background: var(--accent, #2962FF); border-color: var(--accent, #2962FF); color: #FFF;
}

.fl-list { overflow-y: auto; padding: 6px; flex: 1; }
.fl-item {
  appearance: none; width: 100%; text-align: left; cursor: pointer;
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border: 1px solid transparent; border-radius: 9px;
  background: transparent; color: var(--fg, #1B1F24); font-family: inherit;
}
.fl-item:hover { background: var(--icon-hover-bg, #EEF1F5); }
.fl-item-preview { flex: 1; min-width: 0; font-size: 18px; line-height: 1.3; color: var(--fg, #1B1F24); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fl-item-name { font-size: 10px; color: var(--muted, #6B7280); white-space: nowrap; }
.fl-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent, #2962FF); flex-shrink: 0; visibility: hidden; }
.fl-item.is-cached .fl-dot { visibility: visible; }
.fl-item.is-loading { opacity: 0.6; pointer-events: none; }

.fl-empty { padding: 28px 16px; text-align: center; font-size: 12.5px; color: var(--muted, #6B7280); }
.fl-foot { padding: 8px 12px; border-top: 1px solid var(--chrome-border, #E6E8EC); font-size: 10.5px; color: var(--muted, #6B7280); flex-shrink: 0; }
button:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--cp-focus-ring, rgba(41,98,255,.18)); }
`

export class SeFontLibrary extends HTMLElement {
  constructor () {
    super()
    this._shadow = this.attachShadow({ mode: 'open' })
    this._open = false
    this._fonts = []
    this._categories = []
    this._catId = 'handwriting'
    this._query = ''
    this._catalogPath = ''
    this._loaded = false
    this._outsideClick = null
    this._keyHandler = null
    this._previewRequested = new Set()
    this._io = null
  }

  static get observedAttributes () { return ['catalog', 'title'] }

  attributeChangedCallback (name, oldVal, newVal) {
    if (oldVal === newVal) return
    if (name === 'catalog') {
      this._catalogPath = newVal
    } else if (name === 'title') {
      const btn = this._shadow.querySelector('.fl-tool')
      if (btn) btn.title = newVal
    }
  }

  connectedCallback () {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(CSS)
    this._shadow.adoptedStyleSheets = [sheet]
    this._shadow.innerHTML = `
      <button class="fl-tool" type="button" title="${this._esc(this.getAttribute('title') || 'Fonts')}" aria-label="Fonts">
        ${FONT_ICON}
      </button>
      <div class="fl-popover" style="display:none" role="dialog" aria-label="Fonts"></div>
    `
    this._shadow.querySelector('.fl-tool').addEventListener('click', e => {
      e.stopPropagation()
      this._toggle()
    })
    this._syncTheme()
  }

  disconnectedCallback () { this._removeListeners(); this._io?.disconnect() }

  /**
   * Lazily load a tiny preview of one font so its name renders in its own
   * typeface. Uses Google's `text=` subsetting to fetch only the glyphs needed
   * for the family name (a few KB), injected as a document-level stylesheet
   * (font faces pierce the shadow boundary). Skipped if already requested or
   * already fully downloaded. Requires network — offline, names stay in the UI
   * font until downloaded.
   * @param {string} family
   */
  _loadPreview (family) {
    if (!family || this._previewRequested.has(family) || isCached(family)) return
    this._previewRequested.add(family)
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.dataset.fontPreview = family
    const fam = encodeURIComponent(family).replace(/%20/g, '+')
    link.href = `https://fonts.googleapis.com/css2?family=${fam}&text=${encodeURIComponent(family)}&display=swap`
    document.head.appendChild(link)
  }

  /**
   * Re-register previously downloaded fonts (offline). Delegated to fontStore so
   * all font-cache state lives in a single bundled module instance.
   * @returns {Promise<string[]>} restored font families
   */
  restoreCachedFonts () { return restoreAll() }

  _syncTheme () {
    const root = document.querySelector('.svg_editor')
    const isDark = root?.classList.contains('theme-dark')
    this.classList.toggle('theme-dark', !!isDark)
    this.classList.toggle('theme-light', !isDark)
  }

  async _loadCatalog () {
    if (this._loaded) return
    try {
      let json = googleFontsCatalog
      if (!json && this._catalogPath) {
        const r = await fetch(this._catalogPath)
        json = await r.json()
      }
      this._fonts = json?.fonts || []
      this._categories = json?.categories || []
      this._loaded = true
    } catch (e) {
      console.error('SeFontLibrary: failed to load catalog', e)
    }
  }

  async _toggle () {
    if (this._open) { this._close(); return }
    await this._loadCatalog()
    this._open = true
    this._syncTheme()
    this._shadow.querySelector('.fl-tool').classList.add('pressed')
    this._render()
    const pop = this._shadow.querySelector('.fl-popover')
    pop.style.display = ''
    this._position(pop)
    this._attachListeners()
    requestAnimationFrame(() => this._shadow.querySelector('.fl-search input')?.focus())
  }

  _close () {
    this._open = false
    this._query = ''
    this._shadow.querySelector('.fl-tool').classList.remove('pressed')
    this._shadow.querySelector('.fl-popover').style.display = 'none'
    this._removeListeners()
  }

  _position (pop) {
    const btn = this.getBoundingClientRect()
    const rect = pop.getBoundingClientRect()
    const gap = 8
    let left = btn.left
    if (left + rect.width > window.innerWidth - gap) left = Math.max(gap, window.innerWidth - gap - rect.width)
    let top = btn.bottom + gap
    if (top + rect.height > window.innerHeight - gap) top = Math.max(gap, window.innerHeight - gap - rect.height)
    pop.style.left = `${left}px`
    pop.style.top = `${top}px`
  }

  _visibleFonts () {
    const q = this._query.trim().toLowerCase()
    if (q) return this._fonts.filter(f => f.family.toLowerCase().includes(q))
    return this._fonts.filter(f => f.category === this._catId)
  }

  _render () {
    const pop = this._shadow.querySelector('.fl-popover')
    const fonts = this._visibleFonts()
    pop.innerHTML = `
      <div class="fl-head">
        <div class="fl-search">
          <span class="fl-search-icon">${SEARCH13}</span>
          <input type="text" placeholder="Search fonts…" value="${this._escAttr(this._query)}"
                 autocomplete="off" spellcheck="false" aria-label="Search fonts">
        </div>
      </div>
      <div class="fl-cats">
        ${this._categories.map(id => `
          <button class="fl-cat${id === this._catId && !this._query ? ' is-active' : ''}" data-cat="${id}">
            ${this._esc(CAT_LABELS[id] || id)}
          </button>`).join('')}
      </div>
      <div class="fl-list">
        ${fonts.length
          ? fonts.map(f => `
            <button class="fl-item${isCached(f.family) ? ' is-cached' : ''}" data-family="${this._escAttr(f.family)}">
              <span class="fl-item-preview" style="font-family:'${this._escAttr(f.family)}', sans-serif">${this._esc(f.family)}</span>
              <span class="fl-item-name">${this._esc(CAT_LABELS[f.category] || f.category)}</span>
              <span class="fl-dot" title="Downloaded"></span>
            </button>`).join('')
          : '<div class="fl-empty">No fonts found</div>'}
      </div>
      <div class="fl-foot">First use downloads the font once, then it works offline.</div>
    `

    pop.querySelectorAll('.fl-cat[data-cat]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        this._catId = btn.dataset.cat
        this._query = ''
        this._render()
      })
    })

    pop.querySelectorAll('.fl-item[data-family]').forEach(btn => {
      btn.addEventListener('click', () => this._pick(btn))
    })

    // Lazily load in-font previews for rows as they scroll into view
    this._io?.disconnect()
    const list = pop.querySelector('.fl-list')
    this._io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          this._loadPreview(en.target.dataset.family)
          this._io.unobserve(en.target)
        }
      })
    }, { root: list, rootMargin: '120px' })
    pop.querySelectorAll('.fl-item[data-family]').forEach(el => this._io.observe(el))

    const input = pop.querySelector('.fl-search input')
    input?.addEventListener('input', () => {
      clearTimeout(this._searchTimer)
      this._searchTimer = setTimeout(() => {
        this._query = input.value
        this._render()
        this._shadow.querySelector('.fl-search input')?.focus()
      }, 180)
    })
  }

  async _pick (btn) {
    const family = btn.dataset.family
    btn.classList.add('is-loading')
    try {
      await ensureFont(family)
    } catch (e) {
      console.error(`SeFontLibrary: failed to load "${family}"`, e)
      btn.classList.remove('is-loading')
      const foot = this._shadow.querySelector('.fl-foot')
      if (foot) foot.textContent = `Could not download "${family}" — check your connection.`
      return
    }
    this.dispatchEvent(new CustomEvent('font-pick', {
      bubbles: true, composed: true, detail: { family }
    }))
    this._close()
  }

  _attachListeners () {
    this._outsideClick = e => {
      const path = e.composedPath()
      if (!path.includes(this) && !path.some(el => el.classList?.contains('fl-popover'))) this._close()
    }
    setTimeout(() => document.addEventListener('click', this._outsideClick, true), 0)
    this._keyHandler = e => { if (e.key === 'Escape') this._close() }
    document.addEventListener('keydown', this._keyHandler)
  }

  _removeListeners () {
    if (this._outsideClick) { document.removeEventListener('click', this._outsideClick, true); this._outsideClick = null }
    if (this._keyHandler) { document.removeEventListener('keydown', this._keyHandler); this._keyHandler = null }
  }

  _esc (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
  _escAttr (s) { return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;') }
}

if (!customElements.get('se-font-library')) {
  customElements.define('se-font-library', SeFontLibrary)
}
