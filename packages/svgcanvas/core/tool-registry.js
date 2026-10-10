// @ts-check
/**
 * Tool contract: `svgCanvas.registerTool({ id, pointerDown, pointerMove, pointerUp, … })`.
 *
 * A new drawing/editing tool plugs into the canvas through ONE interface
 * instead of adding cases to `event.js`'s mode `switch` or juggling the
 * `runExtensions('mouseDown' | …)` protocol. What the registry gives a tool:
 *
 *  - **One coordinate convention.** Events carry `x, y` in document (content)
 *    units, unzoomed, grid-snapped and mapped into the current group's local
 *    space (`rawX, rawY` are the same without grid snap). The legacy extension
 *    hooks mixed spaces (`start_x` unzoomed, `mouse_x` *zoomed*), which every
 *    extension tool had to divide back out by hand.
 *  - **Automatic undo.** A gesture runs inside an undo transaction
 *    ({@link module:transaction}): `pointerDown` opens it, `pointerUp` commits
 *    it as ONE step (labelled `undoLabel`) or rolls everything back when it
 *    returns `'cancel'`. Escape and switching modes mid-gesture roll back too,
 *    and so does a handler that throws. Tools never touch `addCommandToHistory`.
 *  - **Overlays** (`ctx.addOverlay`) live outside `#svgcontent`, so previews
 *    and guides are never recorded or saved.
 *
 * Dispatch happens in `event.js` *before* the mode `switch` and the extension
 * hooks: if a registered tool's id equals the current mode it handles the
 * event. A `pointerDown` that returns `false` declines and the legacy pipeline
 * runs as before. Touch is converted to synthetic mouse events by `core/touch.js`,
 * so this is the single entry point; don't assume pointer capture.
 *
 * The built-in select / path / text / resize / rotate / zoom modes and the
 * built-in shape modes stay in `event.js`; the legacy extension hooks stay
 * supported.
 *
 * Inspired by VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/tools/src/lib.rs` (`trait Tool`), MIT OR Apache-2.0.
 * @module tool-registry
 * @license MIT
 */

import { cleanupElement } from './dom-utils.js'
import { transformPoint } from './math.js'
import { NS } from './namespaces.js'
import { isCreateInCurrentGroup, toCurrentGroupLocalPoint } from './event-group-context.js'
import { isMac } from '../common/browser.js'
import { error as logError, warn } from '../common/logger.js'

const LOG = 'tool-registry'

/**
 * @typedef {object} ToolMods
 * @property {boolean} shift
 * @property {boolean} alt
 * @property {boolean} ctrl
 * @property {boolean} meta
 * @property {boolean} mod the platform command key (Cmd on macOS, Ctrl elsewhere)
 */

/**
 * @typedef {object} ToolEvent
 * @property {number} x document units, unzoomed, grid-snapped, group-local
 * @property {number} y
 * @property {number} rawX same, before grid snapping
 * @property {number} rawY
 * @property {number} screenX client coordinates
 * @property {number} screenY
 * @property {number} dragDistance screen pixels moved since the press (0 on the press itself)
 * @property {ToolMods} mods
 * @property {number} button
 * @property {MouseEvent} event the original event, for edge cases
 */

/**
 * @typedef {object} ToolContext
 * @property {any} canvas the SvgCanvas
 * @property {number} zoom current zoom
 * @property {ToolEvent} [start] the press that began the current gesture
 * @property {(pt: {x: number, y: number}) => {x: number, y: number}} snap the canvas's snapping, in document units
 * @property {(el: Element) => void} addOverlay add a preview/guide element (document units; never recorded)
 * @property {() => void} clearOverlays
 * @property {(el: Element, evt?: {altKey?: boolean}) => void} finishCreated treat `el` as a newly created element
 */

