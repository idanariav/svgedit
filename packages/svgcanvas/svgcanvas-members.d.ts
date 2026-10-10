/**
 * Members that core modules attach to a canvas at runtime (`svgCanvas.foo = …`
 * in `core/*.js`), so TypeScript can't see them on the class. Declared once
 * here: `svgcanvas.d.ts` merges it into the public class, and `svgcanvas.js`
 * extends it through its base-class type so `@ts-check` knows the surface.
 */
import type { Config, SVGElementJSON, Resolution, BBox, UndoManager, HistoryCommand } from './svgcanvas.js'

export interface ToolMods { shift: boolean, alt: boolean, ctrl: boolean, meta: boolean, mod: boolean }
export interface ToolEvent {
  /** Document units, unzoomed, grid-snapped, in the current group's local space. */
  x: number
  y: number
  /** The same, before grid snapping. */
  rawX: number
  rawY: number
  screenX: number
  screenY: number
  /** Screen pixels moved since the press. */
  dragDistance: number
  mods: ToolMods
  button: number
  event: MouseEvent
}
export interface ToolContext {
  canvas: AttachedMembers & Record<string, any>
  zoom: number
  start?: ToolEvent
  snap(pt: { x: number, y: number }): { x: number, y: number }
  addOverlay(el: Element): void
  clearOverlays(): void
  finishCreated(el: Element, evt?: { altKey?: boolean }): void
}
export interface ToolDef {
  id: string
  activate?(ctx: ToolContext): void
  deactivate?(ctx: ToolContext): void
  /** Return false to decline; the legacy pipeline then handles the press. */
  pointerDown(ctx: ToolContext, ev: ToolEvent): void | false
  pointerMove?(ctx: ToolContext, ev: ToolEvent): void
  /** 'cancel' rolls the gesture back; `{ created }` finishes a new element. */
  pointerUp?(ctx: ToolContext, ev: ToolEvent): void | 'cancel' | { created?: Element }
  keyDown?(ctx: ToolContext, ev: KeyboardEvent): boolean
  cancel?(ctx: ToolContext): void
  undoLabel?: string
  wantsHover?: boolean
  /** Snap `ev.x` / `ev.y` to other objects' anchors, boxes and the page (default false). */
  snap?: boolean
  keepOpacity?: boolean
}

export interface AttachedMembers {
  setSvgString(xmlString: string, preventUndo?: boolean): boolean
  clearSelection(noCall?: boolean): void
  getResolution(): Resolution
  setResolution(width: number | string, height: number | string): boolean
  
  // Element manipulation
  moveSelectedElements(dx: number, dy: number, undoable?: boolean): void
  deleteSelectedElements(): void
  copySelectedElements(): void
  pasteElements(type?: string, x?: number, y?: number, data?: unknown[]): void
  groupSelectedElements(type?: string, urlArg?: string): Element | null
  ungroupSelectedElement(): void
  moveToTopSelectedElement(): void
  moveToBottomSelectedElement(): void
  moveUpDownSelected(dir: 'Up' | 'Down'): void
  
  // Path operations
  pathActions: {
    clear: (keepSelection?: boolean) => void
    canDeleteNodes?: boolean
    closed_subpath?: boolean
    resetOrientation: (path: SVGPathElement) => boolean
    zoomChange: () => void
    getNodePoint: () => {x: number, y: number}
    linkControlPoints: (linkPoints: boolean) => void
    clonePathNode: () => void
    deletePathNode: () => void
    averageSelectedNodes: (axis?: 'h' | 'v' | 'both') => void
    addAnchorPoints: () => void
    smoothPolylineIntoPath: () => void
    setSegType: (type: number) => void
    moveNode: (attr: string, newValue: number) => void
    selectNode: (node?: Element) => void
    opencloseSubPath: () => void
    hover: (mouseX: number | null, mouseY: number | null, mode?: string) => void
  }
  getNumLayers(): number
  getLayer(name: string): any
  getCurrentLayerName(): string
  setCurrentLayer(name: string): boolean
  renameCurrentLayer(newName: string): boolean
  setCurrentLayerPosition(newPos: number): boolean
  setLayerVisibility(name: string, bVisible: boolean): void
  moveSelectedToLayer(layerName: string): void
  cloneLayer(name?: string): void
  deleteCurrentLayer(): boolean
  
