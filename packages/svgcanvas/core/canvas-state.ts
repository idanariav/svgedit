/**
 * The session/UI state of one canvas (`svgCanvas.state`), grouped by concern: zoom, selection, current styles, history
 * scratch and the drawing gesture's working values. The shape only; the constructor in `svgcanvas.js` fills it in and
 * the `getX` / `setX` accessors over it live on the class.
 * @module canvas-state
 * @license MIT
 */
import type { BBox } from '../svgcanvas.js'
import type { BatchCommand } from './history.js'
import type { PathElement } from './path-types.ts'

export interface XY { x: number, y: number }

/** What the panels keep of the current paint (a `Paint`, or just `{ type: 'solidColor' }`). */
export interface PaintState { type: string }

/** An element and its stroked bounding box, as the rubber band caches them (`getIntersectionList`). */
export interface ElementAndBBox { elem: Element, bbox: BBox | null }

/** The current fill/stroke/text style (snake_case keys, as the editor's panels read them). */
export interface StyleProps {
  fill: string
  fill_paint: PaintState | null
  fill_opacity: number | string
  stroke: string
  stroke_paint: PaintState | null
  stroke_opacity: number | string
  stroke_width: number | string
  stroke_dasharray: string
  stroke_linejoin: string
  stroke_linecap: string
  opacity: number | string
  font_size?: number | string
  font_family?: string
}

/** Active brush-tool settings (session state, not persisted). */
export interface BrushParams {
  thickness: number
  angle: number
  roundness: number
  taperStart: number
  taperEnd: number
  opacity: number
  smoothness: number
}

export interface CanvasState {
  zoom: { value: number, rootSctm: DOMMatrix | null }
  selection: {
    elements: Element[]
    currentGroup: Element | null
    justSelected: Element | null
    rubberBox: Element | null
    bboxes: ElementAndBBox[]
  }
  style: { shape: StyleProps, text: StyleProps, brush: BrushParams, properties: StyleProps }
  history: { curCommand: BatchCommand | null }
  drawing: {
    started: boolean
    startTransform: string | null
    currentMode: string
    toolLocked: boolean
    textFreshCreate: boolean
    currentResizeMode: string
    lastClickPoint: XY | null
    drawnPath: PathElement | null
    freehand: { minx: number, miny: number, maxx: number, maxy: number }
    dAttr: string | null
    startX: number
    startY: number
    rStartX: number
    rStartY: number
    /** The box a resize started from (the stroked bounding box of the selection). */
    initBbox: BBox
    sumDistance: number
    controllPoint1: XY
    controllPoint2: XY
    start: XY
    end: XY
    bSpline: XY
    nextPos: XY
    filter: Element | null
    filterHidden: boolean
  }
}
