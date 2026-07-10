/**
 * Path `d`-attribute construction and element-to-path conversion utilities.
 * @module path-utils
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

import {
  hasMatrixTransform,
  getTransformList
} from './math.js'
import { mergeDeep } from '../common/util.js'

/**
 * @typedef {GenericArray} module:path-utils.PathSegmentArray
 * @property {Integer} length 2
 * @property {"M"|"L"|"C"|"Z"} 0
 * @property {Float[]} 1
 */

/**
 * Create a path 'd' attribute from path segments.
 * Each segment is an array of the form: `[singleChar, [x,y, x,y, ...]]`
 * @function module:path-utils.getPathDFromSegments
 * @param {module:path-utils.PathSegmentArray[]} pathSegments - An array of path segments to be converted
 * @returns {string} The converted path d attribute.
 */
export const getPathDFromSegments = (pathSegments) => {
  return pathSegments.map(([command, points]) => {
    const coords = []
    for (let i = 0; i < points.length; i += 2) {
      coords.push(`${points[i]},${points[i + 1]}`)
    }
    return command + coords.join(' ')
  }).join(' ')
}

/**
 * Make a path 'd' attribute from a simple SVG element shape.
 * @function module:path-utils.getPathDFromElement
 * @param {Element} elem - The element to be converted
 * @returns {string|undefined} The path d attribute or `undefined` if the element type is unknown.
 */
export const getPathDFromElement = (elem) => {
  // Possibly the cubed root of 6, but 1.81 works best
  let num = 1.81
  let d
  let rx
  let ry
  switch (elem.tagName) {
    case 'ellipse':
    case 'circle': {
      rx = Number(elem.getAttribute('rx'))
      ry = Number(elem.getAttribute('ry'))
      const cx = Number(elem.getAttribute('cx'))
      const cy = Number(elem.getAttribute('cy'))
      if (elem.tagName === 'circle' && elem.hasAttribute('r')) {
        ry = Number(elem.getAttribute('r'))
        rx = ry
      }
      d = getPathDFromSegments([
        ['M', [cx - rx, cy]],
        ['C', [cx - rx, cy - ry / num, cx - rx / num, cy - ry, cx, cy - ry]],
        ['C', [cx + rx / num, cy - ry, cx + rx, cy - ry / num, cx + rx, cy]],
        ['C', [cx + rx, cy + ry / num, cx + rx / num, cy + ry, cx, cy + ry]],
        ['C', [cx - rx / num, cy + ry, cx - rx, cy + ry / num, cx - rx, cy]],
        ['Z', []]
      ])
      break
    }
    case 'path':
      d = elem.getAttribute('d')
      break
    case 'line': {
      const x1 = elem.getAttribute('x1')
      const y1 = elem.getAttribute('y1')
      const x2 = elem.getAttribute('x2')
      const y2 = elem.getAttribute('y2')
      d = `M${x1},${y1}L${x2},${y2}`
      break
    }
    case 'polyline':
      d = `M${elem.getAttribute('points')}`
      break
    case 'polygon':
      d = `M${elem.getAttribute('points')} Z`
      break
    case 'rect': {
      rx = Number(elem.getAttribute('rx'))
      ry = Number(elem.getAttribute('ry'))
      const b = elem.getBBox()
      const { x, y } = b
      const w = b.width
      const h = b.height
      num = 4 - num // Why? Because!

      d =
        !rx && !ry // Regular rect
          ? getPathDFromSegments([
            ['M', [x, y]],
            ['L', [x + w, y]],
            ['L', [x + w, y + h]],
            ['L', [x, y + h]],
            ['L', [x, y]],
            ['Z', []]
          ])
          : getPathDFromSegments([
            ['M', [x, y + ry]],
            ['C', [x, y + ry / num, x + rx / num, y, x + rx, y]],
            ['L', [x + w - rx, y]],
            ['C', [x + w - rx / num, y, x + w, y + ry / num, x + w, y + ry]],
            ['L', [x + w, y + h - ry]],
            [
              'C',
              [
                x + w,
                y + h - ry / num,
                x + w - rx / num,
                y + h,
                x + w - rx,
                y + h
              ]
            ],
            ['L', [x + rx, y + h]],
            ['C', [x + rx / num, y + h, x, y + h - ry / num, x, y + h - ry]],
            ['L', [x, y + ry]],
            ['Z', []]
          ])
      break
    }
    default:
      break
  }

  return d
}

