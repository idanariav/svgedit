/**
 * Hotkeys.js — central keyboard-shortcut registry for the editor.
 *
 * Historically svgedit had two uncoordinated shortcut systems: the editor-level
 * `this.shortcuts` array (one document keydown listener built in `setAll()`) and
 * a per-component listener self-registered by every `se-button` / `se-menu-item`
 * carrying a `shortcut="…"` attribute. Neither was user-configurable and the two
 * could not see each other's bindings, so conflicts and rebinding were
 * impossible.
 *
 * `HotkeyManager` is the single source of truth that both systems now feed into.
 * It owns:
 *   - the canonical action registry (one descriptor per action),
 *   - runtime dispatch (a single document keydown listener),
 *   - per-user customisation + persistence (via the `userDataAdapter` seam, with
 *     a `localStorage` fallback under `svg-edit-hotkeys`),
 *   - conflict detection (a key may bind to at most one action),
 *   - the read API consumed by the Hotkey Manager dialog (`se-hotkey-dialog`).
 *
 * @module Hotkeys
 */
import { isMac } from '@svgedit/svgcanvas/common/browser'
import { isActiveEditor } from './domScope.js'
import { getUserDataAdapter } from './userDataAdapter.js'
import { t } from './locale.js'

const STORAGE_KEY = 'svg-edit-hotkeys'
// Canonical physical-modifier order (matches the legacy editor handler order).
const MOD_ORDER = ['alt', 'shift', 'meta', 'ctrl']
const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta'])
// Non-character keys accepted as the final token of a component shortcut.
const NAMED_KEYS = new Set([
  'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'tab', 'escape', 'esc',
  'delete', 'del', 'backspace', 'enter', 'return', 'space', 'home', 'end',
  'pageup', 'pagedown', 'insert',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'
])
const isValidKeyToken = (k) => /^[a-z0-9]$/.test(k) || NAMED_KEYS.has(k)
// A human-readable display hint (e.g. "Z / Ctrl + wheel", "Delete/Backspace")
// rather than a single bindable combo.
const isDisplayString = (raw) => /[\s/]/.test(raw)

// The platform "command" modifier expanded to its physical key: Cmd (meta) on
// Mac, Ctrl elsewhere. Authoring specs use the `mod` token; it is expanded here
// so stored/compared keys are always physical modifiers.
const cmdMod = () => (isMac() ? 'meta' : 'ctrl')

/**
 * Normalise an authoring spec (tokens `mod`/`ctrl`/`alt`/`shift`/`meta` + key)
 * to canonical physical form, e.g. `mod+a` → `meta+a` (Mac) / `ctrl+a` (else).
 * @param {string} spec
 * @returns {?string} canonical key, or null if the spec is unparseable
 */
const normalizeSpec = (spec) => {
  const parts = String(spec).toLowerCase().split('+').map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return null
  const key = parts.pop()
  const mods = new Set()
  for (const p of parts) {
    if (p === 'mod') mods.add(cmdMod())
    else if (p === 'ctrl' || p === 'alt' || p === 'shift' || p === 'meta') mods.add(p)
    else return null
  }
  const ordered = MOD_ORDER.filter((m) => mods.has(m))
  return [...ordered, key].join('+')
}

/**
 * Normalise a component's raw `shortcut` HTML attribute. In that authoring form
 * `ctrl+` means the platform command key, and multi-token display strings
 * (e.g. "Z / Ctrl + wheel", "Delete/Backspace") are decorative — not real
 * bindings — so they are reported as null (display-only).
 * @param {string} raw
 * @returns {?string} canonical key, or null when decorative/empty
 */
const normalizeComponentSpec = (raw) => {
  if (!raw || isDisplayString(raw)) return null
  const canonical = normalizeSpec(raw.replace(/ctrl/ig, 'mod'))
  if (!canonical) return null
  // Reject non-key garbage (e.g. an unresolved i18n path used as a shortcut).
  return isValidKeyToken(canonical.split('+').pop()) ? canonical : null
}

/**
 * Expand an editor-level authoring key into its canonical alternatives. `/`
 * separates equivalent keys (e.g. `delete/backspace`), giving an action more
 * than one default binding.
 * @param {string} key
 * @returns {string[]}
 */
const expandEditorKey = (key) =>
  String(key).split('/').map((k) => normalizeSpec(k)).filter(Boolean)

/**
 * Build the canonical key string for a keydown event, or null for a lone
 * modifier press (which must never bind).
 * @param {KeyboardEvent} e
 * @returns {?string}
 */
