/**
 * Numerous tools for working with the editor's "canvas".
 * @module svgcanvas
 *
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Pavol Rusnak, 2010 Jeff Schiller, 2021 OptimistikSAS
 *
 */
import './core/path-seg-shim.js' // SVGPathSeg/SVGPathSegList replacement (see core/path-seg-shim.js)

import Paint from './core/paint.ts'
import * as pathModule from './core/path.ts'
import * as history from './core/history.js'
import * as draw from './core/draw.ts'
import { createPasteElem } from './core/paste-elem.ts'
import type { PasteElemApi } from './core/paste-elem.ts'
import { init as touchInit } from './core/touch.ts'
import { svgRootElement } from './core/svgroot.ts'
import { createUndo } from './core/undo.ts'
import type { UndoApi } from './core/undo.ts'
import { createTransaction } from './core/transaction.ts'
import type { TransactionApi } from './core/transaction.ts'
import { checkDrawing } from './core/drawing-invariants.ts'
import { describeElement } from './core/debug-events.ts'
import { createToolRegistry } from './core/tool-registry.ts'
import type { ToolRegistryApi } from './core/tool-registry.ts'
import { createSelection } from './core/selection.ts'
import type { SelectionApi } from './core/selection.ts'
import { createTextActions } from './core/text-actions.ts'
import { createEvent } from './core/event.ts'
import type { EventApi } from './core/event.ts'
import { createJson } from './core/json.ts'
import type { JsonApi } from './core/json.ts'
import * as elemGetSet from './core/elem-get-set.ts'
import { createSelectedElem } from './core/selected-elem.ts'
import type { SelectedElemApi } from './core/selected-elem.ts'
import { createBlurEvent } from './core/blur-event.ts'
import type { BlurEventApi } from './core/blur-event.ts'
import { getReverseNS, NS } from './core/namespaces.ts'
import {
  assignAttributes,
  cleanupElement,
  getUrlFromAttr,
  getHref,
  setHref,
  remapElementIdsAndRefs,
  createDomUtils,
  $id,
  $qa,
  $qq,
  scopedId,
  scopedQa,
  scopedQq,
  $click,
  getFeGaussianBlur,
  stringToHTML,
  insertChildAtIndex
} from './core/dom-utils.ts'
import type { DomUtilsApi } from './core/dom-utils.ts'
import {
  getBBoxOfElementAsPath,
  createBBoxUtils
} from './core/bbox-utils.ts'
import type { BBoxUtilsApi } from './core/bbox-utils.ts'
import { convertToPath } from './core/path-utils.ts'
import { encode64, decode64, blankPageObjectURL } from './core/encoding-utils.ts'
import {
  matrixMultiply,
  hasMatrixTransform,
  transformListToTransform
} from './core/math.ts'
import { isExtensionHook, EXTENSION_LIFECYCLE_METHODS } from './core/extension-hooks.ts'
import { warn } from './common/logger.ts'
import { createUnits, getTypeMap } from './core/units.ts'
import { createSvgExec } from './core/svg-exec.ts'
import type { SvgExecApi } from './core/svg-exec.ts'
import { createSvgDefs } from './core/svg-defs.ts'
import type { SvgDefsApi } from './core/svg-defs.ts'
import { createCoords } from './core/coords.ts'
import type { CoordsApi } from './core/coords.ts'
import { createRecalculate } from './core/recalculate.ts'
import type { RecalculateApi } from './core/recalculate.ts'
import { createSelect } from './core/select.ts'
import type { SelectApi } from './core/select.ts'
import { clearSvgContentElement } from './core/clear.ts'
import { createBooleanOps } from './core/boolean-ops.ts'
import { createPathOffset } from './core/path-offset.ts'
import type { PathOffsetApi } from './core/path-offset.ts'
import { createPathSimplify } from './core/path-simplify.ts'
import type { PathSimplifyApi } from './core/path-simplify.ts'
import { createCornerRadius } from './core/corner-radius.ts'
import type { CornerRadiusApi } from './core/corner-radius.ts'
import { createTaperStroke } from './core/taper-stroke.ts'
import type { TaperStrokeApi } from './core/taper-stroke.ts'
import { createObjectState } from './core/object-state.ts'
import type { ObjectStateApi } from './core/object-state.ts'
import { createDrawSnap } from './core/draw-snap.ts'
import { createGestureState } from './core/gesture-state.ts'
import { createGuides } from './core/guides.ts'
import type { GuidesApi } from './core/guides.ts'
import { createDashFit } from './core/dash-fit.ts'
import type { DashFitApi } from './core/dash-fit.ts'
import { createArrowAlign } from './core/arrow-align.ts'
import type { ArrowAlignApi } from './core/arrow-align.ts'
import { createPathJoin } from './core/path-join.ts'
import type { PathJoinApi } from './core/path-join.ts'
import { createLiveStack } from './core/live-stack.ts'
import type { LiveStackApi } from './core/live-stack.ts'
import { createArtBrush } from './core/art-brush-canvas.ts'
import type { ArtBrushApi } from './core/art-brush-canvas.ts'
import { createBlend } from './core/blend-canvas.ts'
import type { BlendApi } from './core/blend-canvas.ts'
import { createLiveEffects } from './core/live-effects.ts'
import type { LiveEffectsApi } from './core/live-effects.ts'
import { init as liveEffectsDistortInit } from './core/live-effects-distort.ts'
import { init as warpInit } from './core/warp.ts'
import { init as distortInit } from './core/distort.ts'
import { createTextPath } from './core/text-path.ts'
import type { TextPathApi } from './core/text-path.ts'
import { createShapeBuilder } from './core/shape-builder.ts'
import { createClipMask } from './core/clip-mask.ts'
import { createCutter } from './core/cutter.ts'
import type { CutterApi } from './core/cutter.ts'
import { createSegment } from './core/segment.ts'
import type { SegmentApi } from './core/segment.ts'
import { createImageCrop } from './core/image-crop.ts'
import {
  getClosest,
  getParents,
  mergeDeep
} from './common/util.ts'
import type { TextAttrsApi } from './core/text-attrs.ts'
import type { ElemGetSetApi } from './core/elem-get-set.ts'
import type { LayerOpsApi } from './core/layer-ops.ts'
import type { DrawContextApi } from './core/draw.ts'
import type { GroupOpsApi } from './core/group-ops.ts'
import type { PathMethodApi } from './core/path-method.ts'
import type { PathStateApi } from './core/path.ts'
import { attachApi } from './common/initGuard.ts'

import dataStorage from './core/dataStorage.ts'
import type { SnapTarget } from './core/smart-guides.ts'
import type { SmartGuidesPayload } from './core/smart-guides.ts'
import type { DrawGuidesPayload } from './core/smart-guides.ts'
import type { PathNodeGuidesPayload } from './core/path-node-guides.ts'
import type { ProportionSnapGuides } from './core/proportions.ts'
import type { Drawing } from './core/draw.ts'
import type { Units } from './core/units.ts'
import type { StyleProps, BrushParams, XY, CanvasState, ElementAndBBox } from './core/canvas-state.ts'
import type { BatchCommand } from './core/history.js'

const visElems =
  'a,circle,ellipse,foreignObject,g,image,line,path,polygon,polyline,rect,svg,text,tspan,use'
const refAttrs = [
  'clip-path',
  'fill',
  'filter',
  'marker-end',
  'marker-mid',
  'marker-start',
  'mask',
  'stroke'
]

const THRESHOLD_DIST = 0.8
const STEP_COUNT = 10
const CLIPBOARD_ID = 'svgedit_clipboard'

// Public types (hosts, the editor and the facade files import them from here)
export interface SVGElementJSON {
  /** Set on the clipboard's copies of referenced defs (gradients, filters, …). */
  _defs?: boolean
  element: string
  attr: Record<string, string | number>
  curStyles?: boolean
  children?: SVGElementJSON[]
  namespace?: string
}