  // Undo/Redo
  undoMgr: UndoManager
  undo(): void
  redo(): void
  unbind(event: string, callback: Function): void
  /**
   * Start recording every change to the drawing as ONE undo step (core/transaction.js).
   * Nested calls join the outermost transaction. `commit()` returns the pushed
   * batch, or null when nothing net-changed; `cancel()` restores the drawing and selection.
   */
  beginTransaction(label: string, options?: { selection?: boolean, onAbort?: () => void }): { label: string, commit(): HistoryCommand | null, cancel(): void }
  /** Run `fn` as one undo step; a throw rolls the drawing back and rethrows. `fn` must be synchronous. */
  transact<T>(label: string, fn: () => T): T
  inTransaction(): boolean
  /**
   * Register a tool whose id is the mode name `setMode(id)` switches to (core/tool-registry.js).
   * Events arrive in document units; each press-to-release gesture is one undo step.
   */
  registerTool(def: ToolDef): void
  unregisterTool(id: string): boolean
  hasTool(id: string): boolean
  /** Finish a newly created element like a drawn shape (opacity, events, select it unless locked). */
  finishCreatedElement(el: Element, evt?: { altKey?: boolean }, opts?: { keepOpacity?: boolean }): void
  /** Structural health check of the current drawing (core/drawing-invariants.js); an empty list means healthy. */
  checkDrawing(): Array<{ code: string, message: string, id?: string }>
  
  // Attribute manipulation
  changeSelectedAttribute(attr: string, val: string | number, elems?: Element[]): void
  changeSelectedAttributeNoUndo(attr: string, val: string | number, elems?: Element[]): void
  
  // Canvas properties
  contentW: number
  contentH: number
  
  // Text operations
  textActions: any
  embedImage(dataURI: string): Promise<Element>
  
  // Other utilities
  getPrivateMethods(): any

  // Layers
  /** Show/dim layers other than the current one (all-layers editing mode). */
  setAllLayersMode(bAllLayers: boolean): void

  // View
  /** Zoom to `zoomlevel`, keeping the point under (clientX, clientY) fixed. */
  zoomAtPoint(zoomlevel: number, clientX: number, clientY: number): void

  // Content
  /** Insert raw SVG child markup into the current layer/group as one undoable
   *  step (selects it, fires `changed`). Returns the new elements, or null if
   *  the markup couldn't be parsed. */
  insertSvgFragment(xmlFragment: string): Element[] | null
  /** Grow (delta > 0) or shrink (delta < 0) the selected shape's outline. */
  offsetPath(delta: number): void
  /** Interactive region-merge session over the given (or selected) elements. */
  shapeBuilder: {
    begin(elems?: Element[]): any
    /** Index of the region under (x, y), or -1. */
    hitTest(x: number, y: number): number
    apply(indices: number[], mode?: 'merge' | string): Element[] | null
    end(): void
  }
  runExtensions(action: string, vars?: any, returnArray?: boolean): any

  /** Strip disallowed elements/attributes from `node` in place (per-instance). */
  sanitizeSvg(node: Element): void
  addToSelection(elemsToAdd: ArrayLike<Element>, showGrips?: boolean): void
  cloneSelectedElements(x: number, y: number): void
  alignSelectedElements(type: string, relativeTo: string): void
  flipSelectedElements(scaleX: number, scaleY: number): void
  /** Select the next (true) or previous (false) element in the current layer. */
  cycleElement(next: boolean): void

  // Element creation / lookup
  addSVGElementsFromJson(data: SVGElementJSON): Element
  getStrokedBBox(elems?: Element[]): BBox | null
  insertChildAtIndex(parent: Element, child: Node, index?: number): void
  findDefs(): Element
  setColor(type: 'fill' | 'stroke' | string, val: string, preventUndo?: boolean): void
  setStrokeWidth(val: number): void
  convertUnit(val: number, unit?: string): number
  /** Serialise the content to an SVG string (without `getSvgString` wrapping). */
  svgCanvasToString(): string

  // Layers
  setLayerLocked(layerName: string, locked: boolean): void

  // Events
  /** `modeChange` event dispatched by `setMode`. */
  modeEvent: CustomEvent<{ getMode: () => string }>

  // Text
  getBold(): boolean
  getItalic(): boolean
  hasTextDecoration(value: string): boolean
  setTextAnchor(value: string): void
  setWordSpacing(value: number | string): void
  setTextLength(value: number | string): void
  setTextContent(val: string): void
  setTextPerspectiveX(val: number): void
  setTextPerspectiveY(val: number): void
  /** Move the selected text-on-path start offset to `pct` percent. */
  textPathOffset(pct: number): void
  attachTextToPath(): void

  // Attributes / metadata
  getTitle(elem?: Element): string | undefined
  setGroupTitle(val: string): void
  setPaint(type: 'fill' | 'stroke' | string, paint: unknown): void
  setStrokeAttr(attr: string, val: string | number): void
  setImageURL(val: string): void
  setSegType(newType: number): void
  isValidUnit(attr: string, val: string, selectedElement?: Element): boolean
  getElement(id: string): Element | null | undefined

