/**
 * Members that core modules attach to a canvas at runtime (`svgCanvas.foo = …`
 * in `core/*.js`), so TypeScript can't see them on the class. Declared once
 * here: `svgcanvas.d.ts` merges it into the public class, and `svgcanvas.js`
 * extends it through its base-class type so `@ts-check` knows the surface.
 */
import type { Config, SVGElementJSON, Resolution, BBox, UndoManager, HistoryCommand } from './svgcanvas.js'
import type { ToolDef, ToolOption } from './core/tool-registry.ts'
import type { ExtensionHookPayloads } from './core/extension-hooks.ts'
import type { BrushParams, StyleProps } from './core/canvas-state.ts'
import type { Command } from './core/history.js'
import type { SnapTarget, SmartGuidesPayload, DrawGuidesPayload } from './core/smart-guides.ts'
import type { PathNodeGuidesPayload } from './core/path-node-guides.ts'
import type { SelectorManagerApi, SelectorClassApi } from './core/select.ts'
import type { ProportionSnapGuides } from './core/proportions.ts'
import type { SegmentParams } from './core/segment.ts'

/** The text-edit session (`core/text-actions.ts`): the caret, the selection and the hidden textarea behind them. */
export interface TextActionsApi {
  select(target: SVGTextElement, x: number, y: number): void
  start(elem: SVGTextElement): void
  mouseDown(evt: MouseEvent, mouseTarget: Element, startX: number, startY: number): void
  mouseMove(mouseX: number, mouseY: number): void
  mouseUp(evt: MouseEvent, mouseX: number, mouseY: number): void
  /** Whether the key was handled (only area text is). */
  verticalMove(dir: -1 | 1, extend?: boolean): boolean
  lineEdge(edge: 'start' | 'end', extend?: boolean): boolean
  setCursor(index?: number): void
  toEditMode(x?: number, y?: number): void
  toSelectMode(selectElem?: boolean | Element): void
  setInputElem(elem: HTMLTextAreaElement): void
  clear(): void
  init(inputElem?: Element): void
}

/** What an extension's hook returns (its shape is the extension's own). */
export type ExtensionResult = Record<string, unknown>

export interface RasterExportOptions {
  includeBg?: boolean
  bgcolor?: string
  crop?: { x: number, y: number, w: number, h: number }
  scale?: number
  avoidEvent?: boolean
}

/** What `rasterExport` resolves to (and the `exported` event carries). */
export interface RasterExportResult {
  datauri: string
  bloburl: string
  svg: string
  issues: string[]
  issueCodes: string[]
  type: string
  mimeType: string
  quality: number
  windowName: string
}

export type { ToolMods, ToolEvent, ToolContext, ToolOption, ToolDef } from './core/tool-registry.ts'

export interface AttachedMembers {
  /** Snapping of the point a drawing tool places (`core/draw-snap.ts`). */
  drawSnap: import('./core/draw-snap.ts').DrawSnap
  /** Pointer-gesture state (rotate / resize / drag starts, alt-clone, pending new element, space-pan). */
  gesture: import('./core/gesture-state.ts').GestureState
  /** Remove the canvas's global listeners; call before discarding the instance. */
  destroy(): void
  /** The id of the `localStorage` entry that carries the clipboard between canvases. */
  getClipboardID(): string
  /** The element a pointer event is on, as the selection logic sees it (the svg root for "nothing"). */
  getMouseTarget(evt: Event): Element
  getMouseTarget(evt: Event | null | undefined): Element | null
  getMouseTargetFromNode(node: Element): Element
  getMouseTargetFromNode(node: Element | null | undefined): Element | null
  /** The stroked, transformed bounding box of the elements (all visible ones when omitted). */
  getStrokedBBoxDefaultVisible(elems?: Element[]): BBox
  gettingSelectorManager(): SelectorManagerApi
  /** Name the cursor hint a tool shows (`'add'`, `'pointer'`…), or `null` for none; only a change fires `cursorHint`. */
  setCursorHint(hint: string | null): void
  setEncodableFont(family: string, base64: string): void
  /** Round a value to the grid step. */
  snapToGrid(value: number): number
  /** Offer a key to the active registered tool; true when it was handled (the caller should preventDefault). */
  toolKeyDown(evt: KeyboardEvent): boolean
  setSvgString(xmlString: string, preventUndo?: boolean): boolean
  clearSelection(noCall?: boolean): void
  getResolution(): Resolution
  setResolution(width: number | string, height: number | string): boolean

