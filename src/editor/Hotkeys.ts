/**
 * Hotkeys.ts — central keyboard-shortcut registry for the editor.
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
import { isActiveEditor, ownsKeyEvent } from './domScope.ts'
import { getUserDataAdapter } from './userDataAdapter.ts'
import { error as logError } from '@svgedit/svgcanvas/common/logger.ts'

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
const isValidKeyToken = (k: string) => /^[a-z0-9]$/.test(k) || NAMED_KEYS.has(k)
// A human-readable display hint (e.g. "Z / Ctrl + wheel", "Delete/Backspace")
// rather than a single bindable combo.
const isDisplayString = (raw: string) => /[\s/]/.test(raw)

// The platform "command" modifier expanded to its physical key: Cmd (meta) on
// Mac, Ctrl elsewhere. Authoring specs use the `mod` token; it is expanded here
// so stored/compared keys are always physical modifiers.
const cmdMod = () => (isMac() ? 'meta' : 'ctrl')

/**
 * Normalise an authoring spec (tokens `mod`/`ctrl`/`alt`/`shift`/`meta` + key)
 * to canonical physical form, e.g. `mod+a` → `meta+a` (Mac) / `ctrl+a` (else).
 * @returns canonical key, or null if the spec is unparseable
 */
const normalizeSpec = (spec: string): string | null => {
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
 * @returns canonical key, or null when decorative/empty
 */
const normalizeComponentSpec = (raw: string): string | null => {
  if (!raw || isDisplayString(raw)) return null
  const canonical = normalizeSpec(raw.replace(/ctrl/ig, 'mod'))
  if (!canonical) return null
  // Reject non-key garbage (e.g. an unresolved i18n path used as a shortcut).
  return isValidKeyToken(canonical.split('+').pop() ?? '') ? canonical : null
}

/**
 * Expand an editor-level authoring key into its canonical alternatives. `/`
 * separates equivalent keys (e.g. `delete/backspace`), giving an action more
 * than one default binding.
 */
export const expandEditorKey = (key: string): string[] =>
  String(key).split('/').flatMap((k) => normalizeSpec(k) ?? [])

/**
 * Build the canonical key string for a keydown event, or null for a lone
 * modifier press (which must never bind).
 */
const pressedCombo = (e: KeyboardEvent): string | null => {
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
const KEY_LABELS: Record<string, string> = {
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
} as Record<string, string>)

/** Pretty-print a canonical key for display, e.g. `meta+shift+r` → `⌘ + ⇧ + R`. */
export const formatHotkey = (canonical: string): string => {
  const labels = MOD_LABELS()
  return canonical.split('+').map((tok) => {
    if (labels[tok]) return labels[tok]
    if (KEY_LABELS[tok]) return KEY_LABELS[tok]
    return tok.length === 1 ? tok.toUpperCase() : tok.charAt(0).toUpperCase() + tok.slice(1)
  }).join(' + ')
}

// A badge on a tool icon is a few pixels wide: modifiers are symbols on every platform.
const BADGE_MODS: Record<string, string> = { meta: '⌘', ctrl: '⌃', alt: '⌥', shift: '⇧' }

/**
 * A canonical key as short text for a tool badge: `v` → `V`, `shift+n` → `⇧N`, `meta+i` → `⌘I`.
 * @returns '' when there is no key
 */
export const formatBadgeKey = (canonical: string | null): string => {
  if (!canonical) return ''
  return canonical.split('+').map((tok) => {
    if (BADGE_MODS[tok]) return BADGE_MODS[tok]
    if (KEY_LABELS[tok]) return KEY_LABELS[tok]
    return tok.length === 1 ? tok.toUpperCase() : tok.charAt(0).toUpperCase() + tok.slice(1)
  }).join('')
}

/**
 * Format a component's raw `shortcut` attribute for tooltips/menus, per
 * platform: `ctrl+Z` → `⌘Z` (Mac) / `Ctrl+Z`. Decorative multi-token strings
 * ("Delete/Backspace") are shown as authored.
 * @returns '' when there is no shortcut
 */
export const formatShortcutAttr = (raw: string | null): string => {
  if (!raw) return ''
  const canonical = normalizeComponentSpec(raw)
  if (!canonical) return raw
  return formatCanonicalShortcut(canonical)
}

/** A canonical key as tooltip text, per platform: `meta+z` → `⌘Z` (Mac) / `Meta+Z`. */
const formatCanonicalShortcut = (canonical: string): string => formatHotkey(canonical).replace(/ \+ /g, isMac() ? '' : '+')

/**
 * Tooltip text: the name, plus the formatted shortcut in brackets if any
 * (no trailing space when there is none).
 * @param name already-translated name
 */
export const tooltipText = (name: string, rawShortcut: string | null): string => {
  const sc = formatShortcutAttr(rawShortcut)
  return sc ? `${name} [${sc}]` : name
}

/**
 * Like `tooltipText`, but the key is the action's *effective* binding in the hotkey manager, so a
 * rebinding (or a removed key) shows in the tooltip. An action the manager does not know yet, or one with
 * a read-only hint such as "Z / Ctrl + wheel", keeps the authored `shortcut` attribute.
 * @param name already-translated name
 * @param rawShortcut the authored `shortcut` attribute
 * @param id the action id
 */
export const boundTooltipText = (name: string, rawShortcut: string | null, hotkeys: HotkeyManager | undefined | null, id?: string): string => {
  const action = id ? hotkeys?.getAction(id) : undefined
  if (!hotkeys || !id || !action || action.decorative) return tooltipText(name, rawShortcut)
  const key = hotkeys.effectiveKeys(id)[0]
  return key ? `${name} [${formatCanonicalShortcut(key)}]` : name
}

// Bucket a component (button/menu) action into a manager group by its id.
// Anything not listed falls back to 'Tools'.
const GROUP_BY_ID: Record<string, string> = {
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
  tool_node_smooth: 'Path',
  tool_node_clone: 'Path',
  tool_node_delete: 'Path',
  tool_openclose_path: 'Path',
  tool_add_subpath: 'Path',
  tool_topath: 'Path',
  tool_stroke_to_path: 'Path',
  // Clip / mask
  tool_clip_set: 'Mask',
  tool_mask_set: 'Mask',
  clipmask_release: 'Mask',
  // Text
  tool_bold: 'Text',
  tool_italic: 'Text',
  tool_text_area: 'Text',
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
  'Tools', 'View', 'Canvas', 'Edit', 'Group', 'Transform', 'Arrange', 'Align',
  'Path', 'Boolean', 'Mask', 'Text', 'Layers', 'Connector', 'File',
  'Move', 'Clone', 'Rotate', 'Zoom', 'Selection', 'Navigate'
]

/** one action: a command, as the registry holds it */
export type HotkeyAction = import('./commands.ts').CommandRecord

const FOCUS_CONTROL = 'button, a[href], input, select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])'

/**
 * Whether a keydown target is a focusable UI control (native, or one of the
 * editor's `se-*` custom elements, which retarget to their host) as opposed to
 * the page body / editor container that the canvas leaves focus on.
 */
export const isFocusControl = (target: EventTarget | null): boolean => {
  const el = target as Element | null | undefined
  return !!el?.matches && (el.localName.startsWith('se-') || el.matches(FOCUS_CONTROL))
}

/**
 * Central hotkey registry.
 */
export default class HotkeyManager {
  editor: EditorInstance
  actions: Map<string, HotkeyAction>
  overrides: Record<string, string[]>
  _loaded: boolean
  _handler: ((e: KeyboardEvent) => void) | null
  _listeners: Set<() => void>

  /** @param editor the SVGEditor instance */
  constructor (editor: EditorInstance) {
    this.editor = editor
    /**
     * The hotkey table IS the command registry's table (`editor.commands`,
     * see commands.js): one catalogue, with this class as the key-binding view.
     */
    this.actions = editor.commands.table
    /** per-action override of canonical keys */
    this.overrides = {}
    this._loaded = false
    this._handler = null
    /** called after a binding changed (see `onChange`) */
    this._listeners = new Set()
  }

  /**
   * Be told when bindings change (a key added / removed, an action or all reset).
 * @returns unsubscribe
   */
  onChange (fn: () => void): () => void {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  }

  /* ----------------------------------------------------------------- ingest */

  /**
   * Ingest the editor-level `this.shortcuts` array. Each entry must carry
   * `id`, `group`, `label`; `key` may use `mod`/`ctrl` tokens and `/`
   * alternatives, `pd` is preserved.
   */
  ingestEditorShortcuts (shortcuts: ReturnType<typeof import('./editorShortcuts.ts').buildEditorShortcuts>): void {
    shortcuts.forEach((sc) => {
      if (!sc.id) return
      let keyval: string | undefined
      let pd = false
      if (Array.isArray(sc.key)) {
        keyval = (sc.key[0] as string)
        pd = sc.key.length > 1 ? Boolean(sc.key[1]) : false
      } else {
        keyval = sc.key
      }
      this.editor.commands.register({
        id: sc.id,
        label: sc.label,
        group: sc.group || 'Selection',
        keys: keyval || undefined,
        pd,
        atomic: sc.atomic,
        enabled: sc.enabled,
        run: () => sc.fn()
      }, { replace: true })
    })
  }

  /**
   * Register (or refresh) a component-backed action. Called by `se-button` /
   * `se-menu-item` on connect, so late-loading extension buttons self-register.
   */
  registerEl ({ id, el, label, rawKey }: { id: string, el: Element, label?: string | null, rawKey?: string | null }): void {
    if (!id) return
    const canonical = normalizeComponentSpec(rawKey ?? '')
    // A non-bindable but human-readable hint (e.g. "Z / Ctrl + wheel") is shown
    // read-only; anything else with no valid combo is simply unassigned (and so
    // remains editable, letting the user add a real binding).
    const decorative = (!canonical && rawKey && isDisplayString(rawKey)) ? rawKey : null
    this.editor.commands.registerAdapter({
      id,
      el,
      label: label || id,
      group: GROUP_BY_ID[id] || 'Tools',
      defaultKeys: canonical ? [canonical] : [],
      decorative,
      interactive: el.hasAttribute?.('interactive') ?? false
    })
  }

  /* -------------------------------------------------------------- effective */

  /**
   * The registered descriptor for an action id (or undefined). Used by the
   * quick-action favorites menu to resolve an id to its live label / element /
   * editor handler.
   */
  getAction (id: string): HotkeyAction | undefined {
    return this.actions.get(id)
  }

  /** The effective canonical keys for an action (override if set, else default). */
  effectiveKeys (id: string): string[] {
    const a = this.actions.get(id)
    if (a?.alias) return []
    if (Object.prototype.hasOwnProperty.call(this.overrides, id)) return this.overrides[id]
    return a ? a.defaultKeys : []
  }

  /** Resolve a display label for an action (live for component actions). */
  labelFor (a: HotkeyAction): string {
    return this.editor.commands.labelFor(a)
  }

  /**
   * Build the reverse index `canonicalKey → actionId` from effective bindings.
   * First binding wins (conflicts are prevented at edit time).
   */
  reverseMap (): Map<string, string> {
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
 * @param key canonical
 * @param exceptId ignore this action's own bindings
   */
  conflictFor (key: string, exceptId?: string): string | null {
    for (const id of this.actions.keys()) {
      if (id === exceptId) continue
      if (this.effectiveKeys(id).includes(key)) return id
    }
    return null
  }

  /* ------------------------------------------------------------- edit + UI */

  /** Grouped, display-ready snapshot of every action for the manager dialog. */
  listForUi (): Array<{ group: string, actions: Array<{ id: string, label: string, keys: string[], decorative: (string | null), readonly: boolean, customised: boolean }> }> {
    const groups: Map<string, Array<{ id: string, label: string, keys: string[], decorative: (string | null), readonly: boolean, customised: boolean }>> = new Map()
    for (const a of this.actions.values()) {
      if (a.alias) continue
      if (!groups.has(a.group)) groups.set(a.group, [])
      ;(groups.get(a.group) as Array<any>).push({
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
      actions: (groups.get(g) as Array<any>).sort((a, b) => a.label.localeCompare(b.label))
    }))
  }

  /**
   * Add a canonical key to an action. Rejects (returns the conflicting id) when
   * the key is already bound elsewhere.
 * @param key canonical
   */
  addKey (id: string, key: string): { ok: boolean, conflict?: string } {
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
 * @param key canonical
   */
  removeKey (id: string, key: string): void {
    this.overrides[id] = this.effectiveKeys(id).filter((k) => k !== key)
    this._commit()
  }

  /** Restore one action to its default bindings. */
  resetAction (id: string): void {
    delete this.overrides[id]
    this._commit()
  }

  /** Restore every action to its defaults. */
  resetAll (): void {
    this.overrides = {}
    this._commit()
  }

  /**
   * Parse a keydown into a canonical key for the recorder, or null for a lone
   * modifier press.
   */
  static keyFromEvent (e: KeyboardEvent): string | null {
    return pressedCombo(e)
  }

  /* ------------------------------------------------------------ dispatch */

  /**
   * Install the single document keydown dispatcher (idempotent — removes any
   * previously installed handler so re-init does not stack listeners).
   */
  register (): void {
    this._load()
    if (this._handler) document.removeEventListener('keydown', this._handler)
    this._handler = (e: KeyboardEvent) => {
      if (!isActiveEditor(this.editor)) return
      // Fire only when this editor owns the keystroke. In the standalone editor a
      // canvas click drops focus to `<body>`; when embedded (e.g. the Obsidian
      // plugin) the editor lives inside a container and `<body>` is the host's,
      // so accept either the page body or anything inside this editor's own
      // container. Never steal keystrokes aimed at a focused text field.
      if (!ownsKeyEvent(this.editor?.$container, e.target)) return
      // A registered tool (core/tool-registry.js) sees the key before any shortcut, so that a tool's own
      // Delete (a width point, say) is not also "delete the selected shape".
      const combo = pressedCombo(e)
      const canvas = this.editor.svgCanvas
      if (canvas?.toolKeyDown?.(e)) {
        if (combo) canvas.logDebugEvent?.('key', { combo, handledBy: 'tool', mode: canvas.getMode() })
        e.preventDefault()
        return
      }
      if (!combo) return
      // Tab / Shift+Tab cycle the drawing's elements only while the canvas has the
      // keyboard; on a focused toolbar control they keep moving focus as usual.
      if ((combo === 'tab' || combo === 'shift+tab') && isFocusControl(e.target)) return
      const id = this.reverseMap().get(combo)
      canvas?.logDebugEvent?.('key', { combo, command: id ?? null, mode: canvas.getMode() })
      if (!id) return
      const a = this.actions.get(id)
      if (!a) return
      // A disabled command does nothing and leaves the key to the browser.
      if (this.editor.commands.isEnabled(id) !== true) return
      this.editor.commands.tryRun(id, {}, 'hotkey')
      if (a.pd) e.preventDefault()
    }
    // An already-aborted signal makes this a no-op, so a late register() on a
    // destroyed editor (e.g. extensions finishing after destroy) can't leak.
    document.addEventListener('keydown', this._handler, { signal: this.editor?.listenerAbort?.signal })
  }

  /** Remove the document keydown dispatcher (call before discarding the editor). */
  unregister (): void {
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
      logError('Failed to load hotkeys', err, 'Hotkeys')
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
    for (const fn of this._listeners) {
      try { fn() } catch (err) { logError('A hotkey change listener failed', err, 'Hotkeys') }
    }
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
      logError('Failed to persist hotkeys', err, 'Hotkeys')
    }
  }
}

/** Order-insensitive equality for two canonical key lists. */
const sameKeys = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false
  const sb = [...b].sort()
  return [...a].sort().every((k, i) => k === sb[i])
}
