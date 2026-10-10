// @ts-check
/**
 * commands.js — the editor's command registry ("everything is a command").
 *
 * Every user-visible action is declared once: a stable id, a label, a group,
 * default keys, typed params, an `enabled` check that explains *why* it is
 * unavailable, and `run`. Hotkeys, toolbar buttons (`command="<id>"`), the
 * favorites / quick-action menu, the tablet shell and the host API are all
 * views over this one table, so an action has exactly one implementation.
 *
 * It is the generalisation of `HotkeyManager.actions` — that Map *is* this
 * registry's table (`HotkeyManager.actions === editor.commands.table`), so
 * there is no second catalogue. Components that still self-register through
 * `hotkeys.registerEl` become **adapter** commands (`run` = `el.click()`,
 * `enabled` reads `el.disabled`); migrating a button is just declaring a real
 * command with the same id, with no flag day.
 *
 * Ids are persisted user data (hotkey overrides, favorites). Never rename one.
 *
 * Ported in spirit from VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/engine/src/cmd/mod.rs` (`CommandSpec`) and `lib.rs`
 * (`Session::execute`, `EngineError`), MIT OR Apache-2.0.
 * @module commands
 */
import { t } from './locale.js'
import { expandEditorKey } from './Hotkeys.js'
import { error as logError } from '@svgedit/svgcanvas/common/logger.js'

/**
 * @typedef {object} ParamSpec
 * @property {'number'|'string'|'boolean'|'enum'} type
 * @property {*} [default]
 * @property {number} [min]
 * @property {number} [max]
 * @property {string[]} [values] allowed values for `enum`
 * @property {boolean} [required]
 */

/**
 * @typedef {object} CommandSpec
 * @property {string} id stable, persisted — never rename
 * @property {string} label i18n key (or literal text)
 * @property {string} [group] one of `GROUP_ORDER` (Hotkeys.js); default `Tools`
 * @property {string|string[]} [keys] default binding(s), authoring form (`mod+d`, `delete/backspace`)
 * @property {string} [icon] images/ filename for menus without a button
 * @property {Object<string, ParamSpec>} [params]
 * @property {(editor: any) => true|string} [enabled] `true`, or a human-readable reason it is unavailable
 * @property {(editor: any, params: Object<string, any>) => any} run
 * @property {boolean} [interactive] opens a dialog / file picker / prompt (excluded from sweeps and automation)
 * @property {boolean} [palette] list in host command palettes (default true)
 * @property {boolean} [atomic] run inside `svgCanvas.transact()` so a throw rolls the drawing back
 *   and the whole command is one undo step. Only for synchronous, document-only commands.
 */

/**
 * What the table stores: a spec plus the hotkey-side fields `HotkeyManager`
 * has always kept per action.
 * @typedef {CommandSpec & {
 *   labelKey: string,
 *   group: string,
 *   defaultKeys: string[],
 *   pd: boolean,
 *   el: ?Element,
 *   decorative: ?string,
 *   adapter: boolean
 * }} CommandRecord
 */

/** @typedef {'unknown'|'disabled'|'badParams'|'internal'} CommandErrorCode */

export class CommandError extends Error {
  /**
   * @param {CommandErrorCode} code
   * @param {string} id
   * @param {string} message
   * @param {unknown} [cause]
   */
  constructor (code, id, message, cause) {
    super(message)
    this.name = 'CommandError'
    this.code = code
    this.id = id
    if (cause !== undefined) this.cause = cause
  }
}

/**
 * Coerce + clamp one param value, or throw `badParams`.
 * @param {string} id
 * @param {string} name
 * @param {ParamSpec} spec
 * @param {*} value
 * @returns {*}
 */
const coerceParam = (id, name, spec, value) => {
  const bad = (/** @type {string} */ why) => new CommandError('badParams', id, `${id}: parameter "${name}" ${why}`)
  switch (spec.type) {
    case 'number': {
      const n = typeof value === 'string' && value.trim() === '' ? NaN : Number(value)
      if (!Number.isFinite(n)) throw bad('must be a finite number')
      return Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity, n))
    }
    case 'boolean':
      if (value === true || value === 'true' || value === 1) return true
      if (value === false || value === 'false' || value === 0) return false
      throw bad('must be a boolean')
    case 'enum':
      if (!spec.values?.includes(value)) throw bad(`must be one of ${JSON.stringify(spec.values)}`)
      return value
    default:
      if (value === null || typeof value === 'object') throw bad('must be a string')
      return String(value)
  }
}

