/**
 * Tool contract: `svgCanvas.registerTool({ id, pointerDown, pointerMove, pointerUp, … })`.
 *
 * A new drawing/editing tool plugs into the canvas through ONE interface
 * instead of adding cases to `event.js`'s mode `switch` or juggling the
 * `mouseDown` / `mouseMove` / `mouseUp` extension hooks (now the `gesture*` canvas events). What the registry gives a tool:
 *
 *  - **One coordinate convention.** Events carry `x, y` in document (content)
 *    units, unzoomed, grid-snapped and mapped into the current group's local
 *    space (`rawX, rawY` are the same without grid snap). The legacy extension
 *    hooks mixed spaces (`start_x` unzoomed, `mouse_x` *zoomed*), which every
 *    extension tool had to divide back out by hand.
 *  - **Automatic undo.** A gesture runs inside an undo transaction
 *    ({@link module:transaction}): `pointerDown` opens it, `pointerUp` commits
 *    it as ONE step (labelled `undoLabel`) or rolls everything back when it
 *    returns `'cancel'`. Every other way out rolls back too (Escape, a mode switch,
 *    undo, a new press, a lost focus, a context menu, a handler that throws): the
 *    gesture runs on the canvas's gesture session ({@link module:gesture-session}),
 *    which owns those exits. Tools never touch `addCommandToHistory`.
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

import type SvgCanvas from '../svgcanvas.ts'
import type { Gesture, GestureEndReason } from './gesture-session.ts'
import { createDragIntent } from './pointer-intent.ts'
import type { DragIntent } from './pointer-intent.ts'
import type { SVGElementJSON } from '../svgcanvas.ts'
import { cleanupElement, releasePreviewPointer } from './dom-utils.ts'
import { transformPoint } from './math.ts'
import { NS } from './namespaces.ts'
import { isCreateInCurrentGroup, toCurrentGroupLocalPoint } from './event-group-context.ts'
import { isMac } from '../common/browser.ts'
import { error as logError, warn } from '../common/logger.ts'

const LOG = 'tool-registry'

export interface ToolMods {
  shift: boolean
  alt: boolean
  ctrl: boolean
  meta: boolean
  /** the platform command key (Cmd on macOS, Ctrl elsewhere) */
  mod: boolean
}

export interface ToolEvent {
  /** document units, unzoomed, grid-snapped, group-local */
  x: number
  y: number
  /** same, before grid snapping */
  rawX: number
  rawY: number
  /** client coordinates */
  screenX: number
  screenY: number
  /** screen pixels moved since the press (0 on the press itself) */
  dragDistance: number
  /**
   * the press has become a drag (core/pointer-intent.ts: `DRAG_PX` from where it went down, measured straight) and stays one;
   * `false` on the press and on hover. Use it, not a threshold of the tool's own, so a click is a click in every tool.
   */
  dragging: boolean
  mods: ToolMods
  button: number
  /** the original event, for edge cases */
  event: MouseEvent
}

export interface ToolContext {
  /** the SvgCanvas */
  canvas: SvgCanvas
  /** current zoom */
  zoom: number
  /** the press that began the current gesture */
  start?: ToolEvent
  /** the canvas's snapping, in document units */
  snap: (pt: { x: number, y: number }) => { x: number, y: number }
  /** add a preview/guide element (document units; never recorded) */
  addOverlay: (el: Element) => void
  clearOverlays: () => void
  /** treat `el` as a newly created element */
  finishCreated: (el: Element, evt?: { altKey?: boolean }) => void
}

/**
 * One control of a tool's options bar (`ToolDef.options`). The editor draws the bar from these, so a tool
 * never builds UI of its own for them.
 */
