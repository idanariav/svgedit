// @ts-check
/**
 * automation.js — a stable in-page API for driving and inspecting the editor
 * in **document coordinates**: `editor.automation` (also reachable as
 * `window.svgEditor.automation`).
 *
 * It replaces the workarounds Playwright specs and agents needed:
 *  - deriving the content origin from `#svgroot` + `#svgcontent`'s x/y by hand,
 *  - toolbar buttons that are off-screen at small viewports (`commands.run`),
 *  - drawing by mouse drag being fragile in headless mode (`pointer` scrolls the
 *    point into view and dispatches real `MouseEvent`s the canvas can't tell
 *    from a user's).
 *
 * Everything here is in-page and read-only or event-driven: no network, so it
 * is safe to ship in production builds.
 *
 * Ported in spirit from VectorCraft (https://github.com/storytold/vectorcraft),
 * `docs/control-protocol.md` and `crates/ui-egui/src/control.rs`
 * (`document.inspect`, `ui.inspect`, `ui.pointer`, `ui.key`), MIT OR Apache-2.0.
 * @module automation
 */
import { isMac } from '@svgedit/svgcanvas/common/browser'

/**
 * @typedef {object} Mods
 * @property {boolean} [shift]
 * @property {boolean} [alt]
 * @property {boolean} [ctrl]
 * @property {boolean} [meta]
 * @property {boolean} [mod] the platform command key (Cmd on macOS, Ctrl elsewhere)
 */

/**
 * @typedef {object} PointerEventSpec
 * @property {'down'|'move'|'up'|'click'|'dblclick'|'drag'} kind
 * @property {number} x
 * @property {number} y
 * @property {{x: number, y: number}} [to] end point of a `drag`
 * @property {number} [steps] intermediate `move`s of a `drag` (default 10)
 * @property {'doc'|'screen'} [space] `doc` (default): document units; `screen`: client pixels
 * @property {Mods} [mods]
 */

/**
 * The one definition of the document → client mapping (see CLAUDE.md,
 * "Coordinate mapping"): the content origin is `#svgroot`'s rect plus
 * `#svgcontent`'s x/y attributes, never `svgcontent.getBoundingClientRect()`
 * (for an inner `<svg>` that is the union of its rendered children).
 * @param {{rootLeft: number, rootTop: number, contentX: number, contentY: number, zoom: number}} frame
 * @param {number} x document x
 * @param {number} y document y
 * @returns {{x: number, y: number}} client coordinates
 */
export const docToClient = (frame, x, y) => ({
  x: frame.rootLeft + frame.contentX + x * frame.zoom,
  y: frame.rootTop + frame.contentY + y * frame.zoom
})

/**
 * Inverse of {@link docToClient}.
 * @param {{rootLeft: number, rootTop: number, contentX: number, contentY: number, zoom: number}} frame
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{x: number, y: number}} document coordinates
 */
export const clientToDoc = (frame, clientX, clientY) => ({
  x: (clientX - frame.rootLeft - frame.contentX) / frame.zoom,
  y: (clientY - frame.rootTop - frame.contentY) / frame.zoom
})

const NAMED_KEYS = {
  escape: 'Escape',
  esc: 'Escape',
  delete: 'Delete',
  del: 'Delete',
  backspace: 'Backspace',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  space: ' ',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown'
}

/**
 * Parse a key combo (`mod+d`, `ctrl+shift+z`, `escape`) into KeyboardEvent init.
 * @param {string} combo
 * @returns {KeyboardEventInit & {key: string}}
 */
