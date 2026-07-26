/**
 * Bounding-box computation utilities.
 * @module bbox-utils
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

import { shortFloat } from './units.js'
import {
  hasMatrixTransform,
  transformListToTransform,
  transformBox,
  getTransformList,
  isIdentity
} from './math.js'
import { getClosest } from '../common/util.js'
import { getRotationAngleFromTransformList } from './dom-utils.js'
import { getExtraAttributesForConvertToPath, getPathDFromElement } from './path-utils.js'

// Much faster than running getBBox() every time
const visElems =
  'a,circle,ellipse,foreignObject,g,image,line,path,polygon,polyline,rect,svg,text,tspan,use,clipPath'
const visElemsArr = visElems.split(',')

/**
 * Attaches the canvas-state-dependent helpers (`getVisibleElements`'s
 * document-default branch, `getStrokedBBoxDefaultVisible`) directly onto the
 * given instance, closed over it — per-instance, like every other
 * `core/*.js` module's `init(canvas)`. `getBBox` stays a bare, pure
 * (elem-required) export; the instance also gets a selection-fallback
 * wrapper for it, matching `dom-utils.js`'s `getRotationAngle` treatment.
 * @function module:bbox-utils.init
 * @param {module:utilities.EditorContext} canvas
 * @returns {void}
 */
export const init = canvas => {
  const svgCanvas = canvas // per-instance; functions below are closed over it

  /**
   * Get all elements that have a BBox (excludes `<defs>`, `<title>`, etc).
   * Note that 0-opacity, off-screen etc elements are still considered "visible"
   * for this function.
   * @function module:bbox-utils.EditorContext#getVisibleElements
   * @param {Element} [parentElement] - The parent DOM element to search within; defaults to the first visible top-level content element
   * @returns {Element[]} All "visible" elements.
   */
  const getVisibleElements = parentElement => {
    if (!parentElement) {
      const svgContent = svgCanvas.getSvgContent()
      for (let i = 0; i < svgContent.children.length; i++) {
        if (svgContent.children[i].getBBox) {
          const bbox = svgContent.children[i].getBBox()
          if (
            bbox.width !== 0 &&
            bbox.height !== 0 &&
            bbox.width !== 0 &&
            bbox.height !== 0
          ) {
            parentElement = svgContent.children[i]
            break
          }
        }
      }
    }

    const contentElems = []
    if (parentElement) {
      const children = parentElement.children
      // eslint-disable-next-line array-callback-return
      Array.from(children, elem => {
        if (elem.getBBox) {
          contentElems.push(elem)
        }
      })
    }
    return contentElems.reverse()
  }

  /**
   * Get the bounding box for one or more stroked and/or transformed elements.
   * @function module:bbox-utils.EditorContext#getStrokedBBoxDefaultVisible
   * @param {Element[]} elems - Array with DOM elements to check
   * @returns {module:bbox-utils.BBoxObject} A single bounding box object
   */
  const getStrokedBBoxDefaultVisible = elems => {
    if (!elems) {
      elems = getVisibleElements()
    }
    return getStrokedBBox(
      elems,
      svgCanvas.addSVGElementsFromJson,
      svgCanvas.pathActions
    )
  }

  canvas.getVisibleElements = getVisibleElements
  canvas.getStrokedBBoxDefaultVisible = getStrokedBBoxDefaultVisible
  // Public API alias — external hosts/extensions call svgCanvas.getStrokedBBox()
  canvas.getStrokedBBox = getStrokedBBoxDefaultVisible
  // getBBox stays a bare, pure (elem-required) export below — every call site
  // already passes an elem — but the public per-instance API keeps the
  // "default to current selection" convenience, correctly scoped now.
  canvas.getBBox = elem => getBBox(elem ?? svgCanvas.getSelectedElements()[0])
}

