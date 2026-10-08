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
let typeMap_ = null

/**
 * @interface module:units.ElementContainer
 */
/**
 * @function module:units.ElementContainer#getBaseUnit
 * @returns {string} The base unit type of the container ('em')
 */
/**
 * @function module:units.ElementContainer#getElement
 * @returns {?Element} An element in the container given an id
 */
/**
 * @function module:units.ElementContainer#getHeight
 * @returns {number} The container's height
 */
/**
 * @function module:units.ElementContainer#getWidth
 * @returns {number} The container's width
 */
/**
 * @function module:units.ElementContainer#getRoundDigits
 * @returns {number} The number of digits number should be rounded to
 */

/**
 * @typedef {PlainObject} module:units.TypeMap
 * @property {number} em
 * @property {number} ex
 * @property {number} in
 * @property {number} cm
 * @property {number} mm
 * @property {number} pt
 * @property {number} pc
 * @property {number} px
 * @property {0} %
 */

/**
 * Measure em/ex/in once via a temporary SVG and derive the unit table.
 * @returns {module:units.TypeMap}
 */
const computeTypeMap = () => {
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

/**
* Group: Unit conversion functions.
*/

/**
 * @function module:units.getTypeMap
 * @returns {module:units.TypeMap} The unit object with values for each unit
*/
export const getTypeMap = () => {
  typeMap_ ??= computeTypeMap()
  return typeMap_
}

/**
* @typedef {GenericArray} module:units.CompareNumbers
* @property {number} length 2
* @property {number} 0
* @property {number} 1
*/

/**
* Sets an element's attribute based on the unit in its current value.
*
* @function module:units.setUnitAttr
* @param {Element} elem - DOM element to be changed
* @param {string} attr - Name of the attribute associated with the value
* @param {string} val - Attribute value to convert
* @returns {void}
*/
export const setUnitAttr = (elem, attr, val) => {
  elem.setAttribute(attr, val)
}

const attrsToConvert = {
  line: ['x1', 'x2', 'y1', 'y2'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  foreignObject: ['x', 'y', 'width', 'height'],
  rect: ['x', 'y', 'width', 'height'],
  image: ['x', 'y', 'width', 'height'],
  use: ['x', 'y', 'width', 'height'],
  text: ['x', 'y']
}

/**
 * The unit-conversion functions bound to one canvas (`elementContainer`):
 * rounding digits, base unit, canvas size (for `%`) and id lookup all come
 * from that container, so two editors in one page never read each other's.
 * @function module:units.createUnits
 * @param {module:units.ElementContainer} elementContainer
 * @returns {{shortFloat: Function, convertUnit: (val: number, unit?: string) => number, convertAttrs: Function, convertToNum: (attr: string, val: string) => number, isValidUnit: (attr: string, val: string, selectedElement?: Element) => boolean, getTypeMap: () => Record<string, number>, setUnitAttr: Function}}
 */
export const createUnits = (elementContainer) => {
  /**
  * Rounds a given value to a float with number of digits defined in
  * `round_digits` of `saveOptions`
  *
  * @function module:units.shortFloat
  * @param {string|number|module:units.CompareNumbers} val - The value (or Array of two numbers) to be rounded
  * @returns {number|string} If a string/number was given, returns a number. If an array, return a string
  * with comma-separated floats
  */
  const shortFloat = (val) => {
    const digits = elementContainer.getRoundDigits()
    if (!isNaN(val)) {
      return Number(Number(val).toFixed(digits))
    }
    if (Array.isArray(val)) {
      return `${shortFloat(val[0])},${shortFloat(val[1])}`
    }
    return Number.parseFloat(val).toFixed(digits) - 0
  }

  /**
  * Converts the number to given unit or baseUnit.
  * @function module:units.convertUnit
  * @param {string|number} val
  * @param {"em"|"ex"|"in"|"cm"|"mm"|"pt"|"pc"|"px"|"%"} [unit]
  * @returns {number}
  */
  const convertUnit = (val, unit) => {
    unit = unit || elementContainer.getBaseUnit()
    return shortFloat(val / getTypeMap()[unit])
  }

  /**
  * Converts all applicable attributes to the configured baseUnit.
  * @function module:units.convertAttrs
  * @param {Element} element - A DOM element whose attributes should be converted
  * @returns {void}
  */
  const convertAttrs = (element) => {
    const elName = element.tagName
    const unit = elementContainer.getBaseUnit()
    const attrs = attrsToConvert[elName]
    if (!attrs) { return }

    attrs.forEach((attr) => {
      const cur = element.getAttribute(attr)
      if (cur && !isNaN(cur)) {
        element.setAttribute(attr, (cur / getTypeMap()[unit]) + unit)
      }
    })
  }

  /**
  * Converts given values to numbers. Attributes must be supplied in
  * case a percentage is given.
  *
  * @function module:units.convertToNum
  * @param {string} attr - Name of the attribute associated with the value
  * @param {string} val - Attribute value to convert
  * @returns {number} The converted number
  */
  const convertToNum = (attr, val) => {
    // Return a number if that's what it already is
    if (!isNaN(val)) { return val - 0 }
    if (val.substr(-1) === '%') {
      // Deal with percentage, depends on attribute
      const num = val.substr(0, val.length - 1) / 100
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
    const unit = val.slice(-2)
    const num = val.slice(0, -2)
    // Note that this multiplication turns the string into a number
    return num * getTypeMap()[unit]
  }

  /**
  * Check if an attribute's value is in a valid format.
  * @function module:units.isValidUnit
  * @param {string} attr - The name of the attribute associated with the value
  * @param {string} val - The attribute value to check
  * @param {Element} selectedElement
  * @returns {boolean} Whether the unit is valid
  */
  const isValidUnit = (attr, val, selectedElement) => {
    if (unitAttrs.includes(attr)) {
      // True if it's just a number
      if (!isNaN(val)) {
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

/**
 * The units bound to `canvas` (`canvas.units`, from createUnits()).
 * @param {{units?: object}} canvas
 * @returns {ReturnType<typeof createUnits>}
 */
export const getUnits = (canvas) => {
  if (!canvas?.units) throw new Error('getUnits: canvas has no `units` (create it with createUnits(canvas))')
  return canvas.units
}
