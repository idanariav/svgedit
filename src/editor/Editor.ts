/* globals seConfirm seAlert */
/**
 * The main module for the visual SVG this.
 *
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria
 * 2010 Pavol Rusnak
 * 2010 Jeff Schiller
 * 2010 Narendra Sisodiya
 * 2014 Brett Zamir
 * 2020 OptimistikSAS
 * @module SVGEditor
 */

import './components/index.ts'
import './dialogs/index.ts'

import SvgCanvas from '@svgedit/svgcanvas'
import Paint from '@svgedit/svgcanvas/core/paint.ts'
import { Command } from '@svgedit/svgcanvas/core/history.js'
import ConfigObj from './ConfigObj.ts'
import DebugSnapshotLogger from './DebugSnapshotLogger.ts'
import { attachDebugActionStream } from './DebugActionStream.ts'
import EditorStartup from './EditorStartup.ts'
import { clearActiveEditor } from './domScope.ts'
import LeftPanel from './panels/LeftPanel.ts'
import TopPanel from './panels/TopPanel.ts'
import BottomPanel from './panels/BottomPanel.ts'
import RightPanel from './panels/RightPanel.ts'
import TabletShell from './panels/TabletShell.ts'
import MainMenu from './MainMenu.ts'
import { CommandRegistry } from './commands.ts'
import { registerCoreCommands } from './coreCommands.ts'
import { registerCanvasCommands } from './canvasCommands.ts'
import { registerPanelCommands } from './panelCommands.ts'
import { Automation } from './automation.ts'
import HotkeyManager from './Hotkeys.ts'
import { getParentsUntil } from '@svgedit/svgcanvas/common/util.ts'
import { getIconDataUri } from './images/iconRegistry.ts'
import { blurActiveField } from './components/fieldAutoBlur.ts'
import { runSteps } from './runSteps.ts'
import { buildEditorShortcuts } from './editorShortcuts.ts'
import { getDefaultClassForTag, getClass, applyDefaultClassAttrs } from './classLibrary.ts'
import { setLogSink, setLogLevel } from '@svgedit/svgcanvas/common/logger.ts'

const { $click, decode64 } = SvgCanvas

/**
 *
 */
/** (like `DOMRect`) */
export interface BBoxObjectWithFactor {
  x: number
  y: number
  width: number
  height: number
  /** Needed if width or height are 0 */
  factor?: number
  zoom?: number
}

export type ReadyCallback = () => unknown

/** :SVGthis.URLLoadCallback */
export type module = (success: boolean) => void

class Editor extends EditorStartup {
  showSaveWarning: boolean
  title: string
  $click: (element: EventTarget, handler: EventListener) => void
  isReady: boolean
  customExportImage: boolean
  configObj: ConfigObj
  setConfig: (opts: Record<string, unknown>, cfgCfg?: { allowInitialUserOverride?: boolean; }) => void
  docprops: boolean
  goodLangs: string[]
  shortcuts: ({ id: string; group: string; label: string; key: (string | boolean)[]; fn: () => void; atomic?: undefined; enabled?: undefined; } | { id: string; group: string; label: string; key: string; fn: () => void; atomic?: undefined; enabled?: undefined; } | { id: string; atomic: boolean; group: string; label: string; key: (string | boolean)[]; fn: () => void; enabled?: undefined; } | { id: string; atomic: boolean; group: string; label: string; key: string; fn: () => void; enabled?: undefined; } | { id: string; group: string; label: string; fn: () => void; key?: undefined; atomic?: undefined; enabled?: undefined; } | { enabled: (editor: EditorInstance) => true | string; id: string; group: string; label: string; key: (string | boolean)[]; fn: () => void; atomic?: undefined; } | { enabled: (editor: EditorInstance) => true | string; id: string; group: string; label: string; key: string; fn: () => void; atomic?: undefined; } | { enabled: (editor: EditorInstance) => true | string; id: string; atomic: boolean; group: string; label: string; key: (string | boolean)[]; fn: () => void; } | { enabled: (editor: EditorInstance) => true | string; id: string; atomic: boolean; group: string; label: string; key: string; fn: () => void; } | { enabled: (editor: EditorInstance) => true | string; id: string; group: string; label: string; fn: () => void; key?: undefined; atomic?: undefined; })[]
  commands: CommandRegistry
  automation: Automation
  hotkeys: HotkeyManager
  leftPanel: LeftPanel
  bottomPanel: BottomPanel
  topPanel: TopPanel
  rightPanel: RightPanel
  tabletShell: TabletShell
  mainMenu: MainMenu
  _debugSnapshotLogger: DebugSnapshotLogger | undefined
  _stopDebugActions: (() => void) | null | undefined
  exportWindow: Window | null
  selectedElement: Element | null
  multiselected: boolean

  /** What `ready()` queued until the editor is up. */ callbacks: Array<[() => unknown, (value?: unknown) => void, (reason?: unknown) => void]>
  /** The group being edited, as a breadcrumb; `null` at the top level. */ curContext: string | null
  /** The name of the window an export goes to (set by the main menu). */ exportWindowName: string | null