export const parseKeyCombo = (combo) => {
  const parts = String(combo).split('+').map((p) => p.trim()).filter(Boolean)
  const last = (parts.pop() ?? '').toLowerCase()
  const init = { key: NAMED_KEYS[last] ?? last, code: last === 'space' ? 'Space' : undefined, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }
  for (const p of parts.map((m) => m.toLowerCase())) {
    if (p === 'mod') init[isMac() ? 'metaKey' : 'ctrlKey'] = true
    else if (p === 'ctrl' || p === 'control') init.ctrlKey = true
    else if (p === 'shift') init.shiftKey = true
    else if (p === 'alt' || p === 'option') init.altKey = true
    else if (p === 'meta' || p === 'cmd') init.metaKey = true
    else throw new Error(`Unknown modifier "${p}" in key combo "${combo}"`)
  }
  return init
}

export class Automation {
  /**
   * @param {any} editor the owning editor instance
   */
  constructor (editor) {
    this.editor = editor
  }

  /** The editor's command registry (`editor.commands`): run any action by id. */
  get commands () {
    return this.editor.commands
  }

  /**
   * Where the document sits on screen right now.
   * @returns {{rootLeft: number, rootTop: number, contentX: number, contentY: number, zoom: number}}
   */
  frame () {
    const { editor } = this
    const root = editor.$id('svgroot').getBoundingClientRect()
    const content = editor.$id('svgcontent')
    return {
      rootLeft: root.left,
      rootTop: root.top,
      contentX: Number(content.getAttribute('x')) || 0,
      contentY: Number(content.getAttribute('y')) || 0,
      zoom: editor.svgCanvas.getZoom()
    }
  }

  /**
   * A snapshot of the editor's state, in document units.
   * @param {{depth?: number}} [opts] unused for now; reserved for tree inspection
   * @returns {{
   *   mode: string, zoom: number, toolLocked: boolean,
   *   selection: Array<{id: string, tag: string, bbox: ?{x: number, y: number, width: number, height: number}}>,
   *   layers: Array<{name: string, visible: boolean, locked: boolean, current: boolean, childCount: number}>,
   *   undo: {size: number, redo: number, next: string},
   *   canvas: {width: number, height: number},
   *   viewport: {scrollX: number, scrollY: number},
   *   openDialog: ?string
   * }}
   */
  inspect (opts = {}) { // eslint-disable-line no-unused-vars
    const { editor } = this
    const canvas = editor.svgCanvas
    const drawing = canvas.getCurrentDrawing()
    const current = drawing.getCurrentLayerName()
    const layers = []
    for (let i = 0; i < drawing.getNumLayers(); i++) {
      const name = drawing.getLayerName(i)
      const layer = drawing.getLayerByName(name)
      const group = layer?.getGroup ? layer.getGroup() : layer // a Layer, or already its <g>
      layers.push({
        name,
        visible: drawing.getLayerVisibility(name),
        locked: drawing.getLayerLocked(name),
        current: name === current,
        childCount: group ? Array.from(group.children).filter((c) => c.localName !== 'title').length : 0
      })
    }
    const { w, h } = canvas.getResolution()
    const dialog = editor.$container.querySelector('[dialog="open"]')
    const workarea = editor.workarea
    return {
      mode: canvas.getMode(),
      zoom: canvas.getZoom(),
      toolLocked: canvas.getToolLocked(),
      selection: canvas.getSelectedElements().filter(Boolean).map((el) => ({
        id: el.id,
        tag: el.localName,
        bbox: canvas.getStrokedBBoxDefaultVisible([el]) ?? null
      })),
      layers,
      undo: {
        size: canvas.undoMgr.getUndoStackSize(),
        redo: canvas.undoMgr.getRedoStackSize(),
        next: canvas.undoMgr.getNextUndoCommandText()
      },
      canvas: { width: w, height: h },
      viewport: { scrollX: workarea?.scrollLeft ?? 0, scrollY: workarea?.scrollTop ?? 0 },
      openDialog: dialog ? dialog.localName : null
    }
  }

