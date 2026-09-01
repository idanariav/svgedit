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

import Paint from './core/paint.js'
import * as pathModule from './core/path.js'
import * as history from './core/history.js'
import * as draw from './core/draw.js'
import { init as pasteInit } from './core/paste-elem.js'
import { init as touchInit } from './core/touch.js'
import { svgRootElement } from './core/svgroot.js'
import { init as undoInit } from './core/undo.js'
import { init as selectionInit } from './core/selection.js'
import { init as textActionsInit } from './core/text-actions.js'
import { init as eventInit } from './core/event.js'
import { init as jsonInit } from './core/json.js'
import * as elemGetSet from './core/elem-get-set.js'
import { init as selectedElemInit } from './core/selected-elem.js'
import { init as blurInit } from './core/blur-event.js'
import { init as sanitizeInit } from './core/sanitize.js'
import { getReverseNS, NS } from './core/namespaces.js'
import {
  assignAttributes,
  cleanupElement,
  getUrlFromAttr,
  getHref,
  setHref,
  remapElementIdsAndRefs,
  init as domUtilsInit,
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
} from './core/dom-utils.js'
import {
  getBBoxOfElementAsPath,
  init as bboxUtilsInit
} from './core/bbox-utils.js'
import { convertToPath } from './core/path-utils.js'
import { encode64, decode64, blankPageObjectURL } from './core/encoding-utils.js'
import {
  matrixMultiply,
  hasMatrixTransform,
  transformListToTransform
} from './core/math.js'
import { convertToNum, init as unitsInit, getTypeMap, isValidUnit, convertUnit } from './core/units.js'
import { init as svgInit } from './core/svg-exec.js'
import { init as coordsInit } from './core/coords.js'
import { init as recalculateInit } from './core/recalculate.js'
import { init as selectInit } from './core/select.js'
import { init as clearInit } from './core/clear.js'
import { init as booleanOpsInit } from './core/boolean-ops.js'
import { init as pathOffsetInit } from './core/path-offset.js'
import { init as pathSimplifyInit } from './core/path-simplify.js'
import { init as cornerRadiusInit } from './core/corner-radius.js'
import { init as taperStrokeInit } from './core/taper-stroke.js'
import { init as textPathInit } from './core/text-path.js'
import { init as shapeBuilderInit } from './core/shape-builder.js'
import { init as clipMaskInit } from './core/clip-mask.js'
import { init as cutterInit } from './core/cutter.js'
import { init as segmentInit } from './core/segment.js'
import { init as imageCropInit } from './core/image-crop.js'
import {
  getClosest,
  getParents,
  mergeDeep
} from './common/util.js'
import { runGuardedInit } from './common/initGuard.js'

import dataStorage from './core/dataStorage.js'

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

/**
 * The main SvgCanvas class that manages all SVG-related functions.
 * @memberof module:svgcanvas
 *
 */
class SvgCanvas extends EventTarget {
  /**
   * @param {HTMLElement} container - The container HTML element that should hold the SVG root element
   * @param {module:SVGeditor.configObj.curConfig} config - An object that contains configuration data
   */
  constructor (container, config, scopeRoot = null) {
    super()
    // imported function made available as methods
    this.initializeSvgCanvasMethods()
    // Tracks which `core/*.js` init() call last claimed each property name
    // on this instance, so a later call reusing the same name gets logged
    // instead of silently overwriting the earlier one (see .claude/techdebt.md #8).
    const initGuardRegistry = new Map()
    runGuardedInit(this, 'units', unitsInit, initGuardRegistry)

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
      this.curConfig = SvgCanvas.mergeDeep(this.curConfig, config)
    }
    this.lastGoodImgUrl = `${this.curConfig.imgPath}/logo.svg` // String with image URL of last loadable image
    const { dimensions } = this.curConfig // Array with width/height of canvas

