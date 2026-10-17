/**
 * Types of the path node editor: a path segment as `path-seg-shim.js` models it, the `Segment` and `Path` wrappers that `path-method.ts` builds over it, and the `pathSegList` API of a path element.
 * @module path-types
 * @license MIT
 */

/**
 * One segment of a path. Which of the numeric fields exist depends on `pathSegType` (an `M` / `L` has only `x` and `y`, a cubic has all six), so
 * code reads `x1` / `x2` only after checking `'x1' in item`.
 */
export interface PathSegItem {
  pathSegType: number
  x: number
  y: number
  x1: number
  y1: number
  x2: number
  y2: number
  [prop: string]: number
}

/** The segment list of a path element (the SVG 1.1 `SVGPathSegList`, which `path-seg-shim.js` provides where the browser dropped it). */
export interface PathSegListApi {
  readonly numberOfItems: number
  getItem(index: number): PathSegItem
  replaceItem(seg: PathSegItem, index: number): PathSegItem
  insertItemBefore(seg: PathSegItem, index: number): PathSegItem
  appendItem(seg: PathSegItem): PathSegItem
  removeItem(index: number): PathSegItem
  clear(): void
}

/** A `<path>` with the shim's `pathSegList`. The `createSVGPathSeg*` factories are looked up by name, so they are not listed. */
export type PathElement = SVGPathElement & {
  pathSegList: PathSegListApi
  createSVGPathSegClosePath(): PathSegItem
  createSVGPathSegLinetoAbs(x: number, y: number): PathSegItem
  createSVGPathSegCurvetoCubicAbs(x: number, y: number, x1: number, y1: number, x2: number, y2: number): PathSegItem
}

/** The grips and guide lines of a curve segment's two control points. */
export interface CtrlPoints {
  c1: SVGCircleElement
  c2: SVGCircleElement
  c1_line: SVGLineElement
  c2_line: SVGLineElement
}

/** A segment of the path being edited, with its grips and its neighbours. */
export interface PathSegment {
  selected: boolean
  index: number
  item: PathSegItem
  type: number
  /** The curve this segment was before it was turned into a line, so toggling back restores its handles. */
  olditem: PathSegItem | undefined
  ctrlpts: CtrlPoints | null
  ptgrip: SVGRectElement | null
  segsel: SVGPathElement | null
  /** Linked up by `PathObject.init()`. */
  path: PathObject | null
  prev: PathSegment | null
  next: PathSegment | null
  /** The `M` segment of a closed subpath, on the subpath's last real segment. */
  mate: PathSegment | null
  showCtrlPts(y: boolean): void
  showCtrlPt(which: 'c1' | 'c2', y: boolean): void
  selectCtrls(y: boolean): void
  show(y: boolean): void
  select(y: boolean): void
  addGrip(): void
  update(full?: boolean): void
  move(dx: number, dy: number): void
  setLinked(num: number): void
  moveCtrl(num: number, dx: number, dy: number): void
  setType(newType: number, pts: number[]): void
}

/** The path being edited: its segments, selected nodes and grips. */
export interface PathObject {
  elem: PathElement
  segs: PathSegment[]
  selected_pts: number[]
  first_seg: PathSegment | null
  /** `d` before the edit in progress, for the undo step. */
  last_d: string | null
  /** The control handle (1 or 2) being dragged. */
  dragctrl: number | false | undefined
  /** Where the node drag started, while one is under way. */
  dragging?: [number, number] | false
  /** The path's transform up to content space, and its inverse; `null` when it is the identity. */
  matrix: SVGMatrix | null
  imatrix: SVGMatrix | null
  /** The path's bbox from before a rotation (see `recalcRotatedPath`). */
  oldbbox?: { x: number, y: number, width: number, height: number } | null
  setPathContext(): void
  init(): PathObject
  /** Calls `fn` with each segment as `this`; returning `false` stops the walk. */
  eachSeg(fn: (this: PathSegment, index: number) => boolean | void): void
  addSeg(index: number): void
  removePtFromSelection(index: number): void
  clearSelection(): void
  refreshCtrlPtDisplay(): void
  storeD(): void
  show(y: boolean): PathObject
  movePts(dx: number, dy: number): void
  moveCtrl(dx: number, dy: number): void
  /** `newType` is an SVG path segment type number; without one the selected segments toggle between line and curve. */
  setSegType(newType?: number | null): void
  smoothSelectedNodes(): void
  selectPt(pt?: number | null, ctrlNum?: number): void
  update(): PathObject
  /** Records the edit as one undo step and logs it (`detail` is merged into the `path-commit` debug event). */
  endChanges(text?: string, detail?: object): void
  addPtsToSelection(indexes: number | number[]): void
}

export interface PathClassApi {
  new (elem: SVGPathElement): PathObject
  subpathIsClosed(index: number): boolean
}

export interface SegmentClassApi {
  new (index: number, item: PathSegItem): PathSegment
}