/**
 * @typedef {object} ToolDef
 * @property {string} id the mode name passed to `setMode()`
 * @property {(ctx: ToolContext) => void} [activate] the mode became current
 * @property {(ctx: ToolContext) => void} [deactivate] the mode is being left
 * @property {(ctx: ToolContext, ev: ToolEvent) => (void|false)} pointerDown return `false` to decline (legacy pipeline handles it)
 * @property {(ctx: ToolContext, ev: ToolEvent) => void} [pointerMove] during a press; also on hover when `wantsHover`
 * @property {(ctx: ToolContext, ev: ToolEvent) => (void|'cancel'|{created?: Element})} [pointerUp]
 *   return `'cancel'` to roll the gesture back instead of committing, or
 *   `{ created }` for a new element to finish (opacity, events, select it, …)
 * @property {(ctx: ToolContext, ev: KeyboardEvent) => boolean} [keyDown] return true when handled.
 *   Escape never reaches this: the registry cancels the gesture and lets the editor leave the tool.
 * @property {(ctx: ToolContext) => void} [cancel] the gesture was rolled back (Escape, mode switch,
 *   `'cancel'`, an error): reset the tool's own state
 * @property {string} [undoLabel] undo-menu text of the gesture (default: the id)
 * @property {boolean} [wantsHover] receive `pointerMove` with no button down
 * @property {boolean} [keepOpacity] created elements keep the `opacity` the tool stamped (the brush has its own)
 * @property {boolean} [snap] `ev.x` / `ev.y` also snap to other objects' anchors, bounding boxes and the page (with guides),
 *   when grid snapping is off. Opt in only if the tool places points with `x` / `y` (not `rawX` / `rawY`) on press AND drag.
 */

