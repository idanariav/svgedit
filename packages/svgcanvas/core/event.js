/**
 * Tools for event.
 * @module event
 * @license MIT
 * @copyright 2011 Jeff Schiller
 */
import {
  cleanupElement
} from './dom-utils.js'
import {
  convertAttrs
} from './units.js'
import {
  transformPoint, getTransformList, transformListToTransform
} from './math.js'
import * as hstry from './history.js'
import { error as logError } from '../common/logger.js'
import { findPos } from '../../svgcanvas/common/util.js'
import { isCreateInCurrentGroup, toCurrentGroupLocalPoint } from './event-group-context.js'
import Layer from './layer.js'
import { init as eventZoomInit } from './event-zoom.js'
import { init as eventTextEditInit } from './event-text-edit.js'
import { init as eventPathEditInit } from './event-path-edit.js'
import { init as eventShapeDrawInit } from './event-shape-draw.js'
import { init as eventResizeInit } from './event-resize.js'
import { init as eventRotateInit } from './event-rotate.js'
import { init as eventSelectInit } from './event-select.js'

const {
  InsertElementCommand
} = hstry

/**
* @function module:undo.init
* @param {module:undo.eventContext} eventContext
* @returns {void}
*/
export const init = (canvas) => {
  const svgCanvas = canvas // per-instance; functions below are closed over it
  const eventZoom = eventZoomInit(svgCanvas)
  const eventTextEdit = eventTextEditInit(svgCanvas)
  const eventPathEdit = eventPathEditInit(svgCanvas)
  const eventShapeDraw = eventShapeDrawInit(svgCanvas)
  const eventResize = eventResizeInit(svgCanvas)
  const eventRotate = eventRotateInit(svgCanvas)
  const eventSelect = eventSelectInit(svgCanvas)

/**
 *
 * @param {MouseEvent} evt
 * @fires module:svgcanvas.SvgCanvas#event:transition
 * @fires module:svgcanvas.SvgCanvas#event:ext_mouseMove
 * @returns {void}
 */
const mouseMoveEvent = (evt) => {
  // if the mouse is move without dragging an element, just return.
  if (!svgCanvas.getStarted()) { return }
  if (evt.button === 1 || svgCanvas.spaceKey) { return }

  svgCanvas.textActions.init()

  evt.preventDefault()

  const selectedElements = svgCanvas.getSelectedElements()
  const zoom = svgCanvas.getZoom()
  const svgRoot = svgCanvas.getSvgRoot()
  const selected = selectedElements[0]

  const pt = transformPoint(evt.clientX, evt.clientY, svgCanvas.getrootSctm())
  const mouseX = pt.x * zoom
  const mouseY = pt.y * zoom
  const shape = svgCanvas.getElement(svgCanvas.getId())

  let realX = mouseX / zoom
  let x = realX
  let realY = mouseY / zoom
  let y = realY

  // Match the mouseDown remap: while drawing inside a group, size/position the
  // shape in the group's local space (no-op outside a group / in select modes).
  if (isCreateInCurrentGroup(svgCanvas)) {
    ({ x, y } = toCurrentGroupLocalPoint(svgCanvas, x, y))
    realX = x
    realY = y
  }

  if (svgCanvas.getCurConfig().gridSnapping) {
    ({ x, y } = svgCanvas.snapPointToGrid(x, y))
  }

  switch (svgCanvas.getCurrentMode()) {
    case 'select': {
      eventSelect.move(evt, { selectedElements, selected, x, y, zoom, svgRoot })
      break
    }
    case 'multiselect': {
      eventSelect.multiselectMove(evt, { selectedElements, realX, realY, zoom })
      break
    }
    case 'resize': {
      eventResize.move(evt, { selected, x, y, svgRoot, selectedElements })
      break
    }
    case 'zoom': {
      eventZoom.move(evt, { realX, realY, zoom })
      break
    }
    case 'text':
    case 'line':
    case 'foreignObject':
    case 'frame':
    case 'square':
    case 'rect':
    case 'image':
    case 'circle':
    case 'ellipse':
    case 'fhellipse':
    case 'fhrect':
    case 'fhpath': {
      eventShapeDraw.move(evt, { x, y, realX, realY, shape })
      break
    }
    case 'path': // fall through
    case 'pathedit': {
      eventPathEdit.move(evt, { x, y, zoom, realX, realY })
      break
    }
    case 'textedit': {
      eventTextEdit.move(evt, { mouseX, mouseY })
      break
    }
    case 'rotate': {
      eventRotate.move(evt, { selected, x, y, selectedElements })
      break
    }
    default:
      // A mode can be defined by an extenstion
      break
  }

  /**
  * The mouse has moved on the canvas area.
  * @event module:svgcanvas.SvgCanvas#event:ext_mouseMove
  * @type {PlainObject}
  * @property {MouseEvent} event The event object
  * @property {Float} mouse_x x coordinate on canvas
  * @property {Float} mouse_y y coordinate on canvas
  * @property {Element} selected Refers to the first selected element
  */
  svgCanvas.runExtensions('mouseMove', /** @type {module:svgcanvas.SvgCanvas#event:ext_mouseMove} */ {
    event: evt,
    mouse_x: mouseX,
    mouse_y: mouseY,
    selected
  })
} // mouseMove()

/**
*
* @returns {void}
*/
const mouseOutEvent = (evt) => {
  const { $id } = svgCanvas
  if (svgCanvas.getCurrentMode() !== 'select' && svgCanvas.getStarted()) {
    const event = new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      clientX: evt?.clientX ?? 0,
      clientY: evt?.clientY ?? 0,
      button: evt?.button ?? 0,
      buttons: evt?.buttons ?? 0,
      altKey: evt?.altKey ?? false,
      ctrlKey: evt?.ctrlKey ?? false,
      metaKey: evt?.metaKey ?? false,
      shiftKey: evt?.shiftKey ?? false
    })
    $id('svgcanvas').dispatchEvent(event)
  }
}