const pressedCombo = (e) => {
  const key = e.key.toLowerCase()
  if (MODIFIER_KEYS.has(key)) return null
  const mods = []
  if (e.altKey) mods.push('alt')
  if (e.shiftKey) mods.push('shift')
  if (e.metaKey) mods.push('meta')
  if (e.ctrlKey) mods.push('ctrl')
  return [...mods, key].join('+')
}

// Human-readable token map for displaying a canonical key in the UI.
const KEY_LABELS = {
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  arrowdown: '↓',
  ' ': 'Space',
  escape: 'Esc',
  delete: 'Del',
  backspace: 'Backspace',
  tab: 'Tab'
}
const MOD_LABELS = () => ({
  meta: isMac() ? '⌘' : 'Meta',
  ctrl: 'Ctrl',
  alt: isMac() ? '⌥' : 'Alt',
  shift: isMac() ? '⇧' : 'Shift'
})

/**
 * Pretty-print a canonical key for display, e.g. `meta+shift+r` → `⌘ + ⇧ + R`.
 * @param {string} canonical
 * @returns {string}
 */
export const formatHotkey = (canonical) => {
  const labels = MOD_LABELS()
  return canonical.split('+').map((tok) => {
    if (labels[tok]) return labels[tok]
    if (KEY_LABELS[tok]) return KEY_LABELS[tok]
    return tok.length === 1 ? tok.toUpperCase() : tok.charAt(0).toUpperCase() + tok.slice(1)
  }).join(' + ')
}

// Bucket a component (button/menu) action into a manager group by its id.
// Anything not listed falls back to 'Tools'.
const GROUP_BY_ID = {
  // View toggles
  tool_frame: 'View',
  tool_wireframe: 'View',
  tool_theme_toggle: 'View',
  // Undo / duplicate / delete
  tool_undo: 'Edit',
  tool_redo: 'Edit',
  tool_clone: 'Edit',
  tool_delete: 'Edit',
  tool_clone_multi: 'Edit',
  tool_delete_multi: 'Edit',
  // Group / link
  tool_group_elements: 'Group',
  tool_ungroup: 'Group',
  tool_make_link: 'Group',
  tool_make_link_multi: 'Group',
  tool_unlink_use: 'Group',
  // Transform
  tool_flip_h: 'Transform',
  tool_flip_v: 'Transform',
  // Path / node editing
  tool_node_link: 'Path',
  tool_node_clone: 'Path',
  tool_node_delete: 'Path',
  tool_openclose_path: 'Path',
  tool_add_subpath: 'Path',
  tool_topath: 'Path',
  tool_stroke_to_path: 'Path',
  tool_reorient: 'Path',
  // Boolean ops
  tool_bool_union: 'Boolean',
  tool_bool_intersect: 'Boolean',
  tool_bool_subtract: 'Boolean',
  tool_bool_exclude: 'Boolean',
  tool_bool_divide: 'Boolean',
  // Clip / mask
  tool_clip_set: 'Mask',
  tool_mask_set: 'Mask',
  clipmask_release: 'Mask',
  // Text
  tool_bold: 'Text',
  tool_italic: 'Text',
  tool_text_decoration_underline: 'Text',
  tool_text_decoration_linethrough: 'Text',
  tool_text_decoration_overline: 'Text',
  // Layers
  layer_new: 'Layers',
  layer_delete: 'Layers',
  layer_rename: 'Layers',
  layer_up: 'Layers',
  layer_down: 'Layers',
  layer_moreopts: 'Layers',
  // Connectors
  connleader: 'Connector',
  connroute_elbow: 'Connector',
  connroute_straight: 'Connector',
  // File
  tool_clear: 'File',
  tool_save: 'File'
}
// Stable display order for groups; unknown groups are appended alphabetically.
export const GROUP_ORDER = [
  'Tools', 'View', 'Edit', 'Group', 'Transform', 'Arrange', 'Align',
  'Path', 'Boolean', 'Mask', 'Text', 'Layers', 'Connector', 'File',
  'Move', 'Clone', 'Rotate', 'Zoom', 'Selection', 'Navigate'
]

/**
 * @typedef {object} HotkeyAction
 * @property {string} id
 * @property {string} group
 * @property {string[]} defaultKeys canonical
 * @property {boolean} pd preventDefault on dispatch
 * @property {?function} run editor-level action (null for component actions)
 * @property {?Element} el component element to click (null for editor actions)
 * @property {string} labelKey i18n key / fallback label
 * @property {?string} decorative raw display string when the binding is fixed
 */

/**
 * Central hotkey registry.
 */
