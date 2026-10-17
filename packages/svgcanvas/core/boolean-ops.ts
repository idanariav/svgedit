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

import type SvgCanvas from '../svgcanvas.ts'
import { getMatrixScale, getOwnTransformScale, getPaperScope, getStyleAttrs, scaleStrokeWidth, svgToPaper, toAbsolutePathData } from './paper-utils.ts'
import { getTransformList, transformListToTransform, matrixMultiply, isIdentity } from './math.ts'
import { warn } from '../common/logger.ts'

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
 */
export const collectLeaves = (elem: Element): Element[] => {
  if (!CONTAINER_TAGS.has(elem.tagName)) return [elem]
  const leaves: Element[] = []
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
 */
export const getAncestorMatrix = (elem: Element, stopElem: Element): SVGMatrix => {
  let m = matrixMultiply()
  let el: Element | null = elem
  while (el && el !== stopElem && el.tagName !== 'svg') {
    if ((el.tagName === 'g' || el.tagName === 'a') && (el as SVGGraphicsElement).transform?.baseVal?.numberOfItems) {
      m = matrixMultiply(transformListToTransform(getTransformList(el)).matrix, m)
    }
    el = el.parentNode as Element | null
  }
  return m
}

/**
 * Pick the element whose style attributes should be inherited by the boolean
 * op's result — for a group, its bottom-most (first) leaf shape, matching
 * what's visually underneath.
 */
export const getStyleSourceElem = (elem: Element): Element => {
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
 * @param styleElem - Element `getStyleAttrs` read stroke-width from.
 * @param elem - The (possibly a group) element passed to `getElemAsPath`.
 */
export const getBakedStyleScale = (styleElem: Element, elem: Element): number => {
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
 */
const getElemAsPath = (elem: Element, scope: paper.PaperScope): paper.Path | paper.CompoundPath | null => {
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
    .filter((item): item is paper.Path | paper.CompoundPath => item !== null)

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
 * @param result - paper.js path/compound-path result
 * @param bottomElem - element whose style and DOM position are inherited
 * @param styleAttrs - pre-collected style attributes from the bottom element
 * @param newPaths - accumulator for created elements
 */
const createResultPath = (
  result: paper.PathItem, bottomElem: Element, styleAttrs: Record<string, string>, canvas: SvgCanvas,
  newPaths: Element[], batchCmd: InstanceType<SvgCanvas['history']['BatchCommand']>
): void => {
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
 */
const performBooleanOp = (type: 'union' | 'intersect' | 'subtract' | 'exclude' | 'divide', canvas: SvgCanvas): void => {
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

  const newPaths: Element[] = []

  if (type === 'divide') {
    // Split the bottom shape into pieces using the top shape as a knife.
    // paper.js divide() returns a Group of two children (subtract + intersect
    // pieces); when the shapes don't overlap it collapses to a single path.
    const divided = bottomPath.divide(topPath)
    const pieces = (divided.children ? [...divided.children] : [divided]) as paper.PathItem[]
    pieces.forEach(piece =>
      createResultPath(piece, bottomElem, styleAttrs, canvas, newPaths, batchCmd)
    )
  } else {
    let result: paper.PathItem
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

/** The boolean path operations of one canvas (`svgCanvas.booleanOps`); each acts on exactly two selected shapes. */
export interface BooleanOps {
  union (): void
  intersect (): void
  subtract (): void
  exclude (): void
  divide (): void
}

export const createBooleanOps = (svgCanvas: SvgCanvas): BooleanOps => ({
  union: () => performBooleanOp('union', svgCanvas),
  intersect: () => performBooleanOp('intersect', svgCanvas),
  subtract: () => performBooleanOp('subtract', svgCanvas),
  exclude: () => performBooleanOp('exclude', svgCanvas),
  divide: () => performBooleanOp('divide', svgCanvas)
})
