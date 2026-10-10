import {
  putLocale
} from './locale.js'
import { createContextMenu } from './contextmenu.js'
import { addSelectedToShapeLibrary } from './addToShapeLibrary.js'
import { setUserDataAdapter } from './userDataAdapter.js'
import editorTemplate from './templates/editorTemplate.html'
import SvgCanvas from '@svgedit/svgcanvas'
import Rulers from './Rulers.js'
import { applyTheme } from './themeUtil.js'
import { applyUiMode } from './uiMode.js'
import { getIconDataUri } from './images/iconRegistry.js'
import { getExtension } from './extensions/extensionRegistry.js'
import { setActiveEditor, isActiveEditor, ownsKeyEvent, registerEditorRoot } from './domScope.js'
import { createPasteFallbackArmer } from './pasteFallbackArmer.js'
import { classifyClipboardText } from './pasteClipboardText.js'
import { NEW_LAYER_OPTION_VALUE } from './panels/RightPanel.js'
// svgedit.css `@import`s tablet.css, so this single inline import carries both.
import svgeditCss from './svgedit.css?inline'
import { error as logError, warn as logWarn } from '@svgedit/svgcanvas/common/logger.js'

/**
   * @fires module:svgcanvas.SvgCanvas#event:svgEditorReady
   * @returns {void}
   */
const readySignal = () => {
  // let the opener know SVG Edit is ready (now that config is set up)
  const w = window.opener || window.parent
  if (w) {
    try {
      /**
         * Triggered on a containing `document` (of `window.opener`
         * or `window.parent`) when the editor is loaded.
         * @event module:SVGEditor#event:svgEditorReadyEvent
         * @type {Event}
         * @property {true} bubbles
         * @property {true} cancelable
         */
      /**
         * @name module:SVGthis.svgEditorReadyEvent
         * @type {module:SVGEditor#event:svgEditorReadyEvent}
         */
      const svgEditorReadyEvent = new w.CustomEvent('svgEditorReady', {
        bubbles: true,
        cancelable: true
      })
      w.document.documentElement.dispatchEvent(svgEditorReadyEvent)
    } catch (e) {
      logWarn('svgedit: failed to dispatch svgEditorReady on opener/parent (likely cross-origin)', e, 'EditorStartup')
    }
  }
}

/**
 * Inject the editor stylesheet (inlined into the bundle) into the document head
 * once. Replaces the former `<link href="svgedit.css">` so the editor needs no
 * runtime CSS file. Idempotent.
 * @returns {void}
 */
const injectSvgeditStyles = () => {
  if (document.querySelector('style[data-svgedit-css]')) return
  const styleEl = document.createElement('style')
  styleEl.setAttribute('data-svgedit-css', '')
  styleEl.textContent = svgeditCss
  document.head.append(styleEl)
}

const { $click, scopedId, scopedQa, scopedQq } = SvgCanvas

/**
 *
 */
class EditorStartup {
  /**
   *
   */
  constructor (div) {
    this.extensionsAdded = false
    this.messageQueue = []
    // Document/window-level listeners this editor registers (modeChange, key
    // handling, resize, …) are all wired through this controller's signal so
    // destroy() can tear them down in one shot. Without it, every torn-down
    // editor (each drawing open / markdown↔drawing toggle / file switch in a
    // tab) leaks its listeners onto document/window, and they keep firing on a
    // dead instance — e.g. modeListener hitting `this.workarea.style` after the
    // workarea is gone. See Editor.destroy().
    this.listenerAbort = new AbortController()
    this.$container = div ?? document.getElementById('svg_editor')
    // Mark this container so web components / dialogs nested under it can resolve
    // their owning editor via closestRoot() (see domScope.js).
    this.$container.setAttribute('data-svgedit-root', '')
    registerEditorRoot(this.$container, this)
    // Make the container itself focusable (script-only, not tab-reachable) so
    // `activate()` below can move real DOM focus into it. Canvas clicks (e.g.
    // on an SVG shape) don't focus anything on their own, so without this,
    // `document.activeElement` would stay wherever it was — leaving
    // isActiveEditor()'s live-focus check (domScope.js) with nothing to go on
    // for the most common interaction. Respect a tabindex the host already set.
    if (!this.$container.hasAttribute('tabindex')) this.$container.setAttribute('tabindex', '-1')
    // Become the "active" editor on any interaction, so document-level keyboard
    // shortcut / paste handlers (registered by every mounted editor) only fire
    // for the focused one (see domScope.js, Editor.setKeyHandlers, pasteHandler).
    // Also repoint the `window.svgEditor` global at this instance: it is set once
    // per editor in the constructor, so it otherwise points at the *last*
    // constructed editor, not the focused one. The ~55 components/dialogs that
    // read the global (e.g. se-class-select.applyClass) would then operate on the
    // wrong (or a destroyed) canvas — querying its empty selection and silently
    // no-op'ing — which makes editing the focused drawing feel "locked" whenever
    // a second drawing has ever been opened in the document. Repointing on every
    // interaction keeps the global tracking the drawing the user is actually in.
    const activate = () => {
      setActiveEditor(this)
      window.svgEditor = this
      // Move live focus into this container so isActiveEditor()'s live-focus
      // check (domScope.js) can identify this editor even when the click
      // landed on a non-focusable canvas child (e.g. an SVG shape).
      this.$container.focus?.({ preventScroll: true })
    }
    this.$container.addEventListener('pointerdown', activate, true)
    // Only track — do NOT call container.focus() here. focusin fires *after*
    // a descendant (an input, a dialog control) already has real focus; the
    // live-focus check already resolves that back to this container, so
    // re-focusing the container would immediately steal focus away from the
    // element the user just clicked into, making it impossible to type or
    // double-click-select text in any field.
    this.$container.addEventListener('focusin', () => {
      setActiveEditor(this)
      window.svgEditor = this
    }, true)
    // Exposed so a host that mounts several editors outside a single browser
    // tab (e.g. one editor per pane in a multi-pane app) can mark this editor
    // active on its own pane-focus event, without waiting for a pointerdown/
    // focusin to land inside $container first (switching panes without also
    // clicking the canvas would otherwise leave the previous editor "active",
    // so shortcuts/paste keep targeting the drawing the host just left).
    this.activate = activate
    // Resolve element lookups within this editor's own container so multiple
    // editors mounted in the same document don't collide on the fixed element
    // IDs baked into the template (svgcanvas, workarea, the se-* dialogs, …).
    // Methods read these off `this`; nested callbacks capture them lexically.
    this.$id = scopedId(this.$container)
    this.$qa = scopedQa(this.$container)
    this.$qq = scopedQq(this.$container)
    // Own registry per editor instance (see contextmenu.js) — a shared one
    // would collide across panes on both the id-uniqueness check and the
    // #cmenu_canvas DOM injection.
    this.contextMenu = createContextMenu(this.$id)
  }