  /** @param div the editor's container */
  constructor (div: HTMLElement | null = null) {
    super(div)
    this.showSaveWarning = false
    /**
     * document title
     */
    this.title = 'untitled.svg'

    this.$click = $click
    this.isReady = false
    this.customExportImage = false
    this.configObj = new ConfigObj(this)
    this.configObj.pref = this.configObj.pref.bind(this.configObj)
    this.setConfig = this.configObj.setConfig.bind(this.configObj)
    this.callbacks = []
    this.curContext = null
    this.exportWindowName = null
    this.docprops = false
    this.configObj.preferences = false
    this.goodLangs = ['en']

    // Editor-level shortcuts (not associated with a toolbar button). Each entry
    // carries `id`/`group`/`label` so the Hotkey Manager (see Hotkeys.js) can
    // list and rebind it. `key` may use the `mod` token (platform command key)
    // and `/` to separate equivalent default keys; the trailing `true` keeps the
    // original preventDefault behaviour.
    this.shortcuts = buildEditorShortcuts(this)
    this.commands = new CommandRegistry(this)
    // Order matters: the hotkey table is first-registered-wins, so a core command's key
    // outranks an editor shortcut with the same one (none overlap today).
    registerCoreCommands(this.commands)
    registerCanvasCommands(this.commands)
    registerPanelCommands(this.commands)
    this.automation = new Automation(this)
    this.hotkeys = new HotkeyManager(this)
    this.hotkeys.ingestEditorShortcuts(this.shortcuts)
    this.leftPanel = new LeftPanel(this)
    this.bottomPanel = new BottomPanel(this)
    this.topPanel = new TopPanel(this)
    this.rightPanel = new RightPanel(this)
    this.tabletShell = new TabletShell(this)
    this.mainMenu = new MainMenu(this)
    // makes svgEditor accessible as a global variable
    window.svgEditor = this
  } // end Constructor

  /** @param str SVG string@throws {Error} Upon failure to load SVG */
  loadSvgString (str: string, { noAlert }: { noAlert?: boolean } = {}): void {
    // Loading a document is the undo baseline, not an undoable edit: left
    // on the stack it makes "undo" past the first real edit delete the whole
    // drawing (redo restores it), and keeps openPrep() treating a freshly
    // loaded, untouched document as having unsaved changes.
    const success = this.svgCanvas.setSvgString(str, true) !== false
    if (success) {
      this.svgCanvas.undoMgr.resetUndoStack()
      this.updateCanvas()
      // Loading replaces the whole drawing without firing elementChanged, so
      // refresh the layers panel to match the loaded drawing's layers
      // (otherwise it keeps showing the stale layer list from before the load).
      this.rightPanel.populateLayers()
      // ...and refresh the empty-canvas brand watermark to match the new content
      // (otherwise it lingers when a non-empty drawing is loaded).
      this.updateCanvasWatermark()
      // The stack was just reset: refresh the undo/redo buttons to match.
      this.topPanel.updateContextPanel()
      this.tabletShell?.syncHistory?.()
      return
    }
    if (!noAlert) seAlert(this.i18next.t('notification.errorLoadingSVG'))
    throw new Error('Error loading SVG')
  }

  /**
   * All methods are optional.
   * @interface module:SVGthis.CustomHandler
   * @type {PlainObject}
   */
  /**
   * Its responsibilities are:
   *  - invoke a file chooser dialog in 'open' mode
   *  - let user pick a SVG file
   *  - calls [svgCanvas.setSvgString()]{@link module:svgcanvas.SvgCanvas#setSvgString} with the string contents of that file.
   * Not passed any parameters.
   * @function module:SVGthis.CustomHandler#open
   * @returns {void}
   */
  /**
   * Its responsibilities are:
   *  - accept the string contents of the current document
   *  - invoke a file chooser dialog in 'save' mode
   *  - save the file to location chosen by the user.
   * @function module:SVGthis.CustomHandler#save
   * @param {Window} win
   * @param {module:svgcanvas.SvgCanvas#event:saved} svgStr A string of the SVG
   * @listens module:svgcanvas.SvgCanvas#event:saved
   * @returns {void}
   */
  /**
   * Its responsibilities (with regard to the object it is supplied in its 2nd argument) are:
   *  - inform user of any issues supplied via the "issues" property
   *  - convert the "svg" property SVG string into an image for export;
   *    utilize the properties "type" (currently 'PNG', 'JPEG', 'BMP',
   *    'WEBP'), "mimeType", and "quality" (for 'JPEG' and 'WEBP'
   *    types) to determine the proper output.
   * @function module:SVGthis.CustomHandler#exportImage
   * @param {Window} win
   * @param {module:svgcanvas.SvgCanvas#event:exported} data
   * @listens module:svgcanvas.SvgCanvas#event:exported
   * @returns {void}
   */

  /** @function module:SVGthis.randomizeIds */
  randomizeIds (arg: boolean): void {
    this.svgCanvas.randomizeIds(arg)
  }

  /**
   *  @lends module:SVGEditor~Actions */
  /** editor shortcuts init */
  setAll (): void {
    const { $req } = this // container-scoped lookup (see EditorStartup constructor)

    // All keyboard-shortcut dispatch (editor-level and component buttons) is
    // owned by the central HotkeyManager. register() installs a single document
    // keydown listener and removes any previously-registered one, so re-init
    // does not stack listeners.
    this.hotkeys.register()

    // Misc additional actions

    // Make 'return' keypress trigger the change event
    const elements = this.$container.getElementsByClassName('attr_changer') // scoped to this editor
    Array.from(elements).forEach(function (element) {
      element.addEventListener('keydown', function (evt) {
        evt.currentTarget?.dispatchEvent(new Event('change'))
        evt.preventDefault()
      })
    })
    $req('image_url').addEventListener('keydown', function (evt) {
      evt.currentTarget?.dispatchEvent(new Event('change'))
      evt.preventDefault()
    })
  }

  /**
   * Tear down document-level listeners this editor registered, so a closed
   * editor never reacts to shortcuts/paste (operating on a torn-down canvas) and
   * isn't left as the "active" editor. Call before discarding the instance.
   */
  destroy (): void {
    if (this.hotkeys) this.hotkeys.unregister()
    if (this.pasteHandler) document.removeEventListener('paste', this.pasteHandler)
    // Remove all document/window listeners wired through the abort signal
    // (modeChange, key handling, resize, …). Without this they leak onto
    // document/window per editor instance and keep firing on a dead editor.
    this.listenerAbort?.abort()
    this._debugSnapshotLogger?.stop()
    this.svgCanvas?.destroy()
    clearActiveEditor(this)
  }