export interface ToolOption {
  /** passed back to `setOption` */
  id: string
  /** already translated */
  label: string
  type: 'number' | 'select' | 'checkbox' | 'buttons' | 'button'
  /** the current value */
  value: number | string | boolean
  /** number */
  min?: number
  /** number */
  max?: number
  /** number */
  step?: number
  /**
   * select, buttons; labels already translated. `buttons` is a row of presets: a click calls `setOption(id, value)`,
   * a double click `setOption(id, 'dblclick:' + value)`; `state` is drawn on the button (`active`, `modified`, `filled`, `empty`).
   * `button` is one action button: a click calls `setOption(id, true)`.
   */
  choices?: Array<{ value: string, label: string, title?: string, state?: 'active' | 'modified' | 'filled' | 'empty' }>
  /** tooltip */
  title?: string
  /** the control is not relevant right now (e.g. the distance while spacing is by step count) */
  hidden?: boolean
}

export interface ToolDef {
  /** the mode name passed to `setMode()` */
  id: string
  /** the mode became current */
  activate?: (ctx: ToolContext) => void
  /** the mode is being left */
  deactivate?: (ctx: ToolContext) => void
  /** return `false` to decline (legacy pipeline handles it) */
  pointerDown: (ctx: ToolContext, ev: ToolEvent) => void | false
  /** during a press; also on hover when `wantsHover` */
  pointerMove?: (ctx: ToolContext, ev: ToolEvent) => void
  /**
   * return `'cancel'` to roll the gesture back instead of committing, or
   * `{ created }` for a new element to finish (opacity, events, select it, …), or `{ create }` for one the registry makes through the
   * model (the JSON `addSVGElementsFromJson` takes; nothing is drawn until then, so the tool's preview is an overlay)
   */
  pointerUp?: (ctx: ToolContext, ev: ToolEvent) => void | 'cancel' | { created?: Element, create?: SVGElementJSON }
  /**
   * return true when handled.
   * Escape never reaches this: the registry cancels the gesture and lets the editor leave the tool.
   */
  keyDown?: (ctx: ToolContext, ev: KeyboardEvent) => boolean
  /** the gesture was rolled back (Escape, mode switch, `'cancel'`, an error): reset the tool's own state */
  cancel?: (ctx: ToolContext) => void
  /**
   * the controls of the tool's options bar, shown while the tool is the mode;
   * read again after every `setOption` and mode change, so `value` / `hidden` may depend on the tool's state
   */
  options?: () => ToolOption[]
  /** the user changed a control of `options()` */
  setOption?: (id: string, value: number | string | boolean) => void
  /** undo-menu text of the gesture (default: the id) */
  undoLabel?: string
  /**
   * the CSS cursor of the canvas while the tool is the mode
   * (set on activate, removed on deactivate). A cursor that follows what is under the pointer goes through
   * `svgCanvas.setCursorHint(name)`: the editor picks the artwork (core never does)
   */
  cursor?: string | ((ctx: ToolContext) => string)
  /** a finished gesture leaves its overlay on show (a readout); the tool clears it itself on the next press and in `deactivate` */
  keepOverlays?: boolean
  /**
   * The tool keeps its own undo transaction across gestures (a session: puppet warp pins, then drags, then one commit). The
   * registry opens no transaction per press, so a cancelled gesture (mode switch mid-drag, a stray press) calls `cancel` and
   * nothing else, instead of dooming the session's transaction. `undoLabel` is unused.
   */
  ownsUndo?: boolean
  /** receive `pointerMove` with no button down */
  wantsHover?: boolean
  /** created elements keep the `opacity` the tool stamped (the brush has its own) */
  keepOpacity?: boolean
  /**
   * `ev.x` / `ev.y` also snap to other objects' anchors, bounding boxes and the page (with guides),
   * when grid snapping is off. Opt in only if the tool places points with `x` / `y` (not `rawX` / `rawY`) on press AND drag.
   */
  snap?: boolean
}