export class CommandRegistry {
  /**
   * @param {any} editor the owning editor instance (one registry per editor)
   */
  constructor (editor) {
    this.editor = editor
    /** @type {Map<string, CommandRecord>} */
    this.table = new Map()
  }

  /**
   * Declare a command. A duplicate id throws in dev builds and is logged +
   * ignored in production, unless `replace` is set (the hotkey ingestion paths
   * use it: late/re-registered shortcuts always won). Registering over an
   * **adapter** (a button that self-registered) is always allowed: the real
   * command replaces its `run`/`enabled` and keeps the button as `el`.
   * @param {CommandSpec & Partial<CommandRecord>} spec
   * @param {{replace?: boolean}} [opts]
   * @returns {void}
   */
  register (spec, { replace = false } = {}) {
    if (!spec?.id || typeof spec.run !== 'function') {
      throw new TypeError('A command needs an id and a run function')
    }
    const existing = this.table.get(spec.id)
    const adapter = Boolean(spec.adapter)
    if (existing && !existing.adapter && !adapter && !replace) {
      const msg = `Duplicate command id "${spec.id}"`
      if (/** @type {any} */ (import.meta).env?.PROD) { logError(msg, undefined, 'commands'); return }
      throw new Error(msg)
    }
    if (existing && !existing.adapter && adapter) {
      // A button appearing for an already-declared command: keep the command,
      // just remember the button for labels/icons/focus. Keys come from the
      // command, falling back to the button's `shortcut` attribute.
      existing.el = spec.el ?? existing.el
      if (!existing.defaultKeys.length && spec.defaultKeys?.length) existing.defaultKeys = spec.defaultKeys
      existing.decorative = existing.decorative ?? spec.decorative ?? null
      return
    }
    const defaultKeys = spec.defaultKeys ?? (spec.keys ? [spec.keys].flat().flatMap(expandEditorKey) : [])
    /** @type {CommandRecord} */
    const rec = {
      ...spec,
      group: spec.group || 'Tools',
      labelKey: spec.labelKey ?? spec.label,
      defaultKeys: defaultKeys.length || !existing?.adapter ? defaultKeys : existing.defaultKeys,
      pd: spec.pd ?? false,
      el: spec.el ?? existing?.el ?? null,
      decorative: spec.decorative ?? (existing?.adapter ? existing.decorative : null) ?? null,
      adapter
    }
    this.table.set(spec.id, rec)
  }

  /**
   * Register (or refresh) a command that wraps a component: `run` clicks it
   * and `enabled` follows its `disabled` state.
   * @param {object} opts
   * @param {string} opts.id
   * @param {Element & {disabled?: boolean}} opts.el
   * @param {string} opts.label
   * @param {string[]} opts.defaultKeys canonical
   * @param {?string} opts.decorative
   * @param {string} opts.group
   * @param {boolean} [opts.interactive]
   * @returns {void}
   */
  registerAdapter ({ id, el, label, defaultKeys, decorative, group, interactive = false }) {
    this.register({
      id,
      label,
      group,
      el,
      defaultKeys,
      decorative,
      interactive,
      pd: true,
      adapter: true,
      enabled: () => (el.disabled || el.hasAttribute('disabled') ? 'disabled' : true),
      run: () => { /** @type {HTMLElement} */ (el).click() }
    }, { replace: true })
  }

  /**
   * @param {string} id
   * @returns {boolean} whether a command was removed
   */
  unregister (id) {
    return this.table.delete(id)
  }

  /**
   * @param {string} id
   * @returns {CommandRecord|undefined}
   */
  get (id) {
    return this.table.get(id)
  }

  /**
   * `true`, or the reason the command can't run right now.
   * @param {string} id
   * @returns {true|string}
   */
  isEnabled (id) {
    const rec = this.table.get(id)
    if (!rec) return 'unknown command'
    if (!rec.enabled) return true
    try {
      const r = rec.enabled(this.editor)
      return r === true ? true : (typeof r === 'string' && r) || 'unavailable'
    } catch (err) {
      logError(`enabled() of command "${id}" threw`, err, 'commands')
      return 'unavailable'
    }
  }