  // Element manipulation
  moveSelectedElements(dx: number | number[], dy: number | number[], undoable?: boolean): HistoryCommand | void
  deleteSelectedElements(): void
  copySelectedElements(): void
  pasteElements(type?: string, x?: number, y?: number, data?: unknown[]): void
  groupSelectedElements(type?: string, urlArg?: string): void
  ungroupSelectedElement(): void
  moveToTopSelectedElement(): void
  moveToBottomSelectedElement(): void
  moveUpDownSelected(dir: 'Up' | 'Down'): void

  // Gesture state shared by the select / rotate / resize handlers (null / false outside a gesture)
  /** Set by the editor's snapping overlay; absent in a bare canvas. */
  showDrawGuides?: (payload: DrawGuidesPayload | null) => void

  // Resize gesture state
  /** The text-box resize in progress (its transaction stays open until mouse-up). */
  /** The live scale of a resize, for panels that show the in-progress size. */
  dragLiveResizeBox?: { left: number, top: number, width: number, height: number, tx: number, ty: number, sx: number, sy: number }

  // Move gesture state (select mode)
  smartSnapTargets?: SnapTarget[] | null
  pendingMoveDelta?: { dx: number, dy: number } | null
  dragLiveMoveDelta?: { dx: number, dy: number } | null
  /** The repeatable delta for transformAgain. */
  lastMoveDelta?: { dx: number, dy: number }
  /** Set by the editor's guide overlays; absent in a bare canvas. */
  showSnapGuides?: (snap: ProportionSnapGuides | null) => void
  showSmartGuides?: (payload: SmartGuidesPayload | null) => void
  /** Set by the editor's overlay while a path node is dragged. */
  showPathNodeGuides?: (payload: PathNodeGuidesPayload | null) => void
  /** Space is held (pan). */
  /** A tool just created an element (select it on mouse-up when `selectNew`). */

  // Path operations
  pathActions: {
    select: (target: Element) => void
    mouseDown: (evt: MouseEvent, target: Element, startX: number, startY: number) => void
    mouseMove: (mouseX: number, mouseY: number) => void
    mouseUp: (evt: MouseEvent, element?: Element | null, mouseX?: number, mouseY?: number) => { keep: boolean, element?: Element | null } | void
    clear: (keepSelection?: boolean) => void
    canDeleteNodes?: boolean
    closed_subpath?: boolean
    resetOrientation: (path: Element | null) => false | void
    zoomChange: () => void
    getNodePoint: () => { x: number, y: number }
    linkControlPoints: (linkPoints: boolean) => void
    clonePathNode: () => void
    deletePathNode: () => void
    averageSelectedNodes: (axis?: 'h' | 'v' | 'both') => void
    addAnchorPoints: () => void
    smoothPolylineIntoPath: (element: Element) => Element
    setSegType: (type: number) => void
    moveNode: (attr: string, newValue: number) => void
    toEditMode: (element: Element) => void
    toSelectMode: (elem?: Element | null) => void
    fixEnd: (elem: Element) => void
    convertPath: (pth: SVGPathElement, toRel: boolean) => string
    opencloseSubPath: () => void
    hover: (mouseX: number | null, mouseY: number | null, mode?: string) => void
  }
  setCurrentLayer(name: string): boolean
  renameCurrentLayer(newName: string): boolean
  setCurrentLayerPosition(newPos: number): boolean
  setLayerVisibility(name: string, bVisible: boolean): void
  moveSelectedToLayer(layerName: string): void
  cloneLayer(name?: string, hrService?: unknown): void
  deleteCurrentLayer(): boolean