export interface Config {
  /** 'square' | 'isometric' | 'triangle' | 'perspective1' | 'perspective2'; set via the grid settings popover. */
  gridShape?: string
  /** Object-to-object / drawing snapping guides; only `false` turns them off. */
  smartSnapping?: boolean
  /** Ruler guides are drawn; only `false` hides them. */
  showGuides?: boolean
  showRulers?: boolean
  /** Output viewBox + xmlns instead of fixed width / height. */
  dynamicOutput?: boolean
  /** Snap a dragged selection's bbox to the grid in wireframe mode. */
  wireframeSnapping?: boolean
  pencilStabilization?: number
  pencilFidelity?: number
  /** Only `false` keeps the legacy every-3-points smoothing. */
  pencilSimplify?: boolean
  canvasName?: string
  canvas_expansion?: number
  initFill?: {
    color?: string
    opacity?: number
  }
  initStroke?: {
    width?: number
    color?: string
    opacity?: number
  }
  text?: {
    stroke_width?: number
    font_size?: number
    font_family?: string
  }
  selectionColor?: string
  imgPath?: string
  extensions?: string[]
  initTool?: string
  wireframe?: boolean
  showlayers?: boolean
  no_save_warning?: boolean
  imgImport?: boolean
  baseUnit?: string
  snappingStep?: number
  gridSnapping?: boolean
  gridColor?: string
  dimensions?: [number, number]
  initOpacity?: number
  colorPickerCSS?: string | null
  initRight?: string
  initBottom?: string
  show_outside_canvas?: boolean
  selectNew?: boolean
}

export interface Resolution {
  w: number
  h: number
  zoom?: number
}

export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

// History command types
export interface HistoryCommand {
  apply(handler: HistoryEventHandler): void | true
  unapply(handler: HistoryEventHandler): void | true
  elements(): Element[]
  type(): string
  getText(): string
}

export interface HistoryEventHandler {
  handleHistoryEvent(eventType: string, cmd: HistoryCommand): void
  /** Optional: called around a BatchCommand's (un)apply so global notifications fire once per batch. */
  beginBatch?(): void
  endBatch?(): void
}

export interface UndoManager {
  addCommandToHistory(cmd: HistoryCommand): void
  /** Debug hook, called after every command lands on the stack. */
  onPush: ((cmd: HistoryCommand) => void) | null
  undo(): void
  redo(): void
  getUndoStackSize(): number
  getRedoStackSize(): number
  getNextUndoCommandText(): string
  getNextRedoCommandText(): string
  resetUndoStack(): void
  beginUndoableChange(attrName: string, elems: Element[]): void
  finishUndoableChange(): HistoryCommand & { isEmpty(): boolean }
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
/** What `importSvgString` remembers per imported file, to reuse its `<symbol>`. */
export interface ImportEntry { symbol: Element, xform: string }

/** What the core modules give the canvas; each module owns its interface. */
type ModuleApis =
  SvgDefsApi &
  BlurEventApi &
  JsonApi &
  CoordsApi &
  RecalculateApi &
  BBoxUtilsApi &
  PathOffsetApi &
  PathSimplifyApi &
  DashFitApi &
  ArrowAlignApi &
  CornerRadiusApi &
  PathJoinApi &
  GuidesApi &
  SegmentApi &
  CutterApi &
  TextPathApi &
  TaperStrokeApi &
  LiveEffectsApi &
  ObjectStateApi &
  DomUtilsApi &
  TextAttrsApi &
  ToolRegistryApi &
  ElemGetSetApi &
  LayerOpsApi &
  DrawContextApi &
  GroupOpsApi &
  SelectionApi &
  SelectedElemApi &
  PathMethodApi &
  PathStateApi &
  EventApi &
  SvgExecApi &
  SelectApi &
  UndoApi &
  TransactionApi &
  LiveStackApi &
  ArtBrushApi &
  BlendApi &
  PasteElemApi

/** The detail of the event `call()` dispatches: its argument, and what the last `bind()` handler returned. */
interface CallDetail { arg: unknown, result?: unknown }

/** An extension as `addExtension` registers it: its hooks by name (see `core/extension-hooks.ts`), `eventBased` ones get a DOM event instead. */
export interface ExtensionObject {
  name?: string
  eventBased?: boolean
  [hook: string]: unknown
}

/**
 * The main SvgCanvas class that manages all SVG-related functions.
 */
class SvgCanvas extends (EventTarget as new () => EventTarget & ModuleApis) {
  static $id = $id
  static $qq = $qq
  static $qa = $qa
  static scopedId = scopedId
  static scopedQq = scopedQq
  static scopedQa = scopedQa
  static $click = $click
  static encode64 = encode64
  static decode64 = decode64
  static mergeDeep = mergeDeep
  static getClosest = getClosest
  static getParents = getParents
  static blankPageObjectURL = blankPageObjectURL
  static Paint = Paint
  static getTypeMap = getTypeMap

  // Helpers the editor and the extensions call through the canvas (the same functions the statics above export).
  stringToHTML = stringToHTML
  insertChildAtIndex = insertChildAtIndex
  getClosest = getClosest
  getParents = getParents
  isLayer = draw.Layer.isLayer
  matrixMultiply = matrixMultiply
  hasMatrixTransform = hasMatrixTransform
  transformListToTransform = transformListToTransform
  declare convertToNum: Units['convertToNum']
  declare convertUnit: Units['convertUnit']
  declare isValidUnit: Units['isValidUnit']
  remapElementIdsAndRefs = remapElementIdsAndRefs
  getUrlFromAttr = getUrlFromAttr
  getHref = getHref
  setHref = setHref
  assignAttributes = assignAttributes
  cleanupElement = cleanupElement
  declare getTypeMap: Units['getTypeMap']
  history = history
  NS = NS
  encode64 = encode64
  decode64 = decode64
  mergeDeep = mergeDeep

  $id = $id
  $qq = $qq
  $qa = $qa
  $click = $click
  /** Snapping of the point a drawing tool places (`core/draw-snap.ts`). */
  declare drawSnap: import('./core/draw-snap.ts').DrawSnap
  /** Clip / mask / feather of the selection (`core/clip-mask.ts`). */
  declare clipMask: import('./core/clip-mask.ts').ClipMask
  /** Union / intersect / subtract / exclude / divide of two selected shapes (`core/boolean-ops.ts`). */
  declare booleanOps: import('./core/boolean-ops.ts').BooleanOps
  /** The image-crop session (`core/image-crop.ts`). */
  declare imageCrop: import('./core/image-crop.ts').ImageCrop
  /** Pointer-gesture state (rotate / resize / drag starts, alt-clone, pending new element, space-pan). */
  declare gesture: import('./core/gesture-state.ts').GestureState
  // Gesture state shared by the select / rotate / resize handlers (null / false outside a gesture)
  /** Set by the editor's snapping overlay; absent in a bare canvas. */
  declare showDrawGuides?: (payload: DrawGuidesPayload | null) => void
  // Resize gesture state
  /** The text-box resize in progress (its transaction stays open until mouse-up). */
  /** The live scale of a resize, for panels that show the in-progress size. */
  declare dragLiveResizeBox?: { left: number, top: number, width: number, height: number, tx: number, ty: number, sx: number, sy: number }
  // Move gesture state (select mode)
  declare smartSnapTargets?: SnapTarget[] | null
  declare pendingMoveDelta?: { dx: number, dy: number } | null
  declare dragLiveMoveDelta?: { dx: number, dy: number } | null
  /** The repeatable delta for transformAgain. */
  declare lastMoveDelta?: { dx: number, dy: number }
  /** Set by the editor's guide overlays; absent in a bare canvas. */
  declare showSnapGuides?: (snap: ProportionSnapGuides | null) => void
  declare showSmartGuides?: (payload: SmartGuidesPayload | null) => void
  /** Set by the editor's overlay while a path node is dragged. */
  declare showPathNodeGuides?: (payload: PathNodeGuidesPayload | null) => void
  // Undo/Redo
  declare undoMgr: UndoManager
  /** Structural health check of the current drawing (core/drawing-invariants.js); an empty list means healthy. */
  declare checkDrawing: () => Array<{ code: string, message: string, id?: string }>
  // Canvas properties
  declare contentW: number
  declare contentH: number
  // Text operations
  declare textActions: import('./core/text-actions.ts').TextActionsApi
  /** Interactive region-merge session over the given (or selected) elements. */
  declare shapeBuilder: import('./core/shape-builder.ts').ShapeBuilder
  // Events
  /** `modeChange` event dispatched by `setMode`. */
  declare modeEvent: CustomEvent<{ getMode: () => string }>
  declare pathActions: import('./core/path-actions.ts').PathActionsApi
  // --- attached by built-in extensions (absent when the extension is left out) ---
  declare setMirrorAxis?: (axis: 'v' | 'h' | null) => void
  declare getMirrorAxis?: () => 'v' | 'h' | null
  declare mirrorSelection?: () => void
  declare repeatSelection?: (params: Record<string, unknown>) => void
  declare getRepeatParams?: () => Record<string, unknown> | null
  declare armRepeatCenterPick?: (onPicked: (x: number, y: number) => void) => void
  /** The host's debug-event sink, or null while the debug log is off. */
  declare _debugEventSink: ((event: string, detail?: object) => void) | null
  declare svgroot: SVGSVGElement
  declare curConfig: Config
  declare container: HTMLElement
  declare current_drawing_: Drawing
  declare cursorHintValue: string | null
  declare destroyAbort: AbortController
  declare encodableFonts: Record<string, string>
  declare encodableImages: Record<string, string | false>
  declare extensions: Record<string, unknown>
  declare idprefix: string
  declare importIds: Record<string, ImportEntry>
  declare lastGoodImgUrl: string
  declare linkControlPoints: (linkPoints: boolean) => void
  declare nsMap: Record<string, string>
  declare opacAni: SVGAnimateElement
  declare randIdsMode: number
  declare removedElements: Record<string, Element>
  declare saveOptions: { round_digits: number, apply?: boolean, images?: string, [key: string]: unknown }
  declare scopeRoot: ParentNode | null
  declare state: CanvasState
  declare svgContent: SVGSVGElement
  declare svgdoc: Document
  declare units: Units

