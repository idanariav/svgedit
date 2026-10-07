/**
 * Helpers for the editor's `se:` attribute namespace.
 *
 * Several features (corner radius, taper, …) store state in `se:*` attributes
 * set with a plain `setAttribute('se:…')`, which creates an attribute that has
 * the prefix in its *name* but no namespace. The serializer only declares
 * `xmlns:se` for namespaced attributes, so a saved drawing could use an
 * undeclared `se:` prefix — invalid XML that fails to load (`setSvgString`
 * returned false and the drawing could not be reopened).
 * @module se-namespace
 * @license MIT
 */

import { NS } from './namespaces.js'

/**
 * Whether `elems` hold any `se:`-prefixed attribute that carries no namespace
 * (so the serializer would not otherwise declare `xmlns:se`).
 * @param {Iterable<Element>} elems
 * @returns {boolean}
 */
export const hasUnnamespacedSeAttr = (elems) => {
  for (const el of elems) {
    for (const attr of el.attributes) {
      if (attr.name.startsWith('se:') && !attr.namespaceURI) return true
    }
  }
  return false
}

/**
 * Load-time repair for drawings already saved with an undeclared `se:` prefix
 * (see module doc): adds `xmlns:se` to the root `<svg>` tag when the markup
 * uses `se:` attributes but never declares them. Narrow on purpose — it leaves
 * any string that already declares `xmlns:se`, or doesn't use the prefix, alone.
 * @param {string} xml
 * @returns {string}
 */
export const declareMissingSeNamespace = (xml) => {
  if (typeof xml !== 'string') return xml
  if (/\bxmlns:se\s*=/.test(xml)) return xml
  // `<… se:name="…"` — an attribute using the prefix inside some tag
  if (!/<[^>]*\sse:[A-Za-z][\w.-]*\s*=/.test(xml)) return xml
  return xml.replace(/<svg(?=[\s>/])/, `<svg xmlns:se="${NS.SE}"`)
}