  /**
   * Display label: live for component commands (the element's `title`),
   * translated, and trimmed to the bare name ("Shape builder (click …)").
   * @param {CommandRecord} rec
   * @returns {string}
   */
  labelFor (rec) {
    const key = rec.el ? (rec.el.getAttribute('title') || rec.labelKey) : rec.labelKey
    const translated = t(key) || key
    return translated.split(/ — | \(/)[0].trim() || translated
  }

  /**
   * Effective (user-overridable) keys of a command.
   * @param {string} id
   * @returns {string[]}
   */
  keysOf (id) {
    const hk = this.editor?.hotkeys
    return hk?.effectiveKeys ? hk.effectiveKeys(id) : (this.table.get(id)?.defaultKeys ?? [])
  }

  /**
   * Snapshot of every command for UIs, hosts and sweeps.
   * @param {{includeHidden?: boolean}} [opts] include `palette: false` commands
   * @returns {Array<{id: string, label: string, group: string, keys: string[], enabled: boolean,
   *   disabledReason?: string, params?: Object<string, ParamSpec>, interactive: boolean}>}
   */
  list ({ includeHidden = false } = {}) {
    const out = []
    for (const rec of this.table.values()) {
      if (rec.palette === false && !includeHidden) continue
      const state = this.isEnabled(rec.id)
      out.push({
        id: rec.id,
        label: this.labelFor(rec),
        group: rec.group,
        keys: this.keysOf(rec.id),
        enabled: state === true,
        ...(state === true ? {} : { disabledReason: state }),
        ...(rec.params ? { params: rec.params } : {}),
        interactive: Boolean(rec.interactive)
      })
    }
    return out
  }

  /**
   * Validate `params` against a command's `ParamSpec`s: unknown keys and
   * missing `required` ones are `badParams`; others are coerced + clamped.
   * @param {CommandRecord} rec
   * @param {Object<string, any>} params
   * @returns {Object<string, any>}
   */
  validate (rec, params) {
    const specs = rec.params ?? {}
    /** @type {Object<string, any>} */
    const out = {}
    for (const name of Object.keys(params ?? {})) {
      if (!(name in specs)) throw new CommandError('badParams', rec.id, `${rec.id}: unknown parameter "${name}"`)
    }
    for (const [name, spec] of Object.entries(specs)) {
      if (params && name in params && params[name] !== undefined) {
        out[name] = coerceParam(rec.id, name, spec, params[name])
      } else if (spec.required) {
        throw new CommandError('badParams', rec.id, `${rec.id}: missing required parameter "${name}"`)
      } else if ('default' in spec) {
        out[name] = spec.default
      }
    }
    return out
  }

  /**
   * Run a command. Throws `CommandError`: `unknown`, `disabled` (with the
   * reason), `badParams`, or `internal` (an unexpected throw from `run`, which
   * is logged; atomic commands have already rolled the drawing back).
   * @param {string} id
   * @param {Object<string, any>} [params]
   * @returns {*} whatever the command returns
   */
  run (id, params = {}) {
    const rec = this.table.get(id)
    if (!rec) throw new CommandError('unknown', id, `Unknown command "${id}"`)
    const state = this.isEnabled(id)
    if (state !== true) throw new CommandError('disabled', id, state)
    const args = this.validate(rec, params)
    try {
      const canvas = this.editor?.svgCanvas
      const exec = () => rec.run(this.editor, args)
      return rec.atomic && canvas?.transact ? canvas.transact(this.labelFor(rec), exec) : exec()
    } catch (err) {
      if (err instanceof CommandError) throw err
      logError(`Command "${id}" failed`, err, 'commands')
      throw new CommandError('internal', id, err instanceof Error ? err.message : String(err), err)
    } finally {
      // The selection events a command fires land before an atomic command's
      // undo step is recorded, so the undo/redo state they refreshed is stale.
      this.refreshEnablement()
    }
  }

  /**
   * Like `run`, but for callers that can't do anything with an error (key
   * dispatch, button clicks): a disabled or failing command is swallowed
   * (failures were already logged).
   * @param {string} id
   * @param {Object<string, any>} [params]
   * @returns {boolean} whether the command ran
   */
  tryRun (id, params = {}) {
    try {
      this.run(id, params)
      return true
    } catch (err) {
      if (!(err instanceof CommandError)) throw err
      return false
    }
  }

  /**
   * Sync every element declaring `command="<id>"` with that command's state.
   * Called from the editor's existing selection / change / history paths.
   * @returns {void}
   */
  refreshEnablement () {
    const root = this.editor?.$container
    if (!root?.querySelectorAll) return
    for (const el of /** @type {NodeListOf<Element & {disabled?: boolean}>} */ (root.querySelectorAll('[command]'))) {
      const id = el.getAttribute('command')
      if (!id || !this.table.has(id)) continue
      const off = this.isEnabled(id) !== true
      if (Boolean(el.disabled) !== off) el.disabled = off
    }
  }
}
