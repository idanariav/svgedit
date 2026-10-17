/**
 * Ruler guides: horizontal and vertical lines the user drags out of the rulers
 * to align things by. They are drawing data, not graphics: one attribute on the
 * drawing root, `se:guides="v:120,350;h:300.5"` (`v` = vertical lines, at those
 * x positions; `h` = horizontal lines, at those y positions, in document
 * units). It is saved with the file (the `se:` namespace survives sanitize and
 * the round trip), never exported as artwork, and every change is an undo step.
 *
 * Whether guides are shown / locked is the user's view setting, not the
 * drawing's: `curConfig.showGuides` / `curConfig.lockGuides`, managed by the
 * ruler-guides extension. A hidden guide neither draws nor snaps.
 *
 * @module guides
 * @license MIT
 */

import type SvgCanvas from '../svgcanvas.ts'
import { registerAttrValidator } from './drawing-invariants.ts'

export const GUIDES_ATTR = 'se:guides'

export interface Guides { v: number[], h: number[] }

const round = (n: number): number => Math.round(n * 100) / 100

/** @returns finite numbers, rounded to 0.01, ascending, no duplicates */
const clean = (list: unknown): number[] => {
  const nums = (Array.isArray(list) ? list : []).map(Number).filter(Number.isFinite).map(round)
  return [...new Set(nums)].sort((a, b) => a - b)
}

/**
 * @param text an `se:guides` value
 * @returns what it holds; anything unreadable is dropped
 */
export const parseGuides = (text: string | null | undefined): Guides => {
  const guides: Guides = { v: [], h: [] }
  for (const part of String(text ?? '').split(';')) {
    const m = /^\s*([vh])\s*:\s*(.*)$/.exec(part)
    if (m) guides[m[1] as 'v' | 'h'] = clean(guides[m[1] as 'v' | 'h'].concat(m[2].split(',').map((s) => (s.trim() === '' ? NaN : Number(s)))))
  }
  return guides
}

/** @returns the attribute value, '' when there are no guides */
export const formatGuides = (guides: Partial<Guides>): string => {
  const v = clean(guides.v)
  const h = clean(guides.h)
  return [v.length ? `v:${v.join(',')}` : '', h.length ? `h:${h.join(',')}` : ''].filter(Boolean).join(';')
}

/**
 * Whether an `se:guides` value is well formed (for `checkDrawing`).
 */
export const validateGuides = (value: string): true | string => {
  if (value.trim() === '') return true
  for (const part of value.split(';')) {
    if (!/^\s*[vh]\s*:\s*-?\d+(\.\d+)?(\s*,\s*-?\d+(\.\d+)?)*\s*$/.test(part)) return `has a bad entry "${part.trim().slice(0, 30)}" (expected v:x,x;h:y,y)`
  }
  return true
}

/**
 * Guides that count right now: none while the user hides them.
 */
export const visibleGuides = (svgCanvas: Pick<SvgCanvas, 'getCurConfig' | 'getGuides'>): Guides =>
  svgCanvas.getCurConfig?.().showGuides === false ? { v: [], h: [] } : (svgCanvas.getGuides?.() ?? { v: [], h: [] })

/** The members `guides.ts` gives its canvas. */
export interface GuidesApi {
  /** The drawing's ruler guides (`se:guides` on the root): `v` = x positions of vertical lines, `h` = y positions of horizontal ones. */
  getGuides(): { v: number[]; h: number[] }
  /** Replace the ruler guides as one undo step; false when nothing changed. */
  setGuides(guides: { v?: number[]; h?: number[] }, label?: string): boolean
}

export const createGuides = (canvas: SvgCanvas): GuidesApi => {
  const svgCanvas = canvas
  registerAttrValidator(GUIDES_ATTR, validateGuides)

  /**
   * The drawing's guides, hidden or not.
   */

  /**
   * Replace the drawing's guides as one undo step.
   * @param label undo-menu text
   * @returns whether anything changed
   */

  return {
    getGuides: () => parseGuides(svgCanvas.getSvgContent().getAttribute(GUIDES_ATTR)),
    setGuides: (guides, label = 'Edit guides') => {
      const root = svgCanvas.getSvgContent()
      const next = formatGuides(guides)
      if (next === formatGuides(parseGuides(root.getAttribute(GUIDES_ATTR)))) return false
      svgCanvas.transact(label, () => {
        if (next) root.setAttribute(GUIDES_ATTR, next)
        else root.removeAttribute(GUIDES_ATTR)
      })
      return true
    }
  }
}