  // Layers / content
  createLayer(name?: string, hrService?: unknown): unknown
  indexCurrentLayer(): number
  importSvgString(xmlString: string, preserveDimension?: boolean): Element | null
  getJsonFromSvgElements(data: Element): SVGElementJSON
  strokeToPath(): void
  transformAgain(): void

  // Text (continued)
  setBold(b: boolean): void
  setItalic(i: boolean): void
  setFontSize(val: number): void
  setFontFamily(val: string): void
  setLetterSpacing(value: number | string): void
  setLengthAdjust(value: string): void
  addTextDecoration(value: string): void
  removeTextDecoration(value: string): void
  getTextWithNewlines(elem: Element): string
  getTextPerspectiveX(elem: Element): number
  getTextPerspectiveY(elem: Element): number
  detachTextFromPath(): void
  releaseTextOnPath(removing: Element[], batchCmd: import("./core/history.js").BatchCommand): Element[]
  selectSameAs(criterion: string, options?: { tolerance?: number }): void
  /** The drawing's ruler guides (`se:guides` on the root): `v` = x positions of vertical lines, `h` = y positions of horizontal ones. */
  getGuides(): { v: number[]; h: number[] }
  /** Replace the ruler guides as one undo step; false when nothing changed. */
  setGuides(guides: { v?: number[]; h?: number[] }, label?: string): boolean
  /** Whether dashes are fitted on every one of the elements (default: the selection). */
  isDashFitted(elems?: Element[]): boolean
  /** Why the element cannot have its dashes fitted, or null. */
  dashFitIssue(elem: Element): string | null
  /** Fit the dashes of the elements (or turn the fit off) as one undo step; returns how many changed. */
  setDashFit(on: boolean, elems?: Element[]): number
  /** Choose a dash pattern for the selection (fitted elements are fitted again); false when nothing is fitted. */
  setDashPattern(value: string): boolean
  /** Whether the element's ends can carry an aligned arrowhead (a line, polyline or one open path with its own geometry). */
  canAlignArrows(elem: Element | null): boolean
  /** The element's head alignment (`se:arrow-align`), or null for the legacy centred heads. */
  getArrowAlign(elem: Element): 'tip' | 'extend' | null
  /** Set (or with null clear) the alignment and re-derive markers and geometry; records no history. */
  setArrowAlign(elem: Element, mode: 'tip' | 'extend' | null): boolean
  /** Re-derive an aligned element's marker `refX` and trimmed geometry; returns whether the geometry changed. */
  syncArrowAlign(elem: Element, trusted?: boolean): boolean
  /** The distance a connector keeps an aligned head's end from its shape, or null when not aligned. */
  getArrowOffset(elem: Element, pos: 'start' | 'end'): number | null
  /** The untrimmed points of an aligned line or polyline, or null. */
  getArrowSourcePoints(elem: Element): Array<{ x: number; y: number }> | null
  /** Replace the untrimmed points of an aligned line or polyline and trim again. */
  setArrowSourcePoints(elem: Element, pts: Array<{ x: number; y: number }>): boolean
  /** Whether a width profile can be put on the element (a stroked line, polyline or path, open or closed). */
  canWidthStroke(elem: Element | null): boolean
  /** The element's (default: the selection's) width profile as `[t, left, right]` points, or null. */
  getWidthProfile(elem?: Element): Array<[number, number, number]> | null
  /** A line or polyline as an equivalent path, in place, without history (inside a transaction). */
  widthStrokeAsPath(elem: Element): Element
  /** Draw a path with a width profile from its stored centerline, without history; false if nothing could be drawn. */
  drawWidthProfile(elem: Element, points: Array<[number, number, number]>): boolean
  /** Give the selected strokes a width profile as one undo step; returns the elements that took it. */
  applyWidthProfile(points: Array<[number, number, number]>): Element[]
  switchSelectedZorder(): void
  matchStrokes(): void
  setRotationAngle(val: number, preventUndo?: boolean): void
  setRectRadius(val: number): void
  setCircleArc(arcDegrees: number): void
  setCircleArcAttr(attr: string, val: number): void
  setBBoxZoom(val: 'selection' | 'canvas' | 'content' | 'layer' | object, editorW: number, editorH: number): any
  getVisibleElements(parentElement?: Element): Element[]
  getRefElem(attrVal: string | null): Element | null
  setBlur(val: number, complete?: boolean): void
  setFeather(px: number): void
  releaseClipMask(): void
  makeHyperlink(url: string): void
  removeHyperlink(): void
  setLinkURL(val: string): void
  setBackground(color: string, url?: string, gradientElem?: Element): void

