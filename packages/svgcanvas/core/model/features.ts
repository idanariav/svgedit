/**
 * Document model, layer 2b: the `se:*` features of one element as typed fields.
 *
 * Each feature is read with the parser its owning module exports (`corner-radius.js`, `width-profile.ts`, `dash-fit.js`,
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
import { CORNER_RADIUS_ATTR, CORNER_SOURCE_ATTR, parseCornerSpec } from '../corner-radius.ts'
import { TAPER_ATTR, TAPER_SOURCE_ATTR, TAPER_STYLE_ATTR, WIDTH_PROFILE_ATTR, parseProfile, parseTaper, parseTaperStyle } from '../width-profile.ts'
import { DASH_FIT_ATTR, parseDashes } from '../dash-fit.ts'
import { BRUSH_ATTR, LIB_ATTR, parseBrush } from '../art-brush-canvas.js'
import { BLEND_ATTR, parseBlend } from '../blend-canvas.js'
import type { WidthPoint } from '../width-profile.ts'

export interface Features {
  /** `se:corner-radius`: one radius for every corner, or per-corner radii and kinds */
  cornerRadius?: ReturnType<typeof parseCornerSpec>
  /** `se:orig-d`: the path data the corners were cut from */
  cornerSource?: string
  /** `se:width-profile` */
  widthProfile?: WidthPoint[]
  /** `se:taper`: end widths in percent */
  taper?: { start: number, end: number }
  /** `se:taper-style` */
  taperStyle?: { width: number, paint: string }
  /** `se:taper-d`: the centerline of a tapered or width-profiled outline */
  taperSource?: string
  /** `se:dash-fit`: the dash pattern the fitted `stroke-dasharray` was made from */
  dashFit?: number[]
  /** `se:art-brush` on a brushed group */
  artBrush?: NonNullable<ReturnType<typeof parseBrush>>
  /** `se:brush` on a library entry in `<defs>` */
  brushLibrary?: 'art' | 'pattern'
  /** `se:blend` on a blend group */
  blend?: NonNullable<ReturnType<typeof parseBlend>>
  /** typed attributes that did not parse (their raw value stays in `se`) */
  invalid: string[]
}

/** `se` is every `se:*` attribute of the element. */
export const readFeatures = (se: Readonly<Record<string, string>>): Features => {
  const out: Features = { invalid: [] }
  const read = <T>(attr: string, parse: (value: string) => T | null | undefined): T | undefined => {
    const value = se[attr]
    if (value === undefined) return undefined
    const parsed = parse(value)
    if (parsed === null || parsed === undefined) { out.invalid.push(attr); return undefined }
    return parsed
  }
  const set = (fields: Partial<Features>) => {
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v
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