  /**
   * Route two complementary debug-log channels to a single host-provided
   * sink instead of rendering either in a UI panel. Off by default. A host
   * (e.g. the Obsidian plugin's "Debug logging" setting) passes a sink
   * function to receive `(event, detail)` calls, mirroring the shape of its
   * own action log (`plugin.debugLog.log(event, detail)`); pass `null`/omit
   * to stop both channels.
   * 1. The dev-mode "visibility" snapshot (`svgCanvas.getDebugSnapshot()`),
   *    polled and diffed by DebugSnapshotLogger — selection boxes, path-node
   *    grips, or group-context dimming that are still rendered but no longer
   *    backed by the model (state with a history of desyncing silently).
   * 2. Actions and discrete debug events (see DebugActionStream.js and
   *    `.claude/debug-log.md`): every command run, key, pointer press/release, tool
   *    gesture, selection and history change, plus the following, fired at the
   *    moment they happen — node selection, a path-edit commit, an
   *    open/close-subpath mutation, an undo/redo. The snapshot above only
   *    ever sees the *result* of a gesture; this is the gesture itself, and
   *    is what actually lets a hard-to-reproduce path-node bug be
   *    reconstructed from the log instead of guessed at.
   */
  setDebugLogger (sink?: ((event: string, detail?: Record<string, unknown>) => void) | null): void {
    if (!this._debugSnapshotLogger) {
      this._debugSnapshotLogger = new DebugSnapshotLogger(() => this.svgCanvas.getDebugSnapshot())
    }
    this._stopDebugActions?.()
    this._stopDebugActions = null
    if (typeof sink !== 'function') {
      this._debugSnapshotLogger.start(null)
      return
    }
    // One sequenced sink for all three channels (actions + gestures, state snapshots).
    const { emit, stop } = attachDebugActionStream(this, sink as (event: string, detail?: object) => void)
    this._stopDebugActions = stop
    this._debugSnapshotLogger.start(emit)
  }

  /**
   * Forward svgedit's warnings/errors (the central logger, which also prints
   * to the console) to a host-provided sink, e.g. a plugin's debug log. Shared
   * by every editor on the page. Pass `null` to stop.
 * @param sink - `(level, { message, data })`
 * @param level - A `LogLevel` value; defaults to leaving the level unchanged
   */
  setLogSink (sink: (arg0: string, arg1: { message: string, data: unknown }) => void | null, level?: import('@svgedit/svgcanvas/common/logger.ts').LogLevelValue): void {
    setLogSink(sink)
    if (level !== undefined) setLogLevel(level)
  }

  /** @listens module:svgcanvas.SvgCanvas#event:exported */
  exportHandler (win: Window, data: any): void {
    const { issues, exportWindowName } = data
    this.exportWindow = window.open('', exportWindowName) // A hack to get the window via JSON-able name without opening a new one
    if (!this.exportWindow || this.exportWindow.closed) {
      seAlert(this.i18next.t('notification.popupWindowBlocked'))
      return
    }

    this.exportWindow.location.href = data.bloburl || data.datauri
    const done = this.configObj.pref('export_notice_done')
    if (done !== 'all') {
      let note = this.i18next.t('notification.saveFromBrowser', {
        type: data.type
      })

      // Check if there are issues
      if (issues.length) {
        const pre = '\n \u2022 '
        note +=
          '\n\n' +
          this.i18next.t('notification.noteTheseIssues') +
          pre +
          issues.join(pre)
      }
      // Note that this will also prevent the notice even though new issues may appear later.
      // May want to find a way to deal with that without annoying the user
      this.configObj.pref('export_notice_done', 'all')
      seAlert(note)
    }
  }

  /** Rebuild a gradient element from the serialized XML stored in prefs. */
  gradientElemFromXml (xml: string): Element | undefined {
    if (!xml) { return undefined }
    try {
      return new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement
    } catch (_) {
      return undefined
    }
  }

  /**
 * @param recordUndo - When true, push the change onto the undo stack
so it can be reverted with the Undo button. Programmatic callers (init,
host restore) leave this false to avoid polluting history.
   */
  setBackground (color: string, url?: string, gradientElem?: Element, recordUndo: boolean = false): void {
    // Capture the previous background state before mutating prefs so the undo
    // command can restore it.
    const prev = {
      color: this.configObj.pref('bkgd_color'),
      url: this.configObj.pref('bkgd_url') || '',
      gradient: this.configObj.pref('bkgd_gradient') || ''
    }

    this.applyBackgroundState(color, url, gradientElem)

    if (!recordUndo) { return }

    const next = {
      color,
      url: url || '',
      gradient: gradientElem ? new XMLSerializer().serializeToString(gradientElem) : ''
    }
    // Nothing actually changed → don't record a no-op undo step.
    if (prev.color === next.color && prev.url === next.url && prev.gradient === next.gradient) {
      return
    }

    const editor = this
    const cmd = Object.assign(new Command(), { text: 'Change canvas background' })
    cmd.type = () => 'ChangeBackgroundCommand'
    cmd.elements = () => []
    cmd.apply = (handler) => {
      Command.prototype.apply.call(cmd, handler, () => {
        editor.applyBackgroundState(next.color, next.url, editor.gradientElemFromXml(next.gradient))
      })
    }
    cmd.unapply = (handler) => {
      Command.prototype.unapply.call(cmd, handler, () => {
        editor.applyBackgroundState(prev.color, prev.url, editor.gradientElemFromXml(prev.gradient))
      })
    }
    this.svgCanvas.undoMgr.addCommandToHistory(((cmd as unknown) as import('@svgedit/svgcanvas').HistoryCommand))
  }