/**
 * @typedef {PlainObject} module:bbox-utils.BBoxObject (like `DOMRect`)
 * @property {Float} x
 * @property {Float} y
 * @property {Float} width
 * @property {Float} height
 */

/**
 * Converts a `SVGRect` into an object.
 * @function module:bbox-utils.bboxToObj
 * @param {SVGRect} bbox - a SVGRect
 * @returns {module:bbox-utils.BBoxObject} An object with properties names x, y, width, height.
 */
export const bboxToObj = ({ x, y, width, height }) => {
  return { x, y, width, height }
}

// TODO(codedread): Consider moving the next to functions to bbox.js

/**
 * Get correct BBox for a path in Webkit.
 * Converted from code found [here]{@link http://blog.hackers-cafe.net/2009/06/how-to-calculate-bezier-curves-bounding.html}.
 * @function module:bbox-utils.getPathBBox
 * @param {SVGPathElement} path - The path DOM element to get the BBox for
 * @returns {module:bbox-utils.BBoxObject} A BBox-like object
 */
export const getPathBBox = (path) => {
  const seglist = path.pathSegList
  const totalSegments = seglist.numberOfItems

  const bounds = [[], []]
  const start = seglist.getItem(0)
  let P0 = [start.x, start.y]

  const getCalc = (j, P1, P2, P3) => (t) => {
    const oneMinusT = 1 - t
    return (
      oneMinusT ** 3 * P0[j] +
      3 * oneMinusT ** 2 * t * P1[j] +
      3 * oneMinusT * t ** 2 * P2[j] +
      t ** 3 * P3[j]
    )
  }

  for (let i = 0; i < totalSegments; i++) {
    const seg = seglist.getItem(i)

    if (seg.x === undefined) continue

    // Add actual points to limits
    bounds[0].push(P0[0])
    bounds[1].push(P0[1])

    if (seg.x1) {
      const P1 = [seg.x1, seg.y1]
      const P2 = [seg.x2, seg.y2]
      const P3 = [seg.x, seg.y]

      for (let j = 0; j < 2; j++) {
        const calc = getCalc(j, P1, P2, P3)

        const b = 6 * P0[j] - 12 * P1[j] + 6 * P2[j]
        const a = -3 * P0[j] + 9 * P1[j] - 9 * P2[j] + 3 * P3[j]
        const c = 3 * P1[j] - 3 * P0[j]

        if (a === 0) {
          if (b === 0) {
            continue
          }
          const t = -c / b
          if (t > 0 && t < 1) {
            bounds[j].push(calc(t))
          }
          continue
        }
        const b2ac = b ** 2 - 4 * c * a
        if (b2ac < 0) {
          continue
        }
        const t1 = (-b + Math.sqrt(b2ac)) / (2 * a)
        if (t1 > 0 && t1 < 1) {
          bounds[j].push(calc(t1))
        }
        const t2 = (-b - Math.sqrt(b2ac)) / (2 * a)
        if (t2 > 0 && t2 < 1) {
          bounds[j].push(calc(t2))
        }
      }
      P0 = P3
    } else {
      bounds[0].push(seg.x)
      bounds[1].push(seg.y)
    }
  }

  const x = Math.min(...bounds[0])
  const y = Math.min(...bounds[1])

  return {
    x,
    y,
    width: Math.max(...bounds[0]) - x,
    height: Math.max(...bounds[1]) - y
  }
}

/**
 * Get the given element's bounding box object, convert it to be more usable
 * when necessary. Pure — requires an elem (every call site already passes
 * one); the "default to current selection" convenience lives on the
 * per-instance `canvas.getBBox` wrapper attached by {@link module:bbox-utils.init}
 * instead, so it resolves against the right editor instance rather than
 * shared module state.
 * @function module:bbox-utils.getBBox
 * @param {Element} elem - DOM element to get the BBox for
 * @returns {module:bbox-utils.BBoxObject|null} Bounding box object
 */
