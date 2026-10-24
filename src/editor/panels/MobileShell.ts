// MobileShell.ts — Mobile mode shell: opens view-only (pan / pinch-zoom); Edit switches to a bottom bar of Pan, Pencil and Text with colours, stroke widths and undo / redo
import mobileShellHTML from './MobileShell.html'
import { fetchSvgEl } from '../components/svgIconLoader.ts'

const COLORS = ['#000000', '#FFFFFF', '#E11D48', '#F59E0B', '#22C55E', '#2563EB', '#7C3AED']
const WIDTHS = [2, 5, 10]

/** The edit state's tools, `[mode, iconFile, label]`. */
const TOOLS: Array<[string, string, string]> = [
  ['ext-panning', 'panning.svg', 'Pan'],
  ['fhpath', 'pencil.svg', 'Pencil'],
  ['text', 'text.svg', 'Text']
]
/** The canvas modes a press may start in while editing (`textedit` is the Text tool editing a text). */
const EDIT_MODES = new Set(['ext-panning', 'fhpath', 'text', 'textedit'])

/**
 * The mobile shell, for viewing drawings and rough sketching on a phone. It opens in the **view state**:
 * `editor.viewOnly` is set (every command outside `VIEW_ONLY_COMMANDS` refuses, paste is ignored) and the
 * canvas stays in `ext-panning`, so a finger pans and two pinch-zoom. **Edit** switches to the edit state:
 * a bottom bar with Pan, Pencil and Text (tool lock on, so a tool stays armed), a colour / width palette,
 * undo / redo and Done (back to the view state). Every press is checked before the canvas sees it and
 * reset to the state's tool when the canvas has drifted to another mode (Select after a text edit, the
 * double-click and Space shortcuts). Shown only while `.svg_editor` carries `ui-mobile` (uiMode.ts).
 */
class MobileShell {
  editor: EditorInstance
  /** The edit state's current tool. */ tool: string
  toolBtns: Record<string, HTMLButtonElement>
  /** Whether mobile mode is on (`ui-mobile` is set). */ active: boolean
  /** The tool lock as it was before mobile mode, restored when it ends. */ savedToolLock: boolean

  // Built by `init()`.
  shell: HTMLElement
  palette: HTMLElement
  dot: HTMLElement
  zLabel: HTMLElement
  bUndo: HTMLButtonElement
  bRedo: HTMLButtonElement

  /** @param editor svgedit handler */
  constructor (editor: EditorInstance) {
    this.editor = editor
    this.tool = 'fhpath'
    this.toolBtns = {}
    this.active = false
    this.savedToolLock = false
  }

  get svgCanvas () { return this.editor.svgCanvas }
  get imgPath () { return this.editor.configObj.curConfig.imgPath }

  init (): void {
    const { $req, $svgEditor } = this.editor
    const tpl = document.createElement('template')
    tpl.innerHTML = mobileShellHTML
    $svgEditor.append(tpl.content.cloneNode(true))
    this.shell = ($svgEditor.querySelector('.mobile-shell') as HTMLElement)
    this.palette = $req('ms_palette')

    this.buildZoom()
    this.setIcon($req('ms_edit_icon'), 'pencil.svg')
    $req('ms_edit').addEventListener('click', () => this.run('mobile_edit_toggle'))
    this.buildBar()
    this.buildPalette()
    this.bindEvents()
    this.sync()
  }

  /* ─────────────────── small DOM helpers ─────────────────── */

  async setIcon (elem: HTMLElement, iconFile: string) {
    const svg = await fetchSvgEl(`${this.imgPath}/${iconFile}`)
    if (svg) { elem.replaceChildren(svg) }
  }

  makeBtn (iconFile: string, title: string, tap: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'mbtn'
    b.title = title
    if (iconFile) this.setIcon(b, iconFile)
    b.addEventListener('click', (e) => { e.stopPropagation(); tap() })
    return b
  }

  /** Run a registry command, then refresh the history buttons. */
  run (id: string) {
    this.editor.commands.tryRun(id, {}, 'mobile')
    this.syncHistory()
  }

  /* ─────────────────── controls ─────────────────── */

  buildZoom () {
    const { $req } = this.editor
    const out = this.makeBtn('', 'Zoom out', () => this.run('zoom_out'))
    out.textContent = '−'
    const inn = this.makeBtn('', 'Zoom in', () => this.run('zoom_in'))
    inn.textContent = '+'
    this.zLabel = document.createElement('span')
    this.zLabel.className = 'ms-zlabel'
    $req('ms_zoom').append(out, this.zLabel, inn, this.makeBtn('zoom_fit.svg', 'Fit to canvas', () => this.run('zoom_fit')))
    this.syncZoom()
  }

  buildBar () {
    const { $req } = this.editor
    const bar = $req('ms_bar')
    const sep = () => { const s = document.createElement('div'); s.className = 'ms-sep'; bar.append(s) }
    TOOLS.forEach(([mode, icon, label]) => {
      const b = this.makeBtn(icon, label, () => this.selectTool(mode))
      this.toolBtns[mode] = b
      bar.append(b)
    })
    sep()
    const chip = this.makeBtn('', 'Colour and width', () => this.palette.classList.toggle('show'))
    chip.classList.add('ms-chip')
    this.dot = document.createElement('span')
    this.dot.className = 'dot'
    chip.append(this.dot)
    bar.append(chip)
    sep()
    this.bUndo = this.makeBtn('undo.svg', 'Undo', () => this.run('tool_undo'))
    this.bRedo = this.makeBtn('redo.svg', 'Redo', () => this.run('tool_redo'))
    const done = document.createElement('button')
    done.type = 'button'
    done.className = 'ms-done'
    done.textContent = 'Done'
    done.addEventListener('click', () => this.run('mobile_edit_toggle'))
    bar.append(this.bUndo, this.bRedo, done)
  }