// - in create mode, the element's opacity is set properly, we create an InsertElementCommand
// and store it on the Undo stack
// - in move/resize mode, the element's attributes which were affected by the move/resize are
// identified, a ChangeElementCommand is created and stored on the stack for those attrs
// this is done in when we recalculate the selected dimensions()
/**
* A throw anywhere in this pipeline (each step's output feeds the next, so
* steps can't be isolated/continued independently the way the editor-layer
* update chains are) must not leave drag state stuck for the rest of the
* gesture — a thrown error here still bubbles to the DOM listener (which
* swallows it), but the flags below would otherwise stay in whatever
* mid-gesture state they were in, wedging future mouseDown/mouseUp handling.
* @param {MouseEvent} evt
* @fires module:svgcanvas.SvgCanvas#event:zoomed
* @fires module:svgcanvas.SvgCanvas#event:changed
* @fires module:svgcanvas.SvgCanvas#event:ext_mouseUp
* @returns {void}
*/
const mouseUpEvent = (evt) => {
  try {
    mouseUpEventImpl(evt)
  } catch (err) {
    logError('mouseUpEvent failed; resetting drag state', err, 'event')
    svgCanvas.setStarted(false)
    svgCanvas.hasDragStartTransform = false
    svgCanvas.dragStartTransforms = null
    svgCanvas.groupResizeStart = null
    svgCanvas.groupRotateStart = null
    svgCanvas.groupRotateCenter = null
    svgCanvas.groupRotateBBox = null
    svgCanvas.setStartTransform(null)
  }
}

