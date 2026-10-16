/**
 * Canvas members that exist at runtime but are deliberately NOT part of the
 * typed public API: internal state accessors and module plumbing that `core/*`
 * attaches to the instance (nothing in the editor or extensions calls them).
 * To make one public, move its declaration to
 * `svgcanvas-members.d.ts`. `tests/unit/svgcanvas-dts-drift.test.js` requires every runtime member to be
 * declared either there or here, and `tsc` checks each module's assignment (`svgCanvas.x = fn`) and each class
 * method against these types.
 *
 * Grouped by the file that owns the member. The eleven typed `any` at the end wait for their module's conversion
 * (rearchitecture R3): the `Path`, `Segment` and `SelectorManager` classes are defined inside the `init` of
 * `path-method.js` / `select.js`, and the drawn-path accessors hand out a path element that still uses the legacy
 * `pathSegList` API (`path-seg-shim`).
 */
import type { SVGElementJSON, BBox } from './svgcanvas.js'
import type { StyleProps, XY, ElementAndBBox, CanvasState } from './core/canvas-state.ts'
import type { BatchCommand, ChangeElementCommand } from './core/history.js'
import type { BBoxObject } from './core/bbox-utils.ts'
import type { Drawing } from './core/draw.js'
import type { PenEnd } from './core/pen-continue.ts'
import type { Units } from './core/units.ts'

/** What `importSvgString` remembers per imported file, to reuse its `<symbol>`. */
export interface ImportEntry { symbol: Element, xform: string }