/** The members `tool-registry.ts` gives its canvas. */
export interface ToolRegistryApi {
  /**
   * Register a tool whose id is the mode name `setMode(id)` switches to (core/tool-registry.js).
   * Events arrive in document units; each press-to-release gesture is one undo step.
   */
  registerTool(def: ToolDef): void
  /** The options bar of the current tool (or tool `id`): empty when it has none. */
  getToolOptions(id?: string): ToolOption[]
  setToolOption(optionId: string, value: number | string | boolean, id?: string): boolean
  unregisterTool(id: string): boolean
  hasTool(id: string): boolean
  /** Finish a newly created element like a drawn shape (opacity, events, select it unless locked). */
  finishCreatedElement(el: Element, evt?: { altKey?: boolean }, opts?: { keepOpacity?: boolean }): void
  toolPointerDown(evt: MouseEvent): boolean
  toolPointerMove(evt: MouseEvent): boolean
  toolPointerUp(evt: MouseEvent): boolean
  toolHover(evt: MouseEvent): void
  activeToolSnaps(): boolean
  /** Offer a key to the active registered tool; true when it was handled (the caller should preventDefault). */
  toolKeyDown(evt: KeyboardEvent): boolean
  toolModeChanged(prev: string, next: string): void
}

/** A registered tool's gesture on the session: the tool and the press that began it. */
interface ToolGestureState { tool: ToolDef, start: ToolEvent, intent: DragIntent }

const TOOL_KIND = 'tool:'