const mouseUpEventImpl = (evt) => {
  evt.preventDefault()
  svgCanvas.moveSelectionThresholdReached = false
  svgCanvas.dragStartBBox = null
  svgCanvas.showSnapGuides?.(null) // clear any proportion snap guide lines
  svgCanvas.smartSnapTargets = null
  svgCanvas.showSmartGuides?.(null) // clear any smart alignment guide lines
  const pendingMove = svgCanvas.pendingMoveDelta
  svgCanvas.pendingMoveDelta = null
  if (evt.button === 2) { return }
  if (!svgCanvas.getStarted()) { return }

  svgCanvas.textActions.init()

  const selectedElements = svgCanvas.getSelectedElements()
  const zoom = svgCanvas.getZoom()

  const tempJustSelected = svgCanvas.getJustSelected()
  svgCanvas.setJustSelected(null)

  const pt = transformPoint(evt.clientX, evt.clientY, svgCanvas.getrootSctm())
  const mouseX = pt.x * zoom
  const mouseY = pt.y * zoom
  const x = mouseX / zoom
  const y = mouseY / zoom

  let element = svgCanvas.getElement(svgCanvas.getId())
  let keep = false

  const realX = x
  const realY = y

  // TODO: Make true when in multi-unit mode
  const useUnit = false // (svgCanvas.getCurConfig().baseUnit !== 'px');
  svgCanvas.setStarted(false)
  let t
  // Capture the mode before the 'resize'/'multiselect' cases reset it to 'select'.
  // Resize must be flattened via recalculateDimensions (which bakes the scale into
  // real attributes like width/height/font-size), not consolidated into a matrix.
  const operationMode = svgCanvas.getCurrentMode()
  switch (svgCanvas.getCurrentMode()) {
    // intentionally fall-through to select here (handled inside eventSelect.up)
    case 'resize':
    case 'multiselect':
    case 'select':
      eventSelect.up(evt, { realX, realY, selectedElements, operationMode, pendingMove, tempJustSelected })
      return
    case 'zoom': {
      eventZoom.up(evt, { realX, realY })
      return
    } case 'fhpath':
    case 'line':
    case 'foreignObject':
    case 'frame':
    case 'square':
    case 'rect':
    case 'image':
    case 'circle':
    case 'ellipse':
    case 'fhellipse':
    case 'fhrect':
    case 'text': {
      ({ element, keep } = eventShapeDraw.up(evt, { element, keep }))
      break
    }
    case 'path': {
      ({ element, keep } = eventPathEdit.upPath(evt, { mouseX, mouseY }))
      break
    } case 'pathedit':
      ({ element, keep } = eventPathEdit.upPathEdit(evt))
      break
    case 'textedit':
      ({ element, keep } = eventTextEdit.up(evt, { mouseX, mouseY }))
      break
    case 'rotate': {
      ({ element, keep } = eventRotate.up(evt, { selectedElements }))
      break
    } default:
      // This could occur in an extension
      svgCanvas.hasDragStartTransform = false
      svgCanvas.dragStartTransforms = null
      break
  }
  // Reset drag flag after any mouseUp
  svgCanvas.hasDragStartTransform = false
  svgCanvas.dragStartTransforms = null
  svgCanvas.groupResizeStart = null
  svgCanvas.groupRotateStart = null
  svgCanvas.groupRotateCenter = null
  svgCanvas.groupRotateBBox = null

  /**
* The main (left) mouse button is released (anywhere).
* @event module:svgcanvas.SvgCanvas#event:ext_mouseUp
* @type {PlainObject}
* @property {MouseEvent} event The event object
* @property {Float} mouse_x x coordinate on canvas
* @property {Float} mouse_y y coordinate on canvas
*/
  const extResult = svgCanvas.runExtensions('mouseUp', {
    event: evt,
    mouse_x: mouseX,
    mouse_y: mouseY,
    element
  }, true)

  extResult.forEach((r) => {
    if (r) {
      keep = r.keep || keep;
      ({ element } = r)
      svgCanvas.setStarted(r.started || svgCanvas.getStarted())
    }
  })

  if (!keep && element) {
    svgCanvas.getCurrentDrawing().releaseId(svgCanvas.getId())
    element.remove()
    element = null

    t = evt.target

    // if this element is in a group, go up until we reach the top-level group
    // just below the layer groups
    // TODO: once we implement links, we also would have to check for <a> elements
    while (t?.parentNode?.parentNode?.tagName === 'g') {
      t = t.parentNode
    }
    // if we are not in the middle of creating a path, and we've clicked on some shape,
    // then go to Select mode.
    // WebKit returns <div> when the canvas is clicked, Firefox/Opera return <svg>
    if ((svgCanvas.getCurrentMode() !== 'path' || !svgCanvas.getDrawnPath()) &&
      t &&
      t.parentNode?.id !== 'selectorParentGroup' &&
      t.id !== 'svgcanvas' && t.id !== 'svgroot'
    ) {
      // switch into "select" mode if we've clicked on an element
      svgCanvas.setMode('select')
      svgCanvas.selectOnly([t], true)
    }
  } else if (element) {
    /**
* @name module:svgcanvas.SvgCanvas#addedNew
* @type {boolean}
*/
    svgCanvas.addedNew = true

    // Tracks which element this deferred (setTimeout below) selection belongs
    // to, so that callback can tell whether it's still current by the time it
    // fires — see the guard where it's read for why this matters.
    svgCanvas.pendingNewElement = element

    if (useUnit) { convertAttrs(element) }

    // Path-drawing's mode transition must happen synchronously, not deferred
    // behind the opacity-fade setTimeout below: mode stays 'path' for that
    // whole window even though drawnPath is already null (committed above by
    // pathActions), so any click landing in the gap — routinely the second
    // click of the double-click that just closed this path — gets read as
    // starting a brand-new path at that point. Every click after that keeps
    // silently appending to that phantom instead of the shape the user
    // actually intends, until the deferred setMode('select') finally fires
    // and pathActions.clear() throws the phantom (and all its points) away
    // with no feedback. Switching modes here, before any further event can be
    // dispatched, closes that window.
    if (svgCanvas.getCurrentMode() === 'path') {
      if (svgCanvas.getToolLocked()) {
        // Lock mode: re-arm the path tool to draw another path
        svgCanvas.setMode('path')
      } else {
        // Building the path leaves its in-progress point/control grips visible
        // in the shared pathpointgrip_container; getPath_().show(false) rebuilds
        // and hides them so they don't linger after the element is moved/deleted.
        svgCanvas.getPath_(element).show(false)
        svgCanvas.setMode('select')
        svgCanvas.selectOnly([element], true)
      }
    }

    let aniDur = 0.2
    let cAni
    const curShape = svgCanvas.getStyle()
    const opacAni = svgCanvas.getOpacAni()
    if (opacAni.beginElement && Number.parseFloat(element.getAttribute('opacity')) !== curShape.opacity) {
      cAni = opacAni.cloneNode(true)
      cAni.setAttribute('to', curShape.opacity)
      cAni.setAttribute('dur', aniDur)
      element.appendChild(cAni)
      try {
        // Fails in FF4 on foreignObject
        cAni.beginElement()
      } catch (e) {
        console.warn('svgedit: opacity animation beginElement() failed (known FF/foreignObject quirk)', e)
      }
    } else {
      aniDur = 0
    }

    // Ideally this would be done on the endEvent of the animation,
    // but that doesn't seem to be supported in Webkit
    setTimeout(() => {
      if (cAni) { cAni.remove() }
      // The brush tool stamps its own per-stroke opacity (from the brush
      // popover, independent of the general shape-style opacity) at creation
      // time — don't clobber it with curShape.opacity like every other tool,
      // which has no opacity concept of its own outside curShape.
      if (svgCanvas.getCurrentMode() !== 'brush') {
        element.setAttribute('opacity', curShape.opacity)
      }
      element.setAttribute('style', 'pointer-events:inherit')
      cleanupElement(element)
      // This callback is scheduled aniDur (up to 200ms) in the future. A fast
      // double-click-to-finish workflow routinely starts and finishes the
      // NEXT shape well inside that window — by the time this fires, `element`
      // may no longer be what the user is looking at. Forcing setMode('select')
      // would yank them out of an in-progress draw of a different shape, and
      // selectOnly(element) would silently swap the current selection back to
      // this stale one (symptom: finishing a path selects/edits an unrelated
      // earlier path). Only touch mode/selection if nothing has been created
      // since — i.e. this is still the most recent element.
      if (svgCanvas.getCurConfig().selectNew && svgCanvas.pendingNewElement === element) {
        const modes = ['circle', 'ellipse', 'square', 'rect', 'fhpath', 'line', 'fhellipse', 'fhrect', 'star', 'polygon', 'shapelib', 'frame', 'brush']
        if (modes.indexOf(svgCanvas.getCurrentMode()) !== -1 && !evt.altKey && !svgCanvas.getToolLocked()) {
          svgCanvas.setMode('select')
        }
        // Lock mode: skip selecting the newly created shape so its selection
        // bbox/grips don't overlap the area where the next shape is drawn.
        if (!svgCanvas.getToolLocked()) {
          svgCanvas.selectOnly([element], true)
        }
      }
      // we create the insert command that is stored on the stack
      // undo means to call cmd.unapply(), redo means to call cmd.apply()
      svgCanvas.addCommandToHistory(new InsertElementCommand(element))
      svgCanvas.call('changed', [element])
    }, aniDur * 1000)
  }
  svgCanvas.setStartTransform(null)
}

