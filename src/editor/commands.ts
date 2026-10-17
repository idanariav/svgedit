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
import { t } from './locale.ts'
import { expandEditorKey } from './Hotkeys.ts'
import { error as logError } from '@svgedit/svgcanvas/common/logger.ts'

export interface ParamSpec {
  type: 'number' | 'string' | 'boolean' | 'enum'
  default?: any
  min?: number
  max?: number
  /** allowed values for `enum`; a function is read each time (saved layouts, say) */
  values?: string[] | (() => string[])
  required?: boolean
}

export interface CommandSpec {
  /** stable, persisted — never rename */
  id: string
  /** i18n key (or literal text) */
  label: string
  /** one of `GROUP_ORDER` (Hotkeys.js); default `Tools` */
  group?: string
  /** default binding(s), authoring form (`mod+d`, `delete/backspace`) */
  keys?: string | string[]
  /** images/ filename for menus without a button */
  icon?: string
  params?: Record<string, ParamSpec>
  /** `true`, or a human-readable reason it is unavailable */
  enabled?: (editor: any) => true | string
  run: (editor: any, params: Record<string, any>) => any
  /** opens a dialog / file picker / prompt (excluded from sweeps and automation) */
  interactive?: boolean
  /** list in host command palettes (default true) */
  palette?: boolean
  /** a second button for another command (e.g. the multi-selection toolbar's clone): it owns no keys, so a key can't end up bound twice and rebinding the real command frees it; not listed in palettes or the shortcut manager */
  alias?: boolean
  /** run inside `svgCanvas.transact()` so a throw rolls the drawing back and the whole command is one undo step. Only for synchronous, document-only commands. */
  atomic?: boolean
}

export type CommandRecord = CommandSpec & { labelKey: string, group: string, defaultKeys: string[], pd: boolean, el: (Element | null), decorative: (string | null), adapter: boolean }
/**
 * What the table stores: a spec plus the hotkey-side fields `HotkeyManager`
 * has always kept per action.
 */

export type CommandErrorCode = 'unknown' | 'disabled' | 'badParams' | 'internal'

export class CommandError extends Error {
  name: string
  code: CommandErrorCode
  id: string
  cause: unknown

  constructor (code: CommandErrorCode, id: string, message: string, cause?: unknown) {
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
const valuesOf = (spec: ParamSpec): string[] | undefined => typeof spec.values === 'function' ? spec.values() : spec.values

const coerceParam = (id: string, name: string, spec: ParamSpec, value: any) => {
  const bad = (why: string) => new CommandError('badParams', id, `${id}: parameter "${name}" ${why}`)
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
      if (!valuesOf(spec)?.includes(value)) throw bad(`must be one of ${JSON.stringify(valuesOf(spec))}`)
      return value
    default:
      if (value === null || typeof value === 'object') throw bad('must be a string')
      return String(value)
  }
}

export interface RunEntry {
  id: string
  /** as given (not yet validated) */
  params: Record<string, any>
  source: string
  /** 0, or higher when a command ran inside another */
  depth: number
  /** `ran`, or the `CommandError` code (`unknown` | `disabled` | `badParams` | `internal`) */
  outcome: string
  error?: string
  /** undo stack size before / after */
  undoBefore?: number
  undoAfter?: number
  ms: number
}
/** One finished `run`, as `onRun` listeners see it. */

/** A copy of the specs with function-valued `values` read, so a listing is plain data. */
const resolveParams = (params: Record<string, ParamSpec>): Record<string, ParamSpec> => Object.fromEntries(
  Object.entries(params).map(([name, spec]) => [name, typeof spec.values === 'function' ? { ...spec, values: spec.values() } : spec])
)

export class CommandRegistry {
  editor: any
  table: Map<string, CommandRecord>
  runListeners: Set<(entry: RunEntry) => void>
  runDepth: number

  /** @param editor the owning editor instance (one registry per editor) */
  constructor (editor: any) {
    this.editor = editor
    this.table = new Map()
    this.runListeners = new Set()
    this.runDepth = 0
  }

  /**
   * Observe every `run` / `tryRun` (the debug log's action channel). The listener
   * is called once per run, after it ended, whatever the outcome; a throwing
   * listener is ignored. Returns the unsubscribe function.
   */
  onRun (listener: (entry: RunEntry) => void): () => void {
    this.runListeners.add(listener)
    return () => { this.runListeners.delete(listener) }
  }

