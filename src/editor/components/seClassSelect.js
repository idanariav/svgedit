/* globals svgEditor */
import { t } from '../locale.js'
import { fetchSvgEl } from './svgIconLoader.js'
import {
  getClass,
  getClassesForScope,
  saveClass,
  deleteClass,
  elementScope,
  attrCatalog
} from '../classLibrary.js'

/**
 * Replacement for the old free-text class input. Presents the saved class
 * library as a dropdown (filtered to the selected element's scope), plus
 * buttons to save/update a class from the current object and to delete a class.
 * Picking a class stamps its captured attributes onto the selection
 * (`applyClass`) as a single undo step.
 */

const template = document.createElement('template')
template.innerHTML = `
<style>
:host { display: flex; flex-direction: column; min-width: 0; }
.top-label {
  display: none;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted, #6B7280);
  margin: 0 0 5px 2px;
  white-space: nowrap;
}
:host([label]) .top-label { display: block; }
.row { display: flex; align-items: center; gap: 6px; }
.field {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 34px;
  background: var(--field-bg, #F7F8FA);
  border: 1px solid var(--field-border, #E2E5EA);
  border-radius: 8px;
  overflow: hidden;
  transition: border-color .12s, box-shadow .12s, background .12s;
}
.field:focus-within {
  border-color: var(--accent, #2962FF);
  background: var(--chrome-bg, #FFFFFF);
  box-shadow: 0 0 0 3px var(--accent-ring, rgba(41,98,255,0.16));
}
select {
  flex: 1;
  min-width: 0;
  background: transparent;
  color: var(--fg, #1B1F24);
  border: none;
  height: 32px;
  padding: 0 8px;
  font-size: 13px;
  font-weight: 500;
  font-family: var(--ui-font, inherit);
  appearance: none;
  outline: none;
  cursor: pointer;
}
.chev {
  width: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--faint, #99A0AC);
  pointer-events: none;
}
.chev svg { width: 12px; height: 12px; display: block; }
.iconbtn {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--field-border, #E2E5EA);
  border-radius: 8px;
  background: var(--field-bg, #F7F8FA);
  color: var(--icon, #4B5563);
  cursor: pointer;
  transition: background .12s, border-color .12s, color .12s;
}
.iconbtn:hover {
  border-color: var(--accent-border, #C7D7FF);
  background: var(--icon-hover-bg, #EEF1F5);
  color: var(--icon-hover, #0F172A);
}
.iconbtn:disabled { opacity: 0.4; cursor: default; }
.iconbtn:disabled:hover {
  border-color: var(--field-border, #E2E5EA);
  background: var(--field-bg, #F7F8FA);
  color: var(--icon, #4B5563);
}
.iconbtn .ic { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; }
.iconbtn .ic svg, .iconbtn .ic img { width: 16px; height: 16px; display: block; }

.popover {
  position: fixed;
  flex-direction: column;
  gap: 10px;
  width: 250px;
  padding: 12px;
  background: var(--chrome-bg, #FFFFFF);
  border: 1px solid var(--chrome-border, #E6E8EC);
  border-radius: 10px;
  box-shadow: 0 4px 16px -2px rgba(0,0,0,0.12);
  z-index: 100;
}
.pop-title { font-size: 12px; font-weight: 700; color: var(--fg, #1B1F24); }
.lbl {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted, #6B7280);
}
.lbl input, .lbl select {
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  color: var(--fg, #1B1F24);
  background: var(--field-bg, #F7F8FA);
  border: 1px solid var(--field-border, #E2E5EA);
  border-radius: 7px;
  height: 30px;
  padding: 0 8px;
  outline: none;
}
.lbl input:focus, .lbl select:focus { border-color: var(--accent, #2962FF); }
.checklist {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 200px;
  overflow: auto;
  border: 1px solid var(--field-border, #E2E5EA);
  border-radius: 7px;
  padding: 6px;
}
.checkrow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--fg, #1B1F24);
  cursor: pointer;
  padding: 1px 2px;
}
.checkrow input { margin: 0; flex-shrink: 0; }
.checkrow .val {
  margin-left: auto;
  color: var(--muted, #6B7280);
  font-variant-numeric: tabular-nums;
  max-width: 95px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actions { display: flex; gap: 6px; }
.actions button {
  flex: 1;
  padding: 7px 0;
  border-radius: 8px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background .12s, border-color .12s, color .12s;
}
.cancel {
  border: 1px solid var(--field-border, #E2E5EA);
  background: var(--field-bg, #F7F8FA);
  color: var(--fg, #1B1F24);
}
.cancel:hover { background: var(--icon-hover-bg, #EEF1F5); }
.save {
  border: 1px solid var(--accent-border, #C7D7FF);
  background: var(--accent-soft, #E8EFFF);
  color: var(--accent, #2962FF);
}
.save:hover { border-color: var(--accent, #2962FF); }
</style>
<label class="top-label"></label>
<div class="row">
  <div class="field">
    <select></select>
    <span class="chev" aria-hidden="true">
      <svg viewBox="0 0 12 12" fill="none"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </span>
  </div>
  <button class="iconbtn add" type="button" title="Save class from object"><span class="ic ic-add"></span></button>
  <button class="iconbtn del" type="button" title="Delete class" disabled><span class="ic ic-del"></span></button>
</div>
<div class="popover" role="dialog" aria-label="Save class" style="display:none">
  <div class="pop-title">Save class</div>
  <label class="lbl">Name<input class="cl-name" type="text" placeholder="e.g. title"></label>
  <label class="lbl">Scope
    <select class="cl-scope">
      <option value="text">Text</option>
      <option value="shape">Shape</option>
      <option value="any">Any</option>
    </select>
  </label>
  <div class="lbl">Attributes</div>
  <div class="checklist"></div>
  <div class="actions">
    <button class="cancel" type="button">Cancel</button>
    <button class="save" type="button">Save</button>
  </div>
</div>
`