  parameter?: number
  nextParameter?: number

  /**
   * @param container The container HTML element that should hold the SVG root element
   * @param config An object that contains configuration data
   * @param scopeRoot Look elements up inside this root rather than the whole document
   */
  constructor (container: HTMLElement, config?: Partial<Config>, scopeRoot: ParentNode | null = null) {
    super()
    // Per-canvas unit conversion (rounding digits, base unit, `%` size, id lookup
    // all come from this canvas). Must exist before the core inits below read it.
    this.units = createUnits(this)
    this.cursorHintValue = null
    // the unit helpers are the canvas's own (their rounding digits and base unit come from it)
    this.convertToNum = this.units.convertToNum
    this.convertUnit = this.units.convertUnit
    this.isValidUnit = this.units.isValidUnit
    this.getTypeMap = this.units.getTypeMap
    // Tracks which `core/*.js` init() call last claimed each property name
    // on this instance, so a later call reusing the same name gets logged
    // instead of silently overwriting the earlier one.
    const initGuardRegistry = new Map()

    // initialize class variables
    this.importIds = {} // Object with IDs for imported files, to see if one was already added
    this.extensions = {} // Object to contain all included extensions
    this.removedElements = {} // Map of deleted reference elements
    this.idprefix = 'svg_' // Prefix string for element IDs
    this.encodableImages = {}
    this.encodableFonts = {} // { fontFamily: base64 woff2 } registry for embed-on-export
    this.saveOptions = { round_digits: 2 } // Object with save options

    this.curConfig = {
      // Default configuration options
      show_outside_canvas: true,
      selectNew: true,
      dimensions: [640, 480]
    }
    // Update config with new one if given
    if (config) {
      this.curConfig = mergeDeep(this.curConfig, config)
    }
    this.lastGoodImgUrl = `${this.curConfig.imgPath}/logo.svg` // String with image URL of last loadable image
    const { dimensions } = this.curConfig // Array with width/height of canvas

    const initConfig = this.curConfig as Config & Required<Pick<Config, 'initFill' | 'initStroke'>>
    // Object containing data for the currently selected styles
    const allProperties = {
      shape: ({
        fill:
          (initConfig.initFill.color === 'none' ? '' : '#') +
          initConfig.initFill.color,
        fill_paint: null,
        fill_opacity: initConfig.initFill.opacity,
        stroke:
          (initConfig.initStroke.color === 'none' ? '' : '#') +
          initConfig.initStroke.color,
        stroke_paint: null,
        stroke_opacity: initConfig.initStroke.opacity,
        stroke_width: initConfig.initStroke.width,
        stroke_dasharray: 'none',
        stroke_linejoin: 'miter',
        stroke_linecap: 'butt',
        opacity: this.curConfig.initOpacity
      } as StyleProps),
      text: null as unknown as StyleProps,
      brush: null as unknown as BrushParams
    }
    allProperties.text = mergeDeep({}, allProperties.shape)
    allProperties.text = mergeDeep(allProperties.text, {
      fill: '#000000',
      stroke_width: this.curConfig.text?.stroke_width,
      font_size: this.curConfig.text?.font_size,
      font_family: this.curConfig.text?.font_family
    })
    // Active brush-tool settings (session/tool state, not persisted to the
    // document — mirrors curShape/curText for the freehand brush tool).
    // `roundness`/`taperStart`/`taperEnd` are 0-100, `angle` is degrees,
    // `opacity`/`smoothness` are 0-1. Defaults are neutral (no taper, fully
    // round, full opacity) so a fresh brush draws a plain uniform stroke —
    // tapering/chiseling are opt-in via the settings popover.
    allProperties.brush = {
      thickness: 6,
      angle: 45,
      roundness: 100,
      taperStart: 100,
      taperEnd: 100,
      opacity: 1,
      smoothness: 0.3
    }

    // Session/UI state, grouped by concern rather than as flat instance
    // properties. curConfig (persisted
    // config), DOM refs, and already-object-scoped subsystems (undoMgr,
    // selectorManager, pathActions, ...) are intentionally NOT here — they
    // stay top-level instance properties.
    this.gesture = createGestureState()
    this.state = ({
      zoom: {
        value: 1, // Float displaying the current zoom level (1 = 100%, .5 = 50%, etc.).
        rootSctm: null // Root Current Transformation Matrix in user units
      },
      selection: {
        elements: [], // Array with all the currently selected elements
        currentGroup: null, // pointer to current group (for in-group editing)
        justSelected: null, // The DOM element that was just selected
        rubberBox: null, // DOM element for selection rectangle drawn by the user
        bboxes: [] // Array of current BBoxes, used in getIntersectionList().
      },
      style: {
        shape: allProperties.shape, // Current shape style properties
        text: allProperties.text, // Current text style properties
        brush: allProperties.brush,
        properties: allProperties.shape // Current general properties
      },
      history: {
        curCommand: null
      },
      drawing: {
        started: false, // Boolean indicating whether or not a draw action has been started
        startTransform: null, // String with an element's initial transform attribute value
        currentMode: 'select', // String indicating the current editor mode
        toolLocked: false, // Boolean: keep the active draw tool selected after each object (lock mode)
        textFreshCreate: false, // Boolean: the current text was just placed via the text tool (vs editing an existing one)
        currentResizeMode: 'none', // String with the current direction in which an element is being resized
        lastClickPoint: null, // Canvas point for the most recent right click
        drawnPath: null,
        freehand: {
          // Mouse events (at rest 0, like the gesture state: readers never see null)
          minx: 0,
          miny: 0,
          maxx: 0,
          maxy: 0
        },
        dAttr: null,
        startX: 0,
        startY: 0,
        rStartX: 0,
        rStartY: 0,
        initBbox: { x: 0, y: 0, width: 0, height: 0 },
        sumDistance: 0,
        controllPoint1: { x: 0, y: 0 },
        controllPoint2: { x: 0, y: 0 },
        start: { x: 0, y: 0 },
        end: { x: 0, y: 0 },
        bSpline: { x: 0, y: 0 },
        nextPos: { x: 0, y: 0 },
        filter: null,
        filterHidden: false
      }
    } as CanvasState)

    // "document" element associated with the container (same as window.document using default svg-editor.js)
    // NOTE: This is not actually a SVG document, but an HTML document.
    this.svgdoc = window.document
    this.container = container
    // Resolve element lookups within the owning editor's container rather than
    // the whole document, so several editors can share the same fixed IDs
    // (svgcanvas, svgcontent, …) without colliding. Falls back to the global
    // document lookups when no scope root is supplied (e.g. standalone use).
    // initializeSvgCanvasMethods() above set the global $id/$qq/$qa; override
    // them here now that the scope root is known. core/event.js and the editor
    // extensions read these off the instance, so they inherit the scoping.
    this.scopeRoot = scopeRoot
    if (scopeRoot) {
      this.$id = scopedId(scopeRoot) as typeof this.$id
      this.$qq = scopedQq(scopeRoot)
      this.$qa = scopedQa(scopeRoot)
    }
    // This is a container for the document being edited, not the document itself.
    this.svgroot = svgRootElement(this.svgdoc, dimensions as [number, number])
    container.append(this.svgroot)
    // The actual element that represents the final output SVG element.
    this.svgContent = this.svgdoc.createElementNS(NS.SVG, 'svg') as unknown as SVGSVGElement
    touchInit(this)
    clearSvgContentElement(this)
    // Current `draw.Drawing` object.
    this.randIdsMode = draw.RandomizeModes.LET_DOCUMENT_DECIDE // set by randomizeIds()
    this.current_drawing_ = new draw.Drawing(this.svgContent, this.idprefix, this.randIdsMode)

    // Created before the core inits so their document/window listeners can use its signal.
    this.destroyAbort = new AbortController()

    attachApi(this, 'json', createJson(this), initGuardRegistry)
    attachApi(this, 'domUtils', createDomUtils(this), initGuardRegistry)
    attachApi(this, 'bboxUtils', createBBoxUtils(this), initGuardRegistry)
    attachApi(this, 'coords', createCoords(this), initGuardRegistry)
    attachApi(this, 'recalculate', createRecalculate(this), initGuardRegistry)
    attachApi(this, 'select', createSelect(this), initGuardRegistry)
    attachApi(this, 'undo', createUndo(this), initGuardRegistry)
    attachApi(this, 'transaction', createTransaction(this), initGuardRegistry)
    attachApi(this, 'toolRegistry', createToolRegistry(this), initGuardRegistry)
    /** Structural health check of the current drawing (empty = healthy); see core/drawing-invariants.js. */
    this.checkDrawing = () => checkDrawing(this.getSvgContent())
    attachApi(this, 'selection', createSelection(this), initGuardRegistry)

    this.nsMap = getReverseNS()
    // this.selectorManager is attached per-instance by selectInit()

    // this.pathActions is attached per-instance by pathActionsInit() (run inside pathModule.init)
    attachApi(this, 'path', pathModule.createPathState(this), initGuardRegistry)

    // Animation element to change the opacity of any newly created element
    this.opacAni = document.createElementNS(NS.SVG, 'animate')
    this.opacAni.setAttribute('attributeName', 'opacity')
    this.opacAni.setAttribute('begin', 'indefinite')
    this.opacAni.setAttribute('dur', '1')
    this.opacAni.setAttribute('fill', 'freeze')
    this.svgroot.appendChild(this.opacAni)

    attachApi(this, 'event', createEvent(this), initGuardRegistry)
    this.textActions = createTextActions(this)
    attachApi(this, 'svg', createSvgExec(this), initGuardRegistry)
    attachApi(this, 'svgDefs', createSvgDefs(this), initGuardRegistry)
    attachApi(this, 'draw', draw.createDrawContext(this), initGuardRegistry)
    attachApi(this, 'elemGetSet', elemGetSet.createElemGetSet(this), initGuardRegistry)

    // prevent links from being followed in the canvas
    const handleLinkInCanvas = (e: Event) => {
      e.preventDefault()
      return false
    }
    container.addEventListener('mousedown', this.mouseDownEvent)
    container.addEventListener('mousemove', this.mouseMoveEvent)
    $click(container, handleLinkInCanvas)
    container.addEventListener('dblclick', this.dblClickEvent)
    container.addEventListener('mouseup', this.mouseUpEvent)
    container.addEventListener('mouseleave', this.mouseOutEvent)
    container.addEventListener('mousewheel', this.DOMMouseScrollEvent)
    container.addEventListener('DOMMouseScroll', this.DOMMouseScrollEvent)

    // Alias function
    this.linkControlPoints = this.pathActions.linkControlPoints

    attachApi(this, 'blur', createBlurEvent(this), initGuardRegistry)
    attachApi(this, 'selectedElem', createSelectedElem(this), initGuardRegistry)
    this.booleanOps = createBooleanOps(this)
    attachApi(this, 'pathOffset', createPathOffset(this), initGuardRegistry)
    attachApi(this, 'pathSimplify', createPathSimplify(this), initGuardRegistry)
    attachApi(this, 'liveStack', createLiveStack(this), initGuardRegistry)
    attachApi(this, 'cornerRadius', createCornerRadius(this), initGuardRegistry)
    attachApi(this, 'taperStroke', createTaperStroke(this), initGuardRegistry)
    attachApi(this, 'artBrush', createArtBrush(this), initGuardRegistry)
    attachApi(this, 'blend', createBlend(this), initGuardRegistry)
    attachApi(this, 'objectState', createObjectState(this), initGuardRegistry)
    this.drawSnap = createDrawSnap(this)
    this.clipMask = createClipMask(this)
    attachApi(this, 'guides', createGuides(this), initGuardRegistry)
    attachApi(this, 'dashFit', createDashFit(this), initGuardRegistry)
    attachApi(this, 'arrowAlign', createArrowAlign(this), initGuardRegistry)
    attachApi(this, 'pathJoin', createPathJoin(this), initGuardRegistry)
    attachApi(this, 'liveEffects', createLiveEffects(this), initGuardRegistry)
    liveEffectsDistortInit()
    warpInit()
    distortInit()
    attachApi(this, 'textPath', createTextPath(this), initGuardRegistry)
    this.shapeBuilder = createShapeBuilder(this)
    attachApi(this, 'cutter', createCutter(this), initGuardRegistry)
    attachApi(this, 'segment', createSegment(this), initGuardRegistry)
    this.imageCrop = createImageCrop(this)

    /**
     * Transfers sessionStorage from one tab to another.
     * @param ev Storage event.
     */
    const storageChange = (ev: StorageEvent): void => {
      if (!ev.newValue) return // This is a call from removeItem.
      if (ev.key === `${CLIPBOARD_ID}_startup`) {
        // Another tab asked for our sessionStorage.
        localStorage.removeItem(`${CLIPBOARD_ID}_startup`)
        this.flashStorage()
      } else if (ev.key === CLIPBOARD_ID) {
        // Another tab sent data.
        sessionStorage.setItem(CLIPBOARD_ID, ev.newValue)
      }
    }

    // Listen for changes to localStorage. Scoped to destroyAbort so a torn-down
    // instance (see destroy()) doesn't keep reacting to storage events, and
    // isn't kept alive for the life of the window by window's reference to
    // this closure.
    window.addEventListener('storage', storageChange, { signal: this.destroyAbort.signal })
    // Ask other tabs for sessionStorage (this is ONLY to trigger event).
    localStorage.setItem(`${CLIPBOARD_ID}_startup`, String(Math.random()))

    attachApi(this, 'paste', createPasteElem(this), initGuardRegistry)

    this.contentW = this.getResolution().w
    this.contentH = this.getResolution().h
    this.clear()

    // creates custom modeEvent for editor
    this.modeChangeEvent()
  } // End constructor