/**
 * Get a set of attributes from an element that is useful for convertToPath.
 * @function module:path-utils.getExtraAttributesForConvertToPath
 * @param {Element} elem - The element to be probed
 * @returns {PlainObject<"marker-start"|"marker-end"|"marker-mid"|"filter"|"clip-path", string>} An object with attributes.
 */
export const getExtraAttributesForConvertToPath = (elem) => {
  // TODO: make this list global so that we can properly maintain it
  // TODO: what about @transform, @clip-rule, @fill-rule, etc?
  const attributeNames = ['marker-start', 'marker-end', 'marker-mid', 'filter', 'clip-path']

  return attributeNames.reduce((attrs, name) => {
    const value = elem.getAttribute(name)
    if (value) attrs[name] = value
    return attrs
  }, {})
}

/**
 * Convert selected element to a path.
 * @function module:path-utils.convertToPath
 * @param {Element} elem - The DOM element to be converted
 * @param {module:utilities.SVGElementJSON} attrs - Apply attributes to new path. see canvas.convertToPath
 * @param {module:utilities.EditorContext#addSVGElementsFromJson} addSVGElementsFromJson - Function to add the path element to the current layer. See canvas.addSVGElementsFromJson
 * @param {module:path.pathActions} pathActions - If a transform exists, pathActions.resetOrientation() is used. See: canvas.pathActions.
 * @param {module:draw.DrawCanvasInit#clearSelection|module:path.EditorContext#clearSelection} clearSelection - see [canvas.clearSelection]{@link module:svgcanvas.SvgCanvas#clearSelection}
 * @param {module:path.EditorContext#addToSelection} addToSelection - see [canvas.addToSelection]{@link module:svgcanvas.SvgCanvas#addToSelection}
 * @param {module:history} hstry - see history module
 * @param {module:path.EditorContext#addCommandToHistory|module:draw.DrawCanvasInit#addCommandToHistory} addCommandToHistory - see [canvas.addCommandToHistory]{@link module:svgcanvas~addCommandToHistory}
 * @returns {SVGPathElement|null} The converted path element or null if the DOM element was not recognized.
 */
export const convertToPath = (elem, attrs, svgCanvas) => {
  const batchCmd = new svgCanvas.history.BatchCommand('Convert element to Path')

  // Any attribute on the element not covered by the passed-in attributes
  attrs = mergeDeep(attrs, getExtraAttributesForConvertToPath(elem))

  const path = svgCanvas.addSVGElementsFromJson({
    element: 'path',
    attr: attrs
  })

  const eltrans = elem.getAttribute('transform')
  if (eltrans) {
    path.setAttribute('transform', eltrans)
  }

  const { id } = elem
  const { parentNode } = elem
  if (elem.nextSibling) {
    elem.before(path)
  } else {
    parentNode.append(path)
  }

  const d = getPathDFromElement(elem)
  if (d) {
    path.setAttribute('d', d)

    // Replace the current element with the converted one

    // Reorient if it has a matrix
    if (eltrans) {
      const tlist = getTransformList(path)
      if (hasMatrixTransform(tlist)) {
        svgCanvas.pathActions.resetOrientation(path)
      }
    }

    const { nextSibling } = elem
    batchCmd.addSubCommand(
      new svgCanvas.history.RemoveElementCommand(
        elem,
        nextSibling,
        elem.parentNode
      )
    )
    svgCanvas.clearSelection()
    elem.remove() // We need to remove this element otherwise the nextSibling of 'path' won't be null and an exception will be thrown after subsequent undo and redos.

    batchCmd.addSubCommand(new svgCanvas.history.InsertElementCommand(path))
    path.setAttribute('id', id)
    path.removeAttribute('visibility')
    svgCanvas.addToSelection([path], true)

    svgCanvas.addCommandToHistory(batchCmd)

    return path
  }
  // the elem.tagName was not recognized, so no "d" attribute. Remove it, so we've haven't changed anything.
  path.remove()
  return null
}