export default class HotkeyManager {
  /**
   * @param {object} editor the SVGEditor instance
   */
  constructor (editor) {
    this.editor = editor
    /** @type {Map<string, HotkeyAction>} */
    this.actions = new Map()
    /** @type {Object<string, string[]>} per-action override of canonical keys */
    this.overrides = {}
    this._loaded = false
    this._handler = null
  }

  /* ----------------------------------------------------------------- ingest */

  /**
   * Ingest the editor-level `this.shortcuts` array. Each entry must carry
   * `id`, `group`, `label`; `key` may use `mod`/`ctrl` tokens and `/`
   * alternatives, `pd` is preserved.
   * @param {Array<object>} shortcuts
   * @returns {void}
   */
  ingestEditorShortcuts (shortcuts) {
    shortcuts.forEach((sc) => {
      if (!sc.id) return
      let keyval = sc.key
      let pd = false
      if (Array.isArray(sc.key)) {
        keyval = sc.key[0]
        pd = sc.key.length > 1 ? sc.key[1] : false
      }
      this.actions.set(sc.id, {
        id: sc.id,
        group: sc.group || 'Selection',
        defaultKeys: keyval ? expandEditorKey(keyval) : [],
        pd,
        run: sc.fn,
        el: null,
        labelKey: sc.label,
        decorative: null
      })
    })
  }

  /**
   * Register (or refresh) a component-backed action. Called by `se-button` /
   * `se-menu-item` on connect, so late-loading extension buttons self-register.
   * @param {object} opts
   * @param {string} opts.id
   * @param {Element} opts.el element whose `click()` performs the action
   * @param {string} [opts.label] i18n key (defaults to the element's title)
   * @param {string} [opts.rawKey] the raw `shortcut` attribute
   * @returns {void}
   */
  registerEl ({ id, el, label, rawKey }) {
    if (!id) return
    const canonical = normalizeComponentSpec(rawKey)
    // A non-bindable but human-readable hint (e.g. "Z / Ctrl + wheel") is shown
    // read-only; anything else with no valid combo is simply unassigned (and so
    // remains editable, letting the user add a real binding).
    const decorative = (!canonical && rawKey && isDisplayString(rawKey)) ? rawKey : null
    this.actions.set(id, {
      id,
      group: GROUP_BY_ID[id] || 'Tools',
      defaultKeys: canonical ? [canonical] : [],
      pd: true,
      run: null,
      el,
      labelKey: label || id,
      decorative
    })
  }

  /* -------------------------------------------------------------- effective */

  /**
   * The registered descriptor for an action id (or undefined). Used by the
   * quick-action favorites menu to resolve an id to its live label / element /
   * editor handler.
   * @param {string} id
   * @returns {HotkeyAction|undefined}
   */
  getAction (id) {
    return this.actions.get(id)
  }

  /**
   * The effective canonical keys for an action (override if set, else default).
   * @param {string} id
   * @returns {string[]}
   */
  effectiveKeys (id) {
    if (Object.prototype.hasOwnProperty.call(this.overrides, id)) return this.overrides[id]
    const a = this.actions.get(id)
    return a ? a.defaultKeys : []
  }

  /**
   * Resolve a display label for an action (live for component actions).
   * @param {HotkeyAction} a
   * @returns {string}
   */
  labelFor (a) {
    const key = a.el ? (a.el.getAttribute('title') || a.labelKey) : a.labelKey
    const translated = t(key)
    return translated || key
  }

  /**
   * Build the reverse index `canonicalKey → actionId` from effective bindings.
   * First binding wins (conflicts are prevented at edit time).
   * @returns {Map<string,string>}
   */
  reverseMap () {
    const map = new Map()
    for (const id of this.actions.keys()) {
      for (const key of this.effectiveKeys(id)) {
        if (!map.has(key)) map.set(key, id)
      }
    }
    return map
  }

  /**
   * The id an action key is bound to, if any (for conflict checks).
   * @param {string} key canonical
   * @param {string} [exceptId] ignore this action's own bindings
   * @returns {?string}
   */
  conflictFor (key, exceptId) {
    for (const id of this.actions.keys()) {
      if (id === exceptId) continue
      if (this.effectiveKeys(id).includes(key)) return id
    }
    return null
  }

  /* ------------------------------------------------------------- edit + UI */