  /**
   * Tear down window-level listeners this instance registered (currently just
   * the storage listener above), so a closed drawing view doesn't keep its
   * entire SvgCanvas — and DOM subtree — reachable via a listener closure for
   * the life of the window. Call before discarding the instance.
   */
  destroy (): void {
    this.destroyAbort?.abort()
  }

  getSvgOption () {
    return this.saveOptions
  }

  setSvgOption (key: string, value: unknown) {
    this.saveOptions[key] = value
  }

  getSelectedElements () {
    return this.state.selection.elements
  }

  setSelectedElements (key: number, value: Element) {
    this.state.selection.elements[key] = value
  }

  setEmptySelectedElements () {
    this.state.selection.elements = []
  }

  getSvgRoot () {
    return this.svgroot
  }

  getDOMDocument () {
    return this.svgdoc
  }

  getDOMContainer () {
    return this.container
  }

  getCurConfig () {
    return this.curConfig
  }

  getCurrentDrawing () {
    return this.current_drawing_
  }

  getCurShape () {
    return this.state.style.shape
  }

  getBrushParams () {
    return this.state.style.brush
  }

  setBrushParams (params: Partial<BrushParams>) {
    Object.assign(this.state.style.brush, params)
    return this.state.style.brush
  }

  getCurrentGroup () {
    return this.state.selection.currentGroup
  }