    // Object containing data for the currently selected styles
    const allProperties = {
      shape: {
        fill:
          (this.curConfig.initFill.color === 'none' ? '' : '#') +
          this.curConfig.initFill.color,
        fill_paint: null,
        fill_opacity: this.curConfig.initFill.opacity,
        stroke:
          (this.curConfig.initStroke.color === 'none' ? '' : '#') +
          this.curConfig.initStroke.color,
        stroke_paint: null,
        stroke_opacity: this.curConfig.initStroke.opacity,
        stroke_width: this.curConfig.initStroke.width,
        stroke_dasharray: 'none',
        stroke_linejoin: 'miter',
        stroke_linecap: 'butt',
        opacity: this.curConfig.initOpacity
      }
    }
    allProperties.text = SvgCanvas.mergeDeep({}, allProperties.shape)
    allProperties.text = SvgCanvas.mergeDeep(allProperties.text, {
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
    // properties (see .claude/techdebt.md history). curConfig (persisted
    // config), DOM refs, and already-object-scoped subsystems (undoMgr,
    // selectorManager, pathActions, ...) are intentionally NOT here — they
    // stay top-level instance properties.
    this.state = {
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
          // Mouse events
          minx: null,
          miny: null,
          maxx: null,
          maxy: null
        },
        dAttr: null,
        startX: null,
        startY: null,
        rStartX: null,
        rStartY: null,
        initBbox: {},
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
    }

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
      this.$id = scopedId(scopeRoot)
      this.$qq = scopedQq(scopeRoot)
      this.$qa = scopedQa(scopeRoot)
    }
    // This is a container for the document being edited, not the document itself.
    this.svgroot = svgRootElement(this.svgdoc, dimensions)
    container.append(this.svgroot)
    // The actual element that represents the final output SVG element.
    this.svgContent = this.svgdoc.createElementNS(NS.SVG, 'svg')
    runGuardedInit(this, 'touch', touchInit, initGuardRegistry)
    runGuardedInit(this, 'clear', clearInit, initGuardRegistry)
    this.clearSvgContentElement()
    // Current `draw.Drawing` object.
    this.current_drawing_ = new draw.Drawing(this.svgContent, this.idprefix)

    runGuardedInit(this, 'json', jsonInit, initGuardRegistry)
    runGuardedInit(this, 'domUtils', domUtilsInit, initGuardRegistry)
    runGuardedInit(this, 'bboxUtils', bboxUtilsInit, initGuardRegistry)
    // sanitizeInit needs getRefElem, set above by domUtilsInit
    runGuardedInit(this, 'sanitize', sanitizeInit, initGuardRegistry)
    runGuardedInit(this, 'coords', coordsInit, initGuardRegistry)
    runGuardedInit(this, 'recalculate', recalculateInit, initGuardRegistry)
    runGuardedInit(this, 'select', selectInit, initGuardRegistry)
    runGuardedInit(this, 'undo', undoInit, initGuardRegistry)
    runGuardedInit(this, 'selection', selectionInit, initGuardRegistry)

    this.nsMap = getReverseNS()
    // this.selectorManager is attached per-instance by selectInit()

    // this.pathActions is attached per-instance by pathActionsInit() (run inside pathModule.init)
    runGuardedInit(this, 'path', pathModule.init, initGuardRegistry)
    // Interface strings, usually for title elements
    this.uiStrings = {}

    // Animation element to change the opacity of any newly created element
    this.opacAni = document.createElementNS(NS.SVG, 'animate')
    this.opacAni.setAttribute('attributeName', 'opacity')
    this.opacAni.setAttribute('begin', 'indefinite')
    this.opacAni.setAttribute('dur', 1)
    this.opacAni.setAttribute('fill', 'freeze')
    this.svgroot.appendChild(this.opacAni)

    runGuardedInit(this, 'event', eventInit, initGuardRegistry)
    runGuardedInit(this, 'textActions', textActionsInit, initGuardRegistry)
    runGuardedInit(this, 'svg', svgInit, initGuardRegistry)
    runGuardedInit(this, 'draw', draw.init, initGuardRegistry)
    runGuardedInit(this, 'elemGetSet', elemGetSet.init, initGuardRegistry)