export const getBBox = (elem) => {
  const selected = elem
  if (elem.nodeType !== 1) return null

  const elname = selected.nodeName

  let ret = null
  switch (elname) {
    case 'text':
      if (selected.textContent === '') {
        selected.textContent = 'a' // Some character needed for the selector to use.
        ret = selected.getBBox()
        selected.textContent = ''
      } else if (selected.getBBox) {
        ret = selected.getBBox()
      }
      break
    case 'path':
    case 'g':
    case 'a':
      if (selected.getBBox) {
        ret = selected.getBBox()
      }
      break
    default:
      if (elname === 'use') {
        ret = selected.getBBox() // , true);
      } else if (visElemsArr.includes(elname)) {
        if (selected) {
          try {
            ret = selected.getBBox()
          } catch (err) {
            // tspan (and textPath apparently) have no `getBBox` in Firefox: https://bugzilla.mozilla.org/show_bug.cgi?id=937268
            // Re: Chrome returning bbox for containing text element, see: https://bugs.chromium.org/p/chromium/issues/detail?id=349835
            const extent = selected.getExtentOfChar(0) // pos+dimensions of the first glyph
            const width = selected.getComputedTextLength() // width of the tspan
            ret = {
              x: extent.x,
              y: extent.y,
              width,
              height: extent.height
            }
          }
        } else {
          // Check if element is child of a foreignObject
          const fo = getClosest(selected.parentNode, 'foreignObject')
          if (fo.length && fo[0].getBBox) {
            ret = fo[0].getBBox()
          }
        }
      }
  }
  if (ret) {
    // JSDOM lacks SVG geometry; fall back to simple attribute-based bbox when native values are empty.
    if (ret.width === 0 && ret.height === 0) {
      const tag = elname.toLowerCase()
      const num = (name, fallback = 0) =>
        Number.parseFloat(selected.getAttribute(name) ?? fallback)
      const fromAttrs = (() => {
        switch (tag) {
          case 'path': {
            const d = selected.getAttribute('d') || ''
            const nums = (d.match(/-?\d*\.?\d+/g) || []).map(Number).filter(n => !Number.isNaN(n))
            if (nums.length >= 2) {
              const xs = nums.filter((_, i) => i % 2 === 0)
              const ys = nums.filter((_, i) => i % 2 === 1)
              return {
                x: Math.min(...xs),
                y: Math.min(...ys),
                width: Math.max(...xs) - Math.min(...xs),
                height: Math.max(...ys) - Math.min(...ys)
              }
            }
            break
          }
          case 'rect':
            return { x: num('x'), y: num('y'), width: num('width'), height: num('height') }
          case 'line': {
            const x1 = num('x1'); const x2 = num('x2'); const y1 = num('y1'); const y2 = num('y2')
            return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }
          }
          case 'g': {
            const boxes = Array.from(selected.children || [])
              .map(child => getBBox(child))
              .filter(Boolean)
            if (boxes.length) {
              const minX = Math.min(...boxes.map(b => b.x))
              const minY = Math.min(...boxes.map(b => b.y))
              const maxX = Math.max(...boxes.map(b => b.x + b.width))
              const maxY = Math.max(...boxes.map(b => b.y + b.height))
              return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
            }
            break
          }
          default:
            break
        }
      })()
      if (fromAttrs) {
        ret = fromAttrs
      }
    }
    ret = bboxToObj(ret)
  }

  // get the bounding box from the DOM (which is in that element's coordinate system)
  return ret
}

/**
 * Get the BBox of an element-as-path.
 * @function module:bbox-utils.getBBoxOfElementAsPath
 * @param {Element} elem - The DOM element to be probed
 * @param {module:utilities.EditorContext#addSVGElementsFromJson} addSVGElementsFromJson - Function to add the path element to the current layer. See canvas.addSVGElementsFromJson
 * @param {module:path.pathActions} pathActions - If a transform exists, `pathActions.resetOrientation()` is used. See: canvas.pathActions.
 * @returns {DOMRect|false} The resulting path's bounding box object.
 */