export interface InternalMembers {
  // --- the class (`svgcanvas.js`): state accessors and fields ---
  $click(element: EventTarget, handler: EventListener): void
  $qq(sel: string): Element | null
  addPtsToSelection(points: { closedSubpath: boolean, grips: unknown }): void
  assignAttributes(elem: Element, attrs: Record<string, string | number | undefined>, suspendLength?: number | undefined, unitCheck?: boolean | undefined): void
  changeSvgContent(): void
  cleanupElement(element: Element): void
  container: HTMLElement
  createSVGElement(jsonMap: SVGElementJSON): Element
  current_drawing_: Drawing
  cursorHintValue: string | null
  decode64(input: string): string
  destroyAbort: AbortController
  encodableFonts: Record<string, string>
  encodableImages: Record<string, string | false>
  endChanges(change: { cmd: ChangeElementCommand, elem: SVGPathElement }): void
  extensions: Record<string, unknown>
  flashStorage(): void
  getBaseUnit(): string | undefined
  getClosest(elem: Element, selector: string): Element | null
  getContainer(): HTMLElement
  getControllPoint1(key: 'x' | 'y'): number
  getControllPoint2(key: 'x' | 'y'): number
  getCurBBoxes(): ElementAndBBox[]
  getCurCommand(): BatchCommand | null
  getCurProperties<K extends keyof StyleProps>(key: K): StyleProps[K] | null
  /** An element without the attribute stores `null` (events copy the selection's style here). */
  getCurText<K extends keyof StyleProps>(key: K): StyleProps[K] | null
  getCurrentMode(): string
  getCurrentResizeMode(): string
  getDAttr(): string | null
  getDOMContainer(): HTMLElement
  getDrawing(): Drawing
  getEncodableFonts(): Record<string, string>
  getEncodableImages(key: string): string | false | undefined
  getEnd(key: 'x' | 'y'): number
  getFillOpacity(): number | string
  getFilter(): Element | null
  getFilterHidden(): boolean
  getFreehand(key: 'minx' | 'miny' | 'maxx' | 'maxy'): number
  getGridShape(): string
  getGridSnapping(): boolean | undefined
  getHeight(): number
  getId(): string
  getIdPrefix(): string
  getImportIds(key: string | number): ImportEntry | undefined
  getInitBbox(): BBox
  getJustSelected(): Element | null
  getLastClickPoint(key: 'x' | 'y'): number | undefined
  getLastGoodImgUrl(): string
  getNextIdWithPrefix(prefix: string): string
  getNextParameter(): number
  getNextPos(key: 'x' | 'y'): number
  getNsMap(): Record<string, string>
  getOffset(): XY
  getOpacAni(): SVGAnimateElement
  getParameter(): number
  getRStartX(): number
  getRStartY(): number
  getRoundDigits(): number
  getRubberBox(): Element
  getSnappingStep(): number | undefined
  getStart(key: 'x' | 'y'): number
  getStartTransform(): string | null
  getStartX(): number
  getStartY(): number
  getStarted(): boolean
  getStepCount(): number
  getStrokeOpacity(): number | string
  getStyle(): StyleProps
  getSumDistance(): number
  getSvgOptionApply(): boolean | undefined
  getSvgOptionImages(): string | undefined
  getTextFreshCreate(): boolean
  getThreSholdDist(): number
  getUrlFromAttr(attrVal: string | null | undefined): string | null
  getVisElems(): string
  getWidth(): number
  getbSpline(key: 'x' | 'y'): number
  getrefAttrs(): string[]
  getrootSctm(): DOMMatrix
  hasMatrixTransform(tlist?: SVGTransformList | undefined): boolean
  idprefix: string
  importIds: Record<string, ImportEntry>
  initializeSvgCanvasMethods(): void
  lastGoodImgUrl: string
  linkControlPoints(linkPoints: boolean): void
  matrixMultiply(...args: DOMMatrix[]): DOMMatrix
  modeChangeEvent(): void
  nsMap: Record<string, string>
  opacAni: SVGAnimateElement
  randIdsMode: number
  removedElements: Record<string, Element>
  restoreRefElements(elem: Element): void
  round(val: number): number
  saveOptions: { round_digits: number, apply?: boolean, images?: string, [key: string]: unknown }
  scopeRoot: ParentNode | null
  setCanvas(key: string, value: unknown): void
  setControllPoint1(key: 'x' | 'y', value: number): void
  setControllPoint2(key: 'x' | 'y', value: number): void
  setCurBBoxes(value: ElementAndBBox[]): void
  setCurCommand(value: BatchCommand | null): void
  setCurProperties<K extends keyof StyleProps>(key: K, value: StyleProps[K] | null): void
  setCurShape<K extends keyof StyleProps>(key: K, value: StyleProps[K] | null): void
  setCurText<K extends keyof StyleProps>(key: K, value: StyleProps[K] | null): void
  setCurrentGroup(cg: Element | null): void
  setCurrentMode(cm: string): string
  setCurrentResizeMode(value: string): void
  setDAttr(value: string | null): void
  setEmptySelectedElements(): void
  setEncodableImages(key: string, value: string | false): void
  setEnd(key: 'x' | 'y', value: number): void
  setFilter(value: Element | null): void
  setFilterHidden(value: boolean): void
  setFreehand(key: 'minx' | 'miny' | 'maxx' | 'maxy', value: number): void
  setGoodImage(val: string): void
  setImportIds(key: string | number, value: ImportEntry): void
  setInitBbox(value: BBoxObject): void
  setJustSelected(value: Element | null): void
  setLastClickPoint(value: XY | null): void
  setNextParameter(value: number): void
  setNextPos(value: XY): void
  setPaintOpacity(type: string, val: number, preventUndo: boolean): void
  setParameter(value: number): void
  setRStartX(value: number): void
  setRStartY(value: number): void
  setRemovedElements(key: string, value: Element): void
  setRootSctm(value: DOMMatrix | null): void
  setRubberBox(rb: Element | null): Element | null
  setSelectedElements(key: number, value: Element): void
  setStart(value: XY): void
  setStartTransform(transform: string | null): void
  setStartX(value: number): void
  setStartY(value: number): void
  getCursorHint(): string | null
  setStarted(s: boolean): void
  setSumDistance(value: number): void
  setSvgContent(value: SVGSVGElement): void
  setTextFreshCreate(b: boolean): boolean
  setbSpline(value: XY): void
  state: CanvasState
  stringToHTML(str: string): ChildNode | null
  svgContent: SVGSVGElement
  svgdoc: Document
  transformListToTransform(tlist: SVGTransformList | null | undefined, min?: number, max?: number | null): SVGTransform
  units: Units
  // --- `core/bbox-utils.ts` ---
  getBBox(elem?: Element | undefined): BBoxObject | null
  // --- `core/blur-event.js` ---
  setBlurNoUndo(val: number): void
  setBlurOffsets(filterElem: Element, stdDev: number): void
  // --- `core/coords.js` ---
  remapElement(selected: Element, changes: Record<string, unknown>, m: DOMMatrix): void
  // --- `core/dom-utils.ts` ---
  snapPointToGrid(x: number, y: number): XY
  // --- `core/draw.js` ---
  withContextUndimmed<T>(fn: () => T): T
  // --- `core/elem-get-set.js` ---
  setDocumentTitle(newTitle: string): void
  setGradient(type: 'fill' | 'stroke'): void
  // --- `core/group-ops.js` ---
  pushGroupProperties(g: SVGAElement | SVGGElement, undoable: boolean): void | BatchCommand
  // --- `core/layer-ops.ts` ---
  getAllLayersMode(): boolean
  getLayerComment(layerName: string): boolean
  getLayerLocked(layerName: string): boolean
  identifyLayers(): void
  // --- `core/path-method.js` ---
  addCtrlGrip(id: string | number): SVGCircleElement
  addPointGrip(index: number, x?: number | undefined, y?: number | undefined): SVGRectElement
  getCtrlLine(id: string | number): SVGLineElement
  replacePathSeg(type: number, index: number, pts: number[], elem?: Element): void
  // --- `core/path-simplify.ts` ---
  simplifyFreehand(element: Element, fidelity?: number): Element
  pencilEnd(x: number, y: number): PenEnd | null
  continueFreehand(polyline: Element, end: PenEnd, fidelity?: number): Element
  // --- `core/path.js` ---
  clearData(): void
  getLinkControlPts(): boolean
  getPathFuncs(): (string | number)[]
  getSegData(): Record<number, string[]>
  recalcRotatedPath(): void
  removePath_(id: string): void
  reorientGrads(elem: Element, m: DOMMatrix): void
  setLinkControlPoints(lcp: boolean): void
  smoothControlPoints(ct1: XY, ct2: XY, pt: XY): XY[] | undefined
  // --- `core/recalculate.js` ---
  updateClipPath(attr: string, tx: number, ty: number, elem?: Element | undefined): string | undefined
  // --- `core/selection.js` ---
  getIntersectionList(rect?: BBox): Element[] | null
  groupSvgElem(elem: Element): void
  prepareSvg(newDoc: XMLDocument): void
  recalculateAllSelectedDimensions(): void
  // --- `core/svg-defs.ts` ---
  convertDropShadowFilters(elem: Element): void
  convertGradients(elem: Element): void
  removeUnusedDefElems(): number
  setUseData(parent: Element): void
  // --- `core/svg-exec.js` ---
  svgToString(elem: Element, indent: number): string
  // --- `core/text-attrs.js` ---
  getText(): string
  setFontColor(val: string): void
  setMultilineText(elem: Element, value: string): void
  // --- `core/tool-registry.ts` ---
  activeToolSnaps(): boolean
  cancelToolGesture(): void
  toolHover(evt: MouseEvent): void
  toolModeChanged(prev: string, next: string): void
  toolPointerDown(evt: MouseEvent): boolean
  toolPointerMove(evt: MouseEvent): boolean
  toolPointerUp(evt: MouseEvent): boolean
  // --- typed with their module (see the header) ---
  /** @internal (path-method.js) */
  PathClass: any
  /** @internal (path-method.js) */
  SegmentClass: any
  /** @internal (select.js) */
  SelectorManagerClass: any
  /** @internal (select.js) */
  getSelector(...args: any[]): any
  /** @internal (select.js) */
  getSelectorManager(...args: any[]): any
  /** @internal (path.js) */
  getPath_(...args: any[]): any
  /** @internal (path.js) */
  setPathObj(...args: any[]): any
  /** @internal (path-method.js) */
  getGripPt(...args: any[]): any
  /** @internal (path-method.js) */
  getPointFromGrip(...args: any[]): any
  /** @internal (path-seg-shim legacy API) */
  getDrawnPath(...args: any[]): any
  /** @internal (path-seg-shim legacy API) */
  setDrawnPath(...args: any[]): any
  // --- EventTarget (the class extends it; declared so `svgcanvas-dts-drift` sees them) ---
  addEventListener: EventTarget['addEventListener']
  dispatchEvent: EventTarget['dispatchEvent']
  removeEventListener: EventTarget['removeEventListener']
}