  /**
   * Apply a background state to the canvas, prefs, and bottom-panel swatch.
   * Does not touch the undo stack.
   */
  applyBackgroundState (color: string, url?: string, gradientElem?: Element): void {
    const { $id } = this // container-scoped lookup (see EditorStartup constructor)
    // if (color == this.configObj.pref('bkgd_color') && url == this.configObj.pref('bkgd_url')) { return; }
    this.configObj.pref('bkgd_color', color)
    this.configObj.pref('bkgd_url', (url as string), true)
    // Persist the gradient XML so it can be restored on next load.
    if (gradientElem) {
      this.configObj.pref('bkgd_gradient', new XMLSerializer().serializeToString(gradientElem))
    } else {
      this.configObj.pref('bkgd_gradient', '')
    }

    // This should be done in  this.svgCanvas.js for the borderRect fill
    this.svgCanvas.setBackground(color, url, gradientElem)

    // Keep the bottom-panel background swatch in sync when the background is set
    // programmatically (e.g. a host restoring a saved per-document background).
    // Otherwise the swatch only reflects the pref read once at BottomPanel.init,
    // so the canvas would show the restored color while the swatch stayed white.
    // Solid colors only; gradients/images/chessboard fall back to the swatch's
    // own default rendering, matching the init path.
    const bgPicker = $id('bg_color')
    if (bgPicker && color && color !== 'gradient' && color !== 'chessboard' && !gradientElem && !url) {
      bgPicker.setPaint(
        new Paint({ alpha: 100, solidColor: color === 'none' ? 'none' : color.replace('#', '') })
      )
    }
  }

  /** @function module:SVGthis.updateCanvas */
  updateCanvas (center?: boolean, newCtr?: { x: number, y: number }): void {
    const { $req } = this // container-scoped lookup (see EditorStartup constructor)
    const zoom = this.svgCanvas.getZoom()
    const { workarea } = this
    const cnvs = $req('svgcanvas')

    let w = parseFloat(
      getComputedStyle(workarea, null).width.replace('px', '')
    )
    let h = parseFloat(
      getComputedStyle(workarea, null).height.replace('px', '')
    )
    const wOrig = w
    const hOrig = h
    const oldCtr = {
      x: workarea.scrollLeft + wOrig / 2,
      y: workarea.scrollTop + hOrig / 2
    }
    const multi = this.configObj.curConfig.canvas_expansion
    w = Math.max(wOrig, this.svgCanvas.contentW * zoom * multi)
    h = Math.max(hOrig, this.svgCanvas.contentH * zoom * multi)

    if (w === wOrig && h === hOrig) {
      workarea.style.overflow = 'hidden'
    } else {
      workarea.style.overflow = 'scroll'
    }

    const oldCanY =
      parseFloat(getComputedStyle(cnvs, null).height.replace('px', '')) / 2
    const oldCanX =
      parseFloat(getComputedStyle(cnvs, null).width.replace('px', '')) / 2

    cnvs.style.width = w + 'px'
    cnvs.style.height = h + 'px'
    const newCanY = h / 2
    const newCanX = w / 2
    const offset = this.svgCanvas.updateCanvas(w, h)

    const ratio = newCanX / oldCanX

    const scrollX = w / 2 - wOrig / 2
    const scrollY = h / 2 - hOrig / 2

    if (!newCtr) {
      const oldDistX = oldCtr.x - oldCanX
      const newX = newCanX + oldDistX * ratio

      const oldDistY = oldCtr.y - oldCanY
      const newY = newCanY + oldDistY * ratio

      newCtr = {
        x: newX,
        y: newY
      }
    } else {
      newCtr.x += offset.x
      newCtr.y += offset.y
    }

    if (center) {
      // Go to top-left for larger documents
      if (
        this.svgCanvas.contentW >
        parseFloat(getComputedStyle(workarea, null).width.replace('px', ''))
      ) {
        // Top-left
        workarea.scrollLeft = offset.x - 10
        workarea.scrollTop = offset.y - 10
      } else {
        // Center
        workarea.scrollLeft = scrollX
        workarea.scrollTop = scrollY
      }
    } else {
      workarea.scrollLeft = newCtr.x - wOrig / 2
      workarea.scrollTop = newCtr.y - hOrig / 2
    }
    if (this.configObj.curConfig.showRulers) {
      this.rulers.updateRulers(cnvs, zoom)
      workarea.scroll()
    }

    // Refresh the grid: the non-square line grids are drawn over the canvas
    // extent, so a resolution change must re-render them (set by ext-grid).
    this.updateGrid?.()

    // Proportion markers are anchored to the canvas width/height, so a
    // resolution change must reposition them (set by ext-proportion-markers).
    this.updateProportionMarkers?.()
  }

  updateWireFrame (): void {
    const rule = `
      #workarea.wireframe #svgcontent * {
        stroke-width: ${1 / this.svgCanvas.getZoom()}px;
      }
    `
    const wfRules = this.$qq('#wireframe_rules') // container-scoped (see EditorStartup constructor)
    if (wfRules) {
      wfRules.textContent =
        this.workarea.classList.contains('wireframe') ? rule : ''
    }
  }