const dblClickEvent = (evt) => {
  const evtTarget = evt.target
  const parent = evtTarget.parentNode

  let mouseTarget = svgCanvas.getMouseTarget(evt)
  const { tagName } = mouseTarget

  if (tagName === 'text' && svgCanvas.getCurrentMode() !== 'textedit') {
    // Editing an existing text (not a fresh placement) — don't let lock mode re-arm the text tool
    svgCanvas.setTextFreshCreate(false)
    const pt = transformPoint(evt.clientX, evt.clientY, svgCanvas.getrootSctm())
    svgCanvas.textActions.select(mouseTarget, pt.x, pt.y)
  }

  // Do nothing if already in current group
  if (parent === svgCanvas.getCurrentGroup()) { return }

  // Enter the group non-destructively: we keep the group's transform on the
  // <g> and edit children in the group's local coordinate space (mapped via
  // getMatrixToContent / toCurrentGroupLocalDelta). Previously a rotated group
  // was "baked" here — its rotation pushed down onto every child and the
  // group's own transform removed — which left the group fragile and, combined
  // with the in-group move not being recorded, dissolved the group on the next
  // undo. No baking is needed; this mirrors how rotated paths are edited
  // in-place.
  // Reset context
  if (svgCanvas.getCurrentGroup()) {
    svgCanvas.leaveContext()
  }

  if ((parent.tagName !== 'g' && parent.tagName !== 'a') ||
    parent === svgCanvas.getCurrentDrawing().getCurrentLayer() ||
    mouseTarget === svgCanvas.selectorManager.selectorParentGroup
  ) {
    // Escape from in-group edit
    return
  }
  svgCanvas.setContext(mouseTarget)

  // Now that we've entered the group, select the actual element that was
  // double-clicked so the user doesn't have to click a second time.
  // getMouseTarget walks up from evt.target to the direct child of the
  // (now current) group, which is exactly the element under the cursor.
  const childTarget = svgCanvas.getMouseTarget(evt)
  if (childTarget && childTarget.parentNode === svgCanvas.getCurrentGroup()) {
    svgCanvas.selectOnly([childTarget], true)
  }
}

// Screen-pixel radius within which a fill-less element near the cursor is
// preferred over a filled shape under the exact click point (see
// findStrokeElementNearPoint).
const HIT_TOLERANCE = 8

/**
 * Is `el` a fill-less, stroke-painted element? Such elements (freedraw paths,
 * lines, polylines, hollow shapes) are only hittable on their thin stroke, so
 * the browser's native hit-test rarely lands on them when they overlap a filled
 * shape. Detected via computed style so it generalizes to any `fill:none`
 * element regardless of how the fill/stroke were set.
 * @param {Element} el
 * @returns {boolean}
 */
const isStrokeOnlyElement = (el) => {
  if (!el || !(el instanceof SVGGraphicsElement)) { return false }
  const cs = getComputedStyle(el)
  if (cs.fill !== 'none') { return false }
  return cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0
}

// <line>/<polyline> never enclose an area, and a <path> only does if closed
// (ends in Z/z) — used by the bbox-as-move-handle block below to tell an
// open line/curve (whose bbox is mostly empty space with nothing conceptually
// "inside" it) apart from a closed shape (a hollow rect/circle, or a filled
// shape's rotated-corner gaps) whose whole bbox is a reasonable grab target.
const OPEN_LINE_TAGS = new Set(['line', 'polyline'])
const isOpenPathElement = (el) => {
  if (!el) { return false }
  if (OPEN_LINE_TAGS.has(el.tagName)) { return true }
  if (el.tagName !== 'path') { return false }
  const d = (el.getAttribute('d') || '').trim()
  return d !== '' && !/[Zz]\s*$/.test(d)
}

