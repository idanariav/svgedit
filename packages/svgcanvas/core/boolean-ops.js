/**
 * Boolean path operations: union, intersect, subtract, exclude, divide.
 * Requires exactly 2 selected shapes. Most operations produce a single merged
 * `<path>`; `divide` splits the bottom shape into multiple `<path>` pieces.
 * Undo/redo is fully supported via the history BatchCommand system.
 *
 * @module boolean-ops
 * @license MIT
 */

import paper from 'paper/dist/paper-core.js'
import { getPathDFromElement } from './utilities.js'
import { getTransformList, transformListToTransform } from './math.js'
import { warn } from '../common/logger.js'

// Element types that cannot be converted to a path for boolean operations
const NON_PATH_TAGS = new Set(['text', 'tspan', 'image', 'use', 'symbol', 'g', 'defs'])

// Lazy-initialised paper.js scope — created once on first use. This is a
// stateless reusable compute scope (each op clears it), so it's safe to share
// across editor instances; only the SvgCanvas reference must be per-instance.
let paperScope = null
const getPaperScope = () => {
  if (!paperScope) {
    paperScope = new paper.PaperScope()
    paperScope.setup(document.createElement('canvas'))
  }
  return paperScope
}

/**
 * Convert an SVG element to a paper.js Path with its transform applied.
 * Returns null if the element cannot be converted.
 * @param {Element} elem
 * @param {paper.PaperScope} scope
 * @returns {paper.Path|null}
 */
const getElemAsPath = (elem, scope) => {
  if (NON_PATH_TAGS.has(elem.tagName)) return null

  const d = getPathDFromElement(elem)
  if (!d) return null

  const path = new scope.Path(d)

  // Apply the element's own transform (handles rotation, scale, translation)
  const tlist = getTransformList(elem)
  if (tlist && tlist.numberOfItems > 0) {
    const matrix = transformListToTransform(tlist).matrix
    path.transform(new scope.Matrix(
      matrix.a, matrix.b,
      matrix.c, matrix.d,
      matrix.e, matrix.f
    ))
  }

  return path
}

/**
 * Collect inheritable style attributes from an element.
 * @param {Element} elem
 * @returns {Object}
 */
const getStyleAttrs = (elem) => {
  const styleAttrs = {}
  for (const attr of ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'opacity']) {
    const val = elem.getAttribute(attr)
    if (val !== null) styleAttrs[attr] = val
  }
  return styleAttrs
}

/**
 * Create a styled `<path>` element from a paper.js result and place it at the
 * bottom element's original DOM position. The resulting element is appended to
 * `newPaths` and an InsertElementCommand is added to the batch.
 * @param {paper.PathItem} result - paper.js path/compound-path result
 * @param {Element} bottomElem - element whose style and DOM position are inherited
 * @param {Object} styleAttrs - pre-collected style attributes from the bottom element
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @param {Element[]} newPaths - accumulator for created elements
 * @param {module:history.BatchCommand} batchCmd
 * @returns {void}
 */
const createResultPath = (result, bottomElem, styleAttrs, canvas, newPaths, batchCmd) => {
  if (!result || !result.pathData) return

  const newPath = canvas.addSVGElementsFromJson({
    element: 'path',
    attr: {
      id: canvas.getNextId(),
      d: result.pathData,
      ...styleAttrs
    }
  })

  bottomElem.before(newPath)
  newPaths.push(newPath)
  batchCmd.addSubCommand(new canvas.history.InsertElementCommand(newPath))
}

/**
 * Perform a boolean path operation on exactly 2 selected elements.
 * @param {'union'|'intersect'|'subtract'|'exclude'|'divide'} type
 * @param {module:svgcanvas.SvgCanvas} canvas
 */
const performBooleanOp = (type, canvas) => {
  const elems = canvas.getSelectedElements().filter(Boolean)

  if (elems.length !== 2) {
    warn('Boolean operations require exactly 2 selected shapes', null, 'boolean-ops')
    return
  }

  // Sort by DOM order so earlier = bottom, later = top
  const sorted = [...elems].sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  )
  const [bottomElem, topElem] = sorted

  const scope = getPaperScope()

  const bottomPath = getElemAsPath(bottomElem, scope)
  const topPath = getElemAsPath(topElem, scope)

  if (!bottomPath || !topPath) {
    warn(
      'Boolean operations require path-convertible shapes. Groups, text, and images are not supported.',
      null,
      'boolean-ops'
    )
    return
  }

  // Inherit style from the bottom element
  const styleAttrs = getStyleAttrs(bottomElem)

  // Build undo/redo batch command
  const { BatchCommand, RemoveElementCommand } = canvas.history
  const batchCmd = new BatchCommand(`Boolean ${type}`)

  const newPaths = []

  if (type === 'divide') {
    // Split the bottom shape into pieces using the top shape as a knife.
    // paper.js divide() returns a Group of two children (subtract + intersect
    // pieces); when the shapes don't overlap it collapses to a single path.
    const divided = bottomPath.divide(topPath)
    const pieces = divided.children ? [...divided.children] : [divided]
    pieces.forEach(piece =>
      createResultPath(piece, bottomElem, styleAttrs, canvas, newPaths, batchCmd)
    )
  } else {
    let result
    switch (type) {
      case 'union':
        result = bottomPath.unite(topPath)
        break
      case 'intersect':
        result = bottomPath.intersect(topPath)
        break
      case 'subtract':
        // Convention (Inkscape/Illustrator): top shape cuts into bottom
        result = bottomPath.subtract(topPath)
        break
      case 'exclude':
        // XOR: keep the non-overlapping areas of both shapes
        result = bottomPath.exclude(topPath)
        break
      default:
        return
    }
    createResultPath(result, bottomElem, styleAttrs, canvas, newPaths, batchCmd)
  }

  if (newPaths.length === 0) {
    warn('Boolean operation produced no result', null, 'boolean-ops')
    return
  }

  // Record removal of both source elements before actually removing them
  const bottomNext = bottomElem.nextSibling
  const bottomParent = bottomElem.parentNode
  const topNext = topElem.nextSibling
  const topParent = topElem.parentNode

  batchCmd.addSubCommand(new RemoveElementCommand(bottomElem, bottomNext, bottomParent))
  batchCmd.addSubCommand(new RemoveElementCommand(topElem, topNext, topParent))

  bottomElem.remove()
  topElem.remove()

  canvas.clearSelection()
  canvas.addCommandToHistory(batchCmd)
  canvas.selectOnly(newPaths, true)
}

/**
 * @function module:boolean-ops.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {void}
 */
export const init = canvas => {
  const svgCanvas = canvas
  svgCanvas.booleanUnion = () => performBooleanOp('union', svgCanvas)
  svgCanvas.booleanIntersect = () => performBooleanOp('intersect', svgCanvas)
  svgCanvas.booleanSubtract = () => performBooleanOp('subtract', svgCanvas)
  svgCanvas.booleanExclude = () => performBooleanOp('exclude', svgCanvas)
  svgCanvas.booleanDivide = () => performBooleanOp('divide', svgCanvas)
}
