/**
 * Recalculate dimensions and transformations of SVG elements.
 * @module recalculate
 * @license MIT
 */

import { convertToNum } from './units.js'
import { getRotationAngle } from './dom-utils.js'
import { getBBox } from './bbox-utils.js'
import { BatchCommand, ChangeElementCommand } from './history.js'
import {
  isIdentity,
  matrixMultiply,
  transformPoint,
  transformListToTransform,
  hasMatrixTransform,
  getTransformList
} from './math.js'
import { mergeDeep } from '../common/util.js'

/**
 * Attribute list to translate for each simple (non-points, non-path) tag
 * recalculateDimensions handles.
 */
const TAG_RECALC_ATTRS = {
  line: ['x1', 'y1', 'x2', 'y2'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  foreignObject: ['width', 'height', 'x', 'y'],
  rect: ['width', 'height', 'x', 'y'],
  image: ['width', 'height', 'x', 'y'],
  text: ['x', 'y'],
  tspan: ['x', 'y']
}

/**
 * Translates a `points` attribute string (polyline/polygon) by tx/ty.
 * @param {string} pointsStr - The current `points` attribute value
 * @param {number} tx - The translation's x value
 * @param {number} ty - The translation's y value
 * @returns {string} The translated `points` attribute value
 */
const translatePoints = (pointsStr, tx, ty) => pointsStr
  .trim()
  .split(/\s+/)
  .map((pair) => {
    const [x, y] = pair.split(',')
    return `${Number(x) + tx},${Number(y) + ty}`
  })
  .join(' ')

/**
 * Initialize the recalculate module with the SVG canvas.
 * @function module:recalculate.init
 * @param {Object} canvas - The SVG canvas object
 * @returns {void}
 */
export const init = canvas => {
  const svgCanvas = canvas // per-instance; functions below are closed over it

/**
 * Updates a `<clipPath>` element's values based on the given translation.
 * @function module:recalculate.updateClipPath
 * @param {string} attr - The clip-path attribute value containing the clipPath's ID
 * @param {number} tx - The translation's x value
 * @param {number} ty - The translation's y value
 * @param {Element} elem - The element referencing the clipPath
 * @returns {string|undefined} The clip-path attribute used after updates.
 */
  const updateClipPath = (attr, tx, ty, elem) => {
  const clipPath = svgCanvas.getRefElem(attr)
  if (!clipPath) return undefined
  if (elem && clipPath.id) {
    const svgContent = svgCanvas.getSvgContent?.()
    if (svgContent) {
      const refSelector = `[clip-path="url(#${clipPath.id})"]`
      const users = svgContent.querySelectorAll(refSelector)
      if (users.length > 1) {
        const newClipPath = clipPath.cloneNode(true)
        newClipPath.id = svgCanvas.getNextId()
        svgCanvas.findDefs().append(newClipPath)
        elem.setAttribute('clip-path', `url(#${newClipPath.id})`)
        return updateClipPath(`url(#${newClipPath.id})`, tx, ty)
      }
    }
  }
  const path = clipPath.firstElementChild
  if (!path) return attr
  const cpXform = getTransformList(path)
  if (!cpXform) {
    const tag = (path.tagName || '').toLowerCase()
    if (tag === 'rect') {
      const x = convertToNum('x', path.getAttribute('x') || 0) + tx
      const y = convertToNum('y', path.getAttribute('y') || 0) + ty
      path.setAttribute('x', x)
      path.setAttribute('y', y)
    } else if (tag === 'circle' || tag === 'ellipse') {
      const cx = convertToNum('cx', path.getAttribute('cx') || 0) + tx
      const cy = convertToNum('cy', path.getAttribute('cy') || 0) + ty
      path.setAttribute('cx', cx)
      path.setAttribute('cy', cy)
    } else if (tag === 'line') {
      path.setAttribute('x1', convertToNum('x1', path.getAttribute('x1') || 0) + tx)
      path.setAttribute('y1', convertToNum('y1', path.getAttribute('y1') || 0) + ty)
      path.setAttribute('x2', convertToNum('x2', path.getAttribute('x2') || 0) + tx)
      path.setAttribute('y2', convertToNum('y2', path.getAttribute('y2') || 0) + ty)
    } else if (tag === 'polyline' || tag === 'polygon') {
      const points = (path.getAttribute('points') || '').trim()
      if (points) {
        path.setAttribute('points', translatePoints(points, tx, ty))
      }
    } else {
      path.setAttribute('transform', `translate(${tx},${ty})`)
    }
    return attr
  }
  if (cpXform.numberOfItems) {
    const translate = svgCanvas.getSvgRoot().createSVGMatrix()
    translate.e = tx
    translate.f = ty
    const combined = matrixMultiply(transformListToTransform(cpXform).matrix, translate)
    const merged = svgCanvas.getSvgRoot().createSVGTransform()
    merged.setMatrix(combined)
    cpXform.clear()
    cpXform.appendItem(merged)
    return attr
  }
  const tag = (path.tagName || '').toLowerCase()
  if ((tag === 'polyline' || tag === 'polygon') && !path.points?.numberOfItems) {
    const points = (path.getAttribute('points') || '').trim()
    if (points) {
      path.setAttribute('points', translatePoints(points, tx, ty))
    }
    return
  }
  const newTranslate = svgCanvas.getSvgRoot().createSVGTransform()
  newTranslate.setTranslate(tx, ty)

  cpXform.appendItem(newTranslate)
  recalculateDimensions(path)
  return attr
}

/**
 * Recalculates the dimensions and transformations of a selected element.
 * @function module:recalculate.recalculateDimensions
 * @param {Element} selected - The DOM element to recalculate
 * @returns {Command|null} Undo command object with the resulting change, or null if no change
 */
  const recalculateDimensions = selected => {
  if (!selected) return null

  // Don't recalculate dimensions for groups - this would push their transforms down to children
  // Groups should maintain their transform attribute on the group element itself
  if (selected.tagName === 'g' || selected.tagName === 'a') {
    return null
  }

  if (
    selected.getAttribute?.('clip-path') ||
    selected.getAttribute?.('mask') ||
    selected.querySelector?.('[clip-path], [mask]')
  ) {
    // Keep transforms when a clip-path/mask is present rather than baking the
    // move/resize into x/y/width/height. The clip/mask silhouette in <defs>
    // is static (drawn in the parent's coordinate system); a `transform` on
    // the referencing element carries the clip along with it rigidly, but
    // baking into geometry leaves the silhouette behind — the element then
    // renders entirely outside its own (now stale) clip window and
    // disappears, while still being selectable since selection uses the
    // element's own geometry, not the clipped paint region.
    return null
  }
  const svgroot = svgCanvas.getSvgRoot()
  const dataStorage = svgCanvas.getDataStorage()
  const tlist = getTransformList(selected)

  // Remove any unnecessary transforms (identity matrices, zero-degree rotations)
  if (tlist?.numberOfItems > 0) {
    let k = tlist.numberOfItems
    const noi = k
    while (k--) {
      const xform = tlist.getItem(k)
      if (xform.type === SVGTransform.SVG_TRANSFORM_MATRIX) {
        if (isIdentity(xform.matrix)) {
          if (noi === 1) {
            // Remove the 'transform' attribute if only identity matrix remains
            selected.removeAttribute('transform')
            return null
          }
          tlist.removeItem(k)
        }
      } else if (
        xform.type === SVGTransform.SVG_TRANSFORM_ROTATE &&
        xform.angle === 0
      ) {
        tlist.removeItem(k) // Remove zero-degree rotations
      } else if (
        xform.type === SVGTransform.SVG_TRANSFORM_TRANSLATE &&
        xform.matrix.e === 0 &&
        xform.matrix.f === 0
      ) {
        tlist.removeItem(k) // Remove zero translations
      }
    }

    // End here if all it has is a rotation
    if (tlist.numberOfItems === 1 && getRotationAngle(selected)) {
      return null
    }
  }

  // If this element had no transforms, we are done
  if (!tlist || tlist.numberOfItems === 0) {
    selected.removeAttribute('transform')
    return null
  }

  // Avoid remapping transforms on <use> to preserve referenced positioning/rotation
  if (selected.tagName === 'use') {
    return null
  }

  // Set up undo command
  const batchCmd = new BatchCommand('Transform')

  // Handle special cases for specific elements
  switch (selected.tagName) {
    // Ignore these elements, as they can absorb the [M] transformation
    case 'line':
    case 'polyline':
    case 'polygon':
    case 'path':
      break
    default:
      // A matrix combined with a rotation is left as-is (rotation must stay a
      // separate transform; see the group/non-group rotation handling below).
      // A lone matrix (e.g. the consolidated drag-move transform mouseUpEvent
      // builds from the temporary drag translate) falls through to the
      // matrix-operation branch below so it gets baked into geometry.
      if (
        tlist.numberOfItems === 2 &&
        tlist.getItem(0).type === SVGTransform.SVG_TRANSFORM_MATRIX &&
        tlist.getItem(1).type === SVGTransform.SVG_TRANSFORM_ROTATE
      ) {
        return null
      }
  }

  // Grouped SVG element (special handling for 'gsvg')
  const gsvg = dataStorage.has(selected, 'gsvg')
    ? dataStorage.get(selected, 'gsvg')
    : undefined

  // Store initial values affected by reducing the transform list
  let changes = {}
  let initial = null
  let attrs = []

  // Determine which attributes to adjust based on element type
  if (selected.tagName === 'polygon' || selected.tagName === 'polyline') {
    initial = {}
    initial.points = selected.getAttribute('points')
    const list = selected.points
    const len = list.numberOfItems
    changes.points = new Array(len)
    for (let i = 0; i < len; ++i) {
      const pt = list.getItem(i)
      changes.points[i] = { x: pt.x, y: pt.y }
    }
  } else if (selected.tagName === 'path') {
    initial = {}
    initial.d = selected.getAttribute('d')
    changes.d = selected.getAttribute('d')
  } else if (TAG_RECALC_ATTRS[selected.tagName]) {
    attrs = TAG_RECALC_ATTRS[selected.tagName]
  }

  // Collect initial attribute values
  if (attrs.length) {
    attrs.forEach(attr => {
      changes[attr] = convertToNum(attr, selected.getAttribute(attr))
    })
  } else if (gsvg) {
    // Special case for GSVG elements
    changes = {
      x: Number(gsvg.getAttribute('x')) || 0,
      y: Number(gsvg.getAttribute('y')) || 0
    }
  }

  // If initial values were not set for polygon/polyline/path, create a copy
  if (!initial) {
    initial = mergeDeep({}, changes)
    for (const [attr, val] of Object.entries(initial)) {
      initial[attr] = convertToNum(attr, val)
    }
  }
  // Save the start transform value
  initial.transform = svgCanvas.getStartTransform() || ''

  let oldcenter, newcenter

  // Non-group elements

  // Get the bounding box of the element
  const box = getBBox(selected)

  // Handle elements without a bounding box (e.g., <defs>, <metadata>)
  if (!box && selected.tagName !== 'path') return null

  let m // Transformation matrix

  // Adjust for elements with x and y attributes
  let x = 0
  let y = 0
  if (['use', 'image', 'text', 'tspan'].includes(selected.tagName)) {
    x = convertToNum('x', selected.getAttribute('x') || '0')
    y = convertToNum('y', selected.getAttribute('y') || '0')
  }

  // Handle rotation transformations
  const angle = getRotationAngle(selected)
  if (angle) {
    if (selected.localName === 'image') {
      // Use the center of the image as the rotation center
      const xAttr = convertToNum('x', selected.getAttribute('x') || '0')
      const yAttr = convertToNum('y', selected.getAttribute('y') || '0')
      const width = convertToNum('width', selected.getAttribute('width') || '0')
      const height = convertToNum('height', selected.getAttribute('height') || '0')
      const cx = xAttr + width / 2
      const cy = yAttr + height / 2
      oldcenter = { x: cx, y: cy }
      const transform = transformListToTransform(tlist).matrix
      newcenter = transformPoint(cx, cy, transform)
    } else if (selected.localName === 'text') {
      // Use the center of the bounding box as the rotation center for text
      const cx = box.x + box.width / 2
      const cy = box.y + box.height / 2
      oldcenter = { x: cx, y: cy }
      newcenter = transformPoint(cx, cy, transformListToTransform(tlist).matrix)
    } else {
      // Include x and y in the rotation center calculation for other elements
      oldcenter = {
        x: box.x + box.width / 2 + x,
        y: box.y + box.height / 2 + y
      }
      newcenter = transformPoint(
        box.x + box.width / 2 + x,
        box.y + box.height / 2 + y,
        transformListToTransform(tlist).matrix
      )
    }

    // Remove the rotation transform from the list
    for (let i = 0; i < tlist.numberOfItems; ++i) {
      const xform = tlist.getItem(i)
      if (xform.type === SVGTransform.SVG_TRANSFORM_ROTATE) {
        tlist.removeItem(i)
        break
      }
    }
  }

  const N = tlist.numberOfItems

  // Handle specific transformation cases
  if (
    N >= 3 &&
    tlist.getItem(N - 3).type === SVGTransform.SVG_TRANSFORM_TRANSLATE &&
    tlist.getItem(N - 2).type === SVGTransform.SVG_TRANSFORM_SCALE &&
    tlist.getItem(N - 1).type === SVGTransform.SVG_TRANSFORM_TRANSLATE
  ) {
    // Scaling operation
    m = transformListToTransform(tlist, N - 3, N - 1).matrix
    tlist.removeItem(N - 1)
    tlist.removeItem(N - 2)
    tlist.removeItem(N - 3)

    // Handle remapping for scaling
    if (selected.tagName === 'use') {
      // For '<use>' elements, adjust the transform attribute directly
      const mExisting = transformListToTransform(
        getTransformList(selected)
      ).matrix
      const mNew = matrixMultiply(mExisting, m)

      // Clear the transform list and set the new transform
      tlist.clear()
      const newTransform = svgroot.createSVGTransform()
      newTransform.setMatrix(mNew)
      tlist.appendItem(newTransform)
    } else {
      // Remap other elements normally
      svgCanvas.remapElement(selected, changes, m)
    }

    // Restore rotation if needed
    if (angle) {
      const matrix = transformListToTransform(tlist).matrix
      const oldRotation = svgroot.createSVGTransform()
      oldRotation.setRotate(angle, oldcenter.x, oldcenter.y)
      const oldRotMatrix = oldRotation.matrix
      const newRotation = svgroot.createSVGTransform()
      newRotation.setRotate(angle, newcenter.x, newcenter.y)
      const newRotInvMatrix = newRotation.matrix.inverse()
      const matrixInv = matrix.inverse()
      const extraTransform = matrixMultiply(
        matrixInv,
        newRotInvMatrix,
        oldRotMatrix,
        matrix
      )

      // Remap the element with the extra transformation
      svgCanvas.remapElement(selected, changes, extraTransform)

      if (tlist.numberOfItems) {
        tlist.insertItemBefore(newRotation, 0)
      } else {
        tlist.appendItem(newRotation)
      }
    }
  } else if (
    (N === 1 ||
      (N > 1 &&
        tlist.getItem(1).type !== SVGTransform.SVG_TRANSFORM_SCALE)) &&
    tlist.getItem(0).type === SVGTransform.SVG_TRANSFORM_TRANSLATE
  ) {
    // Translation operation
    const oldTranslate = tlist.getItem(0).matrix
    const remainingTransforms = transformListToTransform(tlist, 1).matrix
    const remainingTransformsInv = remainingTransforms.inverse()
    m = matrixMultiply(
      remainingTransformsInv,
      oldTranslate,
      remainingTransforms
    )
    tlist.removeItem(0)

    // Handle remapping for translation
    if (selected.tagName === 'use') {
      // For '<use>' elements, adjust the transform attribute directly
      const mExisting = transformListToTransform(
        getTransformList(selected)
      ).matrix
      const mNew = matrixMultiply(mExisting, m)

      // Clear the transform list and set the new transform
      tlist.clear()
      const newTransform = svgroot.createSVGTransform()
      newTransform.setMatrix(mNew)
      tlist.appendItem(newTransform)
    } else {
      // Remap other elements normally
      svgCanvas.remapElement(selected, changes, m)
    }

    // Restore rotation if needed
    if (angle) {
      if (!hasMatrixTransform(tlist)) {
        newcenter = {
          x: oldcenter.x + m.e,
          y: oldcenter.y + m.f
        }
      }
      const newRot = svgroot.createSVGTransform()
      newRot.setRotate(angle, newcenter.x, newcenter.y)
      if (tlist.numberOfItems) {
        tlist.insertItemBefore(newRot, 0)
      } else {
        tlist.appendItem(newRot)
      }
    }
  } else if (
    N === 1 &&
    tlist.getItem(0).type === SVGTransform.SVG_TRANSFORM_MATRIX &&
    !angle
  ) {
    // Matrix operation
    m = transformListToTransform(tlist).matrix
    tlist.clear()

    // Handle remapping for matrix operation
    if (selected.tagName === 'use') {
      // For '<use>' elements, adjust the transform attribute directly
      const mExisting = transformListToTransform(
        getTransformList(selected)
      ).matrix
      const mNew = matrixMultiply(mExisting, m)

      // Clear the transform list and set the new transform
      tlist.clear()
      const newTransform = svgroot.createSVGTransform()
      newTransform.setMatrix(mNew)
      tlist.appendItem(newTransform)
    } else {
      // Remap other elements normally
      svgCanvas.remapElement(selected, changes, m)
    }
  } else {
    // Rotation or other transformations
    if (angle) {
      const newRot = svgroot.createSVGTransform()
      newRot.setRotate(angle, newcenter.x, newcenter.y)

      if (tlist.numberOfItems) {
        tlist.insertItemBefore(newRot, 0)
      } else {
        tlist.appendItem(newRot)
      }
    }
    if (tlist.numberOfItems === 0) {
      selected.removeAttribute('transform')
    }
    return null
  }

  // Remove the 'transform' attribute if no transforms remain
  if (tlist.numberOfItems === 0) {
    selected.removeAttribute('transform')
  }

  // Record the changes for undo functionality
  batchCmd.addSubCommand(new ChangeElementCommand(selected, initial))

  return batchCmd
  }

  svgCanvas.updateClipPath = updateClipPath
  svgCanvas.recalculateDimensions = recalculateDimensions
}
