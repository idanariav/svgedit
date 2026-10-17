/**
 * Select Same: extend the selection to every element that shares a property
 * with the primary selected element. Colour criteria take a tolerance, a
 * distance in the OKLab colour space scaled so that black against white is 100
 * (about 2 is the smallest difference an eye notices, 5 reads as "the same
 * colour family"). Tolerance 0 is an exact match of the attribute text.
 *
 * Criteria: `fill`, `stroke`, `fillstroke` (both), `strokeweight`, `opacity`,
 * `type` (the tag name).
 *
 * @module select-same
 * @license MIT
 */

// The modular entry point: only the colour modes and parsers the fills and strokes of a drawing use
// (hex, names, rgb(), hsl()), not all of culori.
import type SvgCanvas from '../svgcanvas.ts'
import { useMode, useParser, parse, modeRgb, modeOklab, modeHsl, parseHex, parseNamed, parseRgb, parseHsl, parseTransparent } from 'culori/fn'

useMode(modeRgb)
useMode(modeHsl)
const toOklab = useMode(modeOklab)
for (const parser of [parseHex, parseNamed, parseRgb, parseHsl, parseTransparent]) useParser(parser)

export type SelectSameCriterion = 'fill' | 'stroke' | 'type' | 'fillstroke' | 'strokeweight' | 'opacity'
export const SELECT_SAME_CRITERIA: SelectSameCriterion[] = ['fill', 'stroke', 'type', 'fillstroke', 'strokeweight', 'opacity']

/**
 * Distance between two CSS colours in OKLab, black to white = 100.
 * @returns `Infinity` when either is not a plain colour (`none`, `url(#g)`, …)
 */
export const colorDistance = (a: string, b: string): number => {
  const ca = parse(a)
  const cb = parse(b)
  if (!ca || !cb) return Infinity
  const x = toOklab(ca)
  const y = toOklab(cb)
  return 100 * Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b)
}

/**
 * The attributes a viewer sees. A tapered stroke is drawn as a filled outline,
 * so its colour is `fill` and its width and stroke paint are in `se:taper-style`
 * ("width|paint"): read it as the stroked line it stands for.
 */
export const appearanceOf = (el: Element): { fill: string, stroke: string, strokeWidth: number, opacity: number } => {
  const norm = (attr: string, def: string): string => {
    const v = el.getAttribute(attr)
    return v === null || v.trim() === '' ? def : v.trim().toLowerCase()
  }
  const num = (attr: string, def: number): number => {
    const n = parseFloat(el.getAttribute(attr) ?? '')
    return Number.isFinite(n) ? n : def
  }
  const taper = el.getAttribute('se:taper-style')
  if (taper) {
    const sep = taper.indexOf('|')
    return {
      fill: 'none',
      stroke: taper.slice(sep + 1).trim().toLowerCase(),
      strokeWidth: parseFloat(taper.slice(0, sep)) || 1,
      opacity: num('opacity', 1)
    }
  }
  const stroke = norm('stroke', 'none')
  return {
    fill: norm('fill', '#000000'),
    stroke,
    // Without a stroke the width is irrelevant: unstroked shapes all have "no weight".
    strokeWidth: stroke === 'none' ? 0 : num('stroke-width', 1),
    opacity: num('opacity', 1)
  }
}

/** @param a normalised paint */
export const samePaint = (a: string, b: string, tolerance: number): boolean => a === b || (tolerance > 0 && colorDistance(a, b) <= tolerance)

/**
 * @param ref the primary selected element
 * @param el a candidate
 * @param tolerance colour tolerance, 0 = exact
 */
export const matchesSame = (criterion: SelectSameCriterion | string, ref: Element, el: Element, tolerance = 0): boolean => {
  if (criterion === 'type') return el.tagName === ref.tagName
  const a = appearanceOf(ref)
  const b = appearanceOf(el)
  switch (criterion) {
    case 'fill': return samePaint(a.fill, b.fill, tolerance)
    case 'stroke': return samePaint(a.stroke, b.stroke, tolerance)
    case 'fillstroke': return samePaint(a.fill, b.fill, tolerance) && samePaint(a.stroke, b.stroke, tolerance)
    case 'strokeweight': return Math.abs(a.strokeWidth - b.strokeWidth) < 1e-6
    case 'opacity': return Math.abs(a.opacity - b.opacity) < 1e-6
    default: return el.tagName === ref.tagName
  }
}

export type SelectionOp = 'replace' | 'add' | 'subtract'

/**
 * What a click of the Magic Wand does: Shift adds and Alt subtracts whatever the tool is set to, otherwise it is the set
 * mode (what a touch screen, with no Shift or Alt, uses).
 * @param mode the mode set on the options bar
 */
export const selectionOpFor = (mods: { shift?: boolean, alt?: boolean }, mode: SelectionOp | string = 'replace'): SelectionOp => {
  if (mods.shift) return 'add'
  if (mods.alt) return 'subtract'
  return mode === 'add' || mode === 'subtract' ? mode : 'replace'
}

/**
 * How a click of the Magic Wand combines what it found with the current selection (Shift adds, Alt subtracts).
 * Order is kept: the current selection first, then what was added.
 */
export const combineSelection = (op: SelectionOp, current: Element[], found: Element[]): Element[] => {
  if (op === 'add') return [...current, ...found.filter((el) => !current.includes(el))]
  if (op === 'subtract') return current.filter((el) => !found.includes(el))
  return [...found]
}

type FindHost = Pick<SvgCanvas, 'getCurrentGroup' | 'getSvgContent'>
type SelectHost = FindHost & Pick<SvgCanvas, 'getSelectedElements' | 'selectOnly'>

/**
 * Every element (in the current group context, or on any visible layer) that shares a property with `ref`,
 * `ref` included. Nothing is selected.
 * @param options `tolerance`: colour distance (see the module comment), default 0 = exact
 */
export const findSameAs = (svgCanvas: FindHost, ref: Element, criterion: SelectSameCriterion | string, options: { tolerance?: number } = {}): Element[] => {
  const tolerance = Math.max(0, Number(options.tolerance) || 0)
  const found: Element[] = []
  const scan = (parent: Element): void => {
    for (const el of parent.children) {
      if (el.tagName === 'title' || el.hasAttribute('data-frame')) continue
      if (matchesSame(criterion, ref, el, tolerance)) found.push(el)
    }
  }
  const group = svgCanvas.getCurrentGroup()
  if (group) {
    scan(group)
  } else {
    for (const layer of svgCanvas.getSvgContent().children) {
      if (layer.tagName !== 'g') continue
      if (layer.getAttribute('display') === 'none' || (layer as HTMLElement).style.display === 'none') continue
      scan(layer)
    }
  }
  return found
}

/**
 * Extend the selection to every element (in the current group context, or on
 * any visible layer) that shares a property with the primary selected element.
 * @param options `tolerance`: colour distance (see the module comment), default 0 = exact
 */
export const selectSameAs = (svgCanvas: SelectHost, criterion: SelectSameCriterion | string, options: { tolerance?: number } = {}): void => {
  const [ref] = svgCanvas.getSelectedElements().filter(Boolean)
  if (!ref) return
  const found = findSameAs(svgCanvas, ref, criterion, options)
  if (found.length) svgCanvas.selectOnly(found, true)
}