/**
 * @param {any} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  const svgCanvas = canvas

  /** @type {Map<string, ToolDef>} */
  const tools = new Map()

  /**
   * @type {?{tool: ToolDef, tx: {commit: () => any, cancel: () => void}, start: ToolEvent}}
   */
  let gesture = null
  /** @type {?SVGSVGElement} */
  let overlay = null
  /** The press of the gesture whose `pointerUp` is running (the gesture itself is already closed). @type {?ToolEvent} */
  let endingStart = null

  // ---- coordinates --------------------------------------------------------

  /**
   * Map a mouse event to the tool coordinate convention. Uses the root CTM the
   * last mouseDown stored (like every other handler), refreshed on demand for
   * hover.
   * @param {MouseEvent} evt
   * @param {{x: number, y: number}} [downClient]
   * @param {ToolDef} [tool] the tool the event is for; one with `snap` gets object snapping
   * @returns {ToolEvent}
   */
  const toToolEvent = (evt, downClient, tool) => {
    const pt = transformPoint(evt.clientX, evt.clientY, svgCanvas.getrootSctm())
    let { x, y } = pt
    if (isCreateInCurrentGroup(svgCanvas)) ({ x, y } = toCurrentGroupLocalPoint(svgCanvas, x, y))
    const raw = { x, y }
    if (svgCanvas.getCurConfig().gridSnapping) ({ x, y } = svgCanvas.snapPointToGrid(x, y))
    else if (tool?.snap) ({ x, y } = svgCanvas.snapDrawPoint?.(x, y, { tool: true }) ?? { x, y })
    const mac = isMac()
    return {
      x,
      y,
      rawX: raw.x,
      rawY: raw.y,
      screenX: evt.clientX,
      screenY: evt.clientY,
      dragDistance: downClient ? Math.hypot(evt.clientX - downClient.x, evt.clientY - downClient.y) : 0,
      mods: {
        shift: Boolean(evt.shiftKey),
        alt: Boolean(evt.altKey),
        ctrl: Boolean(evt.ctrlKey),
        meta: Boolean(evt.metaKey),
        mod: Boolean(mac ? evt.metaKey : evt.ctrlKey)
      },
      button: evt.button ?? 0,
      event: evt
    }
  }

  const refreshRootSctm = () => {
    const rootGroup = svgCanvas.$id('svgcontent')?.querySelector('g')
    const ctm = rootGroup?.getScreenCTM?.()
    if (ctm) svgCanvas.setRootSctm(ctm.inverse())
    return Boolean(ctm)
  }

  // ---- overlays -------------------------------------------------------------

  /** An `<svg>` in `#svgroot` sharing `#svgcontent`'s box and viewBox, so overlay children use document units. */
  const ensureOverlay = () => {
    const content = svgCanvas.getSvgContent()
    if (!overlay) {
      overlay = /** @type {SVGSVGElement} */ (svgCanvas.getSvgRoot().ownerDocument.createElementNS(NS.SVG, 'svg'))
      overlay.setAttribute('id', 'toolOverlay')
      overlay.setAttribute('overflow', 'visible')
      overlay.setAttribute('style', 'pointer-events: none;')
      overlay.setAttribute('data-se-ephemeral', '')
    }
    for (const attr of ['x', 'y', 'width', 'height', 'viewBox']) {
      const v = content.getAttribute(attr)
      if (v !== null) overlay.setAttribute(attr, v)
    }
    if (overlay.parentNode !== svgCanvas.getSvgRoot()) svgCanvas.getSvgRoot().append(overlay)
    return overlay
  }

  const clearOverlays = () => {
    if (overlay) overlay.replaceChildren()
  }

  // ---- context ----------------------------------------------------------------

  /**
   * Finish a newly created element the way the legacy mouse-up does, minus the
   * history entry (the gesture's transaction already records the insertion).
   * @param {Element} el
   * @param {{altKey?: boolean}} [evt]
   * @param {{keepOpacity?: boolean}} [opts] `keepOpacity`: leave the element's own `opacity` alone
   * @returns {void}
   */
  const finishCreated = (el, evt, opts) => {
    const style = svgCanvas.getStyle()
    svgCanvas.addedNew = true
    svgCanvas.pendingNewElement = el
    if (!opts?.keepOpacity) el.setAttribute('opacity', style.opacity)
    el.setAttribute('style', 'pointer-events:inherit')
    cleanupElement(el)
    if (svgCanvas.getCurConfig().selectNew) {
      // A tool that creates an element hands control back to Select, like every drawing tool.
      if (!evt?.altKey && !svgCanvas.getToolLocked()) svgCanvas.setMode('select')
      // Lock mode: leave the new shape unselected so its box/grips don't cover where the next one goes.
      if (!svgCanvas.getToolLocked()) svgCanvas.selectOnly([el], true)
    }
    svgCanvas.call('elementInserted', [el])
    svgCanvas.call('changed', [el])
  }

  /** @type {ToolContext} */
  const ctx = {
    canvas: svgCanvas,
    get zoom () { return svgCanvas.getZoom() },
    get start () { return gesture?.start ?? endingStart ?? undefined },
    snap: (pt) => (svgCanvas.getCurConfig().gridSnapping ? svgCanvas.snapPointToGrid(pt.x, pt.y) : pt),
    addOverlay: (el) => { ensureOverlay().append(el) },
    clearOverlays,
    finishCreated
  }

  // ---- gesture lifecycle ----------------------------------------------------

  /**
   * Roll the open gesture back (no-op without one).
   * @returns {void}
   */
  const cancelGesture = () => {
    if (!gesture) return
    const { tool, tx } = gesture
    gesture = null
    clearOverlays()
    try {
      tx.cancel()
    } finally {
      svgCanvas.setStarted(false)
      try { tool.cancel?.(ctx) } catch (err) { logError(`Tool "${tool.id}" cancel() failed`, err, LOG) }
    }
  }

  /**
   * @param {MouseEvent} evt
   * @returns {boolean} whether a registered tool handled the press
   */
  const toolPointerDown = (evt) => {
    const tool = tools.get(svgCanvas.getCurrentMode())
    if (!tool) return false
    cancelGesture() // a previous press that never saw its mouseup
    const start = toToolEvent(evt, undefined, tool)
    const tx = svgCanvas.beginTransaction(tool.undoLabel ?? tool.id)
    gesture = { tool, tx, start }
    let declined
    try {
      declined = tool.pointerDown(ctx, start) === false
    } catch (err) {
      cancelGesture()
      throw err
    }
    if (declined) {
      gesture = null
      tx.cancel()
      return false
    }
    svgCanvas.setStarted(true)
    return true
  }

  /**
   * @param {MouseEvent} evt
   * @returns {boolean} whether a registered tool handled the move
   */
  const toolPointerMove = (evt) => {
    if (!gesture) return false
    const { tool, start } = gesture
    try {
      tool.pointerMove?.(ctx, toToolEvent(evt, { x: start.screenX, y: start.screenY }, tool))
    } catch (err) {
      cancelGesture()
      throw err
    }
    return true
  }

  /**
   * Hover (no press): only tools that asked for it.
   * @param {MouseEvent} evt
   * @returns {void}
   */
  const toolHover = (evt) => {
    const tool = tools.get(svgCanvas.getCurrentMode())
    if (!tool?.wantsHover || gesture || !refreshRootSctm()) return
    try {
      tool.pointerMove?.(ctx, toToolEvent(evt))
    } catch (err) {
      logError(`Tool "${tool.id}" hover failed`, err, LOG)
    }
  }

  /**
   * @param {MouseEvent} evt
   * @returns {boolean} whether a registered tool handled the release
   */
  const toolPointerUp = (evt) => {
    if (!gesture) return false
    const { tool, tx, start } = gesture
    gesture = null // closed before anything below can call setMode()
    svgCanvas.setStarted(false)
    let result
    endingStart = start
    try {
      result = tool.pointerUp?.(ctx, toToolEvent(evt, { x: start.screenX, y: start.screenY }, tool))
    } catch (err) {
      clearOverlays()
      tx.cancel()
      svgCanvas.setStarted(false)
      try { tool.cancel?.(ctx) } catch (e) { logError(`Tool "${tool.id}" cancel() failed`, e, LOG) }
      throw err
    } finally {
      endingStart = null
    }
    clearOverlays()
    if (result === 'cancel') {
      tx.cancel()
      try { tool.cancel?.(ctx) } catch (err) { logError(`Tool "${tool.id}" cancel() failed`, err, LOG) }
      return true
    }
    tx.commit()
    if (result && typeof result === 'object' && result.created) finishCreated(result.created, evt, { keepOpacity: tool.keepOpacity })
    return true
  }

  /** Key events a tool has handled. @type {WeakSet<KeyboardEvent>} */
  const handledKeys = new WeakSet()

  /**
   * @param {KeyboardEvent} evt
   * @returns {boolean} whether the key was handled (the caller should preventDefault)
   */
  const toolKeyDown = (evt) => {
    if (evt.key === 'Escape') {
      cancelGesture()
      return false
    }
    // The editor has two keydown listeners (the shortcut dispatcher and the canvas one) and either may run
    // first: a key a tool took is taken once, and the other listener hears that it was.
    if (handledKeys.has(evt)) return true
    const tool = tools.get(svgCanvas.getCurrentMode())
    if (!tool?.keyDown) return false
    try {
      const handled = tool.keyDown(ctx, evt) === true
      if (handled) handledKeys.add(evt)
      return handled
    } catch (err) {
      logError(`Tool "${tool.id}" keyDown failed`, err, LOG)
      return false
    }
  }

  /**
   * Called by `setMode()`.
   * @param {string} prev
   * @param {string} next
   * @returns {void}
   */
  const toolModeChanged = (prev, next) => {
    if (prev === next) return
    cancelGesture()
    const out = tools.get(prev)
    const into = tools.get(next)
    try { out?.deactivate?.(ctx) } catch (err) { logError(`Tool "${prev}" deactivate() failed`, err, LOG) }
    try { into?.activate?.(ctx) } catch (err) { logError(`Tool "${next}" activate() failed`, err, LOG) }
  }

  // ---- public API ---------------------------------------------------------------

  /**
   * Register a tool. Its id is the mode name `setMode(id)` switches to.
   * @param {ToolDef} def
   * @returns {void}
   */
  const registerTool = (def) => {
    if (!def || typeof def.id !== 'string' || !def.id || typeof def.pointerDown !== 'function') {
      throw new TypeError('A tool needs an id and a pointerDown function')
    }
    if (tools.has(def.id)) {
      warn(`Tool "${def.id}" is already registered; replacing it`, undefined, LOG)
      cancelGesture()
    }
    tools.set(def.id, def)
  }

  /**
   * @param {string} id
   * @returns {boolean} whether a tool was removed
   */
  const unregisterTool = (id) => {
    if (gesture?.tool.id === id) cancelGesture()
    return tools.delete(id)
  }

  svgCanvas.registerTool = registerTool
  svgCanvas.unregisterTool = unregisterTool
  svgCanvas.hasTool = (/** @type {string} */ id) => tools.has(id)
  svgCanvas.finishCreatedElement = finishCreated
  // Called from event.js / setMode / the editor's key handler.
  svgCanvas.toolPointerDown = toolPointerDown
  svgCanvas.toolPointerMove = toolPointerMove
  svgCanvas.toolPointerUp = toolPointerUp
  svgCanvas.toolHover = toolHover
  svgCanvas.toolKeyDown = toolKeyDown
  svgCanvas.toolModeChanged = toolModeChanged
  svgCanvas.cancelToolGesture = cancelGesture

  // A release outside the window / an alt-tab mid-drag never delivers a mouseup:
  // roll the gesture back instead of leaving its transaction open (which would
  // silently swallow every other edit's undo step).
  const signal = /** @type {any} */ (svgCanvas).destroyAbort?.signal
  window.addEventListener('blur', cancelGesture, signal ? { signal } : undefined)
}