  buildPalette () {
    COLORS.forEach((c) => {
      const s = document.createElement('button')
      s.type = 'button'
      s.className = 'ms-swatch'
      s.title = c
      s.dataset.color = c
      s.style.background = c
      s.addEventListener('click', () => this.pickColor(c))
      this.palette.append(s)
    })
    WIDTHS.forEach((w) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'ms-width'
      b.title = `Width ${w}`
      b.dataset.width = String(w)
      const line = document.createElement('span')
      line.style.height = `${w}px`
      b.append(line)
      b.addEventListener('click', () => this.pickWidth(w))
      this.palette.append(b)
    })
    this.syncStyle()
  }

  /** The colour of new pencil strokes and texts; it also recolours the text being edited. */
  pickColor (color: string) {
    const { svgCanvas } = this
    const sel = svgCanvas.getSelectedElements().filter(Boolean)
    if (sel.length === 1 && sel[0].tagName === 'text') svgCanvas.setColor('fill', color)
    // The defaults only: a stroke colour must not land on a selected text.
    svgCanvas.setCurShape('stroke', color)
    svgCanvas.setCurText('fill', color)
    this.syncStyle()
  }

  /** The width of new pencil strokes. */
  pickWidth (width: number) {
    this.svgCanvas.setCurShape('stroke_width', width)
    this.syncStyle()
  }

  /* ─────────────────── states ─────────────────── */

  /** Enter or leave mobile mode as the `ui-mobile` class comes and goes (the menu, or a host setting the class). */
  sync () {
    const on = this.editor.$svgEditor.classList.contains('ui-mobile')
    if (on === this.active) return
    this.active = on
    if (on) {
      this.savedToolLock = this.svgCanvas.getToolLocked()
      this.setEditing(false)
      return
    }
    this.editor.viewOnly = false
    this.shell.classList.remove('is-editing')
    this.palette.classList.remove('show')
    this.svgCanvas.setToolLocked(this.savedToolLock)
    this.svgCanvas.setMode('select')
    this.editor.commands.refreshEnablement()
  }

  /** Switch between the view state (`false`) and the edit state (`true`). */
  setEditing (on: boolean) {
    const { svgCanvas } = this
    this.editor.viewOnly = !on
    this.shell.classList.toggle('is-editing', on)
    this.palette.classList.remove('show')
    svgCanvas.setToolLocked(on)
    // setMode ends a text edit in progress; nothing stays selected (its handles would be live).
    svgCanvas.setMode(on ? this.tool : 'ext-panning')
    svgCanvas.clearSelection()
    this.editor.commands.refreshEnablement()
    this.syncHistory()
  }

  selectTool (mode: string) {
    this.tool = mode
    this.palette.classList.remove('show')
    this.svgCanvas.setMode(mode)
  }

  /** Before the canvas sees a press: put it back in the state's tool if it drifted to another mode. */
  guardPress () {
    if (!this.active) return
    const { svgCanvas } = this
    const mode = svgCanvas.getMode()
    if (this.editor.viewOnly ? mode === 'ext-panning' : EDIT_MODES.has(mode)) return
    svgCanvas.clearSelection()
    svgCanvas.setMode(this.editor.viewOnly ? 'ext-panning' : this.tool)
  }

  /* ─────────────────── wiring ─────────────────── */

  bindEvents () {
    const { svgCanvas, editor } = this
    const { signal } = editor.listenerAbort
    // Capture on the workarea: before the canvas's own mousedown and the context menu's listener.
    editor.workarea.addEventListener('mousedown', () => this.guardPress(), { capture: true, signal })
    editor.workarea.addEventListener('contextmenu', (e) => {
      if (!this.active) return
      e.preventDefault()
      e.stopImmediatePropagation()
    }, { capture: true, signal })
    const observer = new MutationObserver(() => this.sync())
    observer.observe(editor.$svgEditor, { attributes: true, attributeFilter: ['class'] })
    signal.addEventListener('abort', () => observer.disconnect())
    svgCanvas.bind('changed', () => this.syncHistory())
    document.addEventListener('modeChange', () => this.syncTools(), { signal })
  }

  syncTools () {
    const mode = this.svgCanvas.getMode()
    const shown = mode === 'textedit' ? 'text' : mode
    Object.entries(this.toolBtns).forEach(([m, b]) => b.classList.toggle('is-active', m === shown))
  }

  syncZoom () {
    if (this.zLabel) this.zLabel.textContent = Math.round(this.svgCanvas.getZoom() * 100) + '%'
  }

  syncHistory () {
    if (!this.bUndo) return
    this.bUndo.disabled = this.svgCanvas.undoMgr.getUndoStackSize() === 0
    this.bRedo.disabled = this.svgCanvas.undoMgr.getRedoStackSize() === 0
  }

  syncStyle () {
    const { stroke, stroke_width: width } = this.svgCanvas.getCurShape()
    this.dot.style.background = !stroke || stroke === 'none' ? '#000' : stroke
    this.palette.querySelectorAll<HTMLElement>('.ms-swatch').forEach((s) => s.classList.toggle('is-on', s.dataset.color === stroke))
    this.palette.querySelectorAll<HTMLElement>('.ms-width').forEach((b) => b.classList.toggle('is-on', Number(b.dataset.width) === Number(width)))
  }
}

export default MobileShell
