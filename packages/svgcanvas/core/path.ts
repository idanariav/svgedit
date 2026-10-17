/**
 * Path functionality.
 * @module path
 * @license MIT
 *
 * @copyright 2011 Alexis Deveria, 2011 Jeff Schiller
 */

import { transformPoint, getTransformList } from './math.ts'
import {
  getRotationAngle
} from './dom-utils.ts'
import {
  getBBox,
  requireBBox
} from './bbox-utils.ts'
import type SvgCanvas from '../svgcanvas.ts'
import type { XY } from './canvas-state.ts'
import type { PathObject } from './path-types.ts'
import { init as pathMethodInit } from './path-method.ts'
import { init as pathActionsInit } from './path-actions.ts'

const segData: Record<number, string[]> = {
  2: ['x', 'y'], // PATHSEG_MOVETO_ABS
  4: ['x', 'y'], // PATHSEG_LINETO_ABS
  6: ['x', 'y', 'x1', 'y1', 'x2', 'y2'], // PATHSEG_CURVETO_CUBIC_ABS
  8: ['x', 'y', 'x1', 'y1'], // PATHSEG_CURVETO_QUADRATIC_ABS
  10: ['x', 'y', 'r1', 'r2', 'angle', 'largeArcFlag', 'sweepFlag'], // PATHSEG_ARC_ABS
  12: ['x'], // PATHSEG_LINETO_HORIZONTAL_ABS
  14: ['y'], // PATHSEG_LINETO_VERTICAL_ABS
  16: ['x', 'y', 'x2', 'y2'], // PATHSEG_CURVETO_CUBIC_SMOOTH_ABS
  18: ['x', 'y'] // PATHSEG_CURVETO_QUADRATIC_SMOOTH_ABS
}

/**
 * Reentrant init: all path state (current path, pathData, pathFuncs,
 * linkControlPts) and the helpers/classes below are created per
 * SvgCanvas instance, closed over `svgCanvas`, so several editors coexist in one
 * realm. The init body (attachments + sub-inits) is at the end of this closure.
 */
