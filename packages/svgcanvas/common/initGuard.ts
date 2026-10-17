/**
 * Collision guard for SvgCanvas's per-module `xxxInit(canvas)` calls.
 *
 * `svgcanvas.js`'s constructor runs ~30 `core/*.js` `init(canvas)` functions
 * in sequence, each attaching its own methods/state directly onto the
 * SvgCanvas instance (`canvas.foo = ...`). Nothing stops two modules from
 * picking the same property name — the second one just silently overwrites
 * the first. This wraps each call with a before/after `Object.keys` diff so
 * that kind of collision logs instead of failing silently.
 * @module initGuard
 * @license MIT
 */
import { warn } from './logger.ts'

/**
 * Runs `initFn(canvas)`, then compares the instance's own enumerable
 * properties before and after to detect any property a previous guarded
 * call already claimed. Overwrites by the *same* label (e.g. a legitimate
 * re-init) are not flagged.
 * `canvas` is the SvgCanvas instance being initialized, `label` identifies the module for warning messages
 * (e.g. `'selection'`), `initFn` is the module's `init(canvas)` and `registry` the shared
 * `propName -> owning label` map, one per SvgCanvas instance.
 */
export const runGuardedInit = <C extends object>(canvas: object, label: string, initFn: (canvas: C) => void, registry: Map<string, string>): void => {
  const props = canvas as Record<string, unknown>
  const before = new Map(Object.keys(props).map((key) => [key, props[key]]))
  initFn(canvas as C)
  for (const key of Object.keys(canvas)) {
    if (before.has(key) && Object.is(before.get(key), props[key])) continue
    const owner = registry.get(key)
    if (owner && owner !== label) {
      warn(
        `"${label}" overwrote property "${key}" previously set by "${owner}"`,
        undefined,
        'svgcanvas-init-guard'
      )
    }
    registry.set(key, label)
  }
}

/**
 * Gives `canvas` the members of a module's API object, flagging any name a previous module already claimed.
 * `label` identifies the module for the warning, `registry` is the shared `propName -> owning label` map of one canvas.
 */
export const attachApi = (canvas: object, label: string, api: object, registry: Map<string, string>): void => {
  for (const key of Object.keys(api)) {
    const owner = registry.get(key)
    if (owner && owner !== label) {
      warn(
        `"${label}" overwrote property "${key}" previously set by "${owner}"`,
        undefined,
        'svgcanvas-init-guard'
      )
    }
    registry.set(key, label)
  }
  Object.assign(canvas, api)
}