  /**
   * Declare a command. A duplicate id throws in dev builds and is logged +
   * ignored in production, unless `replace` is set (the hotkey ingestion paths
   * use it: late/re-registered shortcuts always won). Registering over an
   * **adapter** (a button that self-registered) is always allowed: the real
   * command replaces its `run`/`enabled` and keeps the button as `el`.
   */
  register (spec: CommandSpec & Partial<CommandRecord>, { replace = false }: { replace?: boolean } = {}): void {
    if (!spec?.id || typeof spec.run !== 'function') {
      throw new TypeError('A command needs an id and a run function')
    }
    const existing = this.table.get(spec.id)
    const adapter = Boolean(spec.adapter)
    if (existing && !existing.adapter && !adapter && !replace) {
      const msg = `Duplicate command id "${spec.id}"`
      if ((import.meta as any).env?.PROD) { logError(msg, undefined, 'commands'); return }
      throw new Error(msg)
    }
    if (existing && !existing.adapter && adapter) {
      // A button appearing for an already-declared command: keep the command,
      // just remember the button for labels/icons/focus. Keys come from the
      // command, falling back to the button's `shortcut` attribute.
      existing.el = spec.el ?? existing.el
      if (!existing.alias && !existing.defaultKeys.length && spec.defaultKeys?.length) existing.defaultKeys = spec.defaultKeys
      existing.decorative = existing.decorative ?? spec.decorative ?? null
      return
    }
    const defaultKeys = spec.alias ? [] : (spec.defaultKeys ?? (spec.keys ? [spec.keys].flat().flatMap(expandEditorKey) : []))
    const rec: CommandRecord = {
      ...spec,
      group: spec.group || 'Tools',
      labelKey: spec.labelKey ?? spec.label,
      defaultKeys: defaultKeys.length || !existing?.adapter || spec.alias ? defaultKeys : existing.defaultKeys,
      palette: spec.alias ? false : spec.palette,
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
   */
  registerAdapter ({ id, el, label, defaultKeys, decorative, group, interactive = false }: { id: string, el: Element & { disabled?: boolean }, label: string, defaultKeys: string[], decorative: string | null, group: string, interactive?: boolean }): void {
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
      run: () => { (el as HTMLElement).click() }
    }, { replace: true })
  }

  /** @returns whether a command was removed */
  unregister (id: string): boolean {
    return this.table.delete(id)
  }

  get (id: string): CommandRecord | undefined {
    return this.table.get(id)
  }

  /** `true`, or the reason the command can't run right now. */
  isEnabled (id: string): true | string {
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
   */
  labelFor (rec: CommandRecord): string {
    const key = rec.el ? (rec.el.getAttribute('title') || rec.labelKey) : rec.labelKey
    const translated = t(key) || key
    return translated.split(/ — | \(/)[0].trim() || translated
  }

  /** Effective (user-overridable) keys of a command. */
  keysOf (id: string): string[] {
    const hk = this.editor?.hotkeys
    return hk?.effectiveKeys ? hk.effectiveKeys(id) : (this.table.get(id)?.defaultKeys ?? [])
  }

  /**
   * Snapshot of every command for UIs, hosts and sweeps.
 * @param opts include `palette: false` commands
   */
  list ({ includeHidden = false }: { includeHidden?: boolean } = {}): Array<{ id: string, label: string, group: string, keys: string[], enabled: boolean, disabledReason?: string, params?: Record<string, ParamSpec>, interactive: boolean }> {
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
        ...(rec.params ? { params: resolveParams(rec.params) } : {}),
        interactive: Boolean(rec.interactive)
      })
    }
    return out
  }

  /**
   * Validate `params` against a command's `ParamSpec`s: unknown keys and
   * missing `required` ones are `badParams`; others are coerced + clamped.
   */
  validate (rec: CommandRecord, params: Record<string, any>): Record<string, any> {
    const specs = rec.params ?? {}
    const out: Record<string, any> = {}
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
 * @param source who asked, for the debug log: `hotkey`, `button`, `favorites`,
`tablet`, or `api` (host / extension / automation code)
 * @returns whatever the command returns
   */
  run (id: string, params: Record<string, any> = {}, source: string = 'api'): any {
    if (!this.runListeners.size) return this.runCommand(id, params)
    const canvas = this.editor?.svgCanvas
    const undoBefore = canvas?.undoMgr?.getUndoStackSize()
    const started = Date.now()
    const depth = this.runDepth++
    const entry: RunEntry = { id, params, source, depth, outcome: 'ran', undoBefore, undoAfter: undoBefore, ms: 0 }
    try {
      return this.runCommand(id, params)
    } catch (err) {
      if (err instanceof CommandError) {
        entry.outcome = err.code
        entry.error = err.message
      }
      throw err
    } finally {
      this.runDepth--
      entry.undoAfter = canvas?.undoMgr?.getUndoStackSize()
      entry.ms = Date.now() - started
      for (const fn of this.runListeners) {
        try { fn(entry) } catch { /* a logger must never break a command */ }
      }
    }
  }

  runCommand (id: string, params: Record<string, any>): any {
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
 * @param source see `run`
 * @returns whether the command ran
   */
  tryRun (id: string, params: Record<string, any> = {}, source: string = 'api'): boolean {
    try {
      this.run(id, params, source)
      return true
    } catch (err) {
      if (!(err instanceof CommandError)) throw err
      return false
    }
  }

  /**
   * Sync every element declaring `command="<id>"` with that command's state.
   * Also mirrors an unavailable command's reason into `disabled-reason` (shown in the tooltip).
   * Called from the editor's existing selection / change / history paths.
   */
  refreshEnablement (): void {
    const root = this.editor?.$container
    if (!root?.querySelectorAll) return
    for (const el of (root.querySelectorAll('[command]') as NodeListOf<Element & { disabled?: boolean }>)) {
      const id = el.getAttribute('command')
      if (!id || !this.table.has(id)) continue
      const state = this.isEnabled(id)
      const off = state !== true
      if (Boolean(el.disabled) !== off) el.disabled = off
      // The tooltip says why (se-button appends it); adapters' bare 'disabled' says nothing.
      const reason = off && state !== 'disabled' && state !== 'unavailable' ? state : null
      if (reason) {
        if (el.getAttribute('disabled-reason') !== reason) el.setAttribute('disabled-reason', reason)
      } else if (el.hasAttribute('disabled-reason')) {
        el.removeAttribute('disabled-reason')
      }
    }
  }
}