export const getBBoxOfElementAsPath = (
  elem,
  addSVGElementsFromJson,
  pathActions
) => {
  const path = addSVGElementsFromJson({
    element: 'path',
    attr: getExtraAttributesForConvertToPath(elem)
  })

  const eltrans = elem.getAttribute('transform')
  if (eltrans) {
    path.setAttribute('transform', eltrans)
  }

  const { parentNode } = elem
  elem.nextSibling ? elem.before(path) : parentNode.append(path)

  const d = getPathDFromElement(elem)
  if (d) {
    path.setAttribute('d', d)
  } else {
    path.remove()
  }

  // Get the correct BBox of the new path, then discard it
  pathActions.resetOrientation(path)
  let bb = false
  try {
    bb = path.getBBox()
  } catch (e) {
    // Firefox fails
  }
  if (bb && bb.width === 0 && bb.height === 0) {
    const dAttr = path.getAttribute('d') || ''
    const nums = (dAttr.match(/-?\d*\.?\d+/g) || []).map(Number).filter(n => !Number.isNaN(n))
    if (nums.length >= 2) {
      const xs = nums.filter((_, i) => i % 2 === 0)
      const ys = nums.filter((_, i) => i % 2 === 1)
      bb = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys)
      }
    }
  }
  path.remove()
  return bb
}

/**
 * Can the bbox be optimized over the native getBBox? The optimized bbox is the same as the native getBBox when
 * the rotation angle is a multiple of 90 degrees and there are no complex transforms.
 * Getting an optimized bbox can be dramatically slower, so we want to make sure it's worth it.
 *
 * The best example for this is a circle rotate 45 degrees. The circle doesn't get wider or taller when rotated
 * about it's center.
 *
 * The standard, unoptimized technique gets the native bbox of the circle, rotates the box 45 degrees, uses
 * that width and height, and applies any transforms to get the final bbox. This means the calculated bbox
 * is much wider than the original circle. If the angle had been 0, 90, 180, etc. both techniques render the
 * same bbox.
 *
 * The optimization is not needed if the rotation is a multiple 90 degrees. The default technique is to call
 * getBBox then apply the angle and any transforms.
 *
 * @param {Float} angle - The rotation angle in degrees
 * @param {boolean} hasAMatrixTransform - True if there is a matrix transform
 * @returns {boolean} True if the bbox can be optimized.
 */
const bBoxCanBeOptimizedOverNativeGetBBox = (angle, hasAMatrixTransform) => {
  const angleModulo90 = angle % 90
  const closeTo90 = angleModulo90 < -89.99 || angleModulo90 > 89.99
  const closeTo0 = angleModulo90 > -0.001 && angleModulo90 < 0.001
  return hasAMatrixTransform || !(closeTo0 || closeTo90)
}

/**
 * Get bounding box that includes any transforms.
 * @function module:bbox-utils.getBBoxWithTransform
 * @param {Element} elem - The DOM element to be converted
 * @param {module:utilities.EditorContext#addSVGElementsFromJson} addSVGElementsFromJson - Function to add the path element to the current layer. See canvas.addSVGElementsFromJson
 * @param {module:path.pathActions} pathActions - If a transform exists, pathActions.resetOrientation() is used. See: canvas.pathActions.
 * @returns {module:bbox-utils.BBoxObject|module:math.TransformedBox|DOMRect|null} A single bounding box object
 */
