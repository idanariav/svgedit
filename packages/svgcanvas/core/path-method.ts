/**
 * The path node editor's model: the `Segment` and `Path` wrappers over a path's segment list, and the grip helpers they use.
 * @module path
 * @license MIT
 *
 * @copyright 2011 Alexis Deveria, 2011 Jeff Schiller
 */

import { NS } from './namespaces.ts'
import { ChangeElementCommand } from './history.js'
import { restoreAttr } from './dom-utils.ts'
import {
  transformPoint, getMatrix, getMatrixToContent, matrixMultiply, isIdentity
} from './math.ts'
import {
  assignAttributes
} from './dom-utils.ts'
import type SvgCanvas from '../svgcanvas.ts'
import type { XY } from './canvas-state.ts'
import type {
  CtrlPoints, PathClassApi, PathElement, PathObject, PathSegItem, PathSegment, SegmentClassApi
} from './path-types.ts'

/** The members `path-method.ts` gives its canvas. */
export interface PathMethodApi {
  replacePathSeg(type: number, index: number, pts: number[], elem?: Element): void
  addPointGrip(index: number, x?: number | undefined, y?: number | undefined): SVGRectElement
  addCtrlGrip(id: string | number): SVGCircleElement
  /** Hover tooltips of the path editor's node and control-point grips (a `<title>` child; the editor passes translated text). */
  setPathGripTitles(titles: { node?: string, ctrl?: string }): void
  getCtrlLine(id: string | number): SVGLineElement
  getGripPt(seg: PathSegment, altPt?: XY): XY
  getPointFromGrip(pt: XY, pth: PathObject): XY
  PathClass: PathClassApi
  SegmentClass: SegmentClassApi
}

