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

export interface Mods {
  shift?: boolean
  alt?: boolean
  ctrl?: boolean
  meta?: boolean
  /** the platform command key (Cmd on macOS, Ctrl elsewhere) */
  mod?: boolean
}

export interface PointerEventSpec {
  kind: 'down' | 'move' | 'up' | 'click' | 'dblclick' | 'drag'
  x: number
  y: number
  /** end point of a `drag` */
  to?: { x: number, y: number }
  /** intermediate `move`s of a `drag` (default 10) */
  steps?: number
  /** `doc` (default): document units; `screen`: client pixels */
  space?: 'doc' | 'screen'
  mods?: Mods
}

/**
 * The one definition of the document → client mapping (see CLAUDE.md,
 * "Coordinate mapping"): the content origin is `#svgroot`'s rect plus
 * `#svgcontent`'s x/y attributes, never `svgcontent.getBoundingClientRect()`
 * (for an inner `<svg>` that is the union of its rendered children).
 * @param x document x
 * @param y document y
 * @returns client coordinates
 */
export const docToClient = (frame: { rootLeft: number, rootTop: number, contentX: number, contentY: number, zoom: number }, x: number, y: number): { x: number, y: number } => ({
  x: frame.rootLeft + frame.contentX + x * frame.zoom,
  y: frame.rootTop + frame.contentY + y * frame.zoom
})

/**
 * Inverse of {@link docToClient}.
 * @returns document coordinates
 */
export const clientToDoc = (frame: { rootLeft: number, rootTop: number, contentX: number, contentY: number, zoom: number }, clientX: number, clientY: number): { x: number, y: number } => ({
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

/** Parse a key combo (`mod+d`, `ctrl+shift+z`, `escape`) into KeyboardEvent init. */
export const parseKeyCombo = (combo: string): KeyboardEventInit & { key: string } => {
  const parts = String(combo).split('+').map((p) => p.trim()).filter(Boolean)
  const last = (parts.pop() ?? '').toLowerCase()
  const init = { key: (NAMED_KEYS as Record<string, string>)[last] ?? last, code: last === 'space' ? 'Space' : undefined, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }
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
  editor: EditorInstance

  /** @param editor the owning editor instance */
  constructor (editor: EditorInstance) {
    this.editor = editor
  }

  /** The editor's command registry (`editor.commands`): run any action by id. */
  get commands () {
    return this.editor.commands
  }

  /** Where the document sits on screen right now. */
  frame (): { rootLeft: number, rootTop: number, contentX: number, contentY: number, zoom: number } {
    const { editor } = this
    const root = editor.$req('svgroot').getBoundingClientRect()
    const content = editor.$req('svgcontent')
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
 * @param opts unused for now; reserved for tree inspection
   */
  inspect (opts: { depth?: number } = {}): { mode: string, zoom: number, toolLocked: boolean, selection: Array<{ id: string, tag: string, bbox: ({ x: number, y: number, width: number, height: number } | null) }>, layers: Array<{ name: string, visible: boolean, locked: boolean, current: boolean, childCount: number }>, undo: { size: number, redo: number, next: string }, canvas: { width: number, height: number }, viewport: { scrollX: number, scrollY: number }, openDialog: (string | null) } { // eslint-disable-line no-unused-vars
    const { editor } = this
    const canvas = editor.svgCanvas
    const drawing = canvas.getCurrentDrawing()
    const current = drawing.getCurrentLayerName()
    const layers = []
    for (let i = 0; i < drawing.getNumLayers(); i++) {
      const name = drawing.getLayerName(i)
      const layer = drawing.getLayerByName(name) as (SVGGElement & { getGroup?: () => SVGGElement }) | null
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
      selection: canvas.getSelectedElements().filter(Boolean).map((el: Element) => ({
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

  /** Scroll the workarea so a client point is inside it ("the off-screen problem"). */
  revealClientPoint (clientX: number, clientY: number): void {
    const workarea = this.editor.workarea
    if (!workarea) return
    const r = workarea.getBoundingClientRect()
    const margin = 20
    if (clientX < r.left + margin) workarea.scrollLeft -= r.left + margin - clientX
    else if (clientX > r.right - margin) workarea.scrollLeft += clientX - (r.right - margin)
    if (clientY < r.top + margin) workarea.scrollTop -= r.top + margin - clientY
    else if (clientY > r.bottom - margin) workarea.scrollTop += clientY - (r.bottom - margin)
  }

  /** Drive the canvas with real mouse events. */
  pointer (events: PointerEventSpec[]): void {
    let held = false
    const fire = (type: string, mods: Mods | undefined, client: { x: number, y: number }, detail = 1) => {
      const target = document.elementFromPoint(client.x, client.y) ?? this.editor.$req('svgcanvas')
      // An array would pass silently: `['alt'].shift` is the (truthy) Array method, i.e. Shift held.
      if (Array.isArray(mods)) throw new TypeError('pointer mods is an object like { shift: true }, not an array')
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
      const wanted: Array<{ x: number, y: number }> = [{ x: spec.x, y: spec.y }]
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

      const down = (c: { x: number, y: number }) => { held = true; fire('mousedown', spec.mods, c) }
      const up = (c: { x: number, y: number }, detail = 1) => { held = false; fire('mouseup', spec.mods, c, detail) }
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
          up(at, 2) // a browser counts the click on the mouseup of the second press too
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
          throw new Error(`Unknown pointer event kind "${(spec as { kind: string }).kind}"`)
      }
    }
  }

  /**
   * Press a key combo through the same path a user's key press takes (the
   * `HotkeyManager` document listener, after `ownsKeyEvent` / `isActiveEditor`).
 * @param combo `mod+d`, `escape`, `ctrl+shift+z`, …
 * @returns whether the editor consumed the key (it called preventDefault)
   */
  key (combo: string): boolean {
    const init = parseKeyCombo(combo)
    const target = document.body
    const down = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(down)
    target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, ...init }))
    return down.defaultPrevented
  }
}