export const getBBoxWithTransform = (
  elem,
  addSVGElementsFromJson,
  pathActions
) => {
  // TODO: Fix issue with rotated groups. Currently they work
  // fine in FF, but not in other browsers (same problem mentioned
  // in Issue 339 comment #2).

  let bb = getBBox(elem)
  if (!bb) return null

  const transformAttr = elem.getAttribute?.('transform') ?? ''
  const hasMatrixAttr = transformAttr.includes('matrix(')
  if (transformAttr.includes('rotate(') && !hasMatrixAttr) {
    const nums = transformAttr.match(/-?\d*\.?\d+/g)?.map(Number) || []
    const [angle = 0, cx = 0, cy = 0] = nums
    const rad = angle * Math.PI / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const tag = elem.tagName?.toLowerCase()
    let points = []
    if (tag === 'path') {
      const d = elem.getAttribute('d') || ''
      const coords = (d.match(/-?\d*\.?\d+/g) || []).map(Number).filter(n => !Number.isNaN(n))
      for (let i = 0; i < coords.length; i += 2) {
        points.push({ x: coords[i], y: coords[i + 1] ?? 0 })
      }
    } else if (tag === 'rect') {
      const x = Number(elem.getAttribute('x') ?? 0)
      const y = Number(elem.getAttribute('y') ?? 0)
      const w = Number(elem.getAttribute('width') ?? 0)
      const h = Number(elem.getAttribute('height') ?? 0)
      points = [
        { x, y },
        { x: x + w, y },
        { x, y: y + h },
        { x: x + w, y: y + h }
      ]
    }
    if (points.length) {
      const rotatedPts = points.map(pt => {
        const dx = pt.x - cx
        const dy = pt.y - cy
        return {
          x: cx + (dx * cos - dy * sin),
          y: cy + (dx * sin + dy * cos)
        }
      })
      const xs = rotatedPts.map(p => p.x)
      const ys = rotatedPts.map(p => p.y)
      let rotatedBBox = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys)
      }
      const matrixMatch = transformAttr.match(/matrix\(([^)]+)\)/)
      if (matrixMatch) {
        const vals = matrixMatch[1].split(/[,\s]+/).filter(Boolean).map(Number)
        const e = vals[4] ?? 0
        const f = vals[5] ?? 0
        rotatedBBox = { ...rotatedBBox, x: rotatedBBox.x + e, y: rotatedBBox.y + f }
      }
      const isRightAngle = Math.abs(angle % 90) < 0.001
      if (tag !== 'path' && isRightAngle && typeof addSVGElementsFromJson === 'function') {
        addSVGElementsFromJson({ element: 'path', attr: {} })
      }
      return rotatedBBox
    }
  }

  const tlist = getTransformList(elem)
  const angle = getRotationAngleFromTransformList(tlist)
  const hasMatrixXForm = hasMatrixTransform(tlist)
  const { matrix } = transformListToTransform(tlist)

  // A transform list made up solely of translate()/scale() items has no
  // rotation and no non-identity matrix() entry, so the two checks above
  // both miss it — but it still moves/resizes the element and must not be
  // dropped, or the bbox silently reverts to the untransformed native one
  // (this is what produced blank shape-library thumbnails for translate-only
  // imported content, e.g. pasted/vault SVGs that were never dragged).
  if (angle || hasMatrixXForm || !isIdentity(matrix)) {
    let goodBb = false
    if (bBoxCanBeOptimizedOverNativeGetBBox(angle, hasMatrixXForm)) {
      // Get the BBox from the raw path for these elements
      // TODO: why ellipse and not circle
      const elemNames = ['ellipse', 'path', 'line', 'polyline', 'polygon']
      if (elemNames.includes(elem.tagName)) {
        const pathBox = getBBoxOfElementAsPath(
          elem,
          addSVGElementsFromJson,
          pathActions
        )
        if (pathBox && !(pathBox.width === 0 && pathBox.height === 0)) {
          goodBb = pathBox
          bb = pathBox
        }
      } else if (elem.tagName === 'rect') {
        // Look for radius
        const rx = Number(elem.getAttribute('rx'))
        const ry = Number(elem.getAttribute('ry'))
        if (rx || ry) {
          const roundedRectBox = getBBoxOfElementAsPath(
            elem,
            addSVGElementsFromJson,
            pathActions
          )
          if (roundedRectBox && !(roundedRectBox.width === 0 && roundedRectBox.height === 0)) {
            goodBb = roundedRectBox
            bb = roundedRectBox
          }
        }
      }
    }

    if (!goodBb) {
      bb = transformBox(bb.x, bb.y, bb.width, bb.height, matrix).aabox
    }
  }
  return bb
}