  // called when we've selected a different element
  /**
 * @param elems Array of elements that were selected@listens module:svgcanvas.SvgCanvas#event:selected
   * @fires module:svgcanvas.SvgCanvas#event:ext_selectedChanged
   */
  selectedChanged (win: Window, elems: any): void {
    const mode = this.svgCanvas.getMode()
    const isNode = mode === 'pathedit'
    // if this.elems[1] is present, then we have more than one element
    this.selectedElement = elems.length === 1 || !elems[1] ? elems[0] : null
    this.multiselected = elems.length >= 2 && !!elems[1]

    // Each step is isolated: a throw in one (e.g. a stale DOM id after a
    // panel refactor) is logged and skipped instead of aborting every step
    // after it, which would leave the rest of the UI silently un-updated.
    runSteps([
      ['leftPanel.clickSelect', () => {
        if (mode === 'select') this.leftPanel.clickSelect()
      }],
      ['topPanel.update', () => {
        if (this.selectedElement && !isNode) this.topPanel.update()
      }],
      // Nothing selected anymore: release any panel field still holding
      // focus, so a field can't outlive its element's selection (and keep
      // swallowing keys).
      ['blurActiveField', () => {
        if (!this.selectedElement && !this.multiselected) blurActiveField()
      }],
      // Deal with pathedit mode
      ['topPanel.togglePathEditMode', () => this.topPanel.togglePathEditMode(isNode, elems)],
      ['topPanel.updateContextPanel', () => this.topPanel.updateContextPanel()],
      // Switch the right-panel tab to match the selection (text → Text, else
      // Design). Done here, on selection change only — not in
      // updateContextPanel, which also runs on attribute edits and would
      // yank the user off Design mid-edit (e.g. when changing a text
      // object's stroke width).
      ['rightPanel.autoSelectTab', () => this.rightPanel.autoSelectTab(this.selectedElement, this.multiselected)],
      ['rightPanel.updateObjectList', () => this.rightPanel.updateObjectList(this.selectedElement)],
      ['rightPanel.layerTree', () => this.rightPanel.layerTree.schedule()],
      // Some tools (e.g. curvature/path, text) commit a new element by
      // firing only 'selected', not 'changed', so refresh the empty-canvas
      // watermark here too — otherwise it lingers after drawing with those
      // tools.
      ['updateCanvasWatermark', () => this.updateCanvasWatermark()],
      ['runExtensions:selectedChanged', () => this.svgCanvas.runExtensions(
        'selectedChanged',
        /** @type {module:svgcanvas.SvgCanvas#event:ext_selectedChanged} */ {
          elems,
          selectedElement: this.selectedElement,
          multiselected: this.multiselected
        }
      )]
    ])
  }

  // Call when part of element is in process of changing, generally
  // on mousemove actions like rotate, move, etc.
  /**
   * @listens module:svgcanvas.SvgCanvas#event:transition
   * @fires module:svgcanvas.SvgCanvas#event:ext_elementTransition
   */
  elementTransition (win: Window, elems: any): void {
    const { $req } = this // container-scoped lookup (see EditorStartup constructor)
    const mode = this.svgCanvas.getMode()
    const elem = elems[0]

    if (!elem) {
      return
    }

    this.multiselected = elems.length >= 2 && !!elems[1]

    // Each step is isolated: a throw in one must not abort the others (see
    // selectedChanged() above for why) — this fires on every mousemove
    // during a drag, so a broken live-field update shouldn't also stop
    // extensions from hearing about the drag.
    runSteps([
      // Only updating fields for single elements for now
      ['liveFieldUpdate', () => {
        if (this.multiselected) return
        switch (mode) {
          case 'rotate': {
            const ang = this.svgCanvas.getRotationAngle(elem)
            $req('angle').value = ang
            break
          }
          case 'select': {
            const delta = this.svgCanvas.dragLiveMoveDelta
            if (delta) {
              this.topPanel.updateLiveMove(elem, delta.dx, delta.dy)
            }
            break
          }
          case 'resize': {
            const box = this.svgCanvas.dragLiveResizeBox
            if (box) {
              this.topPanel.updateLiveResize(elem, box)
            }
            break
          }
        }
      }],
      ['runExtensions:elementTransition', () => this.svgCanvas.runExtensions(
        'elementTransition',
        /** @type {module:svgcanvas.SvgCanvas#event:ext_elementTransition} */ {
          elems
        }
      )]
    ])
  }

  // called when any element has changed
  /**
   * @listens module:svgcanvas.SvgCanvas#event:changed
   * @fires module:svgcanvas.SvgCanvas#event:ext_elementChanged
   */
  elementChanged (win: Window, elems: Element[]): void {
    const mode = this.svgCanvas.getMode()

    // Each step is isolated: a throw in one must not abort the others (see
    // selectedChanged() above for why).
    runSteps([
      ['leftPanel.clickSelect', () => {
        if (mode === 'select') this.leftPanel.clickSelect()
      }],
      ['perElementUpdates', () => {
        elems.forEach((elem) => {
          const isSvgElem = elem?.tagName === 'svg'
          if (isSvgElem || this.svgCanvas.isLayer((elem as Element))) {
            this.rightPanel.populateLayers()
            // if the element changed was the svg, then it could be a resolution change
            if (isSvgElem) {
              this.updateCanvas()
            }
            // Update selectedElement if element is no longer part of the image.
            // This occurs for the text elements in Firefox. Skip while multiple
            // elements are selected — selectedElement is legitimately null then,
            // and promoting one of the changed elements (e.g. after a multi-align)
            // would make updateContextPanel hide the multiselected_panel.
          } else if (elem && !this.multiselected && !this.selectedElement?.parentNode) {
            this.selectedElement = elem
          }
        })
      }],
      ['rightPanel.layerTree', () => this.rightPanel.layerTree.schedule()],
      ['showSaveWarning', () => { this.showSaveWarning = true }],
      // we update the contextual panel with potentially new
      // positional/sizing information (we DON'T want to update the
      // toolbar here as that creates an infinite loop)
      // also this updates the history buttons
      ['topPanel.updateContextPanel', () => this.topPanel.updateContextPanel()],
      // In the event a gradient was flipped:
      ['bottomPanel.updateColorpickers', () => {
        if (this.selectedElement && mode === 'select') this.bottomPanel.updateColorpickers()
      }],
      ['updateCanvasWatermark', () => this.updateCanvasWatermark()],
      ['runExtensions:elementChanged', () => this.svgCanvas.runExtensions(
        'elementChanged',
        /** @type {module:svgcanvas.SvgCanvas#event:ext_elementChanged} */ {
          elems
        }
      )]
    ])
  }