/**
 * Proximity hit-testing for fill-less elements. When a plain native hit-test
 * lands on a filled shape (or empty canvas), look in a small screen-space radius
 * around the click for a stroke-only element and prefer it — so thin lines over
 * a filled rectangle become easy to grab. Samples nearest-first and reuses the
 * browser's own hit-testing (`elementsFromPoint`), which already accounts for
 * transforms, zoom and stroke width. Group isolation is honored by resolving
 * each sampled node through `getMouseTargetFromNode`.
 * @param {MouseEvent} evt
 * @param {Element} currentTarget - the element the native hit-test resolved to
 * @returns {Element|null} a nearby stroke-only selectable element, or null
 */
const findStrokeElementNearPoint = (evt, currentTarget) => {
  // Already on a stroke-only element (or a selector grip) — nothing to upgrade.
  if (
    currentTarget === svgCanvas.selectorManager.selectorParentGroup ||
    isStrokeOnlyElement(currentTarget)
  ) {
    return null
  }
  const currentGroup = svgCanvas.getCurrentGroup()
  const parentContext = currentGroup || svgCanvas.getCurrentDrawing().getCurrentLayer()
  // In All Layers mode (and not isolated inside a group), a stroke-only
  // element on any layer is a valid pick, not just the current layer's.
  const anyLayer = svgCanvas.getAllLayersMode() && !currentGroup
  // [radius, angleCount] rings, nearest first; the 0-radius ring is the click.
  const rings = [[0, 1], [HIT_TOLERANCE / 2, 8], [HIT_TOLERANCE, 8]]
  for (const [radius, angleCount] of rings) {
    for (let i = 0; i < angleCount; i++) {
      const a = (i / angleCount) * 2 * Math.PI
      const px = evt.clientX + Math.cos(a) * radius
      const py = evt.clientY + Math.sin(a) * radius
      const stack = document.elementsFromPoint(px, py)
      for (const node of stack) {
        const target = svgCanvas.getMouseTargetFromNode(node)
        if (
          target &&
          (target.parentNode === parentContext || (anyLayer && Layer.isLayer(target.parentNode))) &&
          isStrokeOnlyElement(target)
        ) {
          return target
        }
      }
    }
  }
  return null
}

/**
 * Follows these conditions:
 * - When we are in a create mode, the element is added to the canvas but the
 *   action is not recorded until mousing up.
 * - When we are in select mode, select the element, remember the position
 *   and do nothing else.
 *
 * See the doc comment on `mouseUpEvent` above for why this is wrapped in a
 * try/catch: it's a single data-flow pipeline (not independent steps), so a
 * throw partway through must still leave drag state recoverable for the next
 * gesture rather than silently wedged.
 * @param {MouseEvent} evt
 * @fires module:svgcanvas.SvgCanvas#event:ext_mouseDown
 * @returns {void}
 */
const mouseDownEvent = (evt) => {
  try {
    mouseDownEventImpl(evt)
  } catch (err) {
    logError('mouseDownEvent failed; resetting drag state', err, 'event')
    svgCanvas.setStarted(false)
    svgCanvas.hasDragStartTransform = false
    svgCanvas.dragStartTransforms = null
  }
}