  /**
   * Host-provided sink for discrete debug-log events — a complement to
   * getDebugSnapshot()'s polled state diff. The snapshot only ever sees
   * *state* (a grip left visible, a stale selector); it can't tell you what
   * input sequence produced it. This channel carries the sequence itself:
   * which node was grabbed, what a drag committed, an undo/redo firing —
   * see logDebugEvent()'s call sites (path-method.js's endChanges(),
   * path-actions.js's mouseDown/opencloseSubPath, undo.js's
   * handleHistoryEvent). Wired by Editor.js's setDebugLogger() alongside the
   * snapshot poller so both land in the same host log under one toggle.
   */
  setDebugEventSink (sink: ((event: string, detail?: object) => void) | null): void {
    this._debugEventSink = typeof sink === 'function' ? sink : null
  }

  /**
   * Forward one discrete debug event to the sink set via
   * setDebugEventSink(), or no-op if none is set (logging is off by
   * default, so every call site pays only this one property check).
   */
  logDebugEvent (event: string, detail: object): void {
    this._debugEventSink?.(event, detail)
  }

  /**
   * Read-only snapshot of internal visibility state that can desync from the
   * live model (selection box shown for a deselected element, path-node
   * grips left visible from a previously-edited path, group-context sibling
   * dimming not cleared on leaveContext(), a clip-path/mask reference whose
   * target no longer exists). Each subsection marks `stale` entries — state
   * that is currently rendered but no longer backed by the model — for a
   * debug-mode UI to surface. No side effects.
   */
  getDebugSnapshot (): object {
    const selectedIds = new Set(this.getSelectedElements().filter(Boolean).map((el) => el.id))

    const selectors = (this.selectorManager?.selectors ?? []).map((sel) => {
      const elemId = sel.selectedElement?.id ?? null
      const display = sel.selectorGroup?.getAttribute('display') ?? null
      return {
        id: sel.id,
        elemId,
        locked: sel.locked,
        display,
        stale: display === 'inline' && (!elemId || !selectedIds.has(elemId))
      }
    })

    const currentGroup = this.getCurrentGroup()
    const disabledElems = (this.getDisabledElems?.() ?? []).map((el) => ({
      id: el.id,
      opacity: el.getAttribute('opacity')
    }))

    // getPathObj() is only (re)pointed at a path by toEditMode() — a path
    // still being freehand-drawn (mode 'path', not yet committed) never goes
    // through toEditMode, so it wouldn't otherwise be recognized as "current"
    // here and every grip placed for it so far would misreport as orphaned.
    // getDrawnPath() covers exactly that gap; prefer it while a draw is live.
    const drawnPath = this.getDrawnPath?.()
    const path = this.getPathObj?.()
    const pathElemId = drawnPath?.id ?? path?.elem?.id ?? null
    const segCount = drawnPath
      ? drawnPath.pathSegList.numberOfItems
      : (path?.segs?.length ?? 0)
    const mode = this.getMode?.() ?? null
    const gripContainer = this.getElement('pathpointgrip_container')
    const GRIP_ID_RE = /^(pathpointgrip|ctrlpointgrip|ctrlLine|segline)_(\d+)(?:c[12])?$/
    const grips = []
    if (gripContainer) {
      for (const el of gripContainer.children) {
        const m = el.id.match(GRIP_ID_RE)
        if (!m) continue
        const index = Number(m[2])
        const display = el.getAttribute('display')
        // Grips are shared by index across every path, so `index < segCount`
        // can't tell the current path's own grip from one left over from a
        // previously edited path. Outside path/pathedit no grip should be
        // visible at all, whatever its index.
        const gripMode = mode === 'path' || mode === 'pathedit'
        const entry: { id: string; kind: string; index: number; display: string | null; stale: boolean; x?: number; y?: number } = {
          id: el.id,
          kind: m[1],
          index,
          display,
          stale: display === 'inline' && (!pathElemId || index >= segCount || !gripMode)
        }
        if (m[1] === 'pathpointgrip' && display === 'inline') {
          entry.x = Math.round(Number(el.getAttribute('x')))
          entry.y = Math.round(Number(el.getAttribute('y')))
        }
        grips.push(entry)
      }
    }

    // Masking/clipping: an element referencing a <mask>/<clipPath> by
    // url(#id) whose target no longer exists renders as if the attribute
    // weren't there at all -- no visual error, no console warning, just the
    // effect silently vanishing. Scoped to the whole document rather than
    // just the current selection, since a masking bug is just as likely to
    // be noticed on an element that isn't selected when this snapshot is
    // read. clip-mask.js always writes `url(#id)` (see performSet()), but a
    // hand-edited or externally loaded file could have a quoted id or some
    // other value (e.g. a CSS mask keyword) -- match defensively and skip
    // anything that isn't a url() reference.
    const REF_ATTR_RE = /^url\(["']?#([^"')]+)["']?\)$/
    const maskRefs: { id: string; attr: string; ref: string; refExists: boolean; refTag: string | null }[] = []
    this.svgContent?.querySelectorAll('[clip-path], [mask]').forEach((el) => {
      ;['clip-path', 'mask'].forEach((attr) => {
        const val = el.getAttribute(attr)
        const m = val && val.match(REF_ATTR_RE)
        if (!m) return
        const refElem = this.getElement(m[1])
        maskRefs.push({
          id: el.id,
          attr,
          ref: m[1],
          refExists: Boolean(refElem),
          refTag: refElem?.tagName ?? null
        })
      })
    })

    return {
      selection: { selectedIds: [...selectedIds], selectors },
      groupContext: {
        currentGroupId: currentGroup?.id ?? null,
        disabledElems,
        stale: !currentGroup && disabledElems.length > 0
      },
      pathEditing: { mode, pathElemId, segCount, grips },
      masking: { refs: maskRefs, stale: maskRefs.some((r) => !r.refExists) }
    }
  }

  getBaseUnit (): string {
    return this.curConfig.baseUnit as string
  }

  getHeight () {
    return Number(this.svgContent.getAttribute('height')) / this.state.zoom.value
  }

  getWidth () {
    return Number(this.svgContent.getAttribute('width')) / this.state.zoom.value
  }

  getRoundDigits () {
    return this.saveOptions.round_digits
  }

  getSnappingStep () {
    return this.curConfig.snappingStep
  }

  getGridSnapping () {
    return this.curConfig.gridSnapping
  }

  getGridShape () {
    return this.curConfig.gridShape || 'square'
  }

  getStartTransform () {
    return this.state.drawing.startTransform
  }

  setStartTransform (transform: string | null) {
    this.state.drawing.startTransform = transform
  }

  getZoom () {
    return this.state.zoom.value
  }

  round (val: number) {
    const { value: zoom } = this.state.zoom
    return Number.parseInt(String(val * zoom)) / zoom
  }

  createSVGElement (jsonMap: SVGElementJSON) {
    return this.addSVGElementsFromJson(jsonMap)
  }

  getContainer () {
    return this.container
  }

  setStarted (s: boolean) {
    this.state.drawing.started = s
  }

  /**
   * Say what the pointer is over, for the editor to pick the tool's cursor by position (a pen end that a press would
   * carry on or join, a width point...). The editor owns the artwork: `hint` is a short name ('continue', 'join',
   * 'add', ...) or `null` for none. A mode change clears it. Only a change fires `cursorHint`.
   * @fires module:svgcanvas.SvgCanvas#event:cursorHint
   */
  setCursorHint (hint: string | null): void {
    const next = hint || null
    if (next === (this.cursorHintValue ?? null)) return
    this.cursorHintValue = next
    this.call('cursorHint', next)
  }

  getCursorHint () {
    return this.cursorHintValue ?? null
  }

  /**
   * The rubber-band rectangle; `null` until the selector manager has created it (path editing creates it on demand).
   */
  getRubberBox (): Element | null {
    return this.state.selection.rubberBox
  }