/**
 * Set an attribute only if the new value differs from the current one,
 * recording the previous value into `oldAttrs` for undo. `value === null`
 * removes the attribute. Mirrors the helper used by ext-color-shift.
 * @param {Element} elem
 * @param {string} attr
 * @param {string|null} value
 * @param {Object} oldAttrs
 * @returns {void}
 */
const setAttrIfChanged = (elem, attr, value, oldAttrs) => {
  const current = elem.getAttribute(attr)
  const next = value === null ? null : String(value)
  if (current === next) return
  oldAttrs[attr] = current ?? ''
  if (next === null) elem.removeAttribute(attr)
  else elem.setAttribute(attr, next)
}

/** Class tokens not under editor control (e.g. layer/internal `se_*`). */
const internalTokens = elem =>
  (elem.getAttribute('class') || '').split(/\s+/).filter(tk => tk.startsWith('se_'))

/** The user-facing (library) class token currently on an element. */
const currentUserClass = elem =>
  (elem.getAttribute('class') || '')
    .split(/\s+/)
    .filter(tk => tk && !tk.startsWith('se_'))
    .join(' ')

/** Build the next `class` string preserving internal tokens; null if empty. */
const nextClassString = (elem, name) => {
  const next = [...internalTokens(elem), name].filter(Boolean).join(' ')
  return next || null
}

