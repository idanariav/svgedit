// @ts-check
/**
 * Split Into Grid: replace a shape with `rows × cols` rectangles that fill its bounding box, in the shape's own
 * coordinates (so a rotated rect keeps its rotation) and with its look. The cells are grouped so they move as one.
 *
 * Inspired by VectorCraft (https://github.com/storytold/vectorcraft), `crates/pathops/src/edit.rs`
 * `split_into_grid` (MIT OR Apache-2.0); row-major, top-left first.
 * @module split-grid
 * @license MIT
 */

import { NS } from './namespaces.ts'
import { getBBox } from './bbox-utils.ts'

/** Most cells one split makes (every cell is a DOM element and the undo snapshot walks them all). */
export const MAX_CELLS = 2500

/**
 * @typedef {object} Box
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * The cells of a grid over `box`, row-major from the top left.
 * @param {Box} box
 * @param {number} rows
 * @param {number} cols
 * @param {number} [gutter] space between cells
 * @returns {Box[]|null} `null` when the arguments cannot make cells (a gutter that swallows the box, 0 rows, …)
 */
export const gridCells = (box, rows, cols, gutter = 0) => {
  if (!(Number.isInteger(rows) && Number.isInteger(cols) && rows >= 1 && cols >= 1 && rows * cols <= MAX_CELLS)) return null
  const gap = Math.max(0, Number(gutter) || 0)
  const width = (box.width - (cols - 1) * gap) / cols
  const height = (box.height - (rows - 1) * gap) / rows
  if (!(width > 0 && height > 0)) return null
  const cells = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ x: box.x + c * (width + gap), y: box.y + r * (height + gap), width, height })
    }
  }
  return cells
}

/** What a cell must not inherit: the source shape's geometry, identity and live-feature state. */
const SKIP_ATTRS = new Set([
  'id', 'transform', 'x', 'y', 'width', 'height', 'd', 'points', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2',
  'marker-start', 'marker-mid', 'marker-end'
])
const SHAPES = ['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path']

/**
 * @param {Element|null|undefined} elem
 * @returns {boolean} Whether `elem` is a plain shape whose bounding box can be split
 */
export const canSplitIntoGrid = (elem) => !!elem && SHAPES.includes(elem.localName) && !elem.hasAttribute('data-frame')

/**
 * Replace the selected shape with a group of `rows × cols` rects. One undo step.
 * @function module:split-grid.SvgCanvas#splitIntoGrid
 * @param {Pick<import("../svgcanvas.js").default, "getSelectedElements" | "transact" | "getNextId" | "selectOnly">} svgCanvas
 * @param {{rows: number, cols: number, gutter?: number}} params
 * @param {Element} [elem] defaults to the single selected element
 * @returns {Element|null} the new group (selected), or null when nothing was done
 */
export const splitIntoGrid = (svgCanvas, params, elem) => {
  const source = elem ?? (svgCanvas.getSelectedElements().filter(Boolean).length === 1 ? svgCanvas.getSelectedElements()[0] : null)
  if (!source || !canSplitIntoGrid(source) || !source.parentNode) return null
  const isRect = source.localName === 'rect'
  const num = (/** @type {string} */ name) => parseFloat(source.getAttribute(name) ?? '') || 0
  // In the shape's own coordinates: a rect's attributes, else the geometry's box (its transform is kept on the group).
  const box = isRect ? { x: num('x'), y: num('y'), width: num('width'), height: num('height') } : getBBox(source)
  const cells = box ? gridCells(box, params.rows, params.cols, params.gutter ?? 0) : null
  if (!cells) return null

  const group = document.createElementNS(NS.SVG, 'g')
  svgCanvas.transact('Split into grid', () => {
    group.setAttribute('id', svgCanvas.getNextId())
    const transform = source.getAttribute('transform')
    if (transform) group.setAttribute('transform', transform)
    for (const cell of cells) {
      const rect = document.createElementNS(NS.SVG, 'rect')
      for (const attr of Array.from(source.attributes)) {
        if (SKIP_ATTRS.has(attr.name) || attr.name.startsWith('se:') || attr.name.startsWith('data-')) continue
        rect.setAttributeNS(attr.namespaceURI, attr.name, attr.value)
      }
      if (isRect) {
        for (const radius of ['rx', 'ry']) {
          const value = source.getAttribute(radius)
          if (value) rect.setAttribute(radius, value)
        }
      }
      rect.setAttribute('id', svgCanvas.getNextId())
      rect.setAttribute('x', String(cell.x))
      rect.setAttribute('y', String(cell.y))
      rect.setAttribute('width', String(cell.width))
      rect.setAttribute('height', String(cell.height))
      group.append(rect)
    }
    source.before(group)
    source.remove()
  })
  svgCanvas.selectOnly([group], true)
  return group
}