  /** The rubber-band rectangle for the gesture handlers, which only run once the selector manager has made it. */
  requireRubberBox (): Element {
    const box = this.state.selection.rubberBox
    if (!box) throw new Error('The rubber-band box does not exist yet')
    return box
  }

  setRubberBox (rb: Element | null) {
    this.state.selection.rubberBox = rb
    return this.state.selection.rubberBox
  }

  addPtsToSelection ({ closedSubpath, grips }: { closedSubpath: boolean, grips: unknown }): void {
    // TODO: Correct this:
    this.pathActions.canDeleteNodes = true
    this.pathActions.closed_subpath = closedSubpath
    this.call('pointsAdded', { closedSubpath, grips })
    this.call('selected', grips)
  }

  /**
   * @fires module:svgcanvas.SvgCanvas#event:changed
   */
  endChanges ({ cmd, elem }: { cmd: import('./core/history.js').ChangeElementCommand; elem: SVGPathElement }): void {
    this.addCommandToHistory(cmd)
    this.call('changed', [elem])
  }

  getCurrentMode () {
    return this.state.drawing.currentMode
  }

  setCurrentMode (cm: string) {
    this.state.drawing.currentMode = cm
    return this.state.drawing.currentMode
  }

  getToolLocked () {
    return this.state.drawing.toolLocked
  }

  setToolLocked (b: boolean) {
    this.state.drawing.toolLocked = b
    return this.state.drawing.toolLocked
  }

  getTextFreshCreate () {
    return this.state.drawing.textFreshCreate
  }

  setTextFreshCreate (b: boolean) {
    this.state.drawing.textFreshCreate = b
    return this.state.drawing.textFreshCreate
  }

  getDrawnPath () {
    return this.state.drawing.drawnPath
  }

  setDrawnPath (dp: import('./core/path-types.ts').PathElement | null) {
    this.state.drawing.drawnPath = dp
    return this.state.drawing.drawnPath
  }

  setCurrentGroup (cg: Element | null) {
    this.state.selection.currentGroup = cg
  }

  changeSvgContent () {
    this.call('changed', [this.svgContent])
  }

  getStarted () {
    return this.state.drawing.started
  }

  /**
   * The root's current transformation matrix. Typed non-null: the mouse handlers set it before they read it.
   */
  getrootSctm (): DOMMatrix | null {
    return this.state.zoom.rootSctm
  }

  /** The root matrix for the pointer handlers, which set it on the first mouse event before anything reads it. */
  requireRootSctm (): DOMMatrix {
    const matrix = this.state.zoom.rootSctm
    if (!matrix) throw new Error('The root screen matrix has not been set yet')
    return matrix
  }

  getStartX () {
    return this.state.drawing.startX
  }

  /** @param {number} value */
  setStartX (value: number) {
    this.state.drawing.startX = value
  }

  getStartY () {
    return this.state.drawing.startY
  }

  /** @param {number} value */
  setStartY (value: number) {
    this.state.drawing.startY = value
  }

  getRStartX () {
    return this.state.drawing.rStartX
  }

  getRStartY () {
    return this.state.drawing.rStartY
  }

  getInitBbox () {
    return this.state.drawing.initBbox
  }

  getCurrentResizeMode () {
    return this.state.drawing.currentResizeMode
  }

  getJustSelected () {
    return this.state.selection.justSelected
  }

  getOpacAni () {
    return this.opacAni
  }

  getParameter () {
    return this.parameter as number
  }

  getNextParameter () {
    return this.nextParameter as number
  }

  getStepCount () {
    return STEP_COUNT
  }

  getThreSholdDist () {
    return THRESHOLD_DIST
  }

  getSumDistance () {
    return this.state.drawing.sumDistance
  }

  getStart (key: 'x' | 'y') {
    return this.state.drawing.start[key]
  }

  getEnd (key: 'x' | 'y') {
    return this.state.drawing.end[key]
  }

  getbSpline (key: 'x' | 'y') {
    return this.state.drawing.bSpline[key]
  }

  getNextPos (key: 'x' | 'y') {
    return this.state.drawing.nextPos[key]
  }

  getControllPoint1 (key: 'x' | 'y') {
    return this.state.drawing.controllPoint1[key]
  }

  getControllPoint2 (key: 'x' | 'y') {
    return this.state.drawing.controllPoint2[key]
  }

  getFreehand (key: 'minx' | 'miny' | 'maxx' | 'maxy') {
    return this.state.drawing.freehand[key]
  }

  getDrawing () {
    return this.getCurrentDrawing()
  }

  getDAttr () {
    return this.state.drawing.dAttr
  }

  getLastGoodImgUrl () {
    return this.lastGoodImgUrl
  }

  getCurText<K extends keyof StyleProps> (key: K) {
    return this.state.style.text[key] as StyleProps[K] | null
  }

  setDAttr (value: string | null) {
    this.state.drawing.dAttr = value
  }

  setEnd (key: 'x' | 'y', value: number) {
    this.state.drawing.end[key] = value
  }

  setControllPoint1 (key: 'x' | 'y', value: number) {
    this.state.drawing.controllPoint1[key] = value
  }

  setControllPoint2 (key: 'x' | 'y', value: number) {
    this.state.drawing.controllPoint2[key] = value
  }

  setJustSelected (value: Element | null) {
    this.state.selection.justSelected = value
  }

  setParameter (value: number) {
    this.parameter = value
  }

  setStart (value: XY) {
    this.state.drawing.start = value
  }

  setRStartX (value: number) {
    this.state.drawing.rStartX = value
  }

  setRStartY (value: number) {
    this.state.drawing.rStartY = value
  }

  setSumDistance (value: number) {
    this.state.drawing.sumDistance = value
  }

  setbSpline (value: XY) {
    this.state.drawing.bSpline = value
  }

  setNextPos (value: XY) {
    this.state.drawing.nextPos = value
  }

  setNextParameter (value: number) {
    this.nextParameter = value
  }

  setCurText<K extends keyof StyleProps> (key: K, value: StyleProps[K] | null) {
    this.state.style.text[key] = value as StyleProps[K]
  }

  setFreehand (key: 'minx' | 'miny' | 'maxx' | 'maxy', value: number) {
    this.state.drawing.freehand[key] = value
  }

  setCurBBoxes (value: ElementAndBBox[]) {
    this.state.selection.bboxes = value
  }

  getCurBBoxes () {
    return this.state.selection.bboxes
  }

  setInitBbox (value: import('./core/bbox-utils.ts').BBoxObject) {
    this.state.drawing.initBbox = value
  }

  setRootSctm (value: DOMMatrix | null) {
    this.state.zoom.rootSctm = value
  }

  setCurrentResizeMode (value: string) {
    this.state.drawing.currentResizeMode = value
  }

  getLastClickPoint (key: 'x' | 'y') {
    // null until the first right-click: pasting by command/keyboard before that used to throw
    return this.state.drawing.lastClickPoint?.[key]
  }

  setLastClickPoint (value: XY | null) {
    this.state.drawing.lastClickPoint = value
  }

  getId () {
    return this.getCurrentDrawing().getId()
  }

  getNsMap () {
    return this.nsMap
  }

  getSvgOptionApply () {
    return this.saveOptions.apply
  }

  getSvgOptionImages () {
    return this.saveOptions.images
  }

  getEncodableImages (key: string) {
    return this.encodableImages[key]
  }

  setEncodableImages (key: string, value: string | false) {
    this.encodableImages[key] = value
  }

  getEncodableFonts () {
    return this.encodableFonts
  }

  setEncodableFont (family: string, base64: string) {
    this.encodableFonts[family] = base64
  }

  getVisElems () {
    return visElems
  }

  getIdPrefix () {
    return this.idprefix
  }

  getDataStorage () {
    return dataStorage
  }

  setZoom (value: number) {
    this.state.zoom.value = value
  }

  getImportIds (key: string | number) {
    return this.importIds[key]
  }

  setImportIds (key: string | number, value: ImportEntry) {
    this.importIds[key] = value
  }

  setRemovedElements (key: string, value: Element) {
    this.removedElements[key] = value
  }

  setSvgContent (value: SVGSVGElement) {
    this.svgContent = value
  }

  getrefAttrs () {
    return refAttrs
  }

