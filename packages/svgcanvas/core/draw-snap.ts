/**
 * Snapping while drawing: the point a drawing tool places (the corner of a
 * rectangle, a line's end, a pen anchor, a polygon's centre) snaps to other
 * objects' anchors, bounding-box corners / midpoints / centres and edge lines,
 * and to the page, with the guide lines shown by ext-smart-guides.
 *
 * One entry point, `svgCanvas.drawSnap.snapDrawPoint(x, y)`, called from the pointer
 * prelude in `event.js` (the built-in drawing modes) and from the tool registry
 * (tools that opt in with `snap: true`), so every drawing tool gets the same
 * behaviour. Grid snapping wins when it is on, as in VectorCraft; otherwise this
 * follows the same switch as object-to-object snapping (`smartSnapping`).
 * Targets are collected once per gesture and dropped on mouse-up.
 *
 * Hover: with no button down the same snap shows where a press would land (the ring / guide
 * lines of the gesture), through `svgCanvas.drawSnap.hoverDrawSnap`. It keeps its own target cache,
 * keyed on the mode and the undo history so a change to the drawing rebuilds it, and it
 * clears on leaving the canvas or the snapping modes.
 *
 * @module draw-snap
 * @license MIT
 */

import type SvgCanvas from '../svgcanvas.js'
import { collectPointTargets, snapPoint } from './smart-guides.js'
import type { DrawSnapTargets } from './smart-guides.js'

/** The built-in modes in which a press or drag places a point. The pencil (`fhpath`) is free-hand, so it never snaps. */
const DRAW_SNAP_MODES = new Set([
  'text', 'line', 'foreignObject', 'frame', 'square', 'rect', 'image', 'circle', 'ellipse', 'fhellipse', 'fhrect', 'path'
])

/** Snap distance in screen pixels (divided by zoom to get content units). */
const SNAP_PIXELS = 8

export const isDrawSnapMode = (mode: string): boolean => DRAW_SNAP_MODES.has(mode)

interface Point { x: number, y: number }

/** What the service reads from its canvas. */
type Host = Pick<SvgCanvas, 'getCurConfig' | 'getCurrentMode' | 'getCurrentGroup' | 'getZoom' | 'showDrawGuides' | 'undoMgr' | 'getCurrentDrawing'>

/**
 * `tool`: the caller is a registered tool that opted in (any mode);
 * `exclude`: objects not to snap to (the one being drawn).
 */
export interface DrawSnapOptions {
  tool?: boolean
  exclude?: Element[]
}

/** The snapping-while-drawing service of one canvas (`svgCanvas.drawSnap`). */
export interface DrawSnap {
  /** The snapped point (document units), with its guides drawn, or the input when nothing applies. */
  snapDrawPoint (x: number, y: number, opts?: DrawSnapOptions): Point
  /**
   * The pointer moves over the canvas with no button down: show where a press would snap.
   * Nothing is recorded; the press snaps again on its own. `exclude` is only read when the targets are rebuilt.
   */
  hoverDrawSnap (x: number, y: number, opts?: DrawSnapOptions): Point
  /** Forget the hover's targets and take its guides off the canvas. */
  clearDrawHover (): void
  /** End of a gesture: forget the targets (the drawing has changed); the caller clears the overlay itself. */
  clearDrawSnap (): void
}

export const createDrawSnap = (svgCanvas: Host): DrawSnap => {
  let targets: DrawSnapTargets | null = null

  let hoverTargets: DrawSnapTargets | null = null
  let hoverKey = ''
  /** Whether the overlay currently shows a hover's guides (so only a hover clears them). */
  let hovering = false

  /** Whether a point placed now snaps to other objects. */
  const snapsHere = (opts: DrawSnapOptions): boolean => {
    const config = svgCanvas.getCurConfig()
    if (config.gridSnapping || config.smartSnapping === false) return false
    if (!opts.tool && !DRAW_SNAP_MODES.has(svgCanvas.getCurrentMode())) return false
    // Inside a group the children's boxes are in the group's local space.
    return !svgCanvas.getCurrentGroup()
  }

  /** The snapped point, with its guides drawn. */
  const snapAndShow = (pt: Point, found: DrawSnapTargets): Point => {
    const hit = snapPoint(pt, found, SNAP_PIXELS / svgCanvas.getZoom())
    svgCanvas.showDrawGuides?.(hit.point || hit.xLine || hit.yLine ? { at: { x: hit.x, y: hit.y }, ...hit } : null)
    return { x: hit.x, y: hit.y }
  }

  const snapDrawPoint: DrawSnap['snapDrawPoint'] = (x, y, opts = {}) => {
    if (!snapsHere(opts)) return { x, y }
    hovering = false // a press or drag takes the overlay over from the hover
    targets ??= collectPointTargets(svgCanvas, opts.exclude ?? [])
    return snapAndShow({ x, y }, targets)
  }

  const clearDrawHover: DrawSnap['clearDrawHover'] = () => {
    hoverTargets = null
    if (hovering) {
      hovering = false
      svgCanvas.showDrawGuides?.(null)
    }
  }

  const hoverDrawSnap: DrawSnap['hoverDrawSnap'] = (x, y, opts = {}) => {
    if (!snapsHere(opts)) { clearDrawHover(); return { x, y } }
    // A new shape (a pen path in progress is not an undo step yet) changes the layer's child count.
    const key = [svgCanvas.getCurrentMode(), svgCanvas.undoMgr?.getUndoStackSize(), svgCanvas.undoMgr?.getRedoStackSize(),
      svgCanvas.getCurrentDrawing?.().getCurrentLayer?.()?.childElementCount].join('|')
    if (!hoverTargets || key !== hoverKey) {
      hoverTargets = collectPointTargets(svgCanvas, opts.exclude ?? [])
      hoverKey = key
    }
    const snapped = snapAndShow({ x, y }, hoverTargets)
    hovering = true
    return snapped
  }

  const clearDrawSnap: DrawSnap['clearDrawSnap'] = () => {
    targets = null
    hoverTargets = null
    hovering = false // the caller clears the overlay itself
  }

  return { snapDrawPoint, hoverDrawSnap, clearDrawHover, clearDrawSnap }
}