  /**
   * A brand-new element (rect/ellipse/line/text/path/image/... or an
   * extension-drawn shape) was just committed via the canvas's mouseUp
   * insertion path — see `event.js`'s `elementInserted` emission, right
   * before its `InsertElementCommand` is created. Stamp that object type's
   * configured default class (see `classLibrary.js#getDefaultClassForTag`),
   * if one is set. Not undo-tracked on its own: the element isn't in history
   * yet, so the insert command captures it already classed, and undoing the
   * insertion removes it whole.
   */
  elementInserted (win: Window, elems: Element[]): void {
    const elem = elems?.[0]
    // A frame is a plain data-frame rect, not a user-facing "rect" object —
    // it always keeps its own fixed dashed-outline style (see
    // event-shape-draw.js's 'frame' case), so it's excluded from defaults.
    if (!elem || elem.hasAttribute('data-frame')) return
    const name = getDefaultClassForTag(elem.tagName.toLowerCase())
    if (!name) return
    const preset = getClass(name)
    if (!preset) return
    applyDefaultClassAttrs(elem, preset)
  }

  /**
   * Show the faint brand watermark on the canvas only while the drawing has no
   * objects yet (e.g. a freshly opened document). Lazily sets the background
   * image on first call, then toggles visibility on every content change.
   */
  updateCanvasWatermark (): void {
    const el = this.$id('canvas_watermark')
    if (!el) return
    if (!el.style.backgroundImage) {
      const uri = getIconDataUri('logo.svg')
      if (uri) el.style.backgroundImage = `url("${uri}")`
    }
    const isEmpty = this.svgCanvas.getVisibleElements().length === 0
    el.classList.toggle('visible', isEmpty)
  }

  afterClear (win: Window): void {
    this.updateCanvasWatermark()
    this.svgCanvas.runExtensions('afterClear')
  }

  zoomDone (): void {
    for (const el of this.svgCanvas.getSelectedElements()) {
      this.svgCanvas.selectorManager.requestSelector(el).resize()
    }
    this.updateWireFrame()
  }

  /** @see module:svgcanvas.SvgCanvas#event:zoomed */

  /**
   * @function module:svgcanvas.SvgCanvas#zoomChanged
 * @param bbox a box, or what to fit@listens module:svgcanvas.SvgCanvas#event:zoomed
   * @fires module:svgcanvas.SvgCanvas#event:ext_zoomChanged
   */
  zoomChanged (win: Window, bbox: BBoxObjectWithFactor | 'canvas' | 'selection' | 'layer' | 'content', autoCenter?: boolean): void {
    const { $req } = this // container-scoped lookup (see EditorStartup constructor)
    const scrbar = 15
    const zInfo = this.svgCanvas.setBBoxZoom(
      bbox,
      parseFloat(
        getComputedStyle(this.workarea, null).width.replace('px', '')
      ) - scrbar,
      parseFloat(
        getComputedStyle(this.workarea, null).height.replace('px', '')
      ) - scrbar
    )
    if (!zInfo) {
      return
    }
    const zoomlevel = zInfo.zoom
    const bb = zInfo.bbox

    if (zoomlevel < 0.001) {
      this.bottomPanel.changeZoom(0.1)
      return
    }

    // Each step is isolated: a throw in one must not abort the others (see
    // selectedChanged() above for why).
    runSteps([
      ['zoomInput', () => {
        $req('zoom').value = (this.svgCanvas.getZoom() * 100).toFixed(1)
      }],
      ['updateCanvas', () => {
        if (autoCenter) {
          this.updateCanvas()
        } else {
          this.updateCanvas(false, {
            x: bb.x * zoomlevel + (bb.width * zoomlevel) / 2,
            y: bb.y * zoomlevel + (bb.height * zoomlevel) / 2
          })
        }
      }],
      // Go to select if a zoom box was drawn
      ['leftPanel.clickSelect', () => {
        if (this.svgCanvas.getMode() === 'zoom' && bb.width) this.leftPanel.clickSelect()
      }],
      ['zoomDone', () => this.zoomDone()],
      ['runExtensions:zoomChanged', () => this.svgCanvas.runExtensions(
        'zoomChanged',
        /** @type {module:svgcanvas.SvgCanvas#event:ext_zoomChanged} */ this.svgCanvas.getZoom()
      )]
    ])
  }

  /** @listens module:svgcanvas.SvgCanvas#event:contextset */
  contextChanged (win: Window, context: any): void {
    const { $req } = this // container-scoped lookup (see EditorStartup constructor)
    let linkStr = ''
    if (context) {
      let str = ''
      linkStr =
        '<a href="#" data-root="y">' +
        this.svgCanvas.getCurrentDrawing().getCurrentLayerName() +
        '</a>'
      const parentsUntil = getParentsUntil(context, '#svgcontent') ?? []
      parentsUntil.forEach(function (parent) {
        if (parent.id) {
          str += ' > ' + parent.id
          linkStr +=
            parent !== context
              ? ` > <a href="#">${parent.id}</a>`
              : ` > ${parent.id}`
        }
      })

      this.curContext = str
    } else {
      this.curContext = null
    }
    // The layer > group breadcrumb is not useful in this fork — keep it hidden.
    $req('cur_context_panel').style.display = 'none'
    $req('cur_context_panel').innerHTML = linkStr
  }

  /**
   * @listens module:svgcanvas.SvgCanvas#event:extension_added
 * @returns Resolves to `undefined`
   */
  async extAdded (win: Window, ext: any): Promise<void> {
    if (!ext) {
      return undefined
    }
    let cbCalled = false

    const runCallback = (): void => {
      if (ext.callback && !cbCalled) {
        cbCalled = true
        ext.callback.call(this)
      }
    }

    if (ext.events) {
      this.leftPanel.add(ext.events.id, ext.events.click)
    }
    return runCallback()
  }

  zoomImage (multiplier?: number): void {
    const { $req } = this // container-scoped lookup (see EditorStartup constructor)
    const resolution = this.svgCanvas.getResolution()
    multiplier = multiplier ? (resolution.zoom ?? this.svgCanvas.getZoom()) * multiplier : 1
    // setResolution(res.w * multiplier, res.h * multiplier, true);
    $req('zoom').value = (multiplier * 100).toFixed(1)
    this.svgCanvas.setCurrentZoom(multiplier)
    this.zoomDone()
    this.updateCanvas(true)
  }