  setCanvas (key: string, value: unknown) {
    (this as unknown as Record<string, unknown>)[key] = value
  }

  setCurProperties<K extends keyof StyleProps> (key: K, value: StyleProps[K] | null) {
    this.state.style.properties[key] = value as StyleProps[K]
  }

  getCurProperties<K extends keyof StyleProps> (key: K) {
    return this.state.style.properties[key] as StyleProps[K] | null
  }

  setCurShape<K extends keyof StyleProps> (key: K, value: StyleProps[K] | null) {
    this.state.style.shape[key] = value as StyleProps[K]
  }

  getContentW () {
    return this.contentW
  }

  getContentH () {
    return this.contentH
  }

  getClipboardID () {
    return CLIPBOARD_ID
  }

  getSvgContent () {
    return this.svgContent
  }

  getExtensions () {
    return this.extensions as Record<string, ExtensionObject>
  }

  getSelector () {
    return this.SelectorClass
  }

  getMode () {
    return this.state.drawing.currentMode
  } // The current editor mode string

  getNextId (elemType: Element | string | null = null) {
    return this.getCurrentDrawing().getNextId(elemType as string | null)
  }

  getNextIdWithPrefix (prefix: string) {
    return this.getCurrentDrawing().getNextIdWithPrefix(prefix)
  }

  getNonceId (base: string) {
    return this.getCurrentDrawing().getNonceId(base)
  }

  getCurCommand () {
    return this.state.history.curCommand
  }

  setCurCommand (value: BatchCommand | null) {
    this.state.history.curCommand = value
  }

  getFilter () {
    return this.state.drawing.filter
  }

  setFilter (value: Element | null) {
    this.state.drawing.filter = value
  }

  getFilterHidden () {
    return this.state.drawing.filterHidden
  }

  setFilterHidden (value: boolean) {
    this.state.drawing.filterHidden = value
  }

  /**
   * Sets the editor's mode to the given string.
   * @param name String with the new mode to change to
   */
  setMode (name: string): void {
    // A registered tool's open gesture is rolled back by any mode change (core/tool-registry.js).
    this.cancelToolGesture?.()
    const previousMode = this.state.drawing.currentMode
    // Tear down any in-progress path/text edit before switching. These run
    // FIRST because clear() inspects the *current* (outgoing) mode to know what
    // to clean up. But a throw in here must never block the mode change below:
    // every toolbar tool routes through setMode(), so an exception in path/text
    // teardown would leave currentMode stuck on the old tool and make the whole
    // toolbar appear frozen (only a reload recovers) — the exact lockup users
    // hit when a path-edit session held a malformed/degenerate path. Isolate
    // each teardown so a failure is logged but the tool still switches.
    try {
      this.pathActions.clear(true)
    } catch (e) {
      warn('svgedit: pathActions.clear() failed during setMode; continuing', e, 'svgcanvas')
    }
    try {
      this.textActions.clear()
    } catch (e) {
      warn('svgedit: textActions.clear() failed during setMode; continuing', e, 'svgcanvas')
    }
    this.state.style.properties =
      this.state.selection.elements[0]?.nodeName === 'text'
        ? this.state.style.text
        : this.state.style.shape
    this.state.drawing.currentMode = name
    if (previousMode !== name) this.logDebugEvent('set-mode', { from: previousMode, to: name })
    this.setCursorHint(null)
    this.toolModeChanged?.(previousMode, name)

    // fires modeChange event for the editor
    if (this.modeEvent) {
      document.dispatchEvent(this.modeEvent)
    }
  }

  /**
   * Clears the current document. This is not an undoable action.
   * @fires module:svgcanvas.SvgCanvas#event:beforeClear|afterClear
   */
  clear (): void {
    this.call('beforeClear')
    this.pathActions.clear()
    this.clearSelection()
    // clear the svgcontent node
    clearSvgContentElement(this)
    // create new document
    this.current_drawing_ = new draw.Drawing(this.svgContent, undefined, this.randIdsMode)
    // create empty first layer
    this.createLayer()
    // clear the undo stack
    this.undoMgr.resetUndoStack()
    // reset the selector manager
    this.selectorManager.initGroup()
    // reset the rubber band box
    this.state.selection.rubberBox = this.selectorManager.getRubberBandBox()
    this.call('afterClear')
  }

  async addExtension (name: string, extInitFunc: (arg: object) => unknown, { importLocale }: { importLocale: unknown }): Promise<unknown> {
    if (typeof extInitFunc !== 'function') {
      throw new TypeError(
        'Function argument expected for `svgcanvas.addExtension`'
      )
    }
    if (name in this.extensions) {
      throw new Error(
        'Cannot add extension "' +
          name +
          '", an extension by that name already exists.'
      )
    }
    const argObj = {
      importLocale,
      svgroot: this.svgroot,
      svgContent: this.svgContent,
      nonce: this.getCurrentDrawing().getNonce(),
      selectorManager: this.selectorManager
    }
    const extObj = (await extInitFunc(argObj)) as Record<string, unknown> | null | undefined
    if (extObj) {
      extObj.name = name
      for (const [key, val] of Object.entries(extObj)) {
        if (typeof val === 'function' && !isExtensionHook(key) && !EXTENSION_LIFECYCLE_METHODS.includes(key)) {
          warn(`Extension "${name}" defines "${key}()", which is not a known hook`, undefined, 'extensions')
        }
      }
    }
    this.extensions[name] = extObj
    return this.call('extension_added', extObj)
  }

  addCommandToHistory (cmd: HistoryCommand) {
    this.undoMgr.addCommandToHistory(cmd)
  }

  restoreRefElements (elem: Element) {
    // Look for missing reference elements, restore any found
    if (!Object.keys(this.removedElements).length) return // nothing was ever purged
    const refs: string[] = []
    refAttrs.forEach((item) => {
      const val = elem.getAttribute(item)
      const url = val?.startsWith('url(') ? getUrlFromAttr(val) : null
      if (url) refs.push(url.slice(1))
    })
    // A gradient may inherit from another via href (`g1` -> `base`): the purge
    // removes the whole chain, so restoring one link must restore the next.
    const href = getHref(elem)
    if (href?.startsWith('#')) refs.push(href.slice(1))
    refs.forEach((id) => {
      const ref = this.getElement(id)
      // Only restore a ref we actually tracked when it was removed. Appending
      // a missing (undefined) entry injects a literal "undefined" text node
      // into <defs> and never restores the paint server (e.g. cross-document
      // paste, where the def was never removed from *this* canvas).
      if (!ref && this.removedElements[id]) {
        const restored = this.removedElements[id]
        this.findDefs().append(restored)
        delete this.removedElements[id]
        this.restoreRefElements(restored)
      }
    })
    const childs = elem.getElementsByTagName('*')

    if (childs.length) {
      for (let i = 0, l = childs.length; i < l; i++) {
        this.restoreRefElements(childs[i])
      }
    }
  }

  call (ev: string, arg?: unknown) {
    if (ev === 'selected' && this._debugEventSink) {
      this.logDebugEvent('selection', {
        elems: ((arg ?? []) as Array<Element | null>).filter((el): el is Element => Boolean(el)).map(describeElement),
        mode: this.getMode?.()
      })
    }
    const evt = new CustomEvent<CallDetail>(ev, { detail: { arg } })
    this.dispatchEvent(evt)
    return evt.detail.result
  }

  /**
   * Attaches a callback function to an event. Multiple handlers may be bound
   * to the same event name — each fires in registration order, backed by the
   * native `EventTarget` this class extends (previously a single-slot
   * registry where a later `bind()` silently clobbered an earlier one).
   * @param ev String indicating the name of the event
   * @param f The callback function to bind to the event
   */
  bind (ev: string, f: (win: Window, arg: unknown) => unknown): void {
    this.addEventListener(ev, (e: Event) => {
      const { detail } = e as CustomEvent<CallDetail>
      detail.result = f(window, detail.arg)
    })
  }

  /**
   * Flash the clipboard data momentarily on localStorage so all tabs can see.
   */
  flashStorage (): void {
    const data = sessionStorage.getItem(CLIPBOARD_ID)
    if (data === null) return
    localStorage.setItem(CLIPBOARD_ID, data)
    setTimeout(() => {
      localStorage.removeItem(CLIPBOARD_ID)
    }, 1)
  }