  /**
  * Auto-run after a Promise microtask.
  * @function module:SVGthis.init
  * @returns {Promise<void>}
  */
  async init () {
    const { $id } = this // container-scoped lookup (see constructor)
    // Register the optional host storage adapter before any component is
    // constructed (the editor template below instantiates <se-palette> and the
    // shape library, which read user data on creation). Falls back to
    // localStorage when no adapter was configured.
    setUserDataAdapter(this.configObj.curConfig.userDataAdapter)
    injectSvgeditStyles()
    if ('localStorage' in window) {
      this.storage = window.localStorage
    }
    this.configObj.load()
    const { i18next } = await putLocale(this.configObj.pref('lang'), this.goodLangs)
    this.i18next = i18next
    await import('./components/index.js')
    await import('./dialogs/index.js')
    try {
      // add editor components to the DOM
      const template = document.createElement('template')
      template.innerHTML = editorTemplate
      this.$container.append(template.content.cloneNode(true))
      this.$svgEditor = this.$container.querySelector('.svg_editor')
      // Apply saved theme + UI mode before any rendering
      applyTheme(this.configObj.pref('theme') || 'light', this.$svgEditor)
      applyUiMode(this.configObj.pref('tabletMode'), this.$svgEditor)
      // allow to prepare the dom without display
      this.$svgEditor.style.visibility = 'hidden'
      this.workarea = $id('workarea')
      // Image props dialog added to DOM
      const newSeImgPropDialog = document.createElement('se-img-prop-dialog')
      newSeImgPropDialog.setAttribute('id', 'se-img-prop')
      this.$container.append(newSeImgPropDialog)
      newSeImgPropDialog.init(this.i18next)
      // editor prefences dialoag added to DOM
      const newSeEditPrefsDialog = document.createElement('se-edit-prefs-dialog')
      newSeEditPrefsDialog.setAttribute('id', 'se-edit-prefs')
      this.$container.append(newSeEditPrefsDialog)
      newSeEditPrefsDialog.init(this.i18next)
      // canvas menu added to DOM
      const dialogBox = document.createElement('se-cmenu_canvas-dialog')
      dialogBox.setAttribute('id', 'se-cmenu_canvas')
      this.$container.append(dialogBox)
      dialogBox.init(this.i18next)
      // alertDialog added to DOM
      const alertBox = document.createElement('se-alert-dialog')
      alertBox.setAttribute('id', 'se-alert-dialog')
      this.$container.append(alertBox)
      // promptDialog added to DOM
      const promptBox = document.createElement('se-prompt-dialog')
      promptBox.setAttribute('id', 'se-prompt-dialog')
      this.$container.append(promptBox)
      // on-brand text prompt dialog (replaces native window.prompt)
      const textPromptBox = document.createElement('se-text-prompt-dialog')
      textPromptBox.setAttribute('id', 'se-text-prompt-dialog')
      this.$container.append(textPromptBox)
      textPromptBox.init(this.i18next)
      // Export dialog added to DOM
      const exportDialog = document.createElement('se-export-dialog')
      exportDialog.setAttribute('id', 'se-export-dialog')
      this.$container.append(exportDialog)
      exportDialog.init(this.i18next)

      const imageImportDialog = document.createElement('se-image-import-dialog')
      imageImportDialog.setAttribute('id', 'se-image-import-dialog')
      this.$container.append(imageImportDialog)
      imageImportDialog.init(this.i18next)

      // Image-trace ("Convert to editable SVG") options dialog
      const traceDialog = document.createElement('se-trace-dialog')
      traceDialog.setAttribute('id', 'se-trace-dialog')
      this.$container.append(traceDialog)
      traceDialog.init(this.i18next)

      // Hotkey Manager dialog added to DOM
      const hotkeyDialog = document.createElement('se-hotkey-dialog')
      hotkeyDialog.setAttribute('id', 'se-hotkey-dialog')
      this.$container.append(hotkeyDialog)
      hotkeyDialog.init(this.i18next)
      // Favorites manager dialog added to DOM
      const favoritesDialog = document.createElement('se-favorites-dialog')
      favoritesDialog.setAttribute('id', 'se-favorites-dialog')
      this.$container.append(favoritesDialog)
      favoritesDialog.init(this.i18next)
      // Command Search popup added to DOM
      const commandSearchDialog = document.createElement('se-command-search-dialog')
      commandSearchDialog.setAttribute('id', 'se-command-search-dialog')
      this.$container.append(commandSearchDialog)
      commandSearchDialog.init(this.i18next)
    } catch (err) {
      logError('Failed to init command search dialog', err, 'EditorStartup')
    }

    /**
    * @name module:SVGthis.canvas
    * @type {module:svgcanvas.SvgCanvas}
    */
    this.svgCanvas = new SvgCanvas(
      $id('svgcanvas'),
      this.configObj.curConfig,
      this.$container // scope canvas element lookups to this editor's container
    )

    // once svgCanvas is init - adding listener to the changes of the current mode
    this.modeEvent = this.svgCanvas.modeEvent
    document.addEventListener('modeChange', (evt) => this.modeListener(evt), { signal: this.listenerAbort.signal })

    /** if true - selected tool can be cancelled with Esc key
     * disables on dragging (mousedown) to avoid changing mode in the middle of drawing
    */
    this.enableToolCancel = true

    // Each panel is initialized in isolation so one panel's init failure
    // (e.g. a stale DOM id after a template refactor) doesn't abort the
    // remaining panels, the svgCanvas event bindings, and extension loading
    // that all follow later in this method.
    const initPanel = (label, fn) => {
      try {
        fn()
      } catch (err) {
        logError(`Panel failed to init: ${label}; `, err, 'EditorStartup')
      }
    }
    initPanel('leftPanel', () => this.leftPanel.init())
    initPanel('bottomPanel', () => this.bottomPanel.init())
    initPanel('rightPanel', () => this.rightPanel.init())
    initPanel('topPanel', () => this.topPanel.init())
    initPanel('mainMenu', () => this.mainMenu.init())
    initPanel('tabletShell', () => this.tabletShell.init())

    const { undoMgr } = this.svgCanvas
    this.canvMenu = $id('se-cmenu_canvas')
    this.exportWindow = null
    this.defaultImageURL = `${this.configObj.curConfig.imgPath}/logo.svg`
    const zoomInIcon = 'crosshair'
    const zoomOutIcon = 'crosshair'
    // Cursor shown over a movable target in select mode (a selectable element or
    // anywhere inside the current selection's bbox). Hotspot centered (12 12).
    const moveCursorUri = getIconDataUri('move.svg')
    const moveCursor = moveCursorUri ? `url("${moveCursorUri}") 12 12, move` : 'move'
    this.uiContext = 'toolbars'

    // For external openers
    readySignal()

    this.rulers = new Rulers(this)

    this.rightPanel.populateLayers()
    this.selectedElement = null
    this.multiselected = false

    const aLink = $id('cur_context_panel')

    $click(aLink, (evt) => {
      const link = evt.target
      if (link.hasAttribute('data-root')) {
        this.svgCanvas.leaveContext()
      } else {
        this.svgCanvas.setContext(link.textContent)
      }
      this.svgCanvas.clearSelection()
      return false
    })

    // bind the selected event to our function that handles updates to the UI
    this.svgCanvas.bind('selected', this.selectedChanged.bind(this))
    this.svgCanvas.bind('transition', this.elementTransition.bind(this))
    this.svgCanvas.bind('changed', this.elementChanged.bind(this))
    this.svgCanvas.bind('elementInserted', this.elementInserted.bind(this))
    this.svgCanvas.bind('exported', this.exportHandler.bind(this))
    this.svgCanvas.bind('zoomed', this.zoomChanged.bind(this))
    this.svgCanvas.bind('zoomDone', this.zoomDone.bind(this))
    this.svgCanvas.bind(
      'updateCanvas',
      /**
     * @param {external:Window} win
     * @param {PlainObject} centerInfo
     * @param {false} centerInfo.center
     * @param {module:math.XYObject} centerInfo.newCtr
     * @listens module:svgcanvas.SvgCanvas#event:updateCanvas
     * @returns {void}
     */
      function (win, { center, newCtr }) {
        this.updateCanvas(center, newCtr)
      }.bind(this)
    )
    this.svgCanvas.bind('contextset', this.contextChanged.bind(this))
    this.svgCanvas.bind('extension_added', this.extAdded.bind(this))
    this.svgCanvas.bind('elementRenamed', this.elementRenamed.bind(this))

    this.svgCanvas.bind('beforeClear', this.beforeClear.bind(this))
    this.svgCanvas.bind('afterClear', this.afterClear.bind(this))

    this.svgCanvas.textActions.setInputElem($id('text'))

    const bkgdColor = this.configObj.pref('bkgd_color')
    if (bkgdColor === 'gradient') {
      const gradXml = this.configObj.pref('bkgd_gradient')
      let gradElem = null
      if (gradXml) {
        try {
          gradElem = new DOMParser().parseFromString(gradXml, 'image/svg+xml').documentElement
        } catch (_) { /* fall through — gradient lost, background resets to default */ }
      }
      this.setBackground('gradient', '', gradElem || undefined)
    } else {
      this.setBackground(bkgdColor, this.configObj.pref('bkgd_url'))
    }

    // update resolution option with actual resolution
    const res = this.svgCanvas.getResolution()
    if (this.configObj.curConfig.baseUnit !== 'px') {
      res.w = this.svgCanvas.convertUnit(res.w) + this.configObj.curConfig.baseUnit
      res.h = this.svgCanvas.convertUnit(res.h) + this.configObj.curConfig.baseUnit
    }
    $id('se-img-prop').setAttribute('dialog', 'close')
    $id('se-img-prop').setAttribute('title', this.svgCanvas.getDocumentTitle())
    $id('se-img-prop').setAttribute('width', res.w)
    $id('se-img-prop').setAttribute('height', res.h)
    $id('se-img-prop').setAttribute('save', this.configObj.pref('img_save'))

    // Lose focus for select elements when changed (Allows keyboard shortcuts to work better)
    const selElements = this.$qa('select') // container-scoped (see constructor)
    Array.from(selElements).forEach(function (element) {
      element.addEventListener('change', function (evt) {
        evt.currentTarget.blur()
      })
    })

    // fired when user wants to move elements to another layer
    $id('selLayerNames').addEventListener('change', (evt) => {
      const destLayer = evt.detail.value
      if (destLayer === NEW_LAYER_OPTION_VALUE) {
        this.rightPanel.moveSelectedToNewLayer()
        return
      }
      if (destLayer) {
        this.svgCanvas.moveSelectedToLayer(destLayer)
        this.svgCanvas.clearSelection()
        this.rightPanel.populateLayers()
      }
    })
    $id('tool_font_family').addEventListener('change', (evt) => {
      this.svgCanvas.setFontFamily(evt.detail.value)
    })

    $id('seg_type').addEventListener('change', (evt) => {
      this.svgCanvas.setSegType(evt.detail.value)
    })

    const addListenerMulti = (element, eventNames, listener, options = false) => {
      eventNames.split(' ').forEach((eventName) => element.addEventListener(eventName, listener, options))
    }

    addListenerMulti($id('text'), 'keyup input', (evt) => {
      this.svgCanvas.setTextContent(evt.currentTarget.value)
    })

    // Shift+Enter inserts a new row (default textarea behavior); plain Enter
    // commits the text and exits edit mode (no newline inserted).
    $id('text').addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' && !evt.shiftKey) {
        evt.preventDefault()
        this.svgCanvas.textActions.toSelectMode(true)
      }
    })

    $id('link_url').addEventListener('change', (evt) => {
      if (evt.currentTarget.value.length) {
        this.svgCanvas.setLinkURL(evt.currentTarget.value)
      } else {
        this.svgCanvas.removeHyperlink()
      }
    })

    $id('g_title').addEventListener('change', (evt) => {
      this.svgCanvas.setGroupTitle(evt.currentTarget.value)
    })

    // Frame name reuses the <title>-child mechanism (setGroupTitle works on any
    // selected element, with undo). The name labels the frame in the export
    // region picker.
    $id('frame_name').addEventListener('change', (evt) => {
      this.svgCanvas.setGroupTitle(evt.currentTarget.value)
    })

    let lastX = null; let lastY = null
    let panning = false; let keypan = false
    let previousMode = 'select'

    $id('svgcanvas').addEventListener('mouseup', (evt) => {
      if (panning === false) { return true }

      this.workarea.scrollLeft -= (evt.clientX - lastX)
      this.workarea.scrollTop -= (evt.clientY - lastY)

      lastX = evt.clientX
      lastY = evt.clientY

      if (evt.type === 'mouseup') { panning = false }
      return false
    })
    $id('svgcanvas').addEventListener('mousemove', (evt) => {
      if (panning === false) { return true }

      this.workarea.scrollLeft -= (evt.clientX - lastX)
      this.workarea.scrollTop -= (evt.clientY - lastY)

      lastX = evt.clientX
      lastY = evt.clientY

      if (evt.type === 'mouseup') { panning = false }
      return false
    })
    // Show the move cursor whenever a left-click at the pointer would move
    // something: over a selectable element (would be selected then moved) or
    // anywhere inside the current selection's bbox (bbox-drag). Only in select
    // mode while not already dragging/panning, so it never fights the
    // drawing/resize/rotate cursors.
    $id('svgcanvas').addEventListener('mousemove', (evt) => {
      const canv = this.svgCanvas
      if (panning || canv.spaceKey || canv.getStarted() || canv.getMode() !== 'select') { return }
      const svgRoot = canv.getSvgRoot()
      const target = canv.getMouseTarget(evt)
      let movable = target && target !== svgRoot &&
        target !== canv.selectorManager.selectorParentGroup
      // Over empty canvas: still movable if the pointer is inside the current
      // selection's bounding box (matches the bbox-drag behaviour in mouseDown).
      if (!movable) {
        const sel = canv.getSelectedElements().filter(Boolean)
        if (sel.length) {
          let l = Infinity; let t = Infinity; let r = -Infinity; let b = -Infinity
          for (const el of sel) {
            const rect = el.getBoundingClientRect()
            l = Math.min(l, rect.left); t = Math.min(t, rect.top)
            r = Math.max(r, rect.right); b = Math.max(b, rect.bottom)
          }
          movable = evt.clientX >= l && evt.clientX <= r &&
            evt.clientY >= t && evt.clientY <= b
        }
      }
      this.workarea.style.cursor = movable ? moveCursor : 'auto'
    })
    $id('svgcanvas').addEventListener('mousedown', (evt) => {
      this.enableToolCancel = false
      if (evt.button === 1 || keypan === true) {
        // prDefault to avoid firing of browser's panning on mousewheel
        evt.preventDefault()
        panning = true
        previousMode = this.svgCanvas.getMode()
        this.svgCanvas.setMode('ext-panning')
        this.workarea.style.cursor = 'grab'
        lastX = evt.clientX
        lastY = evt.clientY
        return false
      }
      return true
    })

    // Prevent the browser's native scroll/scaling on Ctrl/Cmd+wheel so the
    // svgcanvas zoom handler (DOMMouseScrollEvent) is the only effect.
    this.$container.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
      }
    })

    window.addEventListener('mouseup', (evt) => {
      this.enableToolCancel = true
      if (evt.button === 1) {
        this.svgCanvas.setMode(previousMode ?? 'select')
      }
      panning = false
    }, { signal: this.listenerAbort.signal })

    // Allows quick change to the select mode while panning mode is active
    this.workarea.addEventListener('dblclick', (evt) => {
      if (this.svgCanvas.getMode() === 'ext-panning') {
        this.leftPanel.clickSelect()
      }
    })

    // ownsKeyEvent (domScope.js) replaces a bare `e.target.nodeName === 'BODY'`
    // check: once activate() (constructor) started focusing $container on every
    // pointerdown, e.target stopped being <body> after the first click, which
    // silently killed the Cmd/Ctrl+V paste-fallback armer below on hosts that
    // never dispatch a native `paste` event (e.g. Obsidian/Electron) — see
    // domScope.js's ownsKeyEvent doc for the full history.
    document.addEventListener('keydown', (e) => {
      if (!ownsKeyEvent(this.$container, e.target)) return
      if (!isActiveEditor(this)) return // only the focused editor handles shortcuts
      // A registered tool (core/tool-registry.js) sees the key first; Escape rolls its gesture back.
      if (this.svgCanvas.toolKeyDown?.(e)) {
        e.preventDefault()
        return
      }
      // Collect every extension's answer: without returnArray only the last
      // extension implementing keyDown is heard, silencing the others.
      if (this.svgCanvas.runExtensions('keyDown', { event: e }, true).some((r) => r?.preventDefault)) {
        e.preventDefault()
        return
      }
      if (e.code.toLowerCase() === 'space') {
        this.svgCanvas.spaceKey = keypan = true
        e.preventDefault()
      } else if ((e.key.toLowerCase() === 'shift') && (this.svgCanvas.getMode() === 'zoom')) {
        this.workarea.style.cursor = zoomOutIcon
        e.preventDefault()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        // See pasteFallbackArmer.js: arms a fallback paste for hosts that never
        // deliver a native `paste` DOM event to a non-editable workarea.
        this.pasteFallbackArmer.arm()
      }
    }, { signal: this.listenerAbort.signal })

    // Native clipboard paste (Ctrl/Cmd+V). This is the primary path for paste:
    // the system clipboard tells us whether the content is svgedit's own (an
    // internal copy mirrors its JSON onto the clipboard) or an external SVG
    // document (e.g. "Copy as SVG" from another editor like Excalidraw), which
    // is imported as real, editable elements. Remove any prior listener first so
    // re-initialising the editor does not stack handlers. See
    // pasteFallbackArmer.js for the fallback used when this event never fires.
    //
    // applyClipboardText() holds the side-effecting half of paste (classify,
    // then act); classifyClipboardText() (pasteClipboardText.js) holds the
    // pure parsing rule so the native handler below and the keydown fallback
    // (armed above) apply the exact same logic to whatever text they get.
    this.applyClipboardText = (text) => {
      const classified = classifyClipboardText(text)
      if (!classified) return false
      if (classified.type === 'internal') {
        this.pasteInCenter(classified.data)
        return true
      }
      // external-svg
      const el = this.svgCanvas.importSvgString(text)
      if (!el) return true
      // importSvgString places the document as a single non-editable <use>
      // referencing a <symbol> in <defs> — which looks like one opaque image
      // object on the canvas. Select it, then ungroup so the real shapes
      // (paths, text, …) become an editable group.
      this.svgCanvas.selectOnly([el])
      this.svgCanvas.ungroupSelectedElement()
      this.svgCanvas.alignSelectedElements('m', 'page')
      this.svgCanvas.alignSelectedElements('c', 'page')
      this.topPanel.updateContextPanel()
      return true
    }
    if (this.pasteHandler) {
      document.removeEventListener('paste', this.pasteHandler)
    }
    if (!this.pasteFallbackArmer) {
      // Hosts that swallow the native `paste` DOM event (e.g. Obsidian's
      // Electron renderer, see pasteFallbackArmer.js) never give us
      // `e.clipboardData`, so recovering external content there means asking
      // the async Clipboard API directly. That read can be blocked by
      // permissions/host restrictions, in which case we fall back to the
      // old internal-only behavior (the same sessionStorage clipboard the
      // right-click "Paste" menu item uses).
      this.pasteFallbackArmer = createPasteFallbackArmer(async () => {
        try {
          const text = await navigator.clipboard.readText()
          if (this.applyClipboardText(text)) return
        } catch { /* clipboard read blocked by host/permissions */ }
        this.svgCanvas.pasteElements()
      })
    }
    this.pasteHandler = (e) => {
      if (!isActiveEditor(this)) return // only the focused editor handles paste
      // A real native paste event arrived, so the keydown fallback above (armed
      // for Cmd/Ctrl+V) must stand down — otherwise it would fire again ~80ms
      // later and double-paste.
      this.pasteFallbackArmer.disarm()
      // Let editable fields (inputs, text areas) keep their native paste.
      const t = e.target
      if (t && (t.isContentEditable || t.nodeName === 'INPUT' || t.nodeName === 'TEXTAREA')) return
      const text = e.clipboardData?.getData('image/svg+xml') || e.clipboardData?.getData('text/plain')
      if (this.applyClipboardText(text)) e.preventDefault()
    }
    document.addEventListener('paste', this.pasteHandler)

    // Wheel navigation:
    //   plain wheel        → scroll the canvas up/down (native vertical scroll)
    //   Shift + wheel      → scroll the canvas left/right
    //   Ctrl/Cmd + wheel   → zoom in/out (handled by svgcanvas DOMMouseScrollEvent,
    //                         which zooms toward the pointer)
    this.workarea.addEventListener('wheel', (e) => {
      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        this.workarea.scrollLeft += (e.deltaY || e.deltaX)
      }
      // plain wheel falls through to the browser's native vertical scroll
    }, { passive: false })

    document.addEventListener('keyup', (e) => {
      if (!ownsKeyEvent(this.$container, e.target)) return
      if (!isActiveEditor(this)) return // only the focused editor handles shortcuts
      if (e.code.toLowerCase() === 'space') {
        // A Space press an extension claimed in its keyDown hook (the shape-family
        // tools use it to move the shape being drawn) never armed pan, so there
        // is no mode to restore; resetting it would end the drag in progress.
        const panArmed = keypan
        this.svgCanvas.spaceKey = keypan = false
        if (panArmed) this.svgCanvas.setMode(previousMode === 'ext-panning' ? 'select' : previousMode ?? 'select')
        e.preventDefault()
      } else if ((e.key.toLowerCase() === 'shift') && (this.svgCanvas.getMode() === 'zoom')) {
        this.workarea.style.cursor = zoomInIcon
        e.preventDefault()
      }
    }, { signal: this.listenerAbort.signal })

    /**
     * @function module:SVGthis.setPanning
     * @param {boolean} active
     * @returns {void}
     */
    this.setPanning = (active) => {
      this.svgCanvas.spaceKey = keypan = active
    }
    let inp
    /**
      *
      * @returns {void}
      */
    const unfocus = () => {
      inp.blur()
    }

    const liElems = this.$svgEditor.querySelectorAll('button, select, input:not(#text)')
    const self = this
    Array.prototype.forEach.call(liElems, function (el) {
      el.addEventListener('focus', (e) => {
        inp = e.currentTarget
        self.uiContext = 'toolbars'
        self.workarea.addEventListener('mousedown', unfocus)
      })
      el.addEventListener('blur', () => {
        self.uiContext = 'canvas'
        self.workarea.removeEventListener('mousedown', unfocus)
        // Go back to selecting text if in textedit mode
        if (self.svgCanvas.getMode() === 'textedit') {
          $id('text').focus()
        }
      })
    })
    // ref: https://stackoverflow.com/a/1038781
    function getWidth () {
      return Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth,
        document.body.offsetWidth,
        document.documentElement.offsetWidth,
        document.documentElement.clientWidth
      )
    }

    function getHeight () {
      return Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight,
        document.documentElement.clientHeight
      )
    }
    const winWh = {
      width: getWidth(),
      height: getHeight()
    }

    window.addEventListener('resize', () => {
      Object.entries(winWh).forEach(([type, val]) => {
        const curval = (type === 'width') ? window.innerWidth - 15 : window.innerHeight
        this.workarea['scroll' + (type === 'width' ? 'Left' : 'Top')] -= (curval - val) / 2
        winWh[type] = curval
      })
    }, { signal: this.listenerAbort.signal })

    this.workarea.addEventListener('scroll', () => {
      this.rulers.manageScroll()
    })

    $id('stroke_width').value = this.configObj.curConfig.initStroke.width
    $id('opacity').value = this.configObj.curConfig.initOpacity * 100
    const elements = document.getElementsByClassName('push_button')
    Array.from(elements).forEach(function (element) {
      element.addEventListener('mousedown', function (event) {
        if (!event.currentTarget.classList.contains('disabled')) {
          event.currentTarget.classList.add('push_button_pressed')
          event.currentTarget.classList.remove('push_button')
        }
      })
      element.addEventListener('mouseout', function (event) {
        event.currentTarget.classList.add('push_button')
        event.currentTarget.classList.remove('push_button_pressed')
      })
      element.addEventListener('mouseup', function (event) {
        event.currentTarget.classList.add('push_button')
        event.currentTarget.classList.remove('push_button_pressed')
      })
    })

    this.rightPanel.populateLayers()

    const centerCanvas = () => {
      // this centers the canvas vertically in the this.workarea (horizontal handled in CSS)
      this.workarea.style.lineHeight = this.workarea.style.height
    }

    addListenerMulti(window, 'load resize', centerCanvas, { signal: this.listenerAbort.signal })

    // Prevent browser from erroneously repopulating fields
    const inputEles = this.$qa('input') // container-scoped (see constructor)
    Array.from(inputEles).forEach(function (inputEle) {
      inputEle.setAttribute('autocomplete', 'off')
    })
    const selectEles = this.$qa('select') // container-scoped (see constructor)
    Array.from(selectEles).forEach(function (inputEle) {
      inputEle.setAttribute('autocomplete', 'off')
    })

    $id('se-svg-editor-dialog').addEventListener('change', function (e) {
      if (e?.detail?.copy === 'click') {
        this.cancelOverlays(e)
      } else if (e?.detail?.dialog === 'dynamic') {
        this.toggleDynamicOutput(e)
      } else if (e?.detail?.dialog === 'closed') {
        this.hideSourceEditor()
      } else {
        this.saveSourceEditor(e)
      }
    }.bind(this))
    $id('se-cmenu_canvas').addEventListener('change', function (e) {
      const action = e?.detail?.trigger
      switch (action) {
        case 'delete':
          this.svgCanvas.deleteSelectedElements()
          break
        case 'cut':
          this.cutSelected()
          break
        case 'copy':
          this.copySelected()
          break
        case 'paste':
          this.svgCanvas.pasteElements()
          break
        case 'paste_in_place':
          this.svgCanvas.pasteElements('in_place')
          break
        case 'group':
        case 'group_elements':
          this.svgCanvas.groupSelectedElements()
          break
        case 'ungroup':
          this.svgCanvas.ungroupSelectedElement()
          break
        case 'move_front':
          this.svgCanvas.moveToTopSelectedElement()
          break
        case 'move_up':
          this.moveUpDownSelected('Up')
          break
        case 'move_down':
          this.moveUpDownSelected('Down')
          break
        case 'move_back':
          this.svgCanvas.moveToBottomSelectedElement()
          break
        case 'add_to_shape_library':
          this._addSelectedToShapeLibrary()
          break
        default:
          if (this.contextMenu.hasCustomHandler(action)) {
            this.contextMenu.getCustomHandler(action).call()
          }
          break
      }
    }.bind(this))

    // Select given tool
    this.ready(function () {
      const preTool = $id(`tool_${this.configObj.curConfig.initTool}`)
      const regTool = $id(this.configObj.curConfig.initTool)
      const selectTool = $id('tool_select')
      const $editDialog = $id('se-edit-prefs')

      if (preTool) {
        preTool.click()
      } else if (regTool) {
        regTool.click()
      } else {
        selectTool.click()
      }

      if (this.configObj.curConfig.wireframe) {
        $id('tool_wireframe').click()
      }

      if (this.configObj.curConfig.showRulers) {
        this.rulers.display(true)
      } else {
        this.rulers.display(false)
      }

      $editDialog.setAttribute('showrulers', this.configObj.curConfig.showRulers ? 'true' : 'false')

      if (this.configObj.curConfig.baseUnit) {
        $editDialog.setAttribute('baseunit', this.configObj.curConfig.baseUnit)
      }

      if (this.configObj.curConfig.dynamicOutput) {
        $editDialog.setAttribute('dynamicoutput', true)
      }
    }.bind(this))

    // zoom
    $id('zoom').value = (this.svgCanvas.getZoom() * 100).toFixed(1)
    this.canvMenu.setAttribute('disableallmenu', true)
    this.canvMenu.setAttribute('enablemenuitems', '#delete,#cut,#copy')

    this.enableOrDisableClipboard()

    window.addEventListener('storage', function (e) {
      if (e.key !== 'svgedit_clipboard') { return }

      this.enableOrDisableClipboard()
    }.bind(this), { signal: this.listenerAbort.signal })

    // `storage` only fires in *other* tabs/windows, never the one that wrote
    // the key — so same-window instances need their own signal to re-check
    // Paste state after a copy/cut in a sibling instance (see copySelectedElements).
    document.addEventListener('svgedit:clipboardchange', function () {
      this.enableOrDisableClipboard()
    }.bind(this), { signal: this.listenerAbort.signal })

    window.addEventListener('beforeunload', function (e) {
    // Suppress warning if page is empty
      if (undoMgr.getUndoStackSize() === 0) {
        this.showSaveWarning = false
      }

      // showSaveWarning is set to 'false' when the page is saved.
      if (!this.configObj.curConfig.no_save_warning && this.showSaveWarning) {
      // Browser already asks question about closing the page
        e.returnValue = this.i18next.t('notification.unsavedChanges') // Firefox needs this when beforeunload set by addEventListener (even though message is not used)
        return this.i18next.t('notification.unsavedChanges')
      }
      return true
    }.bind(this), { signal: this.listenerAbort.signal })

    // Use HTML5 File API: http://www.w3.org/TR/FileAPI/
    // if browser has HTML5 File API support, then we will show the open menu item
    // and provide a file input to click. When that change event fires, it will
    // get the text contents of the file and send it to the canvas

    this.workarea.addEventListener('dragenter', this.onDragEnter)
    this.workarea.addEventListener('dragover', this.onDragOver)
    this.workarea.addEventListener('dragleave', this.onDragLeave)

    this.updateCanvas(true)
    // Load extensions
    this.extAndLocaleFunc()
    // Defer injection to wait out initial menu processing. This probably goes
    //    away once all context menu behavior is brought to context menu.
    this.ready(() => {
      this.contextMenu.injectExtendedContextMenuItemsIntoDom()
    })
    // run callbacks stored by this.ready
    await this.runCallbacks()
    // Signal readiness to same-document listeners (tests/debugging hooks)
    document.dispatchEvent(new CustomEvent('svgedit:ready', { detail: this }))
  }

  /**
   * Handle "Add to Shape Library" context menu action (see addToShapeLibrary.js).
   * @returns {Promise<void>}
   */
  _addSelectedToShapeLibrary () {
    return addSelectedToShapeLibrary(this)
  }

  /**
   * @fires module:svgcanvas.SvgCanvas#event:ext_addLangData
   * @fires module:svgcanvas.SvgCanvas#event:ext_langReady
   * @fires module:svgcanvas.SvgCanvas#event:ext_langChanged
   * @fires module:svgcanvas.SvgCanvas#event:extensions_added
   * @returns {Promise<module:locale.LangAndData>} Resolves to result of {@link module:locale.readLang}
   */
  async extAndLocaleFunc () {
    this.$svgEditor.style.visibility = 'visible'
    // Show the brand watermark on the initially-empty canvas.
    this.updateCanvasWatermark()
    try {
      // load standard extensions
      await Promise.all(
        this.configObj.curConfig.extensions.map(async (extname) => {
          /**
           * @tutorial ExtensionDocs
           * @typedef {PlainObject} module:SVGthis.ExtensionObject
           * @property {string} [name] Name of the extension. Used internally; no need for i18n. Defaults to extension name without beginning "ext-" or ending ".js".
           * @property {module:svgcanvas.ExtensionInitCallback} [init]
           */
          try {
            /**
             * @type {module:SVGthis.ExtensionObject}
             */
            // Extensions are inlined into the bundle via extensionRegistry.js
            // (statically resolved), so no runtime fetch from extPath is needed.
            const imported = getExtension(extname)
            if (!imported) throw new Error(`Unknown extension: ${extname}`)
            if (!imported.default) throw new Error(`Extension ${extname} has no default export`)
            const { name = extname, init: initfn } = imported.default
            return this.addExtension(name, (initfn && initfn.bind(this)), { langParam: 'en' }) /** @todo  change to current lng */
          } catch (err) {
            // Todo: Add config to alert any errors
            logError('Extension failed to load: ' + extname + '; ', err, 'EditorStartup')
            return undefined
          }
        })
      )
      // load user extensions (given as pathNames)
      await Promise.all(
        this.configObj.curConfig.userExtensions.map(async ({ pathName, config }) => {
          /**
           * @tutorial ExtensionDocs
           * @typedef {PlainObject} module:SVGthis.ExtensionObject
           * @property {string} [name] Name of the extension. Used internally; no need for i18n. Defaults to extension name without beginning "ext-" or ending ".js".
           * @property {module:svgcanvas.ExtensionInitCallback} [init]
           */
          try {
            /**
             * @type {module:SVGthis.ExtensionObject}
             */
            const imported = await import(/* @vite-ignore */ encodeURI(pathName))
            if (!imported.default) throw new Error(`Extension ${pathName} has no default export`)
            const { name, init: initfn } = imported.default
            return this.addExtension(name, (initfn && initfn.bind(this, config)), {})
          } catch (err) {
            // Todo: Add config to alert any errors
            logError('Extension failed to load: ' + pathName + '; ', err, 'EditorStartup')
            return undefined
          }
        })
      )
      this.svgCanvas.bind(
        'extensions_added',
        /**
        * @param {external:Window} _win
        * @param {module:svgcanvas.SvgCanvas#event:extensions_added} _data
        * @listens module:SvgCanvas#event:extensions_added
        * @returns {void}
        */
        (_win, _data) => {
          this.extensionsAdded = true
          this.setAll()
          this.updateCanvas(true)

          this.messageQueue.forEach(
            /**
             * @param {module:svgcanvas.SvgCanvas#event:message} messageObj
             * @fires module:svgcanvas.SvgCanvas#event:message
             * @returns {void}
             */
            (messageObj) => {
              this.svgCanvas.call('message', messageObj)
            }
          )
        }
      )
      this.svgCanvas.call('extensions_added')
    } catch (err) {
      // Todo: Report errors through the UI
      logError('Failed to finish loading extensions', err, 'EditorStartup')
    }
  }

  /**
 * Listens to the mode change, listener is to be added on document
* @param {Event} evt custom modeChange event
*/
  modeListener (evt) {
    const { $id } = this // container-scoped lookup (see constructor)
    const mode = this.svgCanvas.getMode()

    this.setCursorStyle(mode)
    // The frame tool button lives in the top panel but acts like a drawing tool,
    // so keep its pressed state bound to the canvas mode (cleared when any other
    // tool is selected, by button/flyout/keyboard or the auto-return to select).
    const frameBtn = $id('tool_frame')
    if (frameBtn) frameBtn.pressed = mode === 'frame'
    this.topPanel.toggleImageCropMode(mode === 'imagecrop')
  }

  /**
   * sets cursor styling for workarea depending on the current mode
   * @param {string} mode
   */
  setCursorStyle (mode) {
    // A torn-down editor whose listeners survived would reach here with no
    // workarea; bail rather than throw on `this.workarea.style` (defence in
    // depth — destroy() should already have removed those listeners).
    if (!this.workarea) return
    let cs = 'auto'
    switch (mode) {
      case 'ext-panning':
        cs = 'grab'
        break
      case 'zoom':
      case 'shapelib':
      case 'repeat-pick-center':
      case 'puppetwarp':
      case 'spiral':
      case 'arc':
      case 'rectgrid':
      case 'polargrid':
        cs = 'crosshair'
        break
      case 'circle':
      case 'ellipse':
      case 'rect':
      case 'square':
      case 'star':
      case 'polygon':
        {
          const cur = getIconDataUri(`cursors/${mode}_cursor.svg`)
          cs = cur ? `url("${cur}"), crosshair` : 'crosshair'
        }
        break
      case 'text':
        // #TODO: Cursor should be changed back to default after text element was created
        cs = 'text'
        break
      default:
        cs = 'auto'
    }

    this.workarea.style.cursor = cs
  }

  /**
   * Listens for Esc key to be pressed to cancel active mode, sets mode to Select
   */
  cancelTool () {
    const mode = this.svgCanvas.getMode()
    // list of modes that are currently save to cancel
    const modesToCancel = ['zoom', 'rect', 'square', 'circle', 'ellipse', 'line', 'text', 'star', 'polygon', 'spiral', 'arc', 'rectgrid', 'polargrid', 'shapelib', 'image', 'shapebuilder', 'repeat-pick-center', 'cutter', 'curvature', 'path', 'pathedit']
    if (modesToCancel.includes(mode)) {
      this.leftPanel.clickSelect()
    }
  }
}

export default EditorStartup
