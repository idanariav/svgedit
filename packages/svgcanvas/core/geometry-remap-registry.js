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

const registry = new Map()

/**
 * Register a remap hook for elements carrying `attrName`.
 * @function module:geometry-remap-registry.registerGeometryRemap
 * @param {string} attrName - Attribute that marks an element as owned by
 *   this hook, e.g. `se:orig-d`.
 * @param {(elem: Element, remap: Function, scalew: Function, scaleh: Function, svgCanvas: Object) => void} remapFn
 * @returns {void}
 */
export const registerGeometryRemap = (attrName, remapFn) => {
  registry.set(attrName, remapFn)
}

/**
 * Run every registered remap hook whose attribute is present on `elem`.
 * @function module:geometry-remap-registry.runGeometryRemaps
 * @param {Element} elem
 * @param {Function} remap
 * @param {Function} scalew
 * @param {Function} scaleh
 * @param {Object} svgCanvas
 * @returns {void}
 */
export const runGeometryRemaps = (elem, remap, scalew, scaleh, svgCanvas) => {
  registry.forEach((remapFn, attrName) => {
    if (elem.hasAttribute(attrName)) {
      remapFn(elem, remap, scalew, scaleh, svgCanvas)
    }
  })
}