export const init = (canvas: SvgCanvas): void => {
  const svgCanvas = canvas
  let pathFuncs: Array<string | number> = []

  let linkControlPts = true

  // Stores references to paths via IDs.
  // TODO: Make this cross-document happy.
  let pathData: Record<string, PathObject> = {}

  const setLinkControlPoints = (lcp: boolean): void => {
    linkControlPts = lcp
  }

  /** The path being edited, with its bbox from before a rotation (see `recalcRotatedPath`). */
  let path: PathObject | null = null

  /**
 * Takes three points and creates a smoother line based on them: returns the two "smoothed"
 * control points (`undefined` when a control point sits on the vertex).
 */
  const smoothControlPoints = (ct1: XY, ct2: XY, pt: XY): XY[] | undefined => {
  // each point must not be the origin
    const x1 = ct1.x - pt.x
    const y1 = ct1.y - pt.y
    const x2 = ct2.x - pt.x
    const y2 = ct2.y - pt.y

    if ((x1 !== 0 || y1 !== 0) && (x2 !== 0 || y2 !== 0)) {
      const
        r1 = Math.sqrt(x1 * x1 + y1 * y1)
      const r2 = Math.sqrt(x2 * x2 + y2 * y2)
      const nct1 = svgCanvas.getSvgRoot().createSVGPoint()
      const nct2 = svgCanvas.getSvgRoot().createSVGPoint()
      let anglea = Math.atan2(y1, x1)
      let angleb = Math.atan2(y2, x2)
      if (anglea < 0) { anglea += 2 * Math.PI }
      if (angleb < 0) { angleb += 2 * Math.PI }

      const angleBetween = Math.abs(anglea - angleb)
      const angleDiff = Math.abs(Math.PI - angleBetween) / 2

      let newAnglea; let newAngleb
      if (anglea - angleb > 0) {
        newAnglea = angleBetween < Math.PI ? (anglea + angleDiff) : (anglea - angleDiff)
        newAngleb = angleBetween < Math.PI ? (angleb - angleDiff) : (angleb + angleDiff)
      } else {
        newAnglea = angleBetween < Math.PI ? (anglea - angleDiff) : (anglea + angleDiff)
        newAngleb = angleBetween < Math.PI ? (angleb + angleDiff) : (angleb - angleDiff)
      }

      // rotate the points
      nct1.x = r1 * Math.cos(newAnglea) + pt.x
      nct1.y = r1 * Math.sin(newAnglea) + pt.y
      nct2.x = r2 * Math.cos(newAngleb) + pt.x
      nct2.y = r2 * Math.sin(newAngleb) + pt.y

      return [nct1, nct2]
    }
    return undefined
  }

  const getPath_ = (elem: SVGPathElement) => {
    let p = pathData[elem.id]
    if (!p) {
      p = pathData[elem.id] = new svgCanvas.PathClass(elem)
    }
    return p
  }

  const removePath_ = (id: string): void => {
    if (id in pathData) { delete pathData[id] }
  }

  let newcx = 0; let newcy = 0; let oldcx = 0; let oldcy = 0; let angle = 0

  const getRotVals = (x: number, y: number) => {
    let dx = x - oldcx
    let dy = y - oldcy

    // rotate the point around the old center
    let r = Math.sqrt(dx * dx + dy * dy)
    let theta = Math.atan2(dy, dx) + angle
    dx = r * Math.cos(theta) + oldcx
    dy = r * Math.sin(theta) + oldcy

    // dx,dy should now hold the actual coordinates of each
    // point after being rotated

    // now we want to rotate them around the new center in the reverse direction
    dx -= newcx
    dy -= newcy

    r = Math.sqrt(dx * dx + dy * dy)
    theta = Math.atan2(dy, dx) - angle

    return {
      x: r * Math.cos(theta) + newcx,
      y: r * Math.sin(theta) + newcy
    }
  }

  // If the path was rotated, we must now pay the piper:
  // Every path point must be rotated into the rotated coordinate system of
  // its old center, then determine the new center, then rotate it back
  // This is because we want the path to remember its rotation

  /**
 * @todo This is still using ye olde transform methods, can probably
 * be optimized or even taken care of by `recalculateDimensions`
 */
  const recalcRotatedPath = (): void => {
    const currentPath = path?.elem
    if (!currentPath) { return }
    angle = getRotationAngle(currentPath, true)
    if (!angle) { return }
    // selectedBBoxes[0] = path.oldbbox;
    const oldbox = path?.oldbbox // selectedBBoxes[0],
    if (!oldbox) { return }
    oldcx = oldbox.x + oldbox.width / 2
    oldcy = oldbox.y + oldbox.height / 2
    const box = getBBox(currentPath)
    if (!box) { return }
    newcx = box.x + box.width / 2
    newcy = box.y + box.height / 2

    // un-rotate the new center to the proper position
    const dx = newcx - oldcx
    const dy = newcy - oldcy
    const r = Math.sqrt(dx * dx + dy * dy)
    const theta = Math.atan2(dy, dx) + angle

    newcx = r * Math.cos(theta) + oldcx
    newcy = r * Math.sin(theta) + oldcy

    const list = path?.elem.pathSegList
    if (!list) { return }

    let i = list.numberOfItems
    while (i) {
      i -= 1
      const seg = list.getItem(i)
      const type = seg.pathSegType
      if (type === 1) { continue }

      const props = segData[type]
      if (!props) { continue }

      const newVals: Record<string, number> = {}
      if (seg.x !== null && seg.x !== undefined && seg.y !== null && seg.y !== undefined) {
        const rvals = getRotVals(seg.x, seg.y)
        newVals.x = rvals.x
        newVals.y = rvals.y
      }
      if (seg.x1 !== null && seg.x1 !== undefined && seg.y1 !== null && seg.y1 !== undefined) {
        const cVals1 = getRotVals(seg.x1, seg.y1)
        newVals.x1 = cVals1.x
        newVals.y1 = cVals1.y
      }
      if (seg.x2 !== null && seg.x2 !== undefined && seg.y2 !== null && seg.y2 !== undefined) {
        const cVals2 = getRotVals(seg.x2, seg.y2)
        newVals.x2 = cVals2.x
        newVals.y2 = cVals2.y
      }

      const points = props.map((prop) => {
        if (Object.prototype.hasOwnProperty.call(newVals, prop)) {
          return newVals[prop]
        }
        const val = seg[prop]
        return val === null || val === undefined ? 0 : val
      })
      svgCanvas.replacePathSeg(type, i, points)
    } // loop for each point

    /* box = */ getBBox(currentPath)
    // selectedBBoxes[0].x = box.x; selectedBBoxes[0].y = box.y;
    // selectedBBoxes[0].width = box.width; selectedBBoxes[0].height = box.height;

    // now we must set the new transform to be rotated around the new center
    const Rnc = svgCanvas.getSvgRoot().createSVGTransform()
    const tlist = getTransformList(currentPath)
    if (!tlist) { return }
    Rnc.setRotate((angle * 180.0 / Math.PI), newcx, newcy)
    if (tlist.numberOfItems) {
      if (typeof tlist.replaceItem === 'function') {
        tlist.replaceItem(Rnc, 0)
      } else {
        tlist.removeItem(0)
        tlist.insertItemBefore(Rnc, 0)
      }
    } else {
      tlist.appendItem(Rnc)
    }
  }

  // ====================================
  // Public API starts here

  const clearData = (): void => {
    pathData = {}
  }

  // Making public for mocking
  const reorientGrads = (elem: Element, m: DOMMatrix): void => {
    const bb = requireBBox(elem)
    for (let i = 0; i < 2; i++) {
      const type = i === 0 ? 'fill' : 'stroke'
      const attrVal = elem.getAttribute(type)
      if (attrVal && attrVal.startsWith('url(')) {
        const grad = svgCanvas.getRefElem(attrVal) as Element
        if (grad.tagName === 'linearGradient') {
          let x1 = Number(grad.getAttribute('x1') || 0)
          let y1 = Number(grad.getAttribute('y1') || 0)
          let x2 = Number(grad.getAttribute('x2') || 1)
          let y2 = Number(grad.getAttribute('y2') || 0)

          // Convert to USOU points
          x1 = (bb.width * x1) + bb.x
          y1 = (bb.height * y1) + bb.y
          x2 = (bb.width * x2) + bb.x
          y2 = (bb.height * y2) + bb.y

          // Transform those points
          const pt1 = transformPoint(x1, y1, m)
          const pt2 = transformPoint(x2, y2, m)

          // Convert back to BB points
          const gCoords = {
            x1: (pt1.x - bb.x) / bb.width,
            y1: (pt1.y - bb.y) / bb.height,
            x2: (pt2.x - bb.x) / bb.width,
            y2: (pt2.y - bb.y) / bb.height
          }

          const newgrad = grad.cloneNode(true) as Element
          for (const [key, value] of Object.entries(gCoords)) {
            newgrad.setAttribute(key, String(value))
          }
          newgrad.id = svgCanvas.getNextId()
          svgCanvas.findDefs().append(newgrad)
          elem.setAttribute(type, `url(#${newgrad.id})`)
        }
      }
    }
  }

  // ── init body (relocated here so it runs after the declarations above) ──
  svgCanvas.removePath_ = removePath_
  svgCanvas.getPath_ = getPath_
  svgCanvas.setLinkControlPoints = setLinkControlPoints
  svgCanvas.smoothControlPoints = smoothControlPoints
  svgCanvas.reorientGrads = reorientGrads
  svgCanvas.recalcRotatedPath = recalcRotatedPath
  svgCanvas.clearData = clearData
  svgCanvas.getSegData = () => { return segData }
  svgCanvas.getPathObj = () => { return path }
  svgCanvas.setPathObj = (obj: PathObject | null) => { path = obj }
  svgCanvas.getPathFuncs = () => { return pathFuncs }
  svgCanvas.getLinkControlPts = () => { return linkControlPts }
  pathFuncs = [0, 'ClosePath']
  const pathFuncsStrs = [
    'Moveto', 'Lineto', 'CurvetoCubic', 'CurvetoQuadratic', 'Arc',
    'LinetoHorizontal', 'LinetoVertical', 'CurvetoCubicSmooth', 'CurvetoQuadraticSmooth'
  ]
  pathFuncsStrs.forEach((s) => {
    pathFuncs.push(s + 'Abs')
    pathFuncs.push(s + 'Rel')
  })
  // Sub-modules attach their own per-instance helpers/classes to this canvas.
  pathActionsInit(svgCanvas)
  pathMethodInit(svgCanvas)
}
