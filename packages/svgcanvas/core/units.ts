/**
 * Tools for working with units.
 * @module units
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

import { error } from '../common/logger.js'

const NSSVG = 'http://www.w3.org/2000/svg'

const wAttrs = ['x', 'x1', 'cx', 'rx', 'width']
const hAttrs = ['y', 'y1', 'cy', 'ry', 'height']
const unitAttrs = ['r', 'radius', ...wAttrs, ...hAttrs]

// Mapping of unit type to user coordinates. It only depends on the document's
// font/DPI metrics (measured once below), not on any canvas, so one shared copy
// is fine. Everything that *does* depend on a canvas (round digits, base unit,
// canvas size for `%`, id lookup) goes through a per-canvas instance from
// createUnits().
let typeMap_: TypeMap | null = null

/** What createUnits() needs from its canvas. */
export interface ElementContainer {
  /** The base unit type of the container ('em') */
  getBaseUnit (): string
  /** An element in the container given an id */
  getElement (id: string): Element | null | undefined
  getHeight (): number
  getWidth (): number
  /** The number of digits numbers should be rounded to */
  getRoundDigits (): number
}

export interface TypeMap {
  em: number
  ex: number
  in: number
  cm: number
  mm: number
  pt: number
  pc: number
  px: number
  '%': 0
  [unit: string]: number
}

/** Measure em/ex/in once via a temporary SVG and derive the unit table. */
const computeTypeMap = (): TypeMap => {
  // Get correct em/ex values by creating a temporary SVG.
  const svg = document.createElementNS(NSSVG, 'svg')
  document.body.append(svg)
  const rect = document.createElementNS(NSSVG, 'rect')
  rect.setAttribute('width', '1em')
  rect.setAttribute('height', '1ex')
  rect.setAttribute('x', '1in')
  svg.append(rect)
  const bb = rect.getBBox()
  svg.remove()

  const inch = bb.x
  return {
    em: bb.width,
    ex: bb.height,
    in: inch,
    cm: inch / 2.54,
    mm: inch / 25.4,
    pt: inch / 72,
    pc: inch / 6,
    px: 1,
    '%': 0
  }
}

/** The unit object with values for each unit. */
export const getTypeMap = (): TypeMap => {
  typeMap_ ??= computeTypeMap()
  return typeMap_
}

/** Sets an element's attribute based on the unit in its current value. */
export const setUnitAttr = (elem: Element, attr: string, val: string | number): void => {
  elem.setAttribute(attr, String(val))
}

const attrsToConvert: Record<string, string[]> = {
  line: ['x1', 'x2', 'y1', 'y2'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  foreignObject: ['x', 'y', 'width', 'height'],
  rect: ['x', 'y', 'width', 'height'],
  image: ['x', 'y', 'width', 'height'],
  use: ['x', 'y', 'width', 'height'],
  text: ['x', 'y']
}

/** The unit-conversion functions bound to one canvas, see createUnits(). */
export interface Units {
  shortFloat: {
    (val: string | number): number
    (val: readonly number[]): string
  }
  convertUnit: (val: number | string, unit?: string) => number
  convertAttrs: (element: Element) => void
  convertToNum: (attr: string, val: string | number) => number
  isValidUnit: (attr: string, val: string, selectedElement?: Element) => boolean
  getTypeMap: () => TypeMap
  setUnitAttr: typeof setUnitAttr
}

/**
 * The unit-conversion functions bound to one canvas (`elementContainer`):
 * rounding digits, base unit, canvas size (for `%`) and id lookup all come
 * from that container, so two editors in one page never read each other's.
 */
export const createUnits = (elementContainer: ElementContainer): Units => {
  /**
   * Rounds a given value to a float with number of digits defined in
   * `round_digits` of `saveOptions`. A string/number gives a number; an array
   * of two numbers gives a string of comma-separated floats.
   */
  const shortFloat = ((val: string | number | readonly number[]): number | string => {
    const digits = elementContainer.getRoundDigits()
    if (!isNaN(Number(val))) {
      return Number(Number(val).toFixed(digits))
    }
    if (Array.isArray(val)) {
      return `${shortFloat(val[0])},${shortFloat(val[1])}`
    }
    return Number(Number.parseFloat(String(val)).toFixed(digits))
  }) as Units['shortFloat']

  /** Converts the number to given unit or baseUnit. */
  const convertUnit = (val: number | string, unit?: string): number => {
    const key = unit || elementContainer.getBaseUnit()
    return shortFloat(Number(val) / getTypeMap()[key])
  }

  /** Converts all applicable attributes of an element to the configured baseUnit. */
  const convertAttrs = (element: Element): void => {
    const elName = element.tagName
    const unit = elementContainer.getBaseUnit()
    const attrs = attrsToConvert[elName]
    if (!attrs) { return }

    attrs.forEach((attr) => {
      const cur = element.getAttribute(attr)
      if (cur && !isNaN(Number(cur))) {
        element.setAttribute(attr, (Number(cur) / getTypeMap()[unit]) + unit)
      }
    })
  }

  /**
   * Converts given values to numbers. The attribute name must be supplied in
   * case a percentage is given.
   */
  const convertToNum = (attr: string, val: string | number): number => {
    // Return a number if that's what it already is
    if (!isNaN(Number(val))) { return Number(val) }
    const str = val as string
    if (str.slice(-1) === '%') {
      // Deal with percentage, depends on attribute
      const num = Number(str.slice(0, -1)) / 100
      const width = elementContainer.getWidth()
      const height = elementContainer.getHeight()

      if (wAttrs.includes(attr)) {
        return num * width
      }
      if (hAttrs.includes(attr)) {
        return num * height
      }
      return num * Math.sqrt((width * width) + (height * height)) / Math.sqrt(2)
    }
    const unit = str.slice(-2)
    const num = str.slice(0, -2)
    // Note that this multiplication turns the string into a number
    return Number(num) * getTypeMap()[unit]
  }

  /** Check if an attribute's value is in a valid format. */
  const isValidUnit = (attr: string, val: string, selectedElement?: Element): boolean => {
    if (unitAttrs.includes(attr)) {
      // True if it's just a number
      if (!isNaN(Number(val))) {
        return true
      }
      // Not a number, check if it has a valid unit
      val = val.toLowerCase()
      return Object.keys(getTypeMap()).some((unit) => {
        const re = new RegExp(`^-?[\\d\\.]+${unit}$`)
        return re.test(val)
      })
    }
    if (attr === 'id') {
      // if we're trying to change the id, make sure it's not already present in the doc
      // and the id value is valid.

      let result = false
      // because getElement() can throw an exception in the case of an invalid id
      // (according to https://www.w3.org/TR/xml-id/ IDs must be a NCName)
      // we wrap it in an exception and only return true if the ID was valid and
      // not already present
      try {
        const elem = elementContainer.getElement(val)
        result = (!elem || elem === selectedElement)
      } catch (e) { error('Error getting element by ID', e, 'units') }
      return result
    }
    return true
  }

  return { shortFloat, convertUnit, convertAttrs, convertToNum, isValidUnit, getTypeMap, setUnitAttr }
}

/** The units bound to `canvas` (`canvas.units`, from createUnits()). */
export const getUnits = (canvas: { units?: Units }): Units => {
  if (!canvas?.units) throw new Error('getUnits: canvas has no `units` (create it with createUnits(canvas))')
  return canvas.units
}