const mouseDownEventImpl = (evt) => {
  const dataStorage = svgCanvas.getDataStorage()
  const selectedElements = svgCanvas.getSelectedElements()
  const zoom = svgCanvas.getZoom()
  const curShape = svgCanvas.getStyle()
  const svgRoot = svgCanvas.getSvgRoot()
  const { $id } = svgCanvas

  if (svgCanvas.spaceKey || evt.button === 1) { return }

  const rightClick = (evt.button === 2)

  if (evt.altKey) { // duplicate when dragging
    svgCanvas.cloneSelectedElements(0, 0)
  }

  // Get screenCTM from the first child group of svgcontent
  // Note: svgcontent itself has x/y offset attributes, so we use its first child
  const svgContent = $id('svgcontent')
  const rootGroup = svgContent?.querySelector('g')
  const screenCTM = rootGroup?.getScreenCTM?.()
  if (!screenCTM) { return }
  svgCanvas.setRootSctm(screenCTM.inverse())

  const pt = transformPoint(evt.clientX, evt.clientY, svgCanvas.getrootSctm())
  const mouseX = pt.x * zoom
  const mouseY = pt.y * zoom

  evt.preventDefault()

  if (rightClick) {
    if (svgCanvas.getCurrentMode() === 'path') {
      return
    }
    svgCanvas.setCurrentMode('select')
    svgCanvas.setLastClickPoint(pt)
  }

  let x = mouseX / zoom
  let y = mouseY / zoom
  // When drawing inside a group, work in the group's local coordinate space so
  // new shapes land under the cursor (not offset/scaled by the group transform).
  if (isCreateInCurrentGroup(svgCanvas)) {
    ({ x, y } = toCurrentGroupLocalPoint(svgCanvas, x, y))
  }
  let mouseTarget = svgCanvas.getMouseTarget(evt)

  if (mouseTarget.tagName === 'a' && mouseTarget.childNodes.length === 1) {
    mouseTarget = mouseTarget.firstChild
  }

  // Ctrl/Cmd-click drills straight into a group and selects the clicked child in
  // one click (Excalidraw parity), without leaving the group via double-click.
  // Reuses the same non-destructive entry path as dblClickEvent (no transform
  // bake). On macOS a Ctrl-click is delivered as a right-click, so gate on
  // !rightClick; metaKey covers Cmd, ctrlKey covers other platforms.
  if (
    svgCanvas.getCurrentMode() === 'select' && (evt.metaKey || evt.ctrlKey) &&
    !rightClick && !evt.shiftKey &&
    (mouseTarget.tagName === 'g' || mouseTarget.tagName === 'a') &&
    mouseTarget !== svgCanvas.getCurrentGroup()
  ) {
    if (svgCanvas.getCurrentGroup()) { svgCanvas.leaveContext() }
    svgCanvas.setContext(mouseTarget)
    const childTarget = svgCanvas.getMouseTarget(evt)
    if (childTarget && childTarget.parentNode === svgCanvas.getCurrentGroup()) {
      svgCanvas.selectOnly([childTarget], true)
      mouseTarget = childTarget
    }
  }

  // Exit in-group editing when a click lands outside the current group (empty
  // canvas or another element). Without this the editor stays trapped in the
  // group's context after drilling in, so every later click selects an
  // individual child instead of the whole group — making the group feel
  // "destroyed". Mirrors Excalidraw, where clicking outside clears
  // editingGroupId. Clicks on a child inside the group, on its selection grips,
  // or a Ctrl/Cmd drill-in (handled above) keep the context.
  const curGroup = svgCanvas.getCurrentGroup()
  if (
    curGroup && svgCanvas.getCurrentMode() === 'select' &&
    !evt.metaKey && !evt.ctrlKey &&
    mouseTarget !== svgCanvas.selectorManager.selectorParentGroup &&
    mouseTarget !== curGroup && !curGroup.contains(mouseTarget)
  ) {
    svgCanvas.leaveContext()
    mouseTarget = svgCanvas.getMouseTarget(evt)
  }

  // Prefer an already-selected element under the cursor over the topmost one
  // (matches Excalidraw). When stacked shapes overlap, a plain click keeps the
  // current selection if it lies under the pointer instead of grabbing the top
  // element. Skipped for grips, shift-click (additive) and right-click.
  if (
    svgCanvas.getCurrentMode() === 'select' && !evt.shiftKey && !rightClick &&
    mouseTarget !== svgCanvas.selectorManager.selectorParentGroup
  ) {
    const sel = selectedElements.filter(Boolean)
    if (sel.length && !sel.includes(mouseTarget)) {
      // elementsFromPoint is ordered top→bottom; pick the topmost element that
      // is (or contains) a currently-selected element.
      const stack = document.elementsFromPoint(evt.clientX, evt.clientY)
      for (const node of stack) {
        const hit = sel.find((s) => s === node || s.contains(node))
        if (hit) { mouseTarget = hit; break }
      }
    }
  }

  // Make fill-less elements (freedraw lines, paths, hollow shapes) easy to grab:
  // when the click landed on a filled shape or empty canvas, prefer a stroke-only
  // element within HIT_TOLERANCE px of the cursor. Runs last so it has final say
  // over the plain native hit-test. Skipped for right-click and selector grips.
  if (
    svgCanvas.getCurrentMode() === 'select' && !rightClick &&
    mouseTarget !== svgCanvas.selectorManager.selectorParentGroup
  ) {
    const strokeHit = findStrokeElementNearPoint(evt, mouseTarget)
    if (strokeHit) { mouseTarget = strokeHit }
  }

  // Treat the whole selection bbox as a move handle: when a click that would
  // otherwise hit empty canvas (and start a rubber-band) lands inside the
  // current selection's bounding box, keep the selection and drag it instead.
  // This makes fill-less shapes (whose interior is empty canvas) and the gaps
  // between a shape and its bbox edges grab-able. A click on a real element is
  // left alone so you can still select something inside the bbox.
  // Skipped for a single open line/path: it has no enclosed interior, so its
  // bbox is mostly empty space with nothing conceptually "inside" it —
  // treating the whole rectangle as the shape meant a click clearly away from
  // a diagonal line's actual stroke (but still inside its bbox corner-to-corner)
  // silently kept it selected instead of deselecting. A near-miss on the
  // stroke itself is still caught above by findStrokeElementNearPoint.
  if (
    svgCanvas.getCurrentMode() === 'select' && !rightClick && !evt.shiftKey &&
    mouseTarget === svgRoot
  ) {
    const sel = selectedElements.filter(Boolean)
    if (sel.length && !(sel.length === 1 && isOpenPathElement(sel[0]))) {
      const bb = svgCanvas.getStrokedBBoxDefaultVisible(sel)
      if (bb && x >= bb.x && x <= bb.x + bb.width && y >= bb.y && y <= bb.y + bb.height) {
        mouseTarget = sel[0]
      }
    }
  }

  // realX/y ignores grid-snap value
  const realX = x
  svgCanvas.setStartX(x)
  svgCanvas.setRStartX(x)
  const realY = y
  svgCanvas.setStartY(y)
  svgCanvas.setRStartY(y)

  if (svgCanvas.getCurConfig().gridSnapping) {
    ({ x, y } = svgCanvas.snapPointToGrid(x, y))
    const sp = svgCanvas.snapPointToGrid(svgCanvas.getStartX(), svgCanvas.getStartY())
    svgCanvas.setStartX(sp.x)
    svgCanvas.setStartY(sp.y)
  }

  // if it is a selector grip, then it must be a single element selected,
  // set the mouseTarget to that and update the mode to rotate/resize
  // Scoped to 'select' mode (matching the sibling checks above): outside
  // select, `selectedElements[0]` is stale leftover selection from before a
  // drawing tool was chosen (switching to a creation tool like path/rect
  // doesn't clear selection). Its grips can still be visually/DOM-present and
  // sitting under the cursor while a new shape is being drawn; without this
  // guard, a click that lands on one of them hijacks mode into 'resize'/
  // 'rotate' mid-draw, and the following mouseup — now routed through the
  // select-mode epilogue — calls pathActions.select() on that stale element,
  // silently dropping the user into node-edit mode on a completely different
  // (often previous-layer) path instead of the one just drawn.
  if (
    svgCanvas.getCurrentMode() === 'select' &&
    mouseTarget === svgCanvas.selectorManager.selectorParentGroup && selectedElements[0]
  ) {
    const grip = evt.target
    const griptype = dataStorage.get(grip, 'type')
    // rotating
    if (griptype === 'rotate') {
      svgCanvas.setCurrentMode('rotate')
      // svgCanvas.setCurrentRotateMode(dataStorage.get(grip, 'dir'));
      // resizing
    } else if (griptype === 'resize') {
      svgCanvas.setCurrentMode('resize')
      svgCanvas.setCurrentResizeMode(dataStorage.get(grip, 'dir'))
    }
    mouseTarget = selectedElements[0]
  }

  svgCanvas.setStartTransform(mouseTarget.getAttribute('transform'))

  const tlist = getTransformList(mouseTarget)

  // Consolidate transforms for non-group elements to simplify dragging
  // For elements with multiple transforms (e.g., after ungrouping), consolidate them
  // into a single matrix so the dummy translate can be properly applied during drag
  if (tlist?.numberOfItems > 1 && mouseTarget.tagName !== 'g' && mouseTarget.tagName !== 'a') {
    // Compute the consolidated matrix from all transforms
    const consolidatedMatrix = transformListToTransform(tlist).matrix

    // Clear the transform list and add a single matrix transform
    while (tlist.numberOfItems > 0) {
      tlist.removeItem(0)
    }

    const newTransform = svgCanvas.getSvgRoot().createSVGTransform()
    newTransform.setMatrix(consolidatedMatrix)
    tlist.appendItem(newTransform)
  }
  switch (svgCanvas.getCurrentMode()) {
    case 'select':
      eventSelect.down(evt, { mouseTarget, svgRoot, rightClick, selectedElements, zoom })
      break
    case 'zoom':
      eventZoom.down(evt, { realX, realY, zoom })
      break
    case 'resize': {
      eventResize.down(evt, { x, y, zoom, selectedElements, svgRoot, mouseTarget })
      break
    }
    case 'fhellipse':
    case 'fhrect':
    case 'fhpath':
    case 'image':
    case 'frame':
    case 'square':
    case 'rect':
    case 'line':
    case 'circle':
    case 'ellipse':
    case 'text':
      eventShapeDraw.down(evt, { x, y, realX, realY, curShape })
      break
    case 'path':
    // Fall through
    case 'pathedit':
      eventPathEdit.down(evt, { mouseTarget, zoom })
      break
    case 'textedit':
      eventTextEdit.down(evt, { mouseTarget, zoom })
      break
    case 'rotate': {
      eventRotate.down(evt, { selectedElements })
      break
    }
    default:
      // This could occur in an extension
      break
  }

  /**
* The main (left) mouse button is held down on the canvas area.
* @event module:svgcanvas.SvgCanvas#event:ext_mouseDown
* @type {PlainObject}
* @property {MouseEvent} event The event object
* @property {Float} start_x x coordinate on canvas
* @property {Float} start_y y coordinate on canvas
* @property {Element[]} selectedElements An array of the selected Elements
*/
  const extResult = svgCanvas.runExtensions('mouseDown', {
    event: evt,
    start_x: svgCanvas.getStartX(),
    start_y: svgCanvas.getStartY(),
    selectedElements
  }, true)

  extResult.forEach((r) => {
    if (r?.started) {
      svgCanvas.setStarted(true)
    }
  })
}
/**
 * @param {Event} e
 * @fires module:event.SvgCanvas#event:updateCanvas
 * @fires module:event.SvgCanvas#event:zoomDone
 * @returns {void}
 */