export const createToolRegistry = (canvas: SvgCanvas): ToolRegistryApi => {
  const svgCanvas = canvas

  const tools = new Map<string, ToolDef>()

  /** The active gesture when it is a registered tool's. */
  const current = (): Gesture<ToolGestureState> | null => {
    const g = svgCanvas.activeGesture()
    return g?.kind.startsWith(TOOL_KIND) ? g as Gesture<ToolGestureState> : null
  }
  let overlay: SVGSVGElement | null = null
  /** The press of the gesture whose `pointerUp` is running (the gesture itself is already closed). */
  let endingStart: ToolEvent | null = null

  // ---- coordinates --------------------------------------------------------

  /**
   * Map a mouse event to the tool coordinate convention. Uses the root CTM the
   * last mouseDown stored (like every other handler), refreshed on demand for
   * hover.
   * @param tool the tool the event is for; one with `snap` gets object snapping
   */
  const toToolEvent = (evt: MouseEvent, downClient?: { x: number, y: number }, tool?: ToolDef, intent?: DragIntent): ToolEvent => {
    const pt = transformPoint(evt.clientX, evt.clientY, svgCanvas.requireRootSctm())
    let { x, y } = pt
    if (isCreateInCurrentGroup(svgCanvas)) ({ x, y } = toCurrentGroupLocalPoint(svgCanvas, x, y))
    const raw = { x, y }
    if (svgCanvas.getCurConfig().gridSnapping) ({ x, y } = svgCanvas.snapPointToGrid(x, y))
    else if (tool?.snap) ({ x, y } = svgCanvas.drawSnap.snapDrawPoint(x, y, { tool: true }))
    const mac = isMac()
    return {
      x,
      y,
      rawX: raw.x,
      rawY: raw.y,
      screenX: evt.clientX,
      screenY: evt.clientY,
      dragDistance: downClient ? Math.hypot(evt.clientX - downClient.x, evt.clientY - downClient.y) : 0,
      dragging: intent ? intent.update(evt.clientX, evt.clientY) : false,
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

  const refreshRootSctm = (): boolean => {
    const screenToDoc = svgCanvas.frames.screenToDoc()
    if (screenToDoc) svgCanvas.setRootSctm(screenToDoc)
    return Boolean(screenToDoc)
  }

  // ---- overlays -------------------------------------------------------------

  /** An `<svg>` in `#svgroot` sharing `#svgcontent`'s box and viewBox, so overlay children use document units. */
  const ensureOverlay = (): SVGSVGElement => {
    const content = svgCanvas.getSvgContent()
    if (!overlay) {
      overlay = svgCanvas.getSvgRoot().ownerDocument.createElementNS(NS.SVG, 'svg') as SVGSVGElement
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

  const clearOverlays = (): void => {
    if (overlay) overlay.replaceChildren()
  }

  // ---- context ----------------------------------------------------------------

  /**
   * Finish a newly created element the way the legacy mouse-up does, minus the
   * history entry (the gesture's transaction already records the insertion).
   * @param opts `keepOpacity`: leave the element's own `opacity` alone
   */
  const finishCreated = (el: Element, evt?: { altKey?: boolean }, opts?: { keepOpacity?: boolean }): void => {
    const style = svgCanvas.getStyle()
    svgCanvas.gesture.addedNew = true
    svgCanvas.gesture.pendingNewElement = el
    if (!opts?.keepOpacity) el.setAttribute('opacity', String(style.opacity))
    releasePreviewPointer(el)
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

  const ctx: ToolContext = {
    canvas: svgCanvas,
    get zoom () { return svgCanvas.getZoom() },
    get start () { return current()?.state.start ?? endingStart ?? undefined },
    snap: (pt) => (svgCanvas.getCurConfig().gridSnapping ? svgCanvas.snapPointToGrid(pt.x, pt.y) : pt),
    addOverlay: (el) => { ensureOverlay().append(el) },
    clearOverlays,
    finishCreated
  }

  // ---- gesture lifecycle ----------------------------------------------------

  /** What a rolled-back tool gesture puts back besides the drawing: its overlays, the started flag, the tool's own state. */
  const toolCancelled = (tool: ToolDef) => (why: GestureEndReason): void => {
    if (why === 'declined') return // the tool turned the press down: it has nothing to reset
    clearOverlays()
    svgCanvas.setStarted(false)
    try { tool.cancel?.(ctx) } catch (err) { logError(`Tool "${tool.id}" cancel() failed`, err, LOG) }
  }

  /** @returns whether a registered tool handled the press */
  const toolPointerDown = (evt: MouseEvent): boolean => {
    const tool = tools.get(svgCanvas.getCurrentMode())
    if (!tool) return false
    const start = toToolEvent(evt, undefined, tool)
    // a gesture still open (its release never came) is cancelled by the session as a 'new press'
    const gesture = svgCanvas.beginGesture<ToolGestureState>(TOOL_KIND + tool.id, {
      state: { tool, start, intent: createDragIntent(start.screenX, start.screenY) },
      label: tool.undoLabel ?? tool.id,
      ownsUndo: tool.ownsUndo,
      onCancel: toolCancelled(tool),
      log: { at: [start.x, start.y] }
    })
    let declined: boolean
    try {
      declined = tool.pointerDown(ctx, start) === false
    } catch (err) {
      gesture.cancel('error')
      throw err
    }
    if (declined) {
      gesture.cancel('declined')
      return false
    }
    svgCanvas.setStarted(true)
    return true
  }

  /** @returns whether a registered tool handled the move */
  const toolPointerMove = (evt: MouseEvent): boolean => {
    const gesture = current()
    if (!gesture) return false
    const { tool, start, intent } = gesture.state
    try {
      tool.pointerMove?.(ctx, toToolEvent(evt, { x: start.screenX, y: start.screenY }, tool, intent))
    } catch (err) {
      gesture.cancel('error')
      throw err
    }
    return true
  }

  /** Hover (no press): only tools that asked for it. */
  const toolHover = (evt: MouseEvent): void => {
    const tool = tools.get(svgCanvas.getCurrentMode())
    if (!tool?.wantsHover || current() || !refreshRootSctm()) return
    try {
      const ev = toToolEvent(evt)
      // A tool that opted in with `snap` sees the point a press would land on, as the guides show.
      if (tool.snap && !svgCanvas.getCurConfig().gridSnapping) {
        ({ x: ev.x, y: ev.y } = svgCanvas.drawSnap.hoverDrawSnap(ev.x, ev.y, { tool: true }))
      }
      tool.pointerMove?.(ctx, ev)
    } catch (err) {
      logError(`Tool "${tool.id}" hover failed`, err, LOG)
    }
  }

  /** @returns whether a registered tool handled the release */
  const toolPointerUp = (evt: MouseEvent): boolean => {
    const gesture = current()
    if (!gesture) return false
    const { tool, start, intent } = gesture.state
    gesture.detach() // before anything below can call setMode(), which would cancel it
    svgCanvas.setStarted(false)
    let result: ReturnType<NonNullable<ToolDef['pointerUp']>>
    endingStart = start
    try {
      result = tool.pointerUp?.(ctx, toToolEvent(evt, { x: start.screenX, y: start.screenY }, tool, intent))
    } catch (err) {
      gesture.cancel('error')
      throw err
    } finally {
      endingStart = null
    }
    if (result === 'cancel') {
      gesture.cancel('the tool declined on release')
      return true
    }
    if (!tool.keepOverlays) clearOverlays()
    let created = result && typeof result === 'object' ? result.created : undefined
    if (result && typeof result === 'object' && result.create) {
      created = svgCanvas.insertElementFromJson(result.create) ?? undefined
      if (!created) {
        gesture.cancel('the element could not be created')
        return true
      }
    }
    gesture.commit({ created: created?.id })
    if (created) finishCreated(created, evt, { keepOpacity: tool.keepOpacity })
    return true
  }

  /** Key events a tool has handled. */
  const handledKeys = new WeakSet<KeyboardEvent>()

  /** @returns whether the key was handled (the caller should preventDefault) */
  const toolKeyDown = (evt: KeyboardEvent): boolean => {
    if (evt.key === 'Escape') {
      svgCanvas.cancelGesture('escape')
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

  /** Called by `setMode()`. */
  const toolModeChanged = (prev: string, next: string): void => {
    if (prev === next) return
    svgCanvas.cancelGesture('mode switch')
    const out = tools.get(prev)
    const into = tools.get(next)
    try { out?.deactivate?.(ctx) } catch (err) { logError(`Tool "${prev}" deactivate() failed`, err, LOG) }
    if (out?.cursor) svgCanvas.getSvgRoot().style.removeProperty('cursor')
    if (into?.cursor) svgCanvas.getSvgRoot().style.cursor = typeof into.cursor === 'function' ? into.cursor(ctx) : into.cursor
    try { into?.activate?.(ctx) } catch (err) { logError(`Tool "${next}" activate() failed`, err, LOG) }
  }

  // ---- public API ---------------------------------------------------------------

  /** Register a tool. Its id is the mode name `setMode(id)` switches to. */
  const registerTool = (def: ToolDef): void => {
    if (!def || typeof def.id !== 'string' || !def.id || typeof def.pointerDown !== 'function') {
      throw new TypeError('A tool needs an id and a pointerDown function')
    }
    if (tools.has(def.id)) {
      warn(`Tool "${def.id}" is already registered; replacing it`, undefined, LOG)
      if (current()?.state.tool.id === def.id) svgCanvas.cancelGesture('replaced')
    }
    tools.set(def.id, def)
  }

  /** @returns whether a tool was removed */
  const unregisterTool = (id: string): boolean => {
    if (current()?.state.tool.id === id) svgCanvas.cancelGesture('replaced')
    return tools.delete(id)
  }

  /** The options bar of the current tool (or of tool `id`): empty when it has none. */
  const getToolOptions = (id: string = svgCanvas.getMode()): ToolOption[] => {
    try {
      return tools.get(id)?.options?.() ?? []
    } catch (err) {
      logError(`Tool "${id}" options() failed`, err, LOG)
      return []
    }
  }

  /**
   * Change one control of the current tool's (or tool `id`'s) options bar.
   * @returns whether the tool took it
   */
  const setToolOption = (optionId: string, value: number | string | boolean, id: string = svgCanvas.getMode()): boolean => {
    const tool = tools.get(id)
    if (!tool?.setOption) return false
    try {
      tool.setOption(optionId, value)
      return true
    } catch (err) {
      logError(`Tool "${id}" setOption() failed`, err, LOG)
      return false
    }
  }

  return {
    registerTool,
    getToolOptions,
    setToolOption,
    unregisterTool,
    hasTool: (id: string) => tools.has(id),
    finishCreatedElement: finishCreated,
    // Called from event.js / setMode / the editor's key handler.
    toolPointerDown,
    toolPointerMove,
    toolPointerUp,
    toolHover,
    activeToolSnaps: () => Boolean(tools.get(svgCanvas.getCurrentMode())?.snap),
    toolKeyDown,
    toolModeChanged
  }
}