export const createPathMethod = (canvas: SvgCanvas): PathMethodApi => {
  const svgCanvas = canvas // per-instance; the methods + classes below close over it

  /** @todo See if this should just live in `replacePathSeg` */
  const ptObjToArrMethod = (type: number, segItem: PathSegItem): number[] => {
    const segData = svgCanvas.getSegData()
    const props = segData[type]
    return props.map((prop) => {
      return segItem[prop]
    })
  }

  const getGripPtMethod = (seg: PathSegment, altPt?: XY): XY => {
    const { path: pth } = seg
    let out: XY = {
      x: altPt ? altPt.x : seg.item.x,
      y: altPt ? altPt.y : seg.item.y
    }

    if (pth?.matrix) {
      const pt = transformPoint(out.x, out.y, pth.matrix)
      out = pt
    }
    const zoom = svgCanvas.getZoom()
    out.x *= zoom
    out.y *= zoom

    return out
  }
  const getPointFromGripMethod = (pt: XY, pth: PathObject): XY => {
    const out = {
      x: pt.x,
      y: pt.y
    }

    if (pth.matrix && pth.imatrix) {
      pt = transformPoint(out.x, out.y, pth.imatrix)
      out.x = pt.x
      out.y = pt.y
    }
    const zoom = svgCanvas.getZoom()
    out.x /= zoom
    out.y /= zoom

    return out
  }
  const getGripContainerMethod = (): Element => {
    let c = svgCanvas.getElement('pathpointgrip_container')
    if (!c) {
      const parentElement = svgCanvas.getElement('selectorParentGroup') as Element
      c = document.createElementNS(NS.SVG, 'g')
      parentElement.append(c)
      c.id = 'pathpointgrip_container'
    }
    return c
  }
  // The hover texts of the grips (the editor passes the translated strings in: core has no locale). A `<title>` child
  // is the SVG tooltip; grips made before the texts arrive are given theirs by `setPathGripTitles`.
  const gripTitles = { node: '', ctrl: '' }
  const titleGrip = (grip: Element, text: string): void => {
    let title = [...grip.children].find((c) => c.localName === 'title')
    if (!text) {
      title?.remove()
      return
    }
    if (!title) {
      title = document.createElementNS(NS.SVG, 'title')
      grip.prepend(title)
    }
    if (title.textContent !== text) title.textContent = text
  }
  /**
   * Set the hover tooltips of the path editor's node and control-point grips.
   */
  const setPathGripTitlesMethod = (titles: { node?: string, ctrl?: string }): void => {
    gripTitles.node = titles.node ?? gripTitles.node
    gripTitles.ctrl = titles.ctrl ?? gripTitles.ctrl
    const container = svgCanvas.getElement('pathpointgrip_container')
    for (const grip of container?.children ?? []) {
      if (grip.id.startsWith('pathpointgrip_')) titleGrip(grip, gripTitles.node)
      else if (grip.id.startsWith('ctrlpointgrip_')) titleGrip(grip, gripTitles.ctrl)
    }
  }
  // Side length of the square anchor-node grips. Larger than the round
  // control-point handles (r: 3) so the node reads as the primary target.
  const NODE_GRIP_SIZE = 9
  const addPointGripMethod = (index: number, x?: number, y?: number): SVGRectElement => {
  // create the container of all the point grips
    const pointGripContainer = getGripContainerMethod()

    let pointGrip = svgCanvas.getElement(`pathpointgrip_${index}`) as SVGRectElement | null | undefined
    // create it
    if (!pointGrip) {
    // Anchor nodes are drawn as squares (vs. round control-point handles)
    // so the two can be told apart and aimed at when they overlap.
      pointGrip = document.createElementNS(NS.SVG, 'rect')
      const atts = {
        id: `pathpointgrip_${index}`,
        display: 'none',
        width: NODE_GRIP_SIZE,
        height: NODE_GRIP_SIZE,
        rx: 1,
        fill: '#0FF',
        stroke: '#00F',
        'stroke-width': 2,
        cursor: 'move',
        style: 'pointer-events:all'
      }
      assignAttributes(pointGrip, atts)
      titleGrip(pointGrip, gripTitles.node)
      pointGripContainer.append(pointGrip)

      // Use the grip we just created rather than re-looking it up by id: a
      // global document.getElementById would return whichever editor instance's
      // same-index grip comes first in DOM order when multiple drawings are
      // open, wiring this dblclick handler to the wrong pane's grip.
      pointGrip.addEventListener('dblclick', () => {
        const path = svgCanvas.getPathObj()
        if (path) {
          path.setSegType()
        }
      })
    }
    if (x !== undefined && y !== undefined) {
    // set up the point grip element and display it. Both callers always pass
    // real coordinates -- a falsy `x && y` check previously skipped this
    // (leaving the grip permanently un-positioned and hidden) whenever a
    // point landed exactly on pixel 0.
      assignAttributes(pointGrip, {
        x: x - NODE_GRIP_SIZE / 2,
        y: y - NODE_GRIP_SIZE / 2,
        display: 'inline'
      })
    }
    return pointGrip
  }
  const addCtrlGripMethod = (id: string): SVGCircleElement => {
    let pointGrip = svgCanvas.getElement('ctrlpointgrip_' + id) as SVGCircleElement | null | undefined
    if (pointGrip) { return pointGrip }

    pointGrip = document.createElementNS(NS.SVG, 'circle')
    const atts = {
      id: 'ctrlpointgrip_' + id,
      display: 'none',
      r: 3,
      fill: '#0FF',
      stroke: '#55F',
      'stroke-width': 1,
      cursor: 'move',
      style: 'pointer-events:all'
    }
    assignAttributes(pointGrip, atts)
    titleGrip(pointGrip, gripTitles.ctrl)
    getGripContainerMethod().append(pointGrip)
    return pointGrip
  }
  const getCtrlLineMethod = (id: string): SVGLineElement => {
    let ctrlLine = svgCanvas.getElement('ctrlLine_' + id) as SVGLineElement | null | undefined
    if (ctrlLine) { return ctrlLine }

    ctrlLine = document.createElementNS(NS.SVG, 'line')
    assignAttributes(ctrlLine, {
      id: 'ctrlLine_' + id,
      display: 'none',
      stroke: '#555',
      'stroke-width': 1,
      style: 'pointer-events:none'
    })
    getGripContainerMethod().append(ctrlLine)
    return ctrlLine
  }
  const getPointGripMethod = (seg: PathSegment, update?: boolean): SVGRectElement => {
    const { index } = seg
    const pointGrip = addPointGripMethod(index)

    if (update) {
      const pt = getGripPtMethod(seg)
      assignAttributes(pointGrip, {
        x: pt.x - NODE_GRIP_SIZE / 2,
        y: pt.y - NODE_GRIP_SIZE / 2,
        display: 'inline'
      })
    }

    return pointGrip
  }
  const getControlPointsMethod = (seg: PathSegment): CtrlPoints | null => {
    const { item, index } = seg
    if (!('x1' in item) || !('x2' in item)) { return null }
    const cpt: Record<string, SVGLineElement | SVGCircleElement> = {}
    /* const pointGripContainer = */ getGripContainerMethod()

    // Note that this is intentionally not seg.prev.item
    // The segment's own path, not the canvas-wide current one: a stale session being re-init'ed (clear()) must not index
    // into another path's segs.
    const path = (seg.path ?? svgCanvas.getPathObj()) as PathObject
    const prev = path.segs[index - 1].item

    const segItems = [prev, item]

    for (let i = 1; i < 3; i++) {
      const id = index + 'c' + i

      const ctrlLine = cpt[`c${i}_line`] = getCtrlLineMethod(id)

      const pt = getGripPtMethod(seg, { x: item['x' + i], y: item['y' + i] })
      const gpt = getGripPtMethod(seg, { x: segItems[i - 1].x, y: segItems[i - 1].y })

      // Position only — visibility is driven by node selection
      // (see Path#refreshCtrlPtDisplay), not by repositioning.
      assignAttributes(ctrlLine, {
        x1: pt.x,
        y1: pt.y,
        x2: gpt.x,
        y2: gpt.y
      })

      cpt[`c${i}_line`] = ctrlLine

      // create it
      const pointGrip = cpt[`c${i}`] = addCtrlGripMethod(id)

      assignAttributes(pointGrip, {
        cx: pt.x,
        cy: pt.y
      })
      cpt['c' + i] = pointGrip
    }
    return cpt as unknown as CtrlPoints
  }
  /** This replaces the segment at the given index. `type` is an SVG path segment type number (see `getPathFuncs`). */
  const replacePathSegMethod = (type: number, index: number, pts: number[], elem?: Element): void => {
    const pth = (elem || (svgCanvas.getPathObj() as PathObject).elem) as PathElement
    const pathFuncs = svgCanvas.getPathFuncs()
    const func = 'createSVGPathSeg' + pathFuncs[type]
    const segData = svgCanvas.getSegData?.()
    const props = segData?.[type] || segData?.[type - 1]
    if (props && pts.length < props.length) {
      const currentSeg = pth.pathSegList?.getItem?.(index)
      if (currentSeg) {
        pts = props.map((prop, i) => (pts[i] !== undefined ? pts[i] : currentSeg[prop]))
      }
    }
    let seg: PathSegItem
    const factory = (pth as unknown as Record<string, ((...args: number[]) => PathSegItem) | undefined>)[func]
    if (typeof factory === 'function') {
      seg = factory.apply(pth, pts)
    } else {
      const safeProps = props || []
      seg = { pathSegType: type } as PathSegItem
      safeProps.forEach((prop, i) => {
        seg[prop] = pts[i]
      })
    }

    pth.pathSegList.replaceItem(seg, index)
  }
  const getSegSelectorMethod = (seg: PathSegment, update?: boolean): SVGPathElement => {
    const { index } = seg
    let segLine = svgCanvas.getElement(`segline_${index}`) as SVGPathElement | null | undefined
    if (!segLine) {
      const pointGripContainer = getGripContainerMethod()
      // create segline
      segLine = document.createElementNS(NS.SVG, 'path')
      assignAttributes(segLine, {
        id: `segline_${index}`,
        display: 'none',
        fill: 'none',
        stroke: '#0FF',
        'stroke-width': 2,
        style: 'pointer-events:none',
        d: 'M0,0 0,0'
      })
      pointGripContainer.append(segLine)
    }

    if (update) {
      const { prev } = seg
      if (!prev) {
        segLine.setAttribute('display', 'none')
        return segLine
      }

      const pt = getGripPtMethod(prev)
      // Set start point
      replacePathSegMethod(2, 0, [pt.x, pt.y], segLine)

      const pts = ptObjToArrMethod(seg.type, seg.item) // , true);
      for (let i = 0; i < pts.length; i += 2) {
        const point = getGripPtMethod(seg, { x: pts[i], y: pts[i + 1] })
        pts[i] = point.x
        pts[i + 1] = point.y
      }

      replacePathSegMethod(seg.type, 1, pts, segLine)
    }
    return segLine
  }
  class Segment implements PathSegment {
    selected: boolean
    index: number
    item: PathSegItem
    type: number
    olditem: PathSegItem | undefined
    ctrlpts: CtrlPoints | null
    ptgrip: SVGRectElement | null
    segsel: SVGPathElement | null
    // Linked up by Path#init()
    path: PathObject | null
    prev: PathSegment | null
    next: PathSegment | null
    mate: PathSegment | null

    constructor (index: number, item: PathSegItem) {
      this.selected = false
      this.index = index
      this.item = item
      this.type = item.pathSegType
      this.olditem = undefined

      this.ctrlpts = null
      this.ptgrip = null
      this.segsel = null
      this.path = null
      this.prev = null
      this.next = null
      this.mate = null
    }

    showCtrlPts (y: boolean): void {
      if (!this.ctrlpts) return
      for (const i in this.ctrlpts) {
        if ({}.hasOwnProperty.call(this.ctrlpts, i)) {
          this.ctrlpts[i as keyof CtrlPoints].setAttribute('display', y ? 'inline' : 'none')
        }
      }
    }

    /**
   * Show/hide a single control handle (grip + its line) of this segment.
   * `which` is 'c1' (handle near the previous node) or 'c2' (handle near
   * this node).
   */
    showCtrlPt (which: 'c1' | 'c2', y: boolean): void {
      const display = y ? 'inline' : 'none'
      this.ctrlpts?.[which]?.setAttribute('display', display)
      this.ctrlpts?.[`${which}_line`]?.setAttribute('display', display)
    }

    selectCtrls (y: boolean): void {
    // Use this.ctrlpts (same refs showCtrlPt uses) instead of a global
    // document.getElementById by id: with multiple editor instances open,
    // a same-index grip in another pane could shadow this one and get
    // recolored instead.
      this.ctrlpts?.c1?.setAttribute('fill', y ? '#0FF' : '#EEE')
      this.ctrlpts?.c2?.setAttribute('fill', y ? '#0FF' : '#EEE')
    }

    show (y: boolean): void {
      if (this.ptgrip) {
        this.ptgrip.setAttribute('display', y ? 'inline' : 'none')
        this.segsel?.setAttribute('display', y ? 'inline' : 'none')
        // Control points stay hidden here; only the active node's handles are
        // revealed, by Path#refreshCtrlPtDisplay.
        this.showCtrlPts(false)
      }
    }

    select (y: boolean): void {
      if (this.ptgrip) {
        this.ptgrip.setAttribute('stroke', y ? '#0FF' : '#00F')
        this.segsel?.setAttribute('display', y ? 'inline' : 'none')
        if (this.ctrlpts) {
          this.selectCtrls(y)
        }
        this.selected = y
      }
    }

    addGrip (): void {
      this.ptgrip = getPointGripMethod(this, true)
      this.ctrlpts = getControlPointsMethod(this) // , true);
      this.segsel = getSegSelectorMethod(this, true)
    }

    update (full?: boolean): void {
      if (this.ptgrip) {
        const pt = getGripPtMethod(this)
        assignAttributes(this.ptgrip, {
          x: pt.x - NODE_GRIP_SIZE / 2,
          y: pt.y - NODE_GRIP_SIZE / 2
        })

        getSegSelectorMethod(this, true)

        if (this.ctrlpts) {
          if (full) {
            const path = svgCanvas.getPathObj() as PathObject
            this.item = path.elem.pathSegList.getItem(this.index)
            this.type = this.item.pathSegType
          }
          getControlPointsMethod(this)
        }
      // this.segsel.setAttribute('display', y ? 'inline' : 'none');
      }
    }

    move (dx: number, dy: number): void {
      const { item } = this

      item.x += dx
      item.y += dy

      // `x2/y2` are the control point attached to this node (when present)
      if ('x2' in item) { item.x2 += dx }
      if ('y2' in item) { item.y2 += dy }

      replacePathSegMethod(
        this.type,
        this.index,
        ptObjToArrMethod(this.type, item)
      )

      const next = this.next?.item
      // `x1/y1` are the control point attached to this node on the next segment (when present)
      if (next && 'x1' in next && 'y1' in next) {
        next.x1 += dx
        next.y1 += dy
        const nextSeg = this.next as PathSegment
        replacePathSegMethod(nextSeg.type, nextSeg.index, ptObjToArrMethod(nextSeg.type, next))
      }

      if (this.mate) {
      // The last point of a closed subpath has a 'mate',
      // which is the 'M' segment of the subpath
        const { item: itm } = this.mate
        const pts = [itm.x += dx, itm.y += dy]
        replacePathSegMethod(this.mate.type, this.mate.index, pts)
      // Has no grip, so does not need 'updating'?
      }

      this.update(true)
      if (this.next) { this.next.update(true) }
    }

    setLinked (num: number): void {
      let seg: PathSegment | null; let anum: number; let pt: PathSegItem
      if (num === 2) {
        anum = 1
        seg = this.next
        if (!seg) { return }
        pt = this.item
      } else {
        anum = 2
        seg = this.prev
        if (!seg) { return }
        pt = seg.item
      }

      const { item } = seg
      item['x' + anum] = pt.x + (pt.x - this.item['x' + num])
      item['y' + anum] = pt.y + (pt.y - this.item['y' + num])

      const pts = [
        item.x, item.y,
        item.x1, item.y1,
        item.x2, item.y2
      ]

      replacePathSegMethod(seg.type, seg.index, pts)
      seg.update(true)
    }

    moveCtrl (num: number, dx: number, dy: number): void {
      const { item } = this
      item['x' + num] += dx
      item['y' + num] += dy

      const pts = [
        item.x, item.y,
        item.x1, item.y1, item.x2, item.y2
      ]

      replacePathSegMethod(this.type, this.index, pts)
      this.update(true)
    }

    setType (newType: number, pts: number[]): void {
      replacePathSegMethod(newType, this.index, pts)
      this.type = newType
      const path = svgCanvas.getPathObj() as PathObject
      this.item = path.elem.pathSegList.getItem(this.index)
      this.showCtrlPts(newType === 6)
      this.ctrlpts = getControlPointsMethod(this)
      this.update(true)
    }
  }

  /**
 * The node editor models a closed subpath as `M start … L(back to start) Z`:
 * the last real segment before `Z` lands on the start point and is that
 * vertex's *only* grip (`M` itself gets none — see `Path#init`, which links
 * the two as `seg.mate`). A `Z`-only subpath (`M A L B L C L D Z`, which is
 * perfectly valid SVG and what most other tools/importers emit) has no such
 * segment, so `D` would be mistaken for the start vertex: `A` would have no
 * grip and dragging `D` would drag `A` with it. Insert the missing explicit
 * closing lineto (geometry-identical, since `Z` draws that same edge) so the
 * editor's model holds. Only absolute end-point segments are considered.
 */
  const ensureExplicitClosingSegments = (elem: PathElement): void => {
    const segList = elem.pathSegList
    let mx: number | null = null
    let my: number | null = null
    for (let i = 0; i < segList.numberOfItems; i++) {
      const seg = segList.getItem(i)
      if (seg.pathSegType === 2) { // MovetoAbs starts a subpath
        mx = seg.x
        my = seg.y
        continue
      }
      if (seg.pathSegType !== 1 || mx === null || i === 0) continue
      const prev = segList.getItem(i - 1)
      if (
        prev.pathSegType === 2 || prev.pathSegType === 1 || // nothing to close
        prev.pathSegType % 2 !== 0 || // relative: leave alone
        typeof prev.x !== 'number' || typeof prev.y !== 'number'
      ) continue
      if (Math.abs(prev.x - mx) < 1e-6 && Math.abs(prev.y - (my as number)) < 1e-6) continue
      segList.insertItemBefore(elem.createSVGPathSegLinetoAbs(mx, my as number), i)
      i++ // step past the inserted lineto onto the Z again
    }
  }

  class Path implements PathObject {
    elem: PathElement
    segs: PathSegment[] = []
    selected_pts: number[] = []
    first_seg: PathSegment | null = null
    last_d: string | null = null
    dragctrl: number | false | undefined
    dragging?: [number, number] | false
    matrix: SVGMatrix | null = null
    imatrix: SVGMatrix | null = null
    oldbbox?: { x: number, y: number, width: number, height: number } | null

    /** @throws {Error} If constructed without a path element */
    constructor (elem: SVGPathElement) {
      if (!elem || elem.tagName !== 'path') {
        throw new Error('svgedit.path.Path constructed without a <path> element')
      }

      this.elem = elem as PathElement
      svgCanvas.setPathObj(this)
      // path = this;

      this.init()
    }

    setPathContext (): void {
      svgCanvas.setPathObj(this)
    }

    /** Reset path data. */
    init (): PathObject {
    // Hide all grips, etc

      // fixed, needed to work on all found elements, not just first
      const pointGripContainer = getGripContainerMethod()
      const elements = pointGripContainer.querySelectorAll('*')
      elements.forEach((el) => {
        el.setAttribute('display', 'none')
      })

      ensureExplicitClosingSegments(this.elem)
      const segList = this.elem.pathSegList
      const len = segList.numberOfItems
      this.segs = []
      this.selected_pts = []
      this.first_seg = null

      // Set up segs array
      for (let i = 0; i < len; i++) {
        const item = segList.getItem(i)
        const segment = new Segment(i, item)
        segment.path = this
        this.segs.push(segment)
      }

      const { segs } = this

      let startI = 0
      for (let i = 0; i < len; i++) {
        const seg = segs[i]
        const nextSeg = (i + 1) >= len ? null : segs[i + 1]
        const prevSeg = (i - 1) < 0 ? null : segs[i - 1]
        if (seg.type === 2) {
          if (prevSeg && prevSeg.type !== 1) {
          // New sub-path, last one is open,
          // so add a grip to last sub-path's first point
            const startSeg = segs[startI]
            startSeg.next = segs[startI + 1]
            startSeg.next.prev = startSeg
            startSeg.addGrip()
          }
          // Remember that this is a starter seg
          startI = i
        } else if (nextSeg?.type === 1) {
        // This is the last real segment of a closed sub-path
        // Next is first seg after "M"
          seg.next = segs[startI + 1]

          // First seg after "M"'s prev is this
          seg.next.prev = seg
          seg.mate = segs[startI]
          seg.addGrip()
          if (!this.first_seg) {
            this.first_seg = seg
          }
        } else if (!nextSeg) {
          if (seg.type !== 1) {
          // Last seg, doesn't close so add a grip
          // to last sub-path's first point
            const startSeg = segs[startI]
            startSeg.next = segs[startI + 1]
            startSeg.next.prev = startSeg
            startSeg.addGrip()
            seg.addGrip()

            if (!this.first_seg) {
            // Open path, so set first as real first and add grip
              this.first_seg = segs[startI]
            }
          }
        } else if (seg.type !== 1) {
        // Regular segment, so add grip and its "next"
          seg.addGrip()

          // Don't set its "next" if it's an "M"
          if (nextSeg && nextSeg.type !== 2) {
            seg.next = nextSeg
            seg.next.prev = seg
          }
        }
      }
      return this
    }

    /** @param fn Called with each segment as `this`; returning `false` stops the walk. */
    eachSeg (fn: (this: PathSegment, index: number) => boolean | void): void {
      const len = this.segs.length
      for (let i = 0; i < len; i++) {
        const ret = fn.call(this.segs[i], i)
        if (ret === false) { break }
      }
    }

    addSeg (index: number): void {
    // Adds a new segment
      const seg = this.segs[index]
      if (!seg.prev) { return }

      const { prev } = seg
      let newseg: PathSegItem | undefined; let newX: number; let newY: number
      switch (seg.item.pathSegType) {
        case 4: {
          newX = (seg.item.x + prev.item.x) / 2
          newY = (seg.item.y + prev.item.y) / 2
          newseg = this.elem.createSVGPathSegLinetoAbs(newX, newY)
          break
        } case 6: { // make it a curved segment to preserve the shape (WRS)
          // https://en.wikipedia.org/wiki/De_Casteljau%27s_algorithm#Geometric_interpretation
          const p0x = (prev.item.x + seg.item.x1) / 2
          const p1x = (seg.item.x1 + seg.item.x2) / 2
          const p2x = (seg.item.x2 + seg.item.x) / 2
          const p01x = (p0x + p1x) / 2
          const p12x = (p1x + p2x) / 2
          newX = (p01x + p12x) / 2
          const p0y = (prev.item.y + seg.item.y1) / 2
          const p1y = (seg.item.y1 + seg.item.y2) / 2
          const p2y = (seg.item.y2 + seg.item.y) / 2
          const p01y = (p0y + p1y) / 2
          const p12y = (p1y + p2y) / 2
          newY = (p01y + p12y) / 2
          newseg = this.elem.createSVGPathSegCurvetoCubicAbs(newX, newY, p0x, p0y, p01x, p01y)
          const pts = [seg.item.x, seg.item.y, p12x, p12y, p2x, p2y]
          replacePathSegMethod(seg.type, index, pts)
          break
        }
      }
      const list = this.elem.pathSegList
      list.insertItemBefore(newseg as PathSegItem, index)
    }

    removePtFromSelection (index: number): void {
      const pos = this.selected_pts.indexOf(index)
      if (pos === -1) {
        return
      }
      this.segs[index].select(false)
      this.selected_pts.splice(pos, 1)
      this.refreshCtrlPtDisplay()
    }

    clearSelection (): void {
      this.eachSeg(function () {
      // 'this' is the segment here
        this.select(false)
      })
      this.selected_pts = []
    }

    /**
  * Reveal only the control handles belonging to the currently selected
  * node(s), and hide every other handle. A node at index `i` owns the
  * incoming handle on its own segment (`c2`) and the outgoing handle on the
  * next segment (`c1`).
  */
    refreshCtrlPtDisplay (): void {
      this.eachSeg(function () {
      // 'this' is the segment here
        this.showCtrlPts(false)
      })
      this.selected_pts.forEach((index) => {
        const seg = this.segs[index]
        if (!seg) { return }
        seg.showCtrlPt('c2', true)
        seg.next?.showCtrlPt('c1', true)
      })
    }

    storeD (): void {
      this.last_d = this.elem.getAttribute('d')
    }

    show (y: boolean): PathObject {
    // Shows this path's segment grips
      this.eachSeg(function () {
      // 'this' is the segment here
        this.show(y)
      })
      // `first_seg` is only assigned by init() for sub-paths that have at least
      // one drawable point after their `M`. A degenerate path (`M x,y`, `M x,y Z`
      // — a single point, e.g. from an imported/pasted SVG, or a node-delete/undo
      // that reduced a sub-path to its move) leaves it null, and dereferencing
      // `.index` here threw. That throw propagated out of whatever called
      // show(true) — toEditMode(), the undo/redo handler, addSubPath — mid mode
      // transition, wedging the editor (mode stuck, tool switches then failing
      // because setMode()'s teardown re-threw). Nothing is selectable on a
      // degenerate path, so simply skip the auto-select.
      if (y && this.first_seg) {
        this.selectPt(this.first_seg.index)
      }
      return this
    }

    /** Move selected points. */
    movePts (dx: number, dy: number): void {
      let i = this.selected_pts.length
      while (i--) {
        const seg = this.segs[this.selected_pts[i]]
        seg.move(dx, dy)
      }
    }

    moveCtrl (dx: number, dy: number): void {
      const seg = this.segs[this.selected_pts[0]]
      seg.moveCtrl(this.dragctrl as number, dx, dy)
      if (svgCanvas.getLinkControlPts()) {
        seg.setLinked(this.dragctrl as number)
      }
    }

    /** @param newType See {@link https://www.w3.org/TR/SVG/single-page.html#paths-InterfaceSVGPathSeg} */
    setSegType (newType?: number | null): void {
      this.storeD()
      let i = this.selected_pts.length
      let text: string | undefined
      while (i--) {
        const selPt = this.selected_pts[i]

        // Selected seg
        const cur = this.segs[selPt]
        const { prev } = cur
        if (!prev) { continue }

        if (!newType) { // double-click, so just toggle
          text = 'Toggle Path Segment Type'

          // Toggle segment to curve/straight line
          const oldType = cur.type

          newType = (oldType === 6) ? 4 : 6
        }

        newType = Number(newType)

        const curX = cur.item.x
        const curY = cur.item.y
        const prevX = prev.item.x
        const prevY = prev.item.y
        let points: number[] = []
        switch (newType) {
          case 6: {
            if (cur.olditem) {
              const old = cur.olditem
              points = [curX, curY, old.x1, old.y1, old.x2, old.y2]
            } else {
              const diffX = curX - prevX
              const diffY = curY - prevY
              // get control points from straight line segment
              /*
          const ct1x = (prevX + (diffY/2));
          const ct1y = (prevY - (diffX/2));
          const ct2x = (curX + (diffY/2));
          const ct2y = (curY - (diffX/2));
          */
              // create control points on the line to preserve the shape (WRS)
              const ct1x = (prevX + (diffX / 3))
              const ct1y = (prevY + (diffY / 3))
              const ct2x = (curX - (diffX / 3))
              const ct2y = (curY - (diffY / 3))
              points = [curX, curY, ct1x, ct1y, ct2x, ct2y]
            }
            break
          } case 4: {
            points = [curX, curY]

            // Store original prevve segment nums
            cur.olditem = cur.item
            break
          }
        }

        cur.setType(newType, points)
      }
      const path = svgCanvas.getPathObj() as PathObject
      path.refreshCtrlPtDisplay()
      path.endChanges(text)
    }

    /**
   * Recompute the in/out bezier handles of each selected node so they're
   * collinear through the node again (tangent/G1 continuity) — anchor
   * positions are never moved. Only repositions a handle whose own segment
   * is already a curve (type 6); a side bordering a straight (`L`) segment,
   * or a path endpoint with no neighbor on one side, is left untouched.
   */
    smoothSelectedNodes (): void {
      if (!this.selected_pts.length) return
      this.storeD()
      let i = this.selected_pts.length
      while (i--) {
        const cur = this.segs[this.selected_pts[i]]
        const { prev, next } = cur
        if (!prev || !next) continue

        const curPt = cur.item
        const prevPt = prev.item
        const nextPt = next.item
        const dx = nextPt.x - prevPt.x
        const dy = nextPt.y - prevPt.y
        if (dx === 0 && dy === 0) continue

        const angle = Math.atan2(dy, dx)
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)

        if (cur.type === 6) {
          const distIn = Math.hypot(curPt.x - prevPt.x, curPt.y - prevPt.y) / 3
          const targetX = curPt.x - cos * distIn
          const targetY = curPt.y - sin * distIn
          cur.moveCtrl(2, targetX - curPt.x2, targetY - curPt.y2)
        }

        if (next.type === 6) {
          const distOut = Math.hypot(nextPt.x - curPt.x, nextPt.y - curPt.y) / 3
          const targetX = curPt.x + cos * distOut
          const targetY = curPt.y + sin * distOut
          next.moveCtrl(1, targetX - next.item.x1, targetY - next.item.y1)
        }
      }
      this.endChanges('Smooth path node(s)')
    }

    selectPt (pt?: number | null, ctrlNum?: number): void {
      this.clearSelection()
      // `pt == null` means "no point given"; index 0 is a valid node and must
      // not fall through to auto-selecting the last node.
      if (pt == null) {
        this.eachSeg(function (i) {
        // 'this' is the segment here.
          if (this.prev) {
            pt = i
          }
        })
      }
      this.addPtsToSelection(pt as number)
      if (ctrlNum) {
        this.dragctrl = ctrlNum

        if (svgCanvas.getLinkControlPts()) {
          this.segs[pt as number].setLinked(ctrlNum)
        }
      }
    }

    /** Update position of all points. */
    update (): PathObject {
      const { elem } = this
      // Map the path's local coordinates all the way to content space so grips
      // track the path wherever it actually renders. This must honor any
      // non-identity transform (scale, translate, skew, rotation), not just
      // rotation, and must include transforms on ancestor <g>/<a> groups — not
      // only the path's own transform. Imported/ungrouped SVGs are the common
      // case: each path carries a residual scale matrix (e.g.
      // matrix(0.15625 …)) while the move the user applied lives on an ancestor
      // group. Using only the element's own matrix left grips at the original,
      // un-moved location. The matrix/imatrix round-trip in getGripPt /
      // getPointFromGrip keeps node editing consistent in that space.
      const m = matrixMultiply(getMatrixToContent(elem), getMatrix(elem))
      if (!isIdentity(m)) {
        this.matrix = m
        this.imatrix = m.inverse()
      } else {
        this.matrix = null
        this.imatrix = null
      }

      this.eachSeg(function (i) {
        this.item = elem.pathSegList.getItem(i)
        this.update()
      })

      return this
    }

    /**
  * Single choke point for every node/handle/segment-type edit that commits
  * (move, clone, delete, toggle segment type, smooth) — logs the action
  * name plus the full before/after `d` so a hard-to-reproduce path-node bug
  * can be reconstructed from the log instead of guessed at.
  * @param detail Extra fields merged into the 'path-commit' debug
  *   event (e.g. which node index was involved) — see call sites in
  *   path-actions.js.
  */
    endChanges (text?: string, detail?: object): void {
      const before = this.last_d ?? null
      const cmd = new ChangeElementCommand(this.elem, { d: before }, text)
      svgCanvas.logDebugEvent?.('path-commit', {
        elemId: this.elem.id,
        action: cmd.getText(),
        before,
        after: this.elem.getAttribute('d'),
        ...detail
      })
      const after = this.elem.getAttribute('d')
      // The edit was made on the live path (the grips follow it); the model is handed the result as the step. The live path is put
      // back first so the step starts from the path as it was, and the renderer writes the new `d` again.
      if (this.elem.id && before !== null && after !== null && before !== after) {
        restoreAttr(this.elem, 'd', before)
        if (svgCanvas.setElementAttributes(text ?? 'Edit path', this.elem, { d: after })) {
          svgCanvas.call('changed', [this.elem])
          return
        }
        restoreAttr(this.elem, 'd', after)
      }
      svgCanvas.endChanges({ cmd, elem: this.elem })
    }

    addPtsToSelection (indexes: number | number[]): void {
      if (!Array.isArray(indexes)) { indexes = [indexes] }
      indexes.forEach((index) => {
        const seg = this.segs[index]
        if (seg.ptgrip && !this.selected_pts.includes(index) && index >= 0) {
          this.selected_pts.push(index)
        }
      })
      this.selected_pts.sort((a, b) => a - b)
      let i = this.selected_pts.length
      const grips: Array<SVGRectElement | null> = []
      grips.length = i
      // Loop through points to be selected and highlight each
      while (i--) {
        const pt = this.selected_pts[i]
        const seg = this.segs[pt]
        seg.select(true)
        grips[i] = seg.ptgrip
      }

      const closedSubpath = Path.subpathIsClosed(this.selected_pts[0])
      svgCanvas.addPtsToSelection({ grips, closedSubpath })
      this.refreshCtrlPtDisplay()
    }

    // STATIC
    static subpathIsClosed (index: number): boolean {
      let clsd = false
      // Check if subpath is already open
      const path = svgCanvas.getPathObj() as PathObject
      path.eachSeg(function (i) {
        if (i <= index) { return true }
        if (this.type === 2) {
        // Found M first, so open
          return false
        }
        if (this.type === 1) {
        // Found Z first, so closed
          clsd = true
          return false
        }
        return true
      })

      return clsd
    }
  }

  return {
    // Attach the per-instance path helpers + Path class to the canvas (path.js
    // used to import and attach these; it now reads them off the instance).
    replacePathSeg: replacePathSegMethod,
    addPointGrip: addPointGripMethod,
    addCtrlGrip: addCtrlGripMethod,
    setPathGripTitles: setPathGripTitlesMethod,
    getCtrlLine: getCtrlLineMethod,
    getGripPt: getGripPtMethod,
    getPointFromGrip: getPointFromGripMethod,
    PathClass: Path,
    SegmentClass: Segment
  }
}
