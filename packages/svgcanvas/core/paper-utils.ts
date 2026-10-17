/**
 * Shared paper.js helpers for the boolean/geometry tools (boolean-ops,
 * cutter, path-offset, shape-builder, taper-stroke, path-simplify).
 *
 * @module paper-utils
 * @license MIT
 */

import paperCore from 'paper/dist/paper-core.js'
import type SvgCanvas from '../svgcanvas.ts'
import { getPathDFromElement } from './path-utils.ts'
import { getMatrix, getTransformList, transformListToTransform } from './math.ts'

// Element types that cannot be converted to a path for paper.js operations.
const NON_PATH_TAGS = new Set(['text', 'tspan', 'image', 'use', 'symbol', 'g', 'defs'])

// Lazy-initialised paper.js scope, shared by every consumer. It's a
// stateless reusable compute scope — each operation clears the items it
// creates — so sharing it across editor instances (and across modules) is
// safe; no per-instance state lives here.
let paperScope: paper.PaperScope | null = null
export const getPaperScope = (): paper.PaperScope => {
  if (!paperScope) {
    paperScope = new (paperCore as typeof paper).PaperScope()
    paperScope.setup(document.createElement('canvas'))
  }
  return paperScope
}

// Style attributes inherited when a paper.js result is turned back into an
// SVG element.
const BASE_STYLE_ATTRS = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'opacity', 'paint-order']

/**
 * Collect inheritable style attributes from an element.
 * @param extraAttrs - Additional attribute names to collect.
 */
export const getStyleAttrs = (elem: Element, extraAttrs: string[] = []): Record<string, string> => {
  const styleAttrs: Record<string, string> = {}
  for (const attr of [...BASE_STYLE_ATTRS, ...extraAttrs]) {
    const val = elem.getAttribute(attr)
    if (val !== null) styleAttrs[attr] = val
  }
  return styleAttrs
}

/**
 * Uniform-equivalent scale factor of an SVGMatrix, via its determinant
 * (`sqrt(|det|)`) — for a non-uniform scale this is a geometric-mean
 * approximation, matching the convention already used for radii elsewhere
 * (see `corner-radius.js`/`taper-stroke.js`).
 *
 * Every consumer of `svgToPaper` (boolean ops, cutter, path-offset,
 * shape-builder) bakes a source element's own `transform` into the rebuilt
 * paper.js geometry, but a style value like stroke-width isn't a coordinate
 * — it isn't affected by that bake, and each of those tools places its
 * result with no compensating transform for the source's own scale. Left
 * uncorrected, a source with e.g. `transform="scale(0.3)"` (a shrunk
 * arrowhead-tip, say) comes back full-size with its original, now hugely
 * disproportionate stroke-width. This helper (plus `getOwnTransformScale`/
 * `scaleStrokeWidth` below) is how each tool corrects for it.
 */
export const getMatrixScale = (m: SVGMatrix): number => Math.sqrt(Math.abs((m.a * m.d) - (m.b * m.c)))

/** `getMatrixScale` of `elem`'s own transform (excludes ancestors). */
export const getOwnTransformScale = (elem: Element): number => getMatrixScale(getMatrix(elem))

/**
 * Scale `styleAttrs['stroke-width']` in place by `scale`, if present.
 * No-op when there's no stroke-width or the scale is ~1 (the common case).
 */
export const scaleStrokeWidth = (styleAttrs: Record<string, string>, scale: number): void => {
  if (!styleAttrs['stroke-width'] || !(scale > 0) || scale === 1) return
  styleAttrs['stroke-width'] = String(parseFloat(styleAttrs['stroke-width']) * scale)
}

// Scratch element reused to run path data through pathActions.convertPath
// (never inserted into the document).
let normalizeScratch: SVGPathElement | null = null

/**
 * paper.js's `pathData` getter emits relative/shorthand SVG commands, but
 * svgedit's node-edit machinery (the absolute-only `segData` map in
 * path.js) can only represent absolute M/L/C/Z segments — opening a path
 * built straight from `pathData` for node editing throws. Normalize to
 * absolute commands, via the same `pathSegList`-based conversion the
 * editor's own path tooling already relies on (`pathActions.convertPath`),
 * before it reaches the DOM.
 */
export const toAbsolutePathData = (d: string, svgCanvas: Pick<SvgCanvas, 'pathActions'>): string => {
  if (!normalizeScratch) normalizeScratch = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGPathElement
  normalizeScratch.setAttribute('d', d)
  return svgCanvas.pathActions.convertPath(normalizeScratch, false)
}

/**
 * Convert an SVG element to a paper.js item (Path or CompoundPath) with its
 * own transform applied. Returns null if the element cannot be converted.
 * @param opts.asCompoundPath - Use `CompoundPath` instead of `Path`
 *  (needed for shapes with holes / multiple subpaths, e.g. offset/region ops).
 * @param opts.flatten - When set, flatten curves to line segments
 *  at this tolerance (user units) after building the item.
 */
export const svgToPaper = (
  elem: Element, scope: paper.PaperScope, opts: { asCompoundPath?: boolean, flatten?: number } = {}
): paper.Path | paper.CompoundPath | null => {
  if (NON_PATH_TAGS.has(elem.tagName)) return null

  const d = getPathDFromElement(elem)
  if (!d) return null

  const item = opts.asCompoundPath ? new scope.CompoundPath(d) : new scope.Path(d)

  const tlist = getTransformList(elem)
  if (tlist && tlist.numberOfItems > 0) {
    const matrix = transformListToTransform(tlist).matrix
    item.transform(new scope.Matrix(
      matrix.a, matrix.b,
      matrix.c, matrix.d,
      matrix.e, matrix.f
    ))
  }

  if (opts.flatten) item.flatten(opts.flatten)

  return item
}
