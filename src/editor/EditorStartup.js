/* globals seConfirm seAlert */
import {
  putLocale
} from './locale.js'
import {
  hasCustomHandler, getCustomHandler, injectExtendedContextMenuItemsIntoDom
} from './contextmenu.js'
import { addUserShape, getUserCategories } from './extensions/ext-shapes/userShapes.js'
import { setUserDataAdapter } from './userDataAdapter.js'
import editorTemplate from './templates/editorTemplate.html'
import SvgCanvas from '@svgedit/svgcanvas'
import Rulers from './Rulers.js'
import { applyTheme } from './themeUtil.js'
import { applyUiMode } from './uiMode.js'
import { getIconDataUri } from './images/iconRegistry.js'
import { getExtension } from './extensions/extensionRegistry.js'
import { setActiveEditor, isActiveEditor } from './domScope.js'
// svgedit.css `@import`s tablet.css, so this single inline import carries both.
import svgeditCss from './svgedit.css?inline'

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
    } catch (e) { /* empty fn */ }
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

const { $click, convertUnit, scopedId, scopedQa, scopedQq } = SvgCanvas

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
    this.$container = div ?? document.getElementById('svg_editor')
    // Mark this container so web components / dialogs nested under it can resolve
    // their owning editor via closestRoot() (see domScope.js).
    this.$container.setAttribute('data-svgedit-root', '')
    // Become the "active" editor on any interaction, so document-level keyboard
    // shortcut / paste handlers (registered by every mounted editor) only fire
    // for the focused one (see domScope.js, Editor.setKeyHandlers, pasteHandler).
    const activate = () => { setActiveEditor(this); this.svgCanvas?.activateUtilities?.() }
    this.$container.addEventListener('pointerdown', activate, true)
    this.$container.addEventListener('focusin', activate, true)
    // Resolve element lookups within this editor's own container so multiple
    // editors mounted in the same document don't collide on the fixed element
    // IDs baked into the template (svgcanvas, workarea, the se-* dialogs, …).
    // Methods read these off `this`; nested callbacks capture them lexically.
    this.$id = scopedId(this.$container)
    this.$qa = scopedQa(this.$container)
    this.$qq = scopedQq(this.$container)
  }

  /**
  * Auto-run after a Promise microtask.
  * @function module:SVGthis.init
  * @returns {void}
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
      // Export dialog added to DOM
      const exportDialog = document.createElement('se-export-dialog')
      exportDialog.setAttribute('id', 'se-export-dialog')
      this.$container.append(exportDialog)
      exportDialog.init(this.i18next)

      const imageImportDialog = document.createElement('se-image-import-dialog')
      imageImportDialog.setAttribute('id', 'se-image-import-dialog')
      this.$container.append(imageImportDialog)
      imageImportDialog.init(this.i18next)

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
    } catch (err) {
      console.error(err)
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
    document.addEventListener('modeChange', (evt) => this.modeListener(evt))

    /** if true - selected tool can be cancelled with Esc key
     * disables on dragging (mousedown) to avoid changing mode in the middle of drawing
    */
    this.enableToolCancel = true

    this.leftPanel.init()
    this.bottomPanel.init()
    this.rightPanel.init()
    this.topPanel.init()
    this.mainMenu.init()
    this.tabletShell.init()

    const { undoMgr } = this.svgCanvas
    this.canvMenu = $id('se-cmenu_canvas')
    this.exportWindow = null
    this.defaultImageURL = `${this.configObj.curConfig.imgPath}/logo.svg`
    const zoomInIcon = 'crosshair'
    const zoomOutIcon = 'crosshair'
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
    this.svgCanvas.bind('exported', this.exportHandler.bind(this))
    this.svgCanvas.bind('exportedPDF', function (win, data) {
      if (!data.output) { // Ignore Chrome
        return
      }
      const { exportWindowName } = data
      if (exportWindowName) {
        this.exportWindow = window.open('', this.exportWindowName) // A hack to get the window via JSON-able name without opening a new one
      }
      if (!this.exportWindow || this.exportWindow.closed) {
        seAlert(this.i18next.t('notification.popupWindowBlocked'))
        return
      }
      this.exportWindow.location.href = data.output
    }.bind(this))
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
      res.w = convertUnit(res.w) + this.configObj.curConfig.baseUnit
      res.h = convertUnit(res.h) + this.configObj.curConfig.baseUnit
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
    let promptMoveLayerOnce = false
    $id('selLayerNames').addEventListener('change', (evt) => {
      const destLayer = evt.detail.value
      const confirmStr = this.i18next.t('notification.QmoveElemsToLayer').replace('%s', destLayer)
      /**
    * @param {boolean} ok
    * @returns {void}
    */
      const moveToLayer = (ok) => {
        if (!ok) { return }
        promptMoveLayerOnce = true
        this.svgCanvas.moveSelectedToLayer(destLayer)
        this.svgCanvas.clearSelection()
        this.rightPanel.populateLayers()
      }
      if (destLayer) {
        if (promptMoveLayerOnce) {
          moveToLayer(true)
        } else {
          const ok = seConfirm(confirmStr)
          if (!ok) {
            return
          }
          moveToLayer(true)
        }
      }
    })
    $id('tool_font_family').addEventListener('change', (evt) => {
      this.svgCanvas.setFontFamily(evt.detail.value)
    })

    $id('seg_type').addEventListener('change', (evt) => {
      this.svgCanvas.setSegType(evt.detail.value)
    })

    const addListenerMulti = (element, eventNames, listener) => {
      eventNames.split(' ').forEach((eventName) => element.addEventListener(eventName, listener, false))
    }

    addListenerMulti($id('text'), 'keyup input', (evt) => {
      this.svgCanvas.setTextContent(evt.currentTarget.value)
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
    })

    // Allows quick change to the select mode while panning mode is active
    this.workarea.addEventListener('dblclick', (evt) => {
      if (this.svgCanvas.getMode() === 'ext-panning') {
        this.leftPanel.clickSelect()
      }
    })

    document.addEventListener('keydown', (e) => {
      if (e.target.nodeName !== 'BODY') return
      if (!isActiveEditor(this)) return // only the focused editor handles shortcuts
      if (e.code.toLowerCase() === 'space') {
        this.svgCanvas.spaceKey = keypan = true
        e.preventDefault()
      } else if ((e.key.toLowerCase() === 'shift') && (this.svgCanvas.getMode() === 'zoom')) {
        this.workarea.style.cursor = zoomOutIcon
        e.preventDefault()
      }
    })

    // Native clipboard paste (Ctrl/Cmd+V). This is the single arbiter for paste:
    // the system clipboard tells us whether the content is svgedit's own (an
    // internal copy mirrors its JSON onto the clipboard) or an external SVG
    // document (e.g. "Copy as SVG" from another editor like Excalidraw), which
    // is imported as real, editable elements. Remove any prior listener first so
    // re-initialising the editor does not stack handlers.
    if (this.pasteHandler) {
      document.removeEventListener('paste', this.pasteHandler)
    }
    this.pasteHandler = (e) => {
      if (!isActiveEditor(this)) return // only the focused editor handles paste
      // Let editable fields (inputs, text areas) keep their native paste.
      const t = e.target
      if (t && (t.isContentEditable || t.nodeName === 'INPUT' || t.nodeName === 'TEXTAREA')) return
      const text = e.clipboardData?.getData('image/svg+xml') || e.clipboardData?.getData('text/plain')
      if (!text) return
      // (a) svgedit's own internal clipboard → existing internal paste.
      try {
        if (Array.isArray(JSON.parse(text))) {
          e.preventDefault()
          this.pasteInCenter()
          return
        }
      } catch { /* not internal JSON, fall through */ }
      // (b) external SVG document (e.g. Excalidraw "Copy as SVG").
      if (/<svg[\s\S]*<\/svg>/i.test(text)) {
        e.preventDefault()
        const el = this.svgCanvas.importSvgString(text)
        if (!el) return
        // importSvgString places the document as a single non-editable <use>
        // referencing a <symbol> in <defs> — which looks like one opaque image
        // object on the canvas. Select it, then ungroup so the real shapes
        // (paths, text, …) become an editable group.
        this.svgCanvas.selectOnly([el])
        this.svgCanvas.ungroupSelectedElement()
        this.svgCanvas.alignSelectedElements('m', 'page')
        this.svgCanvas.alignSelectedElements('c', 'page')
        this.topPanel.updateContextPanel()
      }
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
      if (e.target.nodeName !== 'BODY') return
      if (e.code.toLowerCase() === 'space') {
        this.svgCanvas.spaceKey = keypan = false
        this.svgCanvas.setMode(previousMode === 'ext-panning' ? 'select' : previousMode ?? 'select')
        e.preventDefault()
      } else if ((e.key.toLowerCase() === 'shift') && (this.svgCanvas.getMode() === 'zoom')) {
        this.workarea.style.cursor = zoomInIcon
        e.preventDefault()
      }
    })

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
    })

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

    addListenerMulti(window, 'load resize', centerCanvas)

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
          if (hasCustomHandler(action)) {
            getCustomHandler(action).call()
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
    }.bind(this))

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
    }.bind(this))

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
      injectExtendedContextMenuItemsIntoDom()
    })
    // run callbacks stored by this.ready
    await this.runCallbacks()
    // Signal readiness to same-document listeners (tests/debugging hooks)
    document.dispatchEvent(new CustomEvent('svgedit:ready', { detail: this }))
  }

  /**
   * Handle "Add to Shape Library" context menu action.
   * Serializes the selected SVG element(s), shows a dialog for label + category,
   * saves to localStorage, and notifies the shape library component to refresh.
   * @returns {Promise<void>}
   */
  async _addSelectedToShapeLibrary () {
    const elems = this.svgCanvas.getSelectedElements().filter(Boolean)
    if (!elems.length) return

    // Determine target element: a single element is serialized as-is, multiple
    // elements are wrapped in a temporary <g>. In every case the serialized
    // content keeps each element's own `transform`, so the bbox must be measured
    // in that same (parent/user) coordinate space — `getStrokedBBox` accounts
    // for the transform, whereas a bare `getBBox()` does not, which would leave
    // the thumbnail off-centre and clipped.
    let targetElem
    if (elems.length === 1) {
      targetElem = elems[0]
    } else {
      const ns = 'http://www.w3.org/2000/svg'
      const tempG = document.createElementNS(ns, 'g')
      elems.forEach(el => tempG.appendChild(el.cloneNode(true)))
      targetElem = tempG
    }
    let bbox
    try {
      bbox = this.svgCanvas.getStrokedBBox(elems) || elems[0].getBBox()
    } catch {
      bbox = elems[0].getBBox()
    }

    const result = await this._showAddToLibraryDialog()
    if (!result) return

    const { label, category, linkedFile } = result
    if (!label || !category) return

    const svgContent = new XMLSerializer().serializeToString(targetElem)

    addUserShape({
      category,
      label,
      svgContent,
      bbox: { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height },
      linkedFile
    })

    // Notify the shape library component to refresh
    const shapeLib = this.$id('tool_shapelib') // container-scoped (see constructor)
    if (shapeLib) {
      shapeLib.dispatchEvent(new CustomEvent('user-shapes-updated'))
    }
  }

  /**
   * Show a native <dialog> prompting for a shape label and category.
   * @returns {Promise<{label: string, category: string, linkedFile: ?string}|null>}
   */
  async _showAddToLibraryDialog () {
    // An embedding host can expose the linkable files up front so the dialog can
    // offer them inline (a native <datalist>) rather than delegating to a host
    // picker. Delegating opened a second modal that rendered *behind* this
    // top-layer <dialog>; an inline datalist popup shares the top layer instead.
    const hasVault = typeof window.svgEditHost?.listVaultFiles === 'function'
    const vaultFiles = hasVault ? (await window.svgEditHost.listVaultFiles()) || [] : []
    return new Promise((resolve) => {
      const userCats = getUserCategories()
      const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1)
      const inputStyle = 'display:block;width:100%;margin-top:4px;padding:7px 10px;' +
        'border:1px solid var(--field-border,#DDE1E7);border-radius:7px;font-size:13px;' +
        'box-sizing:border-box;background:var(--field-bg,#FFF);color:var(--fg,#1B1F24);' +
        'font-family:inherit;outline:none'

      // Merge user-defined categories with built-in ones (user cats first).
      // Built-in categories are available after the shape library has loaded its index.
      const shapeLibEl = this.$id('tool_shapelib') // container-scoped (see constructor)
      const builtinOptions = shapeLibEl?.getBuiltinCategoryOptions?.() || []
      const userCatSet = new Set(userCats.map(c => c.toLowerCase()))
      // Only include built-in cats that don't already have a user category by the same name
      const filteredBuiltin = builtinOptions.filter(b => !userCatSet.has(b.id.toLowerCase()))

      // Always show a <select>. Pre-select "Other…" when nothing is available.
      const allCats = [
        ...userCats.map(c => ({ value: c, label: capitalize(c) })),
        ...filteredBuiltin.map(b => ({ value: b.id, label: b.label }))
      ]
      const noExisting = allCats.length === 0
      const catOptions = [
        ...allCats.map(c =>
          `<option value="${c.value.replace(/"/g, '&quot;')}">${c.label}</option>`
        ),
        '<option value="__new__">Other…</option>'
      ].join('')

      // Optional vault-file link — only when an embedding host provides a file
      // list. A native <datalist> can't be forced to open *below* the input
      // (Chromium decides direction by viewport space), so we render our own
      // suggestion list, absolutely positioned under the field. The chosen path
      // maps back to the host's link on save (see linkByPath below).
      const linkByPath = new Map(vaultFiles.map(f => [f.path, f.link]))
      const vaultControl = hasVault
        ? `
        <div style="margin-bottom:20px;font-size:13px;color:var(--fg,#1B1F24)">
          <span style="display:block;margin-bottom:4px">Linked vault file (optional)</span>
          <div style="position:relative">
            <input id="_asl_vault_link" type="text"
                   placeholder="Type to search files…" autocomplete="off"
                   style="${inputStyle};margin-top:0"/>
            <ul id="_asl_vault_menu" style="position:absolute;top:calc(100% + 2px);
                left:0;right:0;z-index:10;max-height:180px;overflow-y:auto;margin:0;
                padding:4px 0;list-style:none;background:var(--chrome-bg,#FFF);
                border:1px solid var(--field-border,#DDE1E7);border-radius:7px;
                box-shadow:0 6px 20px rgba(0,0,0,.15);display:none"></ul>
          </div>
        </div>`
        : ''

      const dlg = document.createElement('dialog')
      dlg.style.cssText = [
        'padding:24px',
        'border-radius:12px',
        'border:1px solid var(--chrome-border,#E6E8EC)',
        'background:var(--chrome-bg,#FFF)',
        'color:var(--fg,#1B1F24)',
        'font-family:var(--ui-font,system-ui,sans-serif)',
        'min-width:320px',
        'box-shadow:0 8px 30px rgba(0,0,0,.15)',
        'outline:none'
      ].join(';')

      dlg.innerHTML = `
        <h3 style="margin:0 0 16px;font-size:15px;font-weight:600;color:var(--fg,#1B1F24)">
          Add to Shape Library
        </h3>
        <label style="display:block;margin-bottom:12px;font-size:13px;color:var(--fg,#1B1F24)">
          Label
          <input id="_asl_label" type="text" placeholder="e.g. My Dog" autocomplete="off"
                 style="${inputStyle}"/>
        </label>
        <label style="display:block;margin-bottom:20px;font-size:13px;color:var(--fg,#1B1F24)">
          Category
          <select id="_asl_cat_select" style="${inputStyle}">${catOptions}</select>
          <input id="_asl_cat_new" type="text" placeholder="New category name"
                 autocomplete="off"
                 style="${inputStyle};margin-top:6px;display:${noExisting ? 'block' : 'none'}"/>
        </label>
        ${vaultControl}
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button id="_asl_cancel"
                  style="padding:7px 18px;border-radius:7px;border:1px solid var(--chrome-border,#DDE1E7);
                         background:transparent;color:var(--fg,#1B1F24);font-size:13px;
                         cursor:pointer;font-family:inherit">
            Cancel
          </button>
          <button id="_asl_ok"
                  style="padding:7px 18px;border-radius:7px;border:none;
                         background:var(--accent,#2962FF);color:#FFF;font-size:13px;
                         font-weight:600;cursor:pointer;font-family:inherit">
            Save
          </button>
        </div>
      `

      document.body.appendChild(dlg)
      dlg.showModal()
      dlg.querySelector('#_asl_label').focus()

      const select = dlg.querySelector('#_asl_cat_select')
      const newInput = dlg.querySelector('#_asl_cat_new')

      // If no existing categories, pre-select "Other…" so the text input is visible immediately
      if (noExisting) select.value = '__new__'

      // Show/hide the text input when "Other…" is selected or deselected
      select.addEventListener('change', () => {
        const isOther = select.value === '__new__'
        newInput.style.display = isOther ? 'block' : 'none'
        if (isOther) newInput.focus()
      })

      const getCategory = () =>
        select.value === '__new__' ? newInput.value.trim() : select.value

      // Resolve the chosen file path (from the datalist) back to the host link.
      // Only a path the host actually offered counts; free text is ignored.
      const getLinkedFile = () => {
        if (!hasVault) return null
        const path = dlg.querySelector('#_asl_vault_link').value.trim()
        return path ? (linkByPath.get(path) || null) : null
      }

      // Custom suggestion dropdown that always opens below the input, with the
      // host-provided order preserved (active drawing first). Selecting an entry
      // stamps its path into the input; getLinkedFile() maps it back to a link.
      if (hasVault) {
        const linkInput = dlg.querySelector('#_asl_vault_link')
        const menu = dlg.querySelector('#_asl_vault_menu')
        const escText = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        const optStyle = 'padding:6px 10px;cursor:pointer;white-space:nowrap;' +
          'overflow:hidden;text-overflow:ellipsis;font-size:13px'
        let shown = []
        let activeIdx = -1

        const closeMenu = () => { menu.style.display = 'none'; activeIdx = -1 }
        const highlight = () => {
          [...menu.children].forEach((li, i) => {
            li.style.background = i === activeIdx ? 'var(--accent,#2962FF)' : 'transparent'
            li.style.color = i === activeIdx ? '#FFF' : 'var(--fg,#1B1F24)'
          })
        }
        const renderMenu = () => {
          const q = linkInput.value.trim().toLowerCase()
          shown = q ? vaultFiles.filter(f => f.path.toLowerCase().includes(q)) : vaultFiles.slice()
          if (!shown.length) { closeMenu(); return }
          menu.innerHTML = shown
            .map((f, i) => `<li data-idx="${i}" style="${optStyle}">${escText(f.path)}</li>`)
            .join('')
          activeIdx = -1
          menu.style.display = 'block'
        }
        const choose = (i) => {
          if (i < 0 || i >= shown.length) return
          linkInput.value = shown[i].path
          closeMenu()
        }

        linkInput.addEventListener('focus', renderMenu)
        linkInput.addEventListener('input', renderMenu)
        linkInput.addEventListener('keydown', (e) => {
          if (menu.style.display === 'none') return
          if (e.key === 'ArrowDown') {
            e.preventDefault(); activeIdx = Math.min(activeIdx + 1, shown.length - 1); highlight()
          } else if (e.key === 'ArrowUp') {
            e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); highlight()
          } else if (e.key === 'Enter' && activeIdx >= 0) {
            e.preventDefault(); choose(activeIdx)
          } else if (e.key === 'Escape') {
            // Close the dropdown without dismissing the whole dialog.
            e.preventDefault(); e.stopPropagation(); closeMenu()
          }
        })
        // mousedown (not click) fires before the input's blur hides the menu.
        menu.addEventListener('mousedown', (e) => {
          const li = e.target.closest('li')
          if (li) { e.preventDefault(); choose(Number(li.dataset.idx)) }
        })
        menu.addEventListener('mousemove', (e) => {
          const li = e.target.closest('li')
          if (li) { activeIdx = Number(li.dataset.idx); highlight() }
        })
        linkInput.addEventListener('blur', () => setTimeout(closeMenu, 120))
      }

      const cleanup = (value) => {
        dlg.close()
        document.body.removeChild(dlg)
        resolve(value)
      }

      dlg.querySelector('#_asl_cancel').addEventListener('click', () => cleanup(null))

      dlg.querySelector('#_asl_ok').addEventListener('click', () => {
        const label = dlg.querySelector('#_asl_label').value.trim()
        const category = getCategory()
        cleanup(label && category ? { label, category, linkedFile: getLinkedFile() } : null)
      })

      // Escape key
      dlg.addEventListener('cancel', () => {
        document.body.removeChild(dlg)
        resolve(null)
      })
    })
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
            const { name = extname, init: initfn } = imported.default
            return this.addExtension(name, (initfn && initfn.bind(this)), { langParam: 'en' }) /** @todo  change to current lng */
          } catch (err) {
            // Todo: Add config to alert any errors
            console.error('Extension failed to load: ' + extname + '; ', err)
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
            const { name, init: initfn } = imported.default
            return this.addExtension(name, (initfn && initfn.bind(this, config)), {})
          } catch (err) {
            // Todo: Add config to alert any errors
            console.error('Extension failed to load: ' + pathName + '; ', err)
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

          if (this.storagePromptState === 'ignore') {
            this.updateCanvas(true)
          }

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
      console.error(err)
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
  }

  /**
   * sets cursor styling for workarea depending on the current mode
   * @param {string} mode
   */
  setCursorStyle (mode) {
    let cs = 'auto'
    switch (mode) {
      case 'ext-panning':
        cs = 'grab'
        break
      case 'zoom':
      case 'shapelib':
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
    const modesToCancel = ['zoom', 'rect', 'square', 'circle', 'ellipse', 'line', 'text', 'star', 'polygon', 'shapelib', 'image']
    if (modesToCancel.includes(mode)) {
      this.leftPanel.clickSelect()
    }
  }
}

export default EditorStartup
