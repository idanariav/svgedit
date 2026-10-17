/**
 * Collision guard for the members core modules give the SvgCanvas instance.
 *
 * `svgcanvas.ts`'s constructor attaches the API object each `core/*.ts` module returns (`createX(canvas)`) onto the
 * instance. Nothing stops two modules from using the same member name — the second would silently overwrite the
 * first — so `attachApi` logs such a collision.
 * @module initGuard
 * @license MIT
 */
import { warn } from './logger.ts'

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
