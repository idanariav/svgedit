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
import { warn } from './logger.js'

/**
 * Runs `initFn(canvas)`, then compares the instance's own enumerable
 * properties before and after to detect any property a previous guarded
 * call already claimed. Overwrites by the *same* label (e.g. a legitimate
 * re-init) are not flagged.
 * @param {object} canvas - The SvgCanvas instance being initialized.
 * @param {string} label - Identifies the module for warning messages (e.g. `'selection'`).
 * @param {Function} initFn - The module's `init(canvas)` function.
 * @param {Map<string, string>} registry - Shared `propName -> owning label` map, one per SvgCanvas instance.
 * @returns {void}
 */
export const runGuardedInit = (canvas, label, initFn, registry) => {
  const before = new Map(Object.keys(canvas).map((key) => [key, canvas[key]]))
  initFn(canvas)
  for (const key of Object.keys(canvas)) {
    if (before.has(key) && Object.is(before.get(key), canvas[key])) continue
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