  cutSelected (): void {
    if (this.selectedElement || this.multiselected) {
      this.svgCanvas.cutSelectedElements()
    }
  }

  /** @function copySelected */
  copySelected (): void {
    if (this.selectedElement || this.multiselected) {
      this.svgCanvas.copySelectedElements()
    }
  }

  /**
 * @param data Already-parsed clipboard
contents to paste, bypassing the sessionStorage snapshot (see
`pasteElements`'s `data` param).
   */
  pasteInCenter (data?: unknown[]): void {
    const { workarea } = this
    const zoom = this.svgCanvas.getZoom()
    const x =
      (workarea.scrollLeft +
        parseFloat(getComputedStyle(workarea, null).width.replace('px', '')) /
          2) /
        zoom -
      this.svgCanvas.contentW
    const y =
      (workarea.scrollTop +
        parseFloat(getComputedStyle(workarea, null).height.replace('px', '')) /
          2) /
        zoom -
      this.svgCanvas.contentH
    this.svgCanvas.pasteElements('point', x, y, data)
  }

  moveUpDownSelected (dir: 'Up' | 'Down'): void {
    if (this.selectedElement || this.multiselected) {
      this.svgCanvas.moveUpDownSelected(dir)
    }
  }

  moveSelected (dx: number, dy: number): void {
    if (this.selectedElement || this.multiselected) {
      if (this.configObj.curConfig.gridSnapping) {
        // Use grid snap value regardless of zoom level
        const multi =
          this.svgCanvas.getZoom() * this.configObj.curConfig.snappingStep
        dx *= multi
        dy *= multi
      }
      this.svgCanvas.moveSelectedElements(dx, dy)
    }
  }

  selectNext (): void {
    this.svgCanvas.cycleElement(true)
  }

  selectPrev (): void {
    this.svgCanvas.cycleElement(false)
  }

  rotateSelected (cw: 0 | 1, step: number): void {
    const { $req } = this // container-scoped lookup (see EditorStartup constructor)
    if (!this.selectedElement || this.multiselected) {
      return
    }
    if (!cw) {
      step *= -1
    }
    const angle = Number.parseFloat($req('angle').value) + step
    this.svgCanvas.setRotationAngle(angle)
    this.topPanel.updateContextPanel()
  }

  hideSourceEditor (): void {
    const { $req } = this // container-scoped lookup (see EditorStartup constructor)
    const $editorDialog = $req('se-svg-editor-dialog')
    $editorDialog.setAttribute('dialog', 'closed')
  }

  /** @param e the source dialog's `change` event */
  async saveSourceEditor (e: CustomEvent): Promise<void> {
    const { $req } = this // container-scoped lookup (see EditorStartup constructor)
    const $editorDialog = $req('se-svg-editor-dialog')
    if ($editorDialog.getAttribute('dialog') !== 'open') return
    const saveChanges = () => {
      this.svgCanvas.clearSelection()
      this.hideSourceEditor()
      this.zoomImage()
      this.rightPanel.populateLayers()
    }

    if (!this.svgCanvas.setSvgString(e.detail.value)) {
      const ok = await seConfirm(
        this.i18next.t('notification.QerrorsRevertToSource')
      )
      if (ok === 'Cancel') {
        return
      }
      saveChanges()
      return
    }
    saveChanges()
    this.leftPanel.clickSelect()
  }

  /** @param e the source dialog's `change` event */
  async cancelOverlays (e: CustomEvent): Promise<void> {
    const { $req } = this // container-scoped lookup (see EditorStartup constructor)
    const $editorDialog = $req('se-svg-editor-dialog')
    const editingsource = $editorDialog.getAttribute('dialog') === 'open'
    if (!editingsource && !this.docprops && !this.configObj.preferences) {
      if (this.curContext) {
        this.svgCanvas.leaveContext()
      }
      return
    }

    if (editingsource) {
      const origSource = this.svgCanvas.getSvgString()
      if (origSource !== e.detail.value) {
        const ok = await seConfirm(
          this.i18next.t('notification.QignoreSourceChanges')
        )
        if (ok && ok !== 'Cancel') {
          this.hideSourceEditor()
        }
      } else {
        this.hideSourceEditor()
      }
    }
  }

  /** @param e the source dialog's `change` event */
  toggleDynamicOutput (e: CustomEvent): void {
    this.configObj.curConfig.dynamicOutput = e.detail.dynamic
    this.svgCanvas.setConfig(this.configObj.curConfig)
    const $editorDialog = this.$req('se-svg-editor-dialog') // container-scoped (see EditorStartup constructor)
    const origSource = this.svgCanvas.getSvgString()
    $editorDialog.setAttribute('dialog', 'open')
    $editorDialog.setAttribute('value', origSource)
  }

  enableOrDisableClipboard (): void {
    let svgeditClipboard
    try {
      // sessionStorage is shared directly with other same-window editor
      // instances (no propagation needed); localStorage is the flash-write
      // used for the cross-tab `storage` event case.
      svgeditClipboard = sessionStorage.getItem('svgedit_clipboard') || localStorage.getItem('svgedit_clipboard')
    } catch (err) {
      /* empty fn */
    }
    this.canvMenu.setAttribute(
      (svgeditClipboard ? 'en' : 'dis') + 'ablemenuitems',
      '#paste,#paste_in_place'
    )
    // Paste follows the clipboard: refresh every `command=` control (paste commands are gated on it).
    this.commands?.refreshEnablement()
  }

  /**
   * @function module:SVGthis.openPrep
 * @returns `true` when there is nothing to lose, else the choice the user made in the
confirm dialog (`'Cancel'` to stop; anything else to go on).
   */
  async openPrep (): Promise<true | string | undefined> {
    if (this.svgCanvas.undoMgr.getUndoStackSize() === 0) {
      return true
    }
    return await seConfirm(this.i18next.t('notification.QwantToOpen'))
  }