  /**
   * Scroll the workarea so a client point is inside it ("the off-screen problem").
   * @param {number} clientX
   * @param {number} clientY
   * @returns {void}
   */
  revealClientPoint (clientX, clientY) {
    const workarea = this.editor.workarea
    if (!workarea) return
    const r = workarea.getBoundingClientRect()
    const margin = 20
    if (clientX < r.left + margin) workarea.scrollLeft -= r.left + margin - clientX
    else if (clientX > r.right - margin) workarea.scrollLeft += clientX - (r.right - margin)
    if (clientY < r.top + margin) workarea.scrollTop -= r.top + margin - clientY
    else if (clientY > r.bottom - margin) workarea.scrollTop += clientY - (r.bottom - margin)
  }

  /**
   * Drive the canvas with real mouse events.
   * @param {PointerEventSpec[]} events
   * @returns {void}
   */
  pointer (events) {
    let held = false
    const fire = (/** @type {string} */ type, /** @type {Mods|undefined} */ mods, /** @type {{x: number, y: number}} */ client, detail = 1) => {
      const target = document.elementFromPoint(client.x, client.y) ?? this.editor.$id('svgcanvas')
      const m = mods ?? {}
      const mac = isMac()
      target.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: client.x,
        clientY: client.y,
        button: 0,
        buttons: type === 'mouseup' || type === 'click' || type === 'dblclick' || !held ? 0 : 1,
        detail,
        shiftKey: Boolean(m.shift),
        altKey: Boolean(m.alt),
        ctrlKey: Boolean(m.ctrl || (m.mod && !mac)),
        metaKey: Boolean(m.meta || (m.mod && mac))
      }))
    }

    for (const spec of events) {
      // Resolve to client coordinates ONCE, before the first event of the gesture:
      // scrolling mid-drag would leave the canvas with the root CTM it stored on mousedown.
      /** @type {Array<{x: number, y: number}>} */
      const wanted = [{ x: spec.x, y: spec.y }]
      if (spec.kind === 'drag') {
        if (!spec.to) throw new Error('A drag needs a "to" point')
        wanted.push(spec.to)
      }
      if (spec.space !== 'screen') {
        for (const p of wanted) {
          const c = docToClient(this.frame(), p.x, p.y)
          this.revealClientPoint(c.x, c.y) // may scroll: recomputed below
        }
      }
      const [at, to] = wanted.map((p) => (spec.space === 'screen' ? p : docToClient(this.frame(), p.x, p.y)))

      const down = (/** @type {{x: number, y: number}} */ c) => { held = true; fire('mousedown', spec.mods, c) }
      const up = (/** @type {{x: number, y: number}} */ c) => { held = false; fire('mouseup', spec.mods, c) }
      switch (spec.kind) {
        case 'down': down(at); break
        case 'move': fire('mousemove', spec.mods, at); break
        case 'up': up(at); break
        case 'click':
          down(at)
          up(at)
          fire('click', spec.mods, at)
          break
        case 'dblclick':
          down(at)
          up(at)
          fire('click', spec.mods, at)
          down(at)
          up(at)
          fire('click', spec.mods, at, 2)
          fire('dblclick', spec.mods, at, 2)
          break
        case 'drag': {
          const steps = Math.max(1, spec.steps ?? 10)
          down(at)
          for (let i = 1; i <= steps; i++) {
            fire('mousemove', spec.mods, { x: at.x + (to.x - at.x) * (i / steps), y: at.y + (to.y - at.y) * (i / steps) })
          }
          up(to)
          break
        }
        default:
          throw new Error(`Unknown pointer event kind "${/** @type {any} */ (spec).kind}"`)
      }
    }
  }

  /**
   * Press a key combo through the same path a user's key press takes (the
   * `HotkeyManager` document listener, after `ownsKeyEvent` / `isActiveEditor`).
   * @param {string} combo `mod+d`, `escape`, `ctrl+shift+z`, …
   * @returns {boolean} whether the editor consumed the key (it called preventDefault)
   */
  key (combo) {
    const init = parseKeyCombo(combo)
    const target = document.body
    const down = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(down)
    target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, ...init }))
    return down.defaultPrevented
  }
}