  // Undo/Redo
  undoMgr: UndoManager
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
  /** The options bar of the current tool (or tool `id`): empty when it has none. */
  getToolOptions(id?: string): ToolOption[]
  setToolOption(optionId: string, value: number | string | boolean, id?: string): boolean
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
  textActions: TextActionsApi
  embedImage(src: string): Promise<string | false>

  // Other utilities

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
    begin(elems?: Element[]): Array<{ index: number, d: string }> | null
    /** Index of the region under (x, y), or -1. */
    hitTest(x: number, y: number): number
    apply(indices: number[], mode?: 'merge' | string): Element[] | null
    end(): void
  }
  runExtensions(action: keyof ExtensionHookPayloads, vars: unknown, returnArray: true): ExtensionResult[]
  runExtensions(action: keyof ExtensionHookPayloads, vars?: unknown, returnArray?: false): ExtensionResult | false

  /** Strip disallowed elements/attributes from `node` in place (per-instance). */
  addToSelection(elemsToAdd: ArrayLike<Element>, showGrips?: boolean): void
  cloneSelectedElements(x: number, y: number): void
  alignSelectedElements(type: string, relativeTo: string): void
  flipSelectedElements(scaleX: number, scaleY: number): void
  /** Select the next (true) or previous (false) element in the current layer. */
  cycleElement(next: boolean): void

  // Element creation / lookup
  addSVGElementsFromJson(data: SVGElementJSON): Element
  getStrokedBBox(elems?: Element[]): BBox | null
  insertChildAtIndex(parent: Element, child: string, index?: number): void
  findDefs(): Element
  setColor(type: 'fill' | 'stroke' | string, val: string, preventUndo?: boolean): void
  setStrokeWidth(val: number): void
  convertUnit(val: number, unit?: string): number
  /** Serialise the content to an SVG string (without `getSvgString` wrapping). */
  svgCanvasToString(): string

  // Layers
  setLayerLocked(layerName: string, locked: boolean): void
  setLayersVisibility(states: Record<string, boolean>): boolean
  setLayersLocked(states: Record<string, boolean>): boolean
  setLayerTemplate(layerName: string, template: boolean): boolean
  getLayerTemplate(layerName: string): boolean

  // Events
  /** `modeChange` event dispatched by `setMode`. */
  modeEvent: CustomEvent<{ getMode: () => string }>

  // Text
  getBold(): boolean
  getItalic(): boolean
  hasTextDecoration(value: string): boolean
  setTextAnchor(value: string): void
  /** Vertical alignment of the selected area texts inside their box (`se:valign`). */
  setTextValign(value: 'top' | 'middle' | 'bottom'): void
  /** Selected point texts become area texts of their current width (one undo step); false when nothing changed. */
  /** Whether a `<text>` wraps to a box (`se:wrap-width`). */
  isAreaText(elem: Element | null | undefined): boolean
  getTextValign(elem: Element): 'top' | 'middle' | 'bottom'
  makeAreaText(): boolean
  /** Selected area texts become point texts, the rows as drawn turning into hard rows (one undo step). */
  makePointText(): boolean
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
  /** Hover tooltips of the path editor's node and control-point grips (a `<title>` child; the editor passes translated text). */
  setPathGripTitles(titles: { node?: string, ctrl?: string }): void

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
  releaseTextOnPath(removing: Element[], batchCmd: import('./core/history.js').BatchCommand): Element[]
  /** Every element (current group, else visible layers) sharing the criterion with `ref`, `ref` included; selects nothing. */
  /** Replace the selected shape with a group of rows × cols rects over its bounding box (one undo step); null when nothing was done. */
  /** Whether `elem` is a plain shape that Split Into Grid can take. */
  /** Scale / move / rotate / reflect every selected object about its own reference point (one undo step); returns the transformed elements. */
  /** Hide (`display="none"`) or show objects as one undo step; hidden objects leave the selection. False when nothing changed. */
  setObjectsHidden(elems: Element[], hidden: boolean): boolean
  /** Lock (`se:locked`) or unlock objects as one undo step; locked objects (and what is inside a locked group) cannot be selected. False when nothing changed. */
  setObjectsLocked(elems: Element[], locked: boolean): boolean
  hasLockedObjects(): boolean
  hasHiddenObjects(): boolean
  unlockAllObjects(): boolean
  showAllObjects(): boolean
  /** Set or clear an object's `data-name` as one undo step. */
  setObjectName(el: Element, name: string): boolean
  /** Why the objects cannot be moved into `parent` (a layer or plain group) in front of `before`, or null. */
  objectMoveIssue(elems: Element[], parent: Element, before?: Node | null): string | null
  /** Move objects into `parent` in front of `before` (the end when null) as one undo step, keeping their place on the page. False when refused or nothing moved. */
  moveObjects(elems: Element[], parent: Element, before?: Node | null): boolean
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
  setBBoxZoom(val: 'selection' | 'canvas' | 'content' | 'layer' | object, editorW: number, editorH: number): { zoom: number, bbox: BBox } | void
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
  getCornerSettings(elem?: Element): Array<{
    index: number,
    radius: number,
    kind: 'r' | 'i' | 'c',
    max: number,
    /** The corner's geometry in the element's own space (`core/corner-radius.js`). */
    corner: { index: number, at: { x: number, y: number }, u: { x: number, y: number }, v: { x: number, y: number }, lu: number, lv: number, tanHalf: number }
  }>

  // Live effects (se:fx stack)
  registerLiveEffect(name: string, def: object): void
  listLiveEffects(): Array<{ name: string, label: string, defaults: Record<string, number | boolean | string>, choices?: Record<string, string[]>, ranges?: Record<string, { min?: number, max?: number, step?: number }> }>
  canApplyLiveEffect(elem: Element): boolean
  reconcileLiveEffects(elem: Element): boolean
  /** Live stack (`core/live-stack.js`): null when the element is not stacked, else whether its stack is still current (stale stacks are dropped). */
  reconcileLiveStack(elem: Element): boolean | null
  isLiveStacked(elem: Element): boolean
  /** Art and pattern brushes (`core/art-brush-canvas.js`). */
  getArtBrushLibrary(): Array<{ id: string, name: string, type: 'art' | 'pattern' }>
  canMakeArtBrush(): boolean
  makeArtBrush(type: 'art' | 'pattern', name?: string): string | null
  deleteArtBrush(id: string): boolean
  canApplyArtBrush(elem: Element | null): boolean
  applyArtBrush(brushId: string): Element[]
  getArtBrush(elem?: Element): { type: 'art' | 'pattern', opts: Record<string, unknown> } | null
  setArtBrushOptions(changes: Record<string, unknown>): Element[]
  expandArtBrush(): Element[]
  releaseArtBrush(): Element[]
  refreshArtBrush(elem: Element | null): boolean
  getArtBrushGroup(elem: Element | null): Element | null
  /** Blends (`core/blend-canvas.js`). */
  canBlend(elems?: Element[]): boolean
  makeBlend(elems?: Element[], options?: Record<string, unknown>): Element | null
  getBlend(elem?: Element): { mode: 'steps' | 'distance' | 'smooth', steps: number, distance: number } | null
  setBlendOptions(changes: Record<string, unknown>, elems?: Element[]): Element[]
  expandBlend(): Element[]
  releaseBlend(): Element[]
  /** One blend and one path of the same parent (the selection by default): the path can become the blend's spine. */
  canReplaceBlendSpine(elems?: Element[]): boolean
  /** The spine of a blend (path data in the group's coordinates), null when it goes straight. */
  getBlendSpine(elem?: Element): string | null
  /** Make the path selected with a blend its spine; the keys move onto it. One undo step. */
  replaceBlendSpine(elems?: Element[]): Element | null
  /** Run the selected blends' keys the other way along their spines. */
  reverseBlendSpine(): Element[]
  /** Turn the selected blend's spine back into a path; the blend goes straight. */
  detachBlendSpine(): Element | null
  /** Whether the selected blend is turned to its spine's direction (null: it has no spine). */
  getBlendAlign(elem?: Element): boolean | null
  /** Turn the selected blends' shapes to the direction of their spines, or back. One undo step. */
  alignBlendToPath(on?: boolean): Element[]
  refreshBlend(elem: Element | null): boolean
  getBlendGroup(elem: Element | null): Element | null
  isBlendKeyCandidate(elem: Element | null): boolean
  getBlendDefaults(): { mode: 'steps' | 'distance' | 'smooth', steps: number, distance: number }
  setBlendDefaults(changes: Record<string, unknown>): { mode: 'steps' | 'distance' | 'smooth', steps: number, distance: number }
  getLiveEffects(elem?: Element | null): Array<{ name: string, params: Record<string, number | boolean | string> }>
  /** The box the effects are computed against (the source geometry's), in the element's own coordinates. */
  getLiveEffectsBox(elem: Element): { x: number, y: number, width: number, height: number } | null
  previewLiveEffects(stack: Array<{ name: string, params?: object }>): void
  cancelLiveEffectsPreview(): void
  applyLiveEffects(stack: Array<{ name: string, params?: object }>): Element | null
  /** Like `applyLiveEffects` on `elem`, inside the caller's transaction: no undo step, no re-selection, no event. */
  applyLiveEffectsTo(elem: Element, stack: Array<{ name: string, params?: object }>): Element | null
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
  selectorManager: SelectorManagerApi
  SelectorClass: SelectorClassApi
  updateGroupSelector(elem?: Element): void
  getDisabledElems(): Element[]
  getPathObj(): any

  // Host-facing helpers (called from the editor and extensions)
  /** History helpers (`HistoryCommand` classes, `UndoManager`, …). Untyped on purpose: R1 deletes `core/history.js`. */
  history: any
  NS: Record<string, string>
  svgroot: SVGSVGElement
  curConfig: Config
  $id: (id: string) => Element | null
  $qa: (selector: string) => Element[]
  getBrushParams(): BrushParams
  setBrushParams(params: Partial<BrushParams>): BrushParams
  getCurShape(): StyleProps
  getContentH(): number
  getNonceId(base?: string): string
  getHref(elem: Element): string | null
  setHref(elem: Element, val: string): void
  getRotationAngle(elem?: Element, toRad?: boolean): number
  getEditorNS(add?: boolean): string
  getTypeMap(): Record<string, number>
  convertToNum(attr: string, val: string): number
  getReferencedDefElements(elems: Element[]): Element[]
  getParents(node: Node, selector?: string): Element[] | null
  isLayer(elem: Element): boolean
  hasVisibleStroke(elem: Element): boolean
  mergeDeep: typeof import('./common/util.ts').mergeDeep
  encode64(input: string): string
  registerGeometryRemap(attrName: string, remapFn: Function): void
  remapElementIdsAndRefs(rootEls: Element[], getNewId: () => string): Record<string, string>
  uniquifyElems(g: Element): void
  recalculateDimensions(selected: Element): Command | null
  updateCanvas(w: number, h: number): { x: number, y: number, old_x: number, old_y: number, d_x: number, d_y: number }
  setCurrentZoom(zoomLevel: number): void
  setContext(elem: Element | string): void
  leaveContext(): void
  /** Undo the in-group dimming; call the returned function to re-apply it. */
  suspendContextDimming(): () => void
  rasterExport(imgType?: string, quality?: number, windowName?: string, opts?: RasterExportOptions): Promise<RasterExportResult>

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
  segmentSelection(params: SegmentParams): void
  getSegmentParams(): SegmentParams | null
  canTaperStroke(elem: Element): boolean
  getTaperParams(): { start: number, end: number } | null
  canTextOnPath(): boolean
  simplifyPathD(d: string, tolerance?: number): string | null
  cutShapes(points: Array<{ x: number, y: number }>): void
  startImageCrop(imageElem: Element): void
  isImageCropEligible(elem: Element): boolean
  isImageCropping(): boolean
}