const DOMMouseScrollEvent = (e) => {
  const zoom = svgCanvas.getZoom()
  const { $id } = svgCanvas
  if (!e.ctrlKey && !e.metaKey) { return }

  e.preventDefault()

  // Get screenCTM from the first child group of svgcontent
  // Note: svgcontent itself has x/y offset attributes, so we use its first child
  const svgContent = $id('svgcontent')
  const rootGroup = svgContent?.querySelector('g')
  const screenCTM = rootGroup?.getScreenCTM?.()
  if (!screenCTM) { return }
  svgCanvas.setRootSctm(screenCTM.inverse())

  const workarea = svgCanvas.$id('workarea')
  const scrbar = 15
  const rulerwidth = svgCanvas.getCurConfig().showRulers ? 16 : 0

  // work area width minus scroll and ruler in screen pixels
  const editorW = parseFloat(getComputedStyle(workarea, null).width.replace('px', '')) - scrbar - rulerwidth
  const editorH = parseFloat(getComputedStyle(workarea, null).height.replace('px', '')) - scrbar - rulerwidth

  // work area width in content pixels
  const workareaViewW = editorW * svgCanvas.getrootSctm().a
  const workareaViewH = editorH * svgCanvas.getrootSctm().d

  const delta = (e.wheelDelta) ? e.wheelDelta : (e.detail) ? -e.detail : 0
  if (!delta) { return }

  const factor = Math.max(3 / 4, Math.min(4 / 3, (delta)))

  let wZoom; let hZoom
  if (factor > 1) {
    wZoom = Math.ceil(editorW / workareaViewW * factor * 100) / 100
    hZoom = Math.ceil(editorH / workareaViewH * factor * 100) / 100
  } else {
    wZoom = Math.floor(editorW / workareaViewW * factor * 100) / 100
    hZoom = Math.floor(editorH / workareaViewH * factor * 100) / 100
  }
  const zoomlevel = Math.min(wZoom, hZoom)
  if (zoomlevel === zoom) {
    return
  }
  zoomAtPoint(zoomlevel, e.clientX, e.clientY)
}