  // Path tools
  previewSmoothPath(strength?: number): void
  commitSmoothPath(): void
  cancelSmoothPath(): void
  applyTaperStroke(opts?: { start?: number, end?: number }): void
  removeTaperStroke(): void
  applyCornerRadius(r?: number, opts?: { kind?: 'r' | 'i' | 'c', corners?: number[] }): Element | null
  canRoundCorners(elem: Element): boolean
  canJoinPaths(elems: Element[]): boolean
  joinSelectedPaths(): Element | null
  getCornerSettings(elem?: Element): Array<{ index: number, radius: number, kind: 'r' | 'i' | 'c', max: number }>

  // Live effects (se:fx stack)
  registerLiveEffect(name: string, def: object): void
  listLiveEffects(): Array<{ name: string, label: string, defaults: Record<string, number | boolean | string>, choices?: Record<string, string[]>, ranges?: Record<string, { min?: number, max?: number, step?: number }> }>
  canApplyLiveEffect(elem: Element): boolean
  reconcileLiveEffects(elem: Element): boolean
  /** Live stack (`core/live-stack.js`): null when the element is not stacked, else whether its stack is still current (stale stacks are dropped). */
  reconcileLiveStack(elem: Element): boolean | null
  isLiveStacked(elem: Element): boolean
  getLiveEffects(): Array<{ name: string, params: Record<string, number | boolean | string> }>
  previewLiveEffects(stack: Array<{ name: string, params?: object }>): void
  cancelLiveEffectsPreview(): void
  applyLiveEffects(stack: Array<{ name: string, params?: object }>): Element | null
  removeLiveEffects(): Element | null
  expandLiveEffects(): Element | null

  // Image crop
  applyImageCrop(): Promise<void>
  cancelImageCrop(): void

  // Layers / document
  setLayerComment(layerName: string, comment: boolean): void
  mergeLayer(hrService?: unknown): void
  mergeAllLayers(hrService?: unknown): void
  // Event handlers (core/event.js) and selection internals
  mouseDownEvent(evt: Event): void
  mouseMoveEvent(evt: Event): void
  dblClickEvent(evt: Event): void
  mouseUpEvent(evt: Event): void
  mouseOutEvent(evt: Event): void
  DOMMouseScrollEvent(evt: Event): void
  /** Per-canvas selector box manager (core/select.js). */
  selectorManager: any
  SelectorClass: any
  updateGroupSelector(elem?: Element): void
  clearSvgContentElement(): void
  getDisabledElems(): Element[]
  getPathObj(): any

  // Host-facing helpers (called from the editor and extensions)
  /** History helpers (`HistoryCommand` classes, `UndoManager`, …). */
  history: any
  NS: Record<string, string>
  svgroot: SVGSVGElement
  curConfig: Config
  $id: (id: string) => Element | null
  $qa: (selector: string) => Element[]
  getBrushParams(): any
  setBrushParams(params: object): any
  getCurShape(): any
  getContentH(): number
  getNonceId(base?: string): string
  getHref(elem: Element): string | null
  setHref(elem: Element, val: string): void
  getRotationAngle(elem?: Element, toRad?: boolean): number
  getEditorNS(add?: boolean): string
  getTypeMap(): Record<string, number>
  convertToNum(attr: string, val: string): number
  getReferencedDefElements(elem: Element): Element[]
  getParents(node: Node, selector?: string): Element[]
  isLayer(elem: Element): boolean
  hasVisibleStroke(elem: Element): boolean
  mergeDeep(target: any, source: any): any
  encode64(input: string): string
  registerGeometryRemap(attrName: string, remapFn: Function): void
  remapElementIdsAndRefs(rootEls: Element[], getNewId: () => string): Record<string, string>
  uniquifyElems(g: Element): void
  recalculateDimensions(selected: Element): any
  updateCanvas(w: number, h: number): any
  setCurrentZoom(zoomLevel: number): void
  setContext(elem: Element | string): void
  leaveContext(): void
  /** Undo the in-group dimming; call the returned function to re-apply it. */
  suspendContextDimming(): () => void
  rasterExport(imgType?: string, quality?: number, windowName?: string, opts?: object): Promise<any>

  // Clip / mask / boolean / segment / taper / crop
  setClip(): void
  setMask(): void
  getFeather(elem: Element): number
  booleanUnion(): void
  booleanSubtract(): void
  booleanIntersect(): void
  booleanExclude(): void
  booleanDivide(): void
  canSegment(elem: Element): boolean
  segmentSelection(params: object): any
  getSegmentParams(): any
  canTaperStroke(elem: Element): boolean
  getTaperParams(): any
  canTextOnPath(): boolean
  simplifyPathD(d: string, tolerance?: number): string
  cutShapes(points: Array<{ x: number, y: number }>): any
  startImageCrop(imageElem: Element): any
  isImageCropEligible(elem: Element): boolean
}