  onDragEnter (e: Event): void {
    e.stopPropagation()
    e.preventDefault()
    // and indicator should be displayed here, such as "drop files here"
  }

  onDragOver (e: Event): void {
    e.stopPropagation()
    e.preventDefault()
  }

  onDragLeave (e: Event): void {
    e.stopPropagation()
    e.preventDefault()
    // hypothetical indicator should be removed here
  }

  /**
   * Queues a callback to be invoked when the editor is ready (or
   *   to be invoked immediately if it is already ready--i.e.,
   *   if `runCallbacks` has been run).
   * @function module:SVGthis.ready
 * @param cb Callback to be queued to invoke
 * @returns Resolves when all callbacks, including the supplied have resolved
   */
  ready (cb: ReadyCallback): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.isReady) {
        resolve(cb())
        return
      }
      this.callbacks.push([cb, resolve, reject])
    })
  }

  /**
   * Invokes the callbacks previous set by `svgthis.ready`
   * @function module:SVGthis.runCallbacks
 * @returns Resolves once every queued callback has run, rejects if one failed
   */
  async runCallbacks (): Promise<void> {
    try {
      await Promise.all(
        this.callbacks.map(([cb]) => {
          return cb()
        })
      )
    } catch (err) {
      this.callbacks.forEach(([, , reject]) => {
        reject()
      })
      throw err
    }
    this.callbacks.forEach(([, resolve]) => {
      resolve()
    })
    this.isReady = true
  }

  /**
   * @function module:SVGthis.loadFromString
 * @param str The SVG string to load
 * @param opts `noAlert`: avoid the alert to the user and get a rejected promise instead
   */
  loadFromString (str: string, { noAlert }: { noAlert?: boolean } = {}): Promise<void> {
    return this.ready(async () => {
      try {
        await this.loadSvgString(str, { noAlert })
      } catch (err) {
        if (noAlert) {
          throw err
        }
      }
    })
  }

  /**
   * @function module:SVGthis.loadFromURL
 * @param url URL from which to load an SVG string via Ajax
 * @returns Resolves once the extension is added or rejects upon bad loading of
the SVG (or upon failure to parse the loaded string) when `noAlert` is
enabled
   */
  loadFromURL (url: string, { cache, noAlert }: { cache?: boolean, noAlert?: boolean } = {}): Promise<unknown> {
    return this.ready(() => {
      return new Promise((((resolve, reject) => {
        fetch(url, { cache: cache ? 'force-cache' : 'no-cache' })
          .then((response) => {
            if (!response.ok) {
              if (noAlert) {
                reject(new Error('URLLoadFail'))
                return
              }
              seAlert(this.i18next.t('notification.URLLoadFail'))
              resolve()
              return null // nothing to load: the error page is not an SVG
            }
            return response.text()
          })
          .then((str) => {
            if (str === null) return
            this.loadSvgString((str as string), { noAlert })
            resolve(str)
          })
          .catch((error) => {
            if (noAlert) {
              reject(new Error('URLLoadFail'))
              return
            }
            seAlert(
              this.i18next.t('notification.URLLoadFail') + ': \n' + error
            )
            resolve()
          })
      }) as (resolve: (value?: unknown) => void, reject: (reason?: unknown) => void) => void))
    })
  }

  /**
   * @function module:SVGthis.loadFromDataURI
 * @param str The Data URI to base64-decode (if relevant) and load
 * @returns Resolves once the extension is added and rejects if loading SVG string fails and `noAlert` is enabled
   */
  loadFromDataURI (str: string, { noAlert }: { noAlert?: boolean } = {}): Promise<unknown> {
    return this.ready(() => {
      let base64 = false
      let pre = str.match(/^data:image\/svg\+xml;base64,/)
      if (pre) {
        base64 = true
      } else {
        pre = str.match(/^data:image\/svg\+xml(?:;|;utf8)?,/)
      }
      if (!pre) throw new Error('Not an SVG data URI')
      const src = str.slice(pre[0].length)
      return this.loadSvgString(
        base64 ? decode64(src) : decodeURIComponent(src),
        { noAlert }
      )
    })
  }

  /**
   * @function module:SVGthis.addExtension
 * @param name Used internally; no need for i18n.
 * @param initfn Config to be invoked on this module@throws {Error} If called too early
 * @returns Resolves once the extension is added
   */
  addExtension (name: string, initfn: any, initArgs: any): Promise<unknown> {
    // Note that we don't want this on this.ready since some extensions
    // may want to run before then (like server_opensave).
    if (!this.svgCanvas) {
      throw new Error('Extension added too early')
    }
    return this.svgCanvas.addExtension(name, initfn, initArgs)
  }

  /**
   * Re-read user data (custom palette + saved shape library) from the host
   * storage adapter — or the localStorage fallback — and re-render the
   * corresponding components for THIS editor instance only.
   * Intended for hosts that back the palette and shape library with a shared
   * store across multiple open editor instances: after one instance writes,
   * the host calls `reloadUserData()` on every OTHER open instance so they
   * drop their stale in-memory copy and re-render. Resolves both components
   * through this instance's own DOM root (`this.$svgEditor`), never a
   * document-wide query, so it can't refresh a sibling instance. Safely
   * no-ops when a component isn't mounted.
   * @function module:SVGEditor.reloadUserData
   */
  reloadUserData (): void {
    const root = this.$svgEditor
    if (!root) return
    // Palette: re-read overrides and re-render swatches via the component's
    // own public hook (no reaching into its private fields).
    root.querySelector('se-palette')?.reload?.()
    // Shape library: trigger the existing reload path. querySelectorAll covers
    // both the desktop (#tool_shapelib) and tablet-shell instances.
    root.querySelectorAll('se-shape-library').forEach((lib) => {
      lib.dispatchEvent(new CustomEvent('user-shapes-updated'))
    })
  }
}

export default Editor
