// @ts-check
/**
 * Document model, layer 2b: the `se:*` features of one element as typed fields.
 *
 * Each feature is read with the parser its owning module exports (`corner-radius.js`, `width-profile.js`, `dash-fit.js`,
 * `art-brush-canvas.js`, `blend-canvas.js`), so the grammar has one definition and the editor and the model cannot
 * disagree about it. Only features whose parser runs without a DOM are here; an attribute that is not typed yet stays
 * readable verbatim in `item.se`, and one that has a typed field but does not parse is named in `invalid` (the same
 * condition `checkDrawing` reports as `se-attr-parse`).
 *
 * Not typed yet, and why: `se:fx` (parsing needs the live-effect registry, which the effect modules fill when they
 * are initialised), `se:arrow-*` and the area-text attributes (`se:wrap-width`, `se:valign`, `se:soft`: the grammar
 * is inline in a validator, with no exported parser), repeat, mirror, puppet pins and connector binding.
 * @module model/features
 * @license MIT
 */
import { CORNER_RADIUS_ATTR, CORNER_SOURCE_ATTR, parseCornerSpec } from '../corner-radius.js'
import { TAPER_ATTR, TAPER_SOURCE_ATTR, TAPER_STYLE_ATTR, WIDTH_PROFILE_ATTR, parseProfile, parseTaper, parseTaperStyle } from '../width-profile.ts'
import { DASH_FIT_ATTR, parseDashes } from '../dash-fit.js'
import { BRUSH_ATTR, LIB_ATTR, parseBrush } from '../art-brush-canvas.js'
import { BLEND_ATTR, parseBlend } from '../blend-canvas.js'

/**
 * @typedef {object} Features
 * @property {ReturnType<typeof parseCornerSpec>} [cornerRadius] `se:corner-radius`: one radius for every corner, or per-corner radii and kinds
 * @property {string} [cornerSource] `se:orig-d`: the path data the corners were cut from
 * @property {import('../width-profile.ts').WidthPoint[]} [widthProfile] `se:width-profile`
 * @property {{start: number, end: number}} [taper] `se:taper`: end widths in percent
 * @property {{width: number, paint: string}} [taperStyle] `se:taper-style`
 * @property {string} [taperSource] `se:taper-d`: the centerline of a tapered or width-profiled outline
 * @property {number[]} [dashFit] `se:dash-fit`: the dash pattern the fitted `stroke-dasharray` was made from
 * @property {NonNullable<ReturnType<typeof parseBrush>>} [artBrush] `se:art-brush` on a brushed group
 * @property {'art' | 'pattern'} [brushLibrary] `se:brush` on a library entry in `<defs>`
 * @property {NonNullable<ReturnType<typeof parseBlend>>} [blend] `se:blend` on a blend group
 * @property {string[]} invalid typed attributes that did not parse (their raw value stays in `se`)
 */

/**
 * @param {Readonly<Record<string, string>>} se every `se:*` attribute of the element
 * @returns {Features}
 */
export const readFeatures = (se) => {
  /** @type {Features} */
  const out = { invalid: [] }
  /**
   * @template T
   * @param {string} attr
   * @param {(value: string) => T | null | undefined} parse
   * @returns {T | undefined}
   */
  const read = (attr, parse) => {
    const value = se[attr]
    if (value === undefined) return undefined
    const parsed = parse(value)
    if (parsed === null || parsed === undefined) { out.invalid.push(attr); return undefined }
    return parsed
  }
  const set = (/** @type {Partial<Features>} */ fields) => {
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) /** @type {any} */ (out)[k] = v
  }
  set({
    cornerRadius: read(CORNER_RADIUS_ATTR, parseCornerSpec),
    cornerSource: read(CORNER_SOURCE_ATTR, (v) => v),
    widthProfile: read(WIDTH_PROFILE_ATTR, parseProfile),
    taper: read(TAPER_ATTR, parseTaper),
    taperStyle: read(TAPER_STYLE_ATTR, parseTaperStyle),
    taperSource: read(TAPER_SOURCE_ATTR, (v) => v),
    dashFit: read(DASH_FIT_ATTR, parseDashes),
    artBrush: read(BRUSH_ATTR, parseBrush),
    brushLibrary: read(LIB_ATTR, (v) => (v === 'art' || v === 'pattern' ? v : null)),
    blend: read(BLEND_ATTR, parseBlend)
  })
  return out
}