    // prevent links from being followed in the canvas
    const handleLinkInCanvas = e => {
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

    runGuardedInit(this, 'blur', blurInit, initGuardRegistry)
    runGuardedInit(this, 'selectedElem', selectedElemInit, initGuardRegistry)
    runGuardedInit(this, 'booleanOps', booleanOpsInit, initGuardRegistry)
    runGuardedInit(this, 'pathOffset', pathOffsetInit, initGuardRegistry)
    runGuardedInit(this, 'pathSimplify', pathSimplifyInit, initGuardRegistry)
    runGuardedInit(this, 'cornerRadius', cornerRadiusInit, initGuardRegistry)
    runGuardedInit(this, 'taperStroke', taperStrokeInit, initGuardRegistry)
    runGuardedInit(this, 'textPath', textPathInit, initGuardRegistry)
    runGuardedInit(this, 'shapeBuilder', shapeBuilderInit, initGuardRegistry)
    runGuardedInit(this, 'clipMask', clipMaskInit, initGuardRegistry)
    runGuardedInit(this, 'cutter', cutterInit, initGuardRegistry)
    runGuardedInit(this, 'segment', segmentInit, initGuardRegistry)
    runGuardedInit(this, 'imageCrop', imageCropInit, initGuardRegistry)

    /**
     * Transfers sessionStorage from one tab to another.
     * @param {!Event} ev Storage event.
     * @returns {void}
     */
    const storageChange = ev => {
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
    this.destroyAbort = new AbortController()
    window.addEventListener('storage', storageChange, { signal: this.destroyAbort.signal })
    // Ask other tabs for sessionStorage (this is ONLY to trigger event).
    localStorage.setItem(`${CLIPBOARD_ID}_startup`, Math.random())

    runGuardedInit(this, 'paste', pasteInit, initGuardRegistry)

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
   * @returns {void}
   */
  destroy () {
    this.destroyAbort?.abort()
  }

  getSvgOption () {
    return this.saveOptions
  }

  setSvgOption (key, value) {
    this.saveOptions[key] = value
  }

  getSelectedElements () {
    return this.state.selection.elements
  }

  setSelectedElements (key, value) {
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

  setIdPrefix (p) {
    this.idprefix = p
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

  setBrushParams (params) {
    Object.assign(this.state.style.brush, params)
    return this.state.style.brush
  }

  getCurrentGroup () {
    return this.state.selection.currentGroup
  }

  /**
   * Read-only snapshot of internal visibility state that can desync from the
   * live model (selection box shown for a deselected element, path-node
   * grips left visible from a previously-edited path, group-context sibling
   * dimming not cleared on leaveContext(), a clip-path/mask reference whose
   * target no longer exists). Each subsection marks `stale` entries — state
   * that is currently rendered but no longer backed by the model — for a
   * debug-mode UI to surface. No side effects.
   * @returns {object}
   */
  getDebugSnapshot () {
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
    const gripContainer = this.getElement('pathpointgrip_container')
    const GRIP_ID_RE = /^(pathpointgrip|ctrlpointgrip|ctrlLine|segline)_(\d+)(?:c[12])?$/
    const grips = []
    if (gripContainer) {
      for (const el of gripContainer.children) {
        const m = el.id.match(GRIP_ID_RE)
        if (!m) continue
        const index = Number(m[2])
        const display = el.getAttribute('display')
        grips.push({
          id: el.id,
          kind: m[1],
          index,
          display,
          stale: display === 'inline' && (!pathElemId || index >= segCount)
        })
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
    const maskRefs = []
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
      pathEditing: { pathElemId, segCount, grips },
      masking: { refs: maskRefs, stale: maskRefs.some((r) => !r.refExists) }
    }
  }

  getBaseUnit () {
    return this.curConfig.baseUnit
  }

  getHeight () {
    return this.svgContent.getAttribute('height') / this.state.zoom.value
  }

  getWidth () {
    return this.svgContent.getAttribute('width') / this.state.zoom.value
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

  setStartTransform (transform) {
    this.state.drawing.startTransform = transform
  }

  getZoom () {
    return this.state.zoom.value
  }

  round (val) {
    const { value: zoom } = this.state.zoom
    return Number.parseInt(val * zoom) / zoom
  }

  createSVGElement (jsonMap) {
    return this.addSVGElementsFromJson(jsonMap)
  }

  getContainer () {
    return this.container
  }

  setStarted (s) {
    this.state.drawing.started = s
  }

  getRubberBox () {
    return this.state.selection.rubberBox
  }

  setRubberBox (rb) {
    this.state.selection.rubberBox = rb
    return this.state.selection.rubberBox
  }

  addPtsToSelection ({ closedSubpath, grips }) {
    // TODO: Correct this:
    this.pathActions.canDeleteNodes = true
    this.pathActions.closed_subpath = closedSubpath
    this.call('pointsAdded', { closedSubpath, grips })
    this.call('selected', grips)
  }

  /**
   * @param {PlainObject} changes
   * @param {ChangeElementCommand} changes.cmd
   * @param {SVGPathElement} changes.elem
   * @fires module:svgcanvas.SvgCanvas#event:changed
   * @returns {void}
   */
  endChanges ({ cmd, elem }) {
    this.addCommandToHistory(cmd)
    this.call('changed', [elem])
  }

  getCurrentMode () {
    return this.state.drawing.currentMode
  }

  setCurrentMode (cm) {
    this.state.drawing.currentMode = cm
    return this.state.drawing.currentMode
  }

  getToolLocked () {
    return this.state.drawing.toolLocked
  }

  setToolLocked (b) {
    this.state.drawing.toolLocked = b
    return this.state.drawing.toolLocked
  }

  getTextFreshCreate () {
    return this.state.drawing.textFreshCreate
  }

  setTextFreshCreate (b) {
    this.state.drawing.textFreshCreate = b
    return this.state.drawing.textFreshCreate
  }

  getDrawnPath () {
    return this.state.drawing.drawnPath
  }

  setDrawnPath (dp) {
    this.state.drawing.drawnPath = dp
    return this.state.drawing.drawnPath
  }

  setCurrentGroup (cg) {
    this.state.selection.currentGroup = cg
  }

  changeSvgContent () {
    this.call('changed', [this.svgContent])
  }

  getStarted () {
    return this.state.drawing.started
  }

  getCanvas () {
    return this
  }

  getrootSctm () {
    return this.state.zoom.rootSctm
  }

  getStartX () {
    return this.state.drawing.startX
  }

  setStartX (value) {
    this.state.drawing.startX = value
  }

  getStartY () {
    return this.state.drawing.startY
  }

  setStartY (value) {
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
    return this.parameter
  }

  getNextParameter () {
    return this.nextParameter
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

  getStart (key) {
    return this.state.drawing.start[key]
  }

  getEnd (key) {
    return this.state.drawing.end[key]
  }

  getbSpline (key) {
    return this.state.drawing.bSpline[key]
  }

  getNextPos (key) {
    return this.state.drawing.nextPos[key]
  }

  getControllPoint1 (key) {
    return this.state.drawing.controllPoint1[key]
  }

  getControllPoint2 (key) {
    return this.state.drawing.controllPoint2[key]
  }

  getFreehand (key) {
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

  getCurText (key) {
    return this.state.style.text[key]
  }

  setDAttr (value) {
    this.state.drawing.dAttr = value
  }

  setEnd (key, value) {
    this.state.drawing.end[key] = value
  }

  setControllPoint1 (key, value) {
    this.state.drawing.controllPoint1[key] = value
  }

  setControllPoint2 (key, value) {
    this.state.drawing.controllPoint2[key] = value
  }

  setJustSelected (value) {
    this.state.selection.justSelected = value
  }

  setParameter (value) {
    this.parameter = value
  }

  setStart (value) {
    this.state.drawing.start = value
  }

  setRStartX (value) {
    this.state.drawing.rStartX = value
  }

  setRStartY (value) {
    this.state.drawing.rStartY = value
  }

  setSumDistance (value) {
    this.state.drawing.sumDistance = value
  }

  setbSpline (value) {
    this.state.drawing.bSpline = value
  }

  setNextPos (value) {
    this.state.drawing.nextPos = value
  }

  setNextParameter (value) {
    this.nextParameter = value
  }

  setCurText (key, value) {
    this.state.style.text[key] = value
  }

  setFreehand (key, value) {
    this.state.drawing.freehand[key] = value
  }

  setCurBBoxes (value) {
    this.state.selection.bboxes = value
  }

  getCurBBoxes () {
    return this.state.selection.bboxes
  }

  setInitBbox (value) {
    this.state.drawing.initBbox = value
  }

  setRootSctm (value) {
    this.state.zoom.rootSctm = value
  }

  setCurrentResizeMode (value) {
    this.state.drawing.currentResizeMode = value
  }

  getLastClickPoint (key) {
    return this.state.drawing.lastClickPoint[key]
  }

  setLastClickPoint (value) {
    this.state.drawing.lastClickPoint = value
  }

  getId () {
    return this.getCurrentDrawing().getId()
  }

  getUIStrings () {
    return this.uiStrings
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

  getEncodableImages (key) {
    return this.encodableImages[key]
  }

  setEncodableImages (key, value) {
    this.encodableImages[key] = value
  }

  getEncodableFonts () {
    return this.encodableFonts
  }

  setEncodableFont (family, base64) {
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

  setZoom (value) {
    this.state.zoom.value = value
  }

  getImportIds (key) {
    return this.importIds[key]
  }

  setImportIds (key, value) {
    this.importIds[key] = value
  }

  setRemovedElements (key, value) {
    this.removedElements[key] = value
  }

  setSvgContent (value) {
    this.svgContent = value
  }

  getrefAttrs () {
    return refAttrs
  }

  setCanvas (key, value) {
    this[key] = value
  }

  setCurProperties (key, value) {
    this.state.style.properties[key] = value
  }

  getCurProperties (key) {
    return this.state.style.properties[key]
  }

  setCurShape (key, value) {
    this.state.style.shape[key] = value
  }

  gettingSelectorManager () {
    return this.selectorManager
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
    return this.extensions
  }

  getSelector () {
    return this.SelectorClass
  }

  getMode () {
    return this.state.drawing.currentMode
  } // The current editor mode string

  getNextId (elemType = null) {
    return this.getCurrentDrawing().getNextId(elemType)
  }

  getNextIdWithPrefix (prefix) {
    return this.getCurrentDrawing().getNextIdWithPrefix(prefix)
  }

  getNonceId (base) {
    return this.getCurrentDrawing().getNonceId(base)
  }

  getCurCommand () {
    return this.state.history.curCommand
  }

  setCurCommand (value) {
    this.state.history.curCommand = value
  }

  getFilter () {
    return this.state.drawing.filter
  }

  setFilter (value) {
    this.state.drawing.filter = value
  }

  getFilterHidden () {
    return this.state.drawing.filterHidden
  }

  setFilterHidden (value) {
    this.state.drawing.filterHidden = value
  }

  /**
   * Sets the editor's mode to the given string.
   * @function module:svgcanvas.SvgCanvas#setMode
   * @param {string} name - String with the new mode to change to
   * @returns {void}
   */
  setMode (name) {
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
      console.warn('svgedit: pathActions.clear() failed during setMode; continuing', e)
    }
    try {
      this.textActions.clear()
    } catch (e) {
      console.warn('svgedit: textActions.clear() failed during setMode; continuing', e)
    }
    this.state.style.properties =
      this.state.selection.elements[0]?.nodeName === 'text'
        ? this.state.style.text
        : this.state.style.shape
    this.state.drawing.currentMode = name

    // fires modeChange event for the editor
    if (this.modeEvent) {
      document.dispatchEvent(this.modeEvent)
    }
  }

  /**
   * Clears the current document. This is not an undoable action.
   * @function module:svgcanvas.SvgCanvas#clear
   * @fires module:svgcanvas.SvgCanvas#event:beforeClear|afterClear
   * @returns {void}
   */
  clear () {
    this.call('beforeClear')
    this.pathActions.clear()
    this.clearSelection()
    // clear the svgcontent node
    this.clearSvgContentElement()
    // create new document
    this.current_drawing_ = new draw.Drawing(this.svgContent)
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

  async addExtension (name, extInitFunc, { importLocale }) {
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
    const extObj = await extInitFunc(argObj)
    if (extObj) {
      extObj.name = name
    }
    this.extensions[name] = extObj
    return this.call('extension_added', extObj)
  }

  addCommandToHistory (cmd) {
    this.undoMgr.addCommandToHistory(cmd)
  }

  restoreRefElements (elem) {
    // Look for missing reference elements, restore any found
    const attrs = {}
    refAttrs.forEach((item, _) => {
      attrs[item] = elem.getAttribute(item)
    })
    Object.values(attrs).forEach(val => {
      if (val?.startsWith('url(')) {
        const id = getUrlFromAttr(val).slice(1)
        const ref = this.getElement(id)
        // Only restore a ref we actually tracked when it was removed. Appending
        // a missing (undefined) entry injects a literal "undefined" text node
        // into <defs> and never restores the paint server (e.g. cross-document
        // paste, where the def was never removed from *this* canvas).
        if (!ref && this.removedElements[id]) {
          this.findDefs().append(this.removedElements[id])
          delete this.removedElements[id]
        }
      }
    })
    const childs = elem.getElementsByTagName('*')

    if (childs.length) {
      for (let i = 0, l = childs.length; i < l; i++) {
        this.restoreRefElements(childs[i])
      }
    }
  }

  call (ev, arg) {
    const evt = new CustomEvent(ev, { detail: { arg } })
    this.dispatchEvent(evt)
    return evt.detail.result
  }

  /**
   * Attaches a callback function to an event. Multiple handlers may be bound
   * to the same event name — each fires in registration order, backed by the
   * native `EventTarget` this class extends (previously a single-slot
   * registry where a later `bind()` silently clobbered an earlier one).
   * @function module:svgcanvas.SvgCanvas#bind
   * @param  {string} ev - String indicating the name of the event
   * @param {module:svgcanvas.EventHandler} f - The callback function to bind to the event
   * @returns {void}
   */
  bind (ev, f) {
    this.addEventListener(ev, (e) => { e.detail.result = f(window, e.detail.arg) })
  }

  /**
   * Flash the clipboard data momentarily on localStorage so all tabs can see.
   * @returns {void}
   */
  flashStorage () {
    const data = sessionStorage.getItem(CLIPBOARD_ID)
    localStorage.setItem(CLIPBOARD_ID, data)
    setTimeout(() => {
      localStorage.removeItem(CLIPBOARD_ID)
    }, 1)
  }

  /**
   * Selects only the given elements, shortcut for `clearSelection(); addToSelection()`.
   * @function module:svgcanvas.SvgCanvas#selectOnly
   * @param {Element[]} elems - an array of DOM elements to be selected
   * @param {boolean} showGrips - Indicates whether the resize grips should be shown
   * @returns {void}
   */
  selectOnly (elems, showGrips) {
    this.clearSelection(true)
    this.addToSelection(elems, showGrips)
  }

  /**
   * Removes elements from the selection.
   * @function module:svgcanvas.SvgCanvas#removeFromSelection
   * @param {Element[]} elemsToRemove - An array of elements to remove from selection
   * @returns {void}
   */
  removeFromSelection (elemsToRemove) {
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
   * @function module:svgcanvas.SvgCanvas#selectAllInCurrentLayer
   * @returns {void}
   */
  selectAllInCurrentLayer () {
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

  getOpacity () {
    return this.state.style.shape.opacity
  }

  /**
   * @function module:svgcanvas.SvgCanvas#getSnapToGrid
   * @returns {boolean} The current snap to grid setting
   */
  getSnapToGrid () {
    return this.curConfig.gridSnapping
  }

  /**
   * @function module:svgcanvas.SvgCanvas#getVersion
   * @returns {string} A string which describes the revision number of SvgCanvas.
   */
  getVersion () {
    return 'svgcanvas.js ($Rev$)'
  }

  /**
   * Update interface strings with given values.
   * @function module:svgcanvas.SvgCanvas#setUiStrings
   * @param {module:path.uiStrings} strs - Object with strings (see the [locales API]{@link module:locale.LocaleStrings} and the [tutorial]{@tutorial LocaleDocs})
   * @returns {void}
   */
  setUiStrings (strs) {
    Object.assign(this.uiStrings, strs.notification)
    this.setUiStrings(strs)
  }

  /**
   * Update configuration options with given values.
   * @function module:svgcanvas.SvgCanvas#setConfig
   * @param {module:SVGEditor.Config} opts - Object with options
   * @returns {void}
   */
  setConfig (opts) {
    Object.assign(this.curConfig, opts)
  }

  /**
   * @function module:svgcanvas.SvgCanvas#getDocumentTitle
   * @returns {string|void} The current document title or an empty string if not found
   */
  getDocumentTitle () {
    return this.getTitle(this.svgContent)
  }

  getOffset () {
    return {
      x: Number(this.svgContent.getAttribute('x')),
      y: Number(this.svgContent.getAttribute('y'))
    }
  }

  getColor (type) {
    return this.state.style.properties[type]
  }

  setStrokePaint (paint) {
    this.setPaint('stroke', paint)
  }

  /**
   * @function module:svgcanvas.SvgCanvas#setFillPaint
   * @param {module:jGraduate~Paint} paint
   * @returns {void}
   */
  setFillPaint (paint) {
    this.setPaint('fill', paint)
  }

  /**
   * @function module:svgcanvas.SvgCanvas#getStrokeWidth
   * @returns {Float|string} The current stroke-width value
   */
  getStrokeWidth () {
    return this.state.style.properties.stroke_width
  }

  /**
   * @function module:svgcanvas.SvgCanvas#getStyle
   * @returns {module:svgcanvas.StyleOptions} current style options
   */
  getStyle () {
    return this.state.style.shape
  }

  /**
   * Sets the given opacity on the current selected elements.
   * @function module:svgcanvas.SvgCanvas#setOpacity
   * @param {string} val
   * @returns {void}
   */
  setOpacity (val) {
    this.state.style.shape.opacity = val
    this.changeSelectedAttribute('opacity', val)
  }

  /**
   * @function module:svgcanvas.SvgCanvas#getFillOpacity
   * @returns {Float} the current fill opacity
   */
  getFillOpacity () {
    return this.state.style.shape.fill_opacity
  }

  /**
   * @function module:svgcanvas.SvgCanvas#getStrokeOpacity
   * @returns {string} the current stroke opacity
   */
  getStrokeOpacity () {
    return this.state.style.shape.stroke_opacity
  }

  /**
   * Sets the current fill/stroke opacity.
   * @function module:svgcanvas.SvgCanvas#setPaintOpacity
   * @param {string} type - String with "fill" or "stroke"
   * @param {Float} val - Float with the new opacity value
   * @param {boolean} preventUndo - Indicates whether or not this should be an undoable action
   * @returns {void}
   */
  setPaintOpacity (type, val, preventUndo) {
    this.state.style.shape[`${type}_opacity`] = val
    if (!preventUndo) {
      this.changeSelectedAttribute(`${type}-opacity`, val)
    } else {
      this.changeSelectedAttributeNoUndo(`${type}-opacity`, val)
    }
  }

  /**
   * Gets the current fill/stroke opacity.
   * @function module:svgcanvas.SvgCanvas#getPaintOpacity
   * @param {"fill"|"stroke"} type - String with "fill" or "stroke"
   * @returns {Float} Fill/stroke opacity
   */
  getPaintOpacity (type) {
    return type === 'fill' ? this.getFillOpacity() : this.getStrokeOpacity()
  }

  /**
   * Gets the `stdDeviation` blur value of the given element.
   * @function module:svgcanvas.SvgCanvas#getBlur
   * @param {Element} elem - The element to check the blur value for
   * @returns {string} stdDeviation blur attribute value
   */
  getBlur (elem) {
    let val = 0
    if (elem) {
      const filterUrl = elem.getAttribute('filter')
      if (filterUrl) {
        const blur = this.getElement(`${elem.id}_blur`)
        if (blur) {
          val = blur.firstChild.getAttribute('stdDeviation')
        } else {
          const filterElem = this.getRefElem(filterUrl)
          const blurElem = getFeGaussianBlur(filterElem)
          if (blurElem !== null) {
            val = blurElem.getAttribute('stdDeviation')
          }
        }
      }
    }
    return val
  }

  /**
   * Sets a given URL to be a "last good image" URL.
   * @function module:svgcanvas.SvgCanvas#setGoodImage
   * @param {string} val
   * @returns {void}
   */
  setGoodImage (val) {
    this.lastGoodImgUrl = val
  }

  /**
   * Returns the current drawing as raw SVG XML text.
   * @function module:svgcanvas.SvgCanvas#getSvgString
   * @returns {string} The current drawing as raw SVG XML text.
   */
  getSvgString () {
    this.saveOptions.apply = false
    return this.svgCanvasToString()
  }

  /**
   * This function determines whether to use a nonce in the prefix, when
   * generating IDs for future documents in SVG-Edit.
   * If you're controlling SVG-Edit externally, and want randomized IDs, call
   * this BEFORE calling `svgCanvas.setSvgString`.
   * @function module:svgcanvas.SvgCanvas#randomizeIds
   * @param {boolean} [enableRandomization] If true, adds a nonce to the prefix. Thus
   * `svgCanvas.randomizeIds() <==> svgCanvas.randomizeIds(true)`
   * @returns {void}
   */
  randomizeIds (enableRandomization) {
    if (arguments.length > 0 && enableRandomization === false) {
      draw.randomizeIds(false, this.getCurrentDrawing())
    } else {
      draw.randomizeIds(true, this.getCurrentDrawing())
    }
  }

  /**
   * Convert selected element to a path, or get the BBox of an element-as-path.
   * @function module:svgcanvas.SvgCanvas#convertToPath
   * @todo (codedread): Remove the getBBox argument and split this function into two.
   * @param {Element} elem - The DOM element to be converted
   * @param {boolean} getBBox - Boolean on whether or not to only return the path's BBox
   * @returns {void|DOMRect|false|SVGPathElement|null} If the getBBox flag is true, the resulting path's bounding box object.
   * Otherwise the resulting path element is returned.
   */
  convertToPath (elem, getBBox) {
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
    // TODO: Why is this applying attributes from the current shape style, then inside utilities.convertToPath it's pulling addition attributes from elem?
    // TODO: If convertToPath is called with one elem, curShape and elem are probably the same; but calling with multiple is a bug or cool feature.
    const curShape = this.state.style.shape
    const attrs = {
      fill: curShape.fill,
      'fill-opacity': curShape.fill_opacity,
      stroke: curShape.stroke,
      'stroke-width': curShape.stroke_width,
      'stroke-dasharray': curShape.stroke_dasharray,
      'stroke-linejoin': curShape.stroke_linejoin,
      'stroke-linecap': curShape.stroke_linecap,
      'stroke-opacity': curShape.stroke_opacity,
      opacity: curShape.opacity,
      visibility: 'hidden'
    }
    return convertToPath(elem, attrs, this) // call convertToPath from path-utils.js
  }

  /**
   * Removes all selected elements from the DOM and adds the change to the
   * history stack. Remembers removed elements on the clipboard.
   * @function module:svgcanvas.SvgCanvas#cutSelectedElements
   * @returns {void}
   */
  cutSelectedElements () {
    this.copySelectedElements()
    this.deleteSelectedElements()
  }

  initializeSvgCanvasMethods () {
    // getJsonFromSvgElements / addSVGElementsFromJson are attached per-instance by jsonInit()
    // clearSvgContentElement is attached per-instance by clearInit()
    // textActions is attached per-instance by textActionsInit()
    // getElement / findDefs / getRefElem / getReferencedDefElements /
    // getRotationAngle / snapToGrid / snapPointToGrid are attached
    // per-instance by domUtilsInit() (run later in the constructor); getBBox /
    // getVisibleElements / getStrokedBBoxDefaultVisible / getStrokedBBox by
    // bboxUtilsInit(); sanitizeSvg by sanitizeInit().
    this.stringToHTML = stringToHTML
    this.insertChildAtIndex = insertChildAtIndex
    this.getClosest = getClosest
    this.getParents = getParents
    this.isLayer = draw.Layer.isLayer
    this.matrixMultiply = matrixMultiply
    this.hasMatrixTransform = hasMatrixTransform
    this.transformListToTransform = transformListToTransform
    this.convertToNum = convertToNum
    this.convertUnit = convertUnit
    this.remapElementIdsAndRefs = remapElementIdsAndRefs
    this.getUrlFromAttr = getUrlFromAttr
    this.getHref = getHref
    this.setHref = setHref
    this.assignAttributes = assignAttributes
    this.cleanupElement = cleanupElement
    // remapElement / recalculateDimensions are attached per-instance by coordsInit() / recalculateInit()
    // pasteElements is attached per-instance by pasteInit()
    // The layer/context operations (identifyLayers, createLayer, leaveContext, …)
    // are attached per-instance by draw.init().
    // changeSelectedAttributeNoUndo / changeSelectedAttribute are attached per-instance by undoInit()
    // setBlurNoUndo / setBlurOffsets / setBlur are attached per-instance by blurInit().
    // smoothControlPoints is attached per-instance by pathModule.init()
    this.getTypeMap = getTypeMap
    this.history = history // object with all histor methods
    this.NS = NS
    this.$id = $id
    this.$qq = $qq
    this.$qa = $qa
    this.$click = $click
    this.encode64 = encode64
    this.decode64 = decode64
    this.mergeDeep = mergeDeep
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
SvgCanvas.$id = $id
SvgCanvas.$qq = $qq
SvgCanvas.$qa = $qa
SvgCanvas.scopedId = scopedId
SvgCanvas.scopedQq = scopedQq
SvgCanvas.scopedQa = scopedQa
SvgCanvas.$click = $click
SvgCanvas.encode64 = encode64
SvgCanvas.decode64 = decode64
SvgCanvas.mergeDeep = mergeDeep
SvgCanvas.getClosest = getClosest
SvgCanvas.getParents = getParents
SvgCanvas.blankPageObjectURL = blankPageObjectURL
SvgCanvas.Paint = Paint
SvgCanvas.getTypeMap = getTypeMap
SvgCanvas.convertToNum = convertToNum
SvgCanvas.isValidUnit = isValidUnit
SvgCanvas.convertUnit = convertUnit

export default SvgCanvas