  /**
   * Selects only the given elements, shortcut for `clearSelection(); addToSelection()`.
   * @param elems an array of DOM elements to be selected
   * @param showGrips Indicates whether the resize grips should be shown
   */
  selectOnly (elems: ArrayLike<Element>, showGrips?: boolean): void {
    this.clearSelection(true)
    this.addToSelection(elems, showGrips)
  }

  /**
   * Removes elements from the selection.
   * @param elemsToRemove An array of elements to remove from selection
   */
  removeFromSelection (elemsToRemove: Element[]): void {
    if (!this.state.selection.elements[0]) {
      return
    }
    if (!elemsToRemove.length) {
      return
    }

    // find every element and remove it from our array copy
    const newSelectedItems = []
    const len = this.state.selection.elements.length
    for (let i = 0; i < len; ++i) {
      const elem = this.state.selection.elements[i]
      if (elem) {
        // keep the item
        if (!elemsToRemove.includes(elem)) {
          newSelectedItems.push(elem)
        } else {
          // remove the item and its selector
          this.selectorManager.releaseSelector(elem)
        }
      }
    }
    // the copy becomes the master now
    this.state.selection.elements = newSelectedItems
    this.updateGroupSelector()
  }

  /**
   * Clears the selection, then adds all elements in the current layer to the selection.
   */
  selectAllInCurrentLayer (): void {
    const currentLayer = this.getCurrentDrawing().getCurrentLayer()
    if (currentLayer) {
      this.state.drawing.currentMode = 'select'
      if (this.state.selection.currentGroup) {
        this.selectOnly(this.state.selection.currentGroup.children)
      } else {
        this.selectOnly(currentLayer.children)
      }
    }
  }

  getOpacity (): number {
    return this.state.style.shape.opacity as number
  }

  /**
   * Update configuration options with given values.
   * @param opts Object with options
   */
  setConfig (opts: Partial<Config>): void {
    Object.assign(this.curConfig, opts)
  }

  /**
   * @returns The current document title or an empty string if not found
   */
  getDocumentTitle (): string | void {
    return this.getTitle(this.svgContent)
  }

  getOffset () {
    return {
      x: Number(this.svgContent.getAttribute('x')),
      y: Number(this.svgContent.getAttribute('y'))
    }
  }

  getColor<K extends keyof StyleProps> (type: K): StyleProps[K] {
    return this.state.style.properties[type]
  }

  /**
   * @returns The current stroke-width value
   */
  getStrokeWidth (): number | string {
    return this.state.style.properties.stroke_width
  }

  /**
   * @returns current style options
   */
  getStyle (): StyleProps {
    return this.state.style.shape
  }

  /**
   * Sets the given opacity on the current selected elements.
   */
  setOpacity (val: number): void {
    this.state.style.shape.opacity = val
    this.changeSelectedAttribute('opacity', val)
  }

  /**
   * @returns the current fill opacity (a string once read from an element)
   */
  getFillOpacity (): number | string {
    return this.state.style.shape.fill_opacity
  }

  /**
   * @returns the current stroke opacity (a string once read from an element)
   */
  getStrokeOpacity (): number | string {
    return this.state.style.shape.stroke_opacity
  }

  /**
   * Sets the current fill/stroke opacity.
   * @param type String with "fill" or "stroke"
   * @param val number with the new opacity value
   * @param preventUndo Indicates whether or not this should be an undoable action
   */
  setPaintOpacity (type: string, val: number, preventUndo: boolean): void {
    (this.state.style.shape as unknown as Record<string, unknown>)[`${type}_opacity`] = val
    if (!preventUndo) {
      this.changeSelectedAttribute(`${type}-opacity`, val)
    } else {
      this.changeSelectedAttributeNoUndo(`${type}-opacity`, val)
    }
  }

  /**
   * Gets the `stdDeviation` blur value of the given element.
   * @param elem The element to check the blur value for
   * @returns stdDeviation blur attribute value (0 when unblurred)
   */
  getBlur (elem: Element): number | string {
    let val: number | string = 0
    if (elem) {
      const filterUrl = elem.getAttribute('filter')
      if (filterUrl) {
        const blur = this.getElement(`${elem.id}_blur`)
        if (blur) {
          val = (blur.firstChild as Element).getAttribute('stdDeviation') ?? 0
        } else {
          const filterElem = this.getRefElem(filterUrl)
          // The effect composer's filter (shadow / outline / glow) is not a
          // blur: a glow's feGaussianBlur must not read as the Blur value.
          const composed = filterElem?.hasAttribute('data-fx') || /_(fx|shadow)$/.test(filterElem?.id || '')
          const blurElem = composed ? null : getFeGaussianBlur(filterElem)
          if (blurElem !== null) {
            val = blurElem.getAttribute('stdDeviation') ?? 0
          }
        }
      }
    }
    return val
  }

  /**
   * Sets a given URL to be a "last good image" URL.
   */
  setGoodImage (val: string): void {
    this.lastGoodImgUrl = val
  }

  /**
   * Returns the current drawing as raw SVG XML text.
   * @returns The current drawing as raw SVG XML text.
   */
  getSvgString (): string {
    this.saveOptions.apply = false
    return this.svgCanvasToString()
  }

  /**
   * This function determines whether to use a nonce in the prefix, when
   * generating IDs for future documents in SVG-Edit.
   * If you're controlling SVG-Edit externally, and want randomized IDs, call
   * this BEFORE calling `svgCanvas.setSvgString`.
   * @param enableRandomization If true, adds a nonce to the prefix. Thus
   * `svgCanvas.randomizeIds() <==> svgCanvas.randomizeIds(true)`
   */
  randomizeIds (enableRandomization: boolean): void {
    if (arguments.length > 0 && enableRandomization === false) {
      this.randIdsMode = draw.randomizeIds(false, this.getCurrentDrawing())
    } else {
      this.randIdsMode = draw.randomizeIds(true, this.getCurrentDrawing())
    }
  }

  /**
   * Convert selected element to a path, or get the BBox of an element-as-path.
   * @todo (codedread): Remove the getBBox argument and split this function into two.
   * @param elem The DOM element to be converted
   * @param getBBox Boolean on whether or not to only return the path's BBox
   * @returns If the getBBox flag is true, the resulting path's bounding box object.
   * Otherwise the resulting path element is returned.
   */
  convertToPath (elem?: Element, getBBox?: boolean): void | import('./core/bbox-utils.ts').BBoxObject | false | SVGPathElement | null {
    // if elems not given, recursively call convertPath for all selected elements.
    if (!elem) {
      const elems = this.state.selection.elements
      elems.forEach(el => {
        if (el) {
          this.convertToPath(el)
        }
      })
      return undefined
    }
    if (getBBox) {
      return getBBoxOfElementAsPath(
        elem,
        this.addSVGElementsFromJson,
        this.pathActions
      )
    }
    // The path keeps the element's OWN paint/stroke attributes. (It used to take the
    // editor's current shape style, so converting an element whose style differed
    // from that global lost its fill, stroke and opacity.)
    const attrs: { [s: string]: string } = { visibility: 'hidden' }
    for (const name of ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-dasharray',
      'stroke-dashoffset', 'stroke-linejoin', 'stroke-linecap', 'stroke-miterlimit', 'stroke-opacity',
      'opacity', 'paint-order', 'style']) {
      const value = elem.getAttribute(name)
      if (value !== null) attrs[name] = value
    }
    return convertToPath(elem, attrs, this) // call convertToPath from path-utils.js
  }

  /**
   * Removes all selected elements from the DOM and adds the change to the
   * history stack. Remembers removed elements on the clipboard.
   */
  cutSelectedElements (): void {
    this.copySelectedElements()
    this.deleteSelectedElements()
  }

  /**
   * Creates modeChange event, adds it as an svgCanvas property
   * **/
  modeChangeEvent () {
    const modeEvent = new CustomEvent('modeChange', { detail: { getMode: () => this.getMode() } })
    this.modeEvent = modeEvent
  }
} // End class

// attach utilities function to the class that are used by SvgEdit so
// we can avoid using the whole utilities.js file in svgEdit.js

export default SvgCanvas