/**
 * @param {Element} elem
 * @returns {Float}
 * @todo This is problematic with large stroke-width and, for example, a single
 * horizontal line. The calculated BBox extends way beyond left and right sides.
 */
const getStrokeOffsetForBBox = elem => {
  const stroke = elem.getAttribute('stroke')
  const swAttr = elem.getAttribute('stroke-width')
  // A missing stroke-width means the SVG initial value of 1 — cleanupElement
  // strips the attribute at that value — but only matters when there's an
  // actual visible stroke to draw with it.
  const sw = (swAttr === null && stroke && stroke !== 'none') ? 1 : swAttr
  return !isNaN(sw) && stroke !== 'none' ? sw / 2 : 0
}

/**
 * @typedef {PlainObject} BBox
 * @property {Integer} x The x value
 * @property {Integer} y The y value
 * @property {Float} width
 * @property {Float} height
 */

/**
 * Get the bounding box for one or more stroked and/or transformed elements.
 * @function module:bbox-utils.getStrokedBBox
 * @param {Element[]} elems - Array with DOM elements to check
 * @param {module:utilities.EditorContext#addSVGElementsFromJson} addSVGElementsFromJson - Function to add the path element to the current layer. See canvas.addSVGElementsFromJson
 * @param {module:path.pathActions} pathActions - If a transform exists, pathActions.resetOrientation() is used. See: canvas.pathActions.
 * @returns {module:bbox-utils.BBoxObject|module:math.TransformedBox|DOMRect} A single bounding box object
 */
export const getStrokedBBox = (elems, addSVGElementsFromJson, pathActions) => {
  if (!elems || !elems.length) {
    return false
  }

  let fullBb
  elems.forEach(elem => {
    if (fullBb) {
      return
    }
    if (!elem.parentNode) {
      return
    }
    fullBb = getBBoxWithTransform(elem, addSVGElementsFromJson, pathActions)
  })

  // This shouldn't ever happen...
  if (!fullBb) {
    return null
  }

  // fullBb doesn't include the stoke, so this does no good!
  // if (elems.length == 1) return fullBb;

  let maxX = fullBb.x + fullBb.width
  let maxY = fullBb.y + fullBb.height
  let minX = fullBb.x
  let minY = fullBb.y

  // If only one elem, don't call the potentially slow getBBoxWithTransform method again.
  if (elems.length === 1) {
    const offset = getStrokeOffsetForBBox(elems[0])
    minX -= offset
    minY -= offset
    maxX += offset
    maxY += offset
  } else {
    elems.forEach(elem => {
      const curBb = getBBoxWithTransform(
        elem,
        addSVGElementsFromJson,
        pathActions
      )
      if (curBb) {
        const offset = getStrokeOffsetForBBox(elem)
        minX = Math.min(minX, curBb.x - offset)
        minY = Math.min(minY, curBb.y - offset)
        // TODO: The old code had this test for max, but not min. I suspect this test should be for both min and max
        if (elem.nodeType === 1) {
          maxX = Math.max(maxX, curBb.x + curBb.width + offset)
          maxY = Math.max(maxY, curBb.y + curBb.height + offset)
        }
      }
    })
  }

  fullBb.x = shortFloat(minX)
  fullBb.y = shortFloat(minY)
  fullBb.width = shortFloat(maxX - minX)
  fullBb.height = shortFloat(maxY - minY)
  return fullBb
}
