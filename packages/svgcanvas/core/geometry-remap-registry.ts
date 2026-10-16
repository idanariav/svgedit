/**
 * Registry for attribute-driven derived-geometry remap hooks.
 *
 * `coords.js`'s `remapElement` is the single function every move/scale/rotate
 * transform-bake runs through. Features that cache their own source geometry
 * in an `se:`-prefixed attribute (corner-radius's `se:orig-d`, taper-stroke's
 * `se:taper-d`, …) must keep that cache in sync with the baked transform or
 * it silently desyncs on the next edit. Rather than `coords.js` hardcoding a
 * branch per feature, each feature module registers itself here from its own
 * `init`, and `remapElement` runs whatever is registered.
 * @module geometry-remap-registry
 * @license MIT
 */

import type SvgCanvas from '../svgcanvas.js'
import { rebuildAfterRemap } from './live-stack.ts'

/** `coords.js`'s point map, and the scalers for a width and a height. */
export type RemapPoint = (x: number, y: number) => { x: number, y: number }
export type RemapScale = (n: number) => number

/** The hook signature: the element, `coords.js`'s remap helpers and the canvas. */
export type GeometryRemapFn = (elem: Element, remap: RemapPoint, scalew: RemapScale, scaleh: RemapScale, svgCanvas: SvgCanvas) => void

const registry = new Map<string, GeometryRemapFn>()

/**
 * Register a remap hook for elements carrying `attrName`.
 * @function module:geometry-remap-registry.registerGeometryRemap
 * @param attrName - Attribute that marks an element as owned by this hook, e.g. `se:orig-d`.
 */
export const registerGeometryRemap = (attrName: string, remapFn: GeometryRemapFn): void => {
  registry.set(attrName, remapFn)
}

/**
 * Run every registered remap hook whose attribute is present on `elem`.
 * @function module:geometry-remap-registry.runGeometryRemaps
 */
export const runGeometryRemaps = (elem: Element, remap: RemapPoint, scalew: RemapScale, scaleh: RemapScale, svgCanvas: SvgCanvas): void => {
  registry.forEach((remapFn, attrName) => {
    if (elem.hasAttribute(attrName)) {
      remapFn(elem, remap, scalew, scaleh, svgCanvas)
    }
  })
  // A stacked element (live-stack.js): the hooks mapped every source and scaled every stage's size parameters;
  // now the mirrors and `d` are regenerated from the root.
  rebuildAfterRemap(elem, svgCanvas)
}

/**
 * The attributes that have a remap hook, i.e. the cached source geometry that a transform bake rewrites.
 * Anything that records the old values of a bake for undo must include these.
 * @function module:geometry-remap-registry.remapSourceAttrs
 */
export const remapSourceAttrs = (): string[] => [...registry.keys()]
