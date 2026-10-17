/**
 * Members that core modules attach to a canvas at runtime (`svgCanvas.foo = …`
 * in `core/*.ts`), so TypeScript can't see them on the class. Declared once
 * here: `svgcanvas.ts` extends it through its base-class type, so the class
 * and every module typed against it know the surface.
 */
import type { Config, UndoManager } from './svgcanvas.js'

import type { BrushParams, StyleProps } from './core/canvas-state.ts'
import type { SnapTarget, SmartGuidesPayload, DrawGuidesPayload } from './core/smart-guides.ts'
import type { PathNodeGuidesPayload } from './core/path-node-guides.ts'
import type { SelectorManagerApi } from './core/select.ts'
import type { ProportionSnapGuides } from './core/proportions.ts'

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
  /** Clip / mask / feather of the selection (`core/clip-mask.ts`). */
  clipMask: import('./core/clip-mask.ts').ClipMask
  /** Union / intersect / subtract / exclude / divide of two selected shapes (`core/boolean-ops.ts`). */
  booleanOps: import('./core/boolean-ops.ts').BooleanOps
  /** The image-crop session (`core/image-crop.ts`). */
  imageCrop: import('./core/image-crop.ts').ImageCrop
  /** Pointer-gesture state (rotate / resize / drag starts, alt-clone, pending new element, space-pan). */
  gesture: import('./core/gesture-state.ts').GestureState
  /** Remove the canvas's global listeners; call before discarding the instance. */
  destroy(): void
  /** The id of the `localStorage` entry that carries the clipboard between canvases. */
  getClipboardID(): string
  gettingSelectorManager(): SelectorManagerApi
  /** Name the cursor hint a tool shows (`'add'`, `'pointer'`…), or `null` for none; only a change fires `cursorHint`. */
  setCursorHint(hint: string | null): void
  setEncodableFont(family: string, base64: string): void

  pasteElements(type?: string, x?: number, y?: number, data?: unknown[]): void

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

  // Undo/Redo
  undoMgr: UndoManager
  /** Structural health check of the current drawing (core/drawing-invariants.js); an empty list means healthy. */
  checkDrawing(): Array<{ code: string, message: string, id?: string }>

  // Canvas properties
  contentW: number
  contentH: number

  // Text operations
  textActions: import('./core/text-actions.ts').TextActionsApi

  // Other utilities

  /** Interactive region-merge session over the given (or selected) elements. */
  shapeBuilder: import('./core/shape-builder.ts').ShapeBuilder

  insertChildAtIndex(parent: Element, child: string, index?: number): void
  convertUnit(val: number, unit?: string): number

  // Events
  /** `modeChange` event dispatched by `setMode`. */
  modeEvent: CustomEvent<{ getMode: () => string }>

  isValidUnit(attr: string, val: string, selectedElement?: Element): boolean

  // Image crop

  pathActions: import('./core/path-actions.ts').PathActionsApi
  // --- attached by built-in extensions (absent when the extension is left out) ---
  setMirrorAxis?(axis: 'v' | 'h' | null): void
  getMirrorAxis?(): 'v' | 'h' | null
  mirrorSelection?(): void
  repeatSelection?(params: Record<string, unknown>): void
  getRepeatParams?(): Record<string, unknown> | null
  armRepeatCenterPick?(onPicked: (x: number, y: number) => void): void
  /** The host's debug-event sink, or null while the debug log is off. */
  _debugEventSink: ((event: string, detail?: object) => void) | null

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
  getTypeMap(): Record<string, number>
  convertToNum(attr: string, val: string): number
  getParents(node: Node, selector?: string): Element[] | null
  isLayer(elem: Element): boolean
  mergeDeep: typeof import('./common/util.ts').mergeDeep
  encode64(input: string): string
  remapElementIdsAndRefs(rootEls: Element[], getNewId: () => string): Record<string, string>

}