/**
 * Apply a zoom level while keeping a given screen point fixed under the
 * pointer/fingers. Shared by the Ctrl+wheel handler and the tablet-mode
 * pinch gesture (see `core/touch.js`).
 * @param {number} zoomlevel - target zoom (clamped to [0.01, 10])
 * @param {number} clientX - screen x of the zoom anchor
 * @param {number} clientY - screen y of the zoom anchor
 * @fires module:event.SvgCanvas#event:updateCanvas
 * @fires module:event.SvgCanvas#event:zoomDone
 * @returns {void}
 */
const zoomAtPoint = (zoomlevel, clientX, clientY) => {
  const zoom = svgCanvas.getZoom()
  const { $id } = svgCanvas

  // Get screenCTM from the first child group of svgcontent
  // Note: svgcontent itself has x/y offset attributes, so we use its first child
  const svgContent = $id('svgcontent')
  const rootGroup = svgContent?.querySelector('g')
  const screenCTM = rootGroup?.getScreenCTM?.()
  if (!screenCTM) { return }
  svgCanvas.setRootSctm(screenCTM.inverse())

  zoomlevel = Math.min(10, Math.max(0.01, zoomlevel))
  if (zoomlevel === zoom) { return }
  const factor = zoomlevel / zoom

  const workarea = svgCanvas.$id('workarea')
  const rulerwidth = svgCanvas.getCurConfig().showRulers ? 16 : 0

  // full work area size in screen pixels
  const editorFullW = parseFloat(getComputedStyle(workarea, null).width.replace('px', ''))
  const editorFullH = parseFloat(getComputedStyle(workarea, null).height.replace('px', ''))

  // anchor point relative to content area in content pixels
  const pt = transformPoint(clientX, clientY, svgCanvas.getrootSctm())

  // content offset from canvas in screen pixels
  const wOffset = findPos(workarea)
  const wOffsetLeft = wOffset.left + rulerwidth
  const wOffsetTop = wOffset.top + rulerwidth

  // top left of workarea in content pixels before zoom
  const topLeftOld = transformPoint(wOffsetLeft, wOffsetTop, svgCanvas.getrootSctm())

  // top left of workarea in content pixels after zoom
  const topLeftNew = {
    x: pt.x - (pt.x - topLeftOld.x) / factor,
    y: pt.y - (pt.y - topLeftOld.y) / factor
  }

  // top left of workarea in canvas pixels relative to content after zoom
  const topLeftNewCanvas = {
    x: topLeftNew.x * zoomlevel,
    y: topLeftNew.y * zoomlevel
  }

  // new center in canvas pixels
  const newCtr = {
    x: topLeftNewCanvas.x - rulerwidth + editorFullW / 2,
    y: topLeftNewCanvas.y - rulerwidth + editorFullH / 2
  }

  svgCanvas.setZoom(zoomlevel)
  svgCanvas.$id('zoom').value = ((zoomlevel * 100).toFixed(1))

  svgCanvas.call('updateCanvas', { center: false, newCtr })
  svgCanvas.call('zoomDone')
}

  svgCanvas.mouseDownEvent = mouseDownEvent
  svgCanvas.mouseMoveEvent = mouseMoveEvent
  svgCanvas.dblClickEvent = dblClickEvent
  svgCanvas.mouseUpEvent = mouseUpEvent
  svgCanvas.mouseOutEvent = mouseOutEvent
  svgCanvas.DOMMouseScrollEvent = DOMMouseScrollEvent
  svgCanvas.zoomAtPoint = zoomAtPoint
}