  /**
   * Grouped, display-ready snapshot of every action for the manager dialog.
   * @returns {Array<{group:string, actions:Array<object>}>}
   */
  listForUi () {
    const groups = new Map()
    for (const a of this.actions.values()) {
      if (!groups.has(a.group)) groups.set(a.group, [])
      groups.get(a.group).push({
        id: a.id,
        label: this.labelFor(a),
        keys: this.effectiveKeys(a.id),
        decorative: a.decorative,
        readonly: !!a.decorative,
        customised: Object.prototype.hasOwnProperty.call(this.overrides, a.id)
      })
    }
    const ordered = [...groups.keys()].sort((x, y) => {
      const ix = GROUP_ORDER.indexOf(x); const iy = GROUP_ORDER.indexOf(y)
      if (ix === -1 && iy === -1) return x.localeCompare(y)
      if (ix === -1) return 1
      if (iy === -1) return -1
      return ix - iy
    })
    return ordered.map((g) => ({
      group: g,
      actions: groups.get(g).sort((a, b) => a.label.localeCompare(b.label))
    }))
  }

  /**
   * Add a canonical key to an action. Rejects (returns the conflicting id) when
   * the key is already bound elsewhere.
   * @param {string} id
   * @param {string} key canonical
   * @returns {{ok:boolean, conflict?:string}}
   */
  addKey (id, key) {
    // Canonicalise so modifier ordering can't produce a phantom non-match
    // (the recorder already emits canonical keys; this guards other callers).
    key = normalizeSpec(key) || key
    const conflict = this.conflictFor(key, id)
    if (conflict) return { ok: false, conflict }
    const keys = this.effectiveKeys(id)
    if (!keys.includes(key)) this.overrides[id] = [...keys, key]
    else this.overrides[id] = [...keys]
    this._commit()
    return { ok: true }
  }

  /**
   * Remove a canonical key from an action.
   * @param {string} id
   * @param {string} key canonical
   * @returns {void}
   */
  removeKey (id, key) {
    this.overrides[id] = this.effectiveKeys(id).filter((k) => k !== key)
    this._commit()
  }

  /**
   * Restore one action to its default bindings.
   * @param {string} id
   * @returns {void}
   */
  resetAction (id) {
    delete this.overrides[id]
    this._commit()
  }

  /**
   * Restore every action to its defaults.
   * @returns {void}
   */
  resetAll () {
    this.overrides = {}
    this._commit()
  }

  /**
   * Parse a keydown into a canonical key for the recorder, or null for a lone
   * modifier press.
   * @param {KeyboardEvent} e
   * @returns {?string}
   */
  static keyFromEvent (e) {
    return pressedCombo(e)
  }

  /* ------------------------------------------------------------ dispatch */

  /**
   * Install the single document keydown dispatcher (idempotent — removes any
   * previously installed handler so re-init does not stack listeners).
   * @returns {void}
   */
  register () {
    this._load()
    if (this._handler) document.removeEventListener('keydown', this._handler)
    this._handler = (e) => {
      if (e.target.nodeName !== 'BODY') return
      if (!isActiveEditor(this.editor)) return
      const combo = pressedCombo(e)
      if (!combo) return
      const id = this.reverseMap().get(combo)
      if (!id) return
      const a = this.actions.get(id)
      if (!a) return
      if (a.run) a.run()
      else if (a.el) a.el.click()
      if (a.pd) e.preventDefault()
    }
    document.addEventListener('keydown', this._handler)
  }

  /**
   * Remove the document keydown dispatcher (call before discarding the editor).
   * @returns {void}
   */
  unregister () {
    if (this._handler) {
      document.removeEventListener('keydown', this._handler)
      this._handler = null
    }
  }

  /* --------------------------------------------------------- persistence */

  /** Load overrides from the host adapter or localStorage (once). */
  _load () {
    if (this._loaded) return
    this._loaded = true
    try {
      const adapter = getUserDataAdapter()
      if (adapter && typeof adapter.getHotkeys === 'function') {
        this.overrides = adapter.getHotkeys() || {}
      } else if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY)
        this.overrides = raw ? JSON.parse(raw) : {}
      }
    } catch (err) {
      console.error('Failed to load hotkeys', err)
      this.overrides = {}
    }
  }

  /** Drop overrides that match defaults, then persist. */
  _commit () {
    for (const id of Object.keys(this.overrides)) {
      const a = this.actions.get(id)
      if (a && sameKeys(this.overrides[id], a.defaultKeys)) delete this.overrides[id]
    }
    this._persist()
  }

  /** Persist overrides via the host adapter or localStorage. */
  _persist () {
    try {
      const adapter = getUserDataAdapter()
      if (adapter && typeof adapter.setHotkeys === 'function') {
        adapter.setHotkeys({ ...this.overrides })
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.overrides))
      }
    } catch (err) {
      console.error('Failed to persist hotkeys', err)
    }
  }
}

/**
 * Order-insensitive equality for two canonical key lists.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
const sameKeys = (a, b) => {
  if (a.length !== b.length) return false
  const sb = [...b].sort()
  return [...a].sort().every((k, i) => k === sb[i])
}