class SeClassSelect extends HTMLElement {
  constructor () {
    super()
    this.handleClose = this.handleClose.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)

    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))

    this.$label = this._shadowRoot.querySelector('.top-label')
    this.$select = this._shadowRoot.querySelector('.field select')
    this.$add = this._shadowRoot.querySelector('.add')
    this.$del = this._shadowRoot.querySelector('.del')
    this.$row = this._shadowRoot.querySelector('.row')
    this.$popover = this._shadowRoot.querySelector('.popover')
    this.$name = this._shadowRoot.querySelector('.cl-name')
    this.$scope = this._shadowRoot.querySelector('.cl-scope')
    this.$checklist = this._shadowRoot.querySelector('.checklist')

    this._elem = null
    this._editingPreset = null

    this.$select.addEventListener('change', () => this.applyClass(this.$select.value))
    this.$add.addEventListener('click', e => {
      e.stopPropagation()
      this.openSave()
    })
    this.$del.addEventListener('click', e => {
      e.stopPropagation()
      this.deleteCurrent()
    })
    this.$scope.addEventListener('change', () =>
      this._renderChecklist(this.$scope.value, this._editingPreset)
    )
    this._shadowRoot.querySelector('.cancel').addEventListener('click', () => this.closeSave())
    this._shadowRoot.querySelector('.save').addEventListener('click', () => this.save())

    document.addEventListener('click', this.handleClose)
    this.addEventListener('keydown', this.handleKeyDown)
  }

  connectedCallback () {
    const label = this.getAttribute('label')
    if (label) this.$label.textContent = t(label)
    const title = this.getAttribute('title')
    if (title) this.$select.setAttribute('title', t(title))
    this._loadIcons()
  }

  async _loadIcons () {
    const imgPath = svgEditor?.configObj?.curConfig?.imgPath
    if (!imgPath) return
    const set = async (host, src) => {
      const svgEl = await fetchSvgEl(`${imgPath}/${src}`)
      if (svgEl) {
        svgEl.style.cssText = 'width:16px;height:16px;display:block;'
        host.replaceChildren(svgEl)
      }
    }
    set(this._shadowRoot.querySelector('.ic-add'), 'new.svg')
    set(this._shadowRoot.querySelector('.ic-del'), 'delete.svg')
  }

  /**
   * Rebuild the dropdown for the given element, filtered by its scope, and
   * select the element's current library class.
   * @param {Element|null} elem
   * @returns {void}
   */
  refresh (elem) {
    this._elem = elem?.parentNode ? elem : null
    if (!this._elem) return
    const scope = elementScope(this._elem)
    const presets = getClassesForScope(scope)
    const userClass = currentUserClass(this._elem)

    this.$select.replaceChildren()
    this.$select.append(this._option('', t('properties.class_none') || '(none)'))
    presets.forEach(p => this.$select.append(this._option(p.name, p.name)))
    if (userClass && !presets.some(p => p.name === userClass)) {
      this.$select.append(this._option(userClass, `(custom: ${userClass})`))
    }
    this.$select.value = userClass || ''
    this._updateDelState()
  }

  _option (value, text) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = text
    return opt
  }

  _updateDelState () {
    const name = this.$select.value
    this.$del.disabled = !(name && getClass(name))
  }

  /**
   * Stamp the named class (and its captured attributes) onto every selected
   * element as a single undo step. An empty name removes the library class
   * token without reverting any attributes.
   * @param {string} name
   * @returns {void}
   */
  applyClass (name) {
    const svgCanvas = svgEditor.svgCanvas
    const elems = svgCanvas.getSelectedElements().filter(Boolean)
    if (!elems.length) return
    const preset = name ? getClass(name) : null
    const { BatchCommand, ChangeElementCommand } = svgCanvas.history
    const batch = new BatchCommand('Apply class')
    elems.forEach(elem => {
      const oldAttrs = {}
      setAttrIfChanged(elem, 'class', nextClassString(elem, name), oldAttrs)
      if (preset) {
        Object.entries(preset.attrs).forEach(([k, v]) =>
          setAttrIfChanged(elem, k, v, oldAttrs)
        )
        // Mirror the normal stroke-width path: paint the stroke beneath the
        // fill so it grows outward rather than inward (matters for text).
        if ('stroke-width' in preset.attrs) {
          setAttrIfChanged(elem, 'paint-order', 'stroke', oldAttrs)
        }
      }
      if (Object.keys(oldAttrs).length) {
        batch.addSubCommand(new ChangeElementCommand(elem, oldAttrs))
      }
    })
    if (!batch.isEmpty()) svgCanvas.addCommandToHistory(batch)
    // Refresh the panels so the stamped fill/size/etc. are reflected. These
    // also re-run refresh() on this control, keeping the dropdown in sync.
    svgEditor.topPanel.update()
    svgEditor.topPanel.updateContextPanel()
  }

  /* ── Save / update popover ─────────────────────────────────────── */

  get isOpen () {
    return this.$popover.style.display === 'flex'
  }

  openSave () {
    if (!this._elem) return
    const current = this.$select.value
    const editing = current ? getClass(current) : null
    this._editingPreset = editing
    const scope = editing?.scope ?? elementScope(this._elem)
    this.$name.value = editing?.name ?? currentUserClass(this._elem)
    this.$scope.value = scope
    this._renderChecklist(scope, editing)
    this.$popover.style.display = 'flex'
    this.positionPopup()
    this.$name.focus()
  }

  closeSave () {
    this.$popover.style.display = 'none'
  }

  _renderChecklist (scope, editing) {
    const elem = this._elem
    this.$checklist.replaceChildren()
    attrCatalog(scope).forEach(attr => {
      const elemVal = elem.getAttribute(attr)
      const presetVal = editing?.attrs?.[attr]
      const hasVal = elemVal != null || presetVal != null
      const row = document.createElement('label')
      row.className = 'checkrow'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.dataset.attr = attr
      cb.checked = hasVal
      const nameEl = document.createElement('span')
      nameEl.textContent = attr
      const valEl = document.createElement('span')
      valEl.className = 'val'
      valEl.textContent = elemVal ?? presetVal ?? '—'
      row.append(cb, nameEl, valEl)
      this.$checklist.append(row)
    })
  }

  save () {
    const name = this.$name.value.trim()
    if (!name) {
      this.$name.focus()
      return
    }
    const scope = this.$scope.value
    const elem = this._elem
    const attrs = {}
    this.$checklist.querySelectorAll('input[type=checkbox]').forEach(cb => {
      if (!cb.checked) return
      const attr = cb.dataset.attr
      const v = elem.getAttribute(attr) ?? this._editingPreset?.attrs?.[attr]
      if (v != null) attrs[attr] = v
    })
    const existing = getClass(name)
    if (existing && this._editingPreset?.name !== name) {
      if (!window.confirm(`A class named "${name}" already exists. Overwrite it?`)) {
        return
      }
    }
    saveClass({ name, scope, attrs })
    this.closeSave()
    // Tag the source object with the new class (a no-op on its attributes) so
    // the dropdown reflects it and panels refresh.
    this.applyClass(name)
  }

  deleteCurrent () {
    const name = this.$select.value
    if (!name || !getClass(name)) return
    if (!window.confirm(`Delete class "${name}"?`)) return
    deleteClass(name)
    this.refresh(this._elem)
  }

  positionPopup () {
    const anchor = this.$row.getBoundingClientRect()
    const pop = this.$popover.getBoundingClientRect()
    const gap = 6
    let left = anchor.left
    if (left + pop.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - pop.width - 8)
    }
    let top = anchor.bottom + gap
    if (top + pop.height > window.innerHeight - 8) {
      top = Math.max(8, anchor.top - pop.height - gap)
    }
    // `left`/`top` are viewport coordinates, but a `position: fixed` element is
    // resolved against the nearest ancestor that establishes a containing block
    // (any transform/filter/contain/perspective/will-change). Embedders such as
    // Obsidian — or their themes — routinely set those on a pane, which would
    // otherwise fling this popover far off the trigger. Re-measure and correct by
    // the delta so it lands under the trigger regardless of the containing block.
    //
    // A single correction is exact when the containing block is only translated,
    // but a scaled ancestor (UI zoom, a `scale()` pane transform) makes one delta
    // over/undershoot. Iterate: the residual shrinks each pass and converges in a
    // couple of rounds, so cap the loop and bail once it's within a pixel.
    let styleLeft = left
    let styleTop = top
    for (let i = 0; i < 4; i++) {
      this.$popover.style.left = `${styleLeft}px`
      this.$popover.style.top = `${styleTop}px`
      const after = this.$popover.getBoundingClientRect()
      const dx = left - after.left
      const dy = top - after.top
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break
      styleLeft += dx
      styleTop += dy
    }
  }

  handleClose (e) {
    // Clicks anywhere inside this component retarget to the host (=== this).
    if (this.isOpen && e.target !== this) {
      this.closeSave()
    }
  }

  handleKeyDown (e) {
    if (e.key === 'Escape' && this.isOpen) {
      this.closeSave()
    }
  }
}

customElements.define('se-class-select', SeClassSelect)
