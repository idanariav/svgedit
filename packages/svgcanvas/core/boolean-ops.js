/**
 * Boolean path operations: union, intersect, subtract, exclude, divide.
 * Requires exactly 2 selected shapes; a shape may be a `<g>`/`<a>` group, in
 * which case its (recursive) leaf shapes are merged into a single compound
 * path for the operation. Most operations produce a single merged `<path>`;
 * `divide` splits the bottom shape into multiple `<path>` pieces. Undo/redo
 * is fully supported via the history BatchCommand system.
 *
 * @module boolean-ops
 * @license MIT
 */

import { getMatrixScale, getOwnTransformScale, getPaperScope, getStyleAttrs, scaleStrokeWidth, svgToPaper, toAbsolutePathData } from './paper-utils.js'
import { getTransformList, transformListToTransform, matrixMultiply, isIdentity } from './math.js'
import { warn } from '../common/logger.js'

// Element types that cannot be converted to a path (mirrors the check in
// svgToPaper) — used when walking into a group to find its leaf shapes.
const NON_PATH_TAGS = new Set(['text', 'tspan', 'image', 'use', 'symbol', 'defs'])

// Container tags whose children are merged into a single compound path
// instead of being treated as a leaf shape (groups and, per svgedit
// convention, hyperlink wrappers).
const CONTAINER_TAGS = new Set(['g', 'a'])

/**
 * Recursively collect the leaf (path-convertible) shapes inside a `<g>`/`<a>`
 * container. Returns `[elem]` unchanged if it isn't a container.
 * @param {Element} elem
 * @returns {Element[]}
 */
export const collectLeaves = elem => {
  if (!CONTAINER_TAGS.has(elem.tagName)) return [elem]
  const leaves = []
  for (const child of elem.children) {
    if (child.tagName === 'title') continue
    if (CONTAINER_TAGS.has(child.tagName)) {
      leaves.push(...collectLeaves(child))
    } else if (NON_PATH_TAGS.has(child.tagName)) {
      warn(`Boolean ops: cannot convert <${child.tagName}> to path — skipped`, null, 'boolean-ops')
    } else {
      leaves.push(child)
    }
  }
  return leaves
}

/**
 * Compose the transform of every `<g>`/`<a>` ancestor of `elem`, stopping
 * (exclusive) at `stopElem`. Mirrors `getMatrixToContent` in math.js, but
 * stops at a node reference rather than an id — the group being merged here
 * (`stopElem`) isn't necessarily the content root.
 * @param {Element} elem
 * @param {Element} stopElem
 * @returns {SVGMatrix}
 */
export const getAncestorMatrix = (elem, stopElem) => {
  let m = matrixMultiply()
  let el = elem
  while (el && el !== stopElem && el.tagName !== 'svg') {
    if ((el.tagName === 'g' || el.tagName === 'a') && el.transform?.baseVal?.numberOfItems) {
      m = matrixMultiply(transformListToTransform(getTransformList(el)).matrix, m)
    }
    el = el.parentNode
  }
  return m
}

/**
 * Pick the element whose style attributes should be inherited by the boolean
 * op's result — for a group, its bottom-most (first) leaf shape, matching
 * what's visually underneath.
 * @param {Element} elem
 * @returns {Element}
 */
export const getStyleSourceElem = elem => {
  if (!CONTAINER_TAGS.has(elem.tagName)) return elem
  const leaves = collectLeaves(elem)
  return leaves[0] || elem
}

/**
 * Scale factor to correct `styleElem`'s stroke-width by, matching every
 * transform `getElemAsPath` bakes into the result geometry with no
 * compensating transform on the output (see `getMatrixScale`'s doc comment):
 * `styleElem`'s own transform, plus — when `elem` is a group, so `styleElem`
 * is one of its leaves — every transform between the two: the intermediate
 * ancestors and `elem`'s own transform.
 * @param {Element} styleElem - Element `getStyleAttrs` read stroke-width from.
 * @param {Element} elem - The (possibly a group) element passed to `getElemAsPath`.
 * @returns {number}
 */
export const getBakedStyleScale = (styleElem, elem) => {
  let scale = getOwnTransformScale(styleElem)
  if (CONTAINER_TAGS.has(elem.tagName)) {
    scale *= getMatrixScale(getAncestorMatrix(styleElem, elem))
    scale *= getOwnTransformScale(elem)
  }
  return scale
}

/**
 * Convert an SVG element to a paper.js Path/CompoundPath with its transform
 * applied. A `<g>`/`<a>` is flattened into a single CompoundPath merging all
 * of its (recursive) leaf shapes, each positioned in the group's own local
 * space, with the group's own transform applied last.
 * Returns null if the element cannot be converted.
 * @param {Element} elem
 * @param {paper.PaperScope} scope
 * @returns {paper.Path|paper.CompoundPath|null}
 */
const getElemAsPath = (elem, scope) => {
  if (!CONTAINER_TAGS.has(elem.tagName)) return svgToPaper(elem, scope)

  const items = collectLeaves(elem)
    .map(leaf => {
      const item = svgToPaper(leaf, scope)
      if (!item) return null
      const ancestorMatrix = getAncestorMatrix(leaf, elem)
      if (!isIdentity(ancestorMatrix)) {
        item.transform(new scope.Matrix(
          ancestorMatrix.a, ancestorMatrix.b,
          ancestorMatrix.c, ancestorMatrix.d,
          ancestorMatrix.e, ancestorMatrix.f
        ))
      }
      return item
    })
    .filter(Boolean)

  if (items.length === 0) return null

  const merged = new scope.CompoundPath({ children: items, insert: false })

  const tlist = getTransformList(elem)
  if (tlist && tlist.numberOfItems > 0) {
    const matrix = transformListToTransform(tlist).matrix
    merged.transform(new scope.Matrix(
      matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f
    ))
  }

  return merged
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
      d: toAbsolutePathData(result.pathData, canvas),
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
      'Boolean operations require path-convertible shapes. Text, images, and empty/unsupported groups are not supported.',
      null,
      'boolean-ops'
    )
    return
  }

  // Inherit style from the bottom element (its bottom-most leaf, if a group)
  const styleSourceElem = getStyleSourceElem(bottomElem)
  const styleAttrs = getStyleAttrs(styleSourceElem)
  scaleStrokeWidth(styleAttrs, getBakedStyleScale(styleSourceElem, bottomElem))

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
