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

import './components/index.js'
import './dialogs/index.js'

import SvgCanvas from '@svgedit/svgcanvas'
import Paint from '@svgedit/svgcanvas/core/paint.js'
import { Command } from '@svgedit/svgcanvas/core/history.js'
import ConfigObj from './ConfigObj.js'
import EditorStartup from './EditorStartup.js'
import { setActiveEditor } from './domScope.js'
import LeftPanel from './panels/LeftPanel.js'
import TopPanel from './panels/TopPanel.js'
import BottomPanel from './panels/BottomPanel.js'
import RightPanel from './panels/RightPanel.js'
import TabletShell from './panels/TabletShell.js'
import MainMenu from './MainMenu.js'
import HotkeyManager from './Hotkeys.js'
import { getParentsUntil } from '@svgedit/svgcanvas/common/util.js'
import { getIconDataUri } from './images/iconRegistry.js'
import { blurActiveField } from './components/fieldAutoBlur.js'

const { $click, decode64 } = SvgCanvas

/**
 *
 */
class Editor extends EditorStartup {
  /**
   *
   */
  constructor (div = null) {
    super(div)
    /**
     * @type {boolean}
     */
    this.langChanged = false
    /**
     * @type {boolean}
     */
    this.showSaveWarning = false
    /**
     * Will be set to a boolean by `ext-storage.js`
     * @type {"ignore"|"waiting"|"closed"}
     */
    this.storagePromptState = 'ignore'
    /**
     * document title
     */
    this.title = 'untitled.svg'

    this.svgCanvas = null
    this.$click = $click
    this.isReady = false
    this.customExportImage = false
    this.customExportPDF = false
    this.configObj = new ConfigObj(this)
    this.configObj.pref = this.configObj.pref.bind(this.configObj)
    this.setConfig = this.configObj.setConfig.bind(this.configObj)
    this.callbacks = []
    this.curContext = null
    this.exportWindowName = null
    this.docprops = false
    this.configObj.preferences = false
    this.canvMenu = null
    this.goodLangs = [
      'ar',
      'cs',
      'de',
      'en',
      'es',
      'fa',
      'fr',
      'fy',
      'hi',
      'it',
      'ja',
      'nl',
      'pl',
      'pt-BR',
      'ro',
      'ru',
      'sk',
      'sl',
      'sv',
      'tr',
      'uk',
      'zh-CN',
      'zh-TW'
    ]

    // Editor-level shortcuts (not associated with a toolbar button). Each entry
    // carries `id`/`group`/`label` so the Hotkey Manager (see Hotkeys.js) can
    // list and rebind it. `key` may use the `mod` token (platform command key)
    // and `/` to separate equivalent default keys; the trailing `true` keeps the
    // original preventDefault behaviour.
    this.shortcuts = [
      {
        id: 'rotate_ccw_fine',
        group: 'Rotate',
        label: 'hotkeys.rotate_ccw_fine',
        key: ['ctrl+arrowleft', true],
        fn: () => {
          this.rotateSelected(0, 1)
        }
      },
      {
        id: 'rotate_cw_fine',
        group: 'Rotate',
        label: 'hotkeys.rotate_cw_fine',
        key: 'ctrl+arrowright',
        fn: () => {
          this.rotateSelected(1, 1)
        }
      },
      {
        id: 'rotate_ccw',
        group: 'Rotate',
        label: 'hotkeys.rotate_ccw',
        key: ['ctrl+shift+arrowleft', true],
        fn: () => {
          this.rotateSelected(0, 5)
        }
      },
      {
        id: 'rotate_cw',
        group: 'Rotate',
        label: 'hotkeys.rotate_cw',
        key: 'ctrl+shift+arrowright',
        fn: () => {
          this.rotateSelected(1, 5)
        }
      },
      {
        id: 'cycle_prev',
        group: 'Navigate',
        label: 'hotkeys.cycle_prev',
        key: 'shift+o/tab',
        fn: () => {
          this.svgCanvas.cycleElement(0)
        }
      },
      {
        id: 'cycle_next',
        group: 'Navigate',
        label: 'hotkeys.cycle_next',
        key: 'shift+p/shift+tab',
        fn: () => {
          this.svgCanvas.cycleElement(1)
        }
      },
      {
        id: 'zoom_in',
        group: 'Zoom',
        label: 'hotkeys.zoom_in',
        key: ['mod+arrowup', true],
        fn: () => {
          this.zoomImage(2)
        }
      },
      {
        id: 'zoom_out',
        group: 'Zoom',
        label: 'hotkeys.zoom_out',
        key: ['mod+arrowdown', true],
        fn: () => {
          this.zoomImage(0.5)
        }
      },
      {
        id: 'raise',
        group: 'Arrange',
        label: 'hotkeys.raise',
        key: ['mod+]', true],
        fn: () => {
          this.moveUpDownSelected('Up')
        }
      },
      {
        id: 'lower',
        group: 'Arrange',
        label: 'hotkeys.lower',
        key: ['mod+[', true],
        fn: () => {
          this.moveUpDownSelected('Down')
        }
      },
      {
        id: 'move_up',
        group: 'Move',
        label: 'hotkeys.move_up',
        key: ['arrowup', true],
        fn: () => {
          this.moveSelected(0, -1)
        }
      },
      {
        id: 'move_down',
        group: 'Move',
        label: 'hotkeys.move_down',
        key: ['arrowdown', true],
        fn: () => {
          this.moveSelected(0, 1)
        }
      },
      {
        id: 'move_left',
        group: 'Move',
        label: 'hotkeys.move_left',
        key: ['arrowleft', true],
        fn: () => {
          this.moveSelected(-1, 0)
        }
      },
      {
        id: 'move_right',
        group: 'Move',
        label: 'hotkeys.move_right',
        key: ['arrowright', true],
        fn: () => {
          this.moveSelected(1, 0)
        }
      },
      {
        id: 'move_up_big',
        group: 'Move',
        label: 'hotkeys.move_up_big',
        key: 'shift+arrowup',
        fn: () => {
          this.moveSelected(0, -10)
        }
      },
      {
        id: 'move_down_big',
        group: 'Move',
        label: 'hotkeys.move_down_big',
        key: 'shift+arrowdown',
        fn: () => {
          this.moveSelected(0, 10)
        }
      },
      {
        id: 'move_left_big',
        group: 'Move',
        label: 'hotkeys.move_left_big',
        key: 'shift+arrowleft',
        fn: () => {
          this.moveSelected(-10, 0)
        }
      },
      {
        id: 'move_right_big',
        group: 'Move',
        label: 'hotkeys.move_right_big',
        key: 'shift+arrowright',
        fn: () => {
          this.moveSelected(10, 0)
        }
      },
      {
        id: 'clone_up',
        group: 'Clone',
        label: 'hotkeys.clone_up',
        key: ['alt+arrowup', true],
        fn: () => {
          this.svgCanvas.cloneSelectedElements(0, -1)
        }
      },
      {
        id: 'clone_down',
        group: 'Clone',
        label: 'hotkeys.clone_down',
        key: ['alt+arrowdown', true],
        fn: () => {
          this.svgCanvas.cloneSelectedElements(0, 1)
        }
      },
      {
        id: 'clone_left',
        group: 'Clone',
        label: 'hotkeys.clone_left',
        key: ['alt+arrowleft', true],
        fn: () => {
          this.svgCanvas.cloneSelectedElements(-1, 0)
        }
      },
      {
        id: 'clone_right',
        group: 'Clone',
        label: 'hotkeys.clone_right',
        key: ['alt+arrowright', true],
        fn: () => {
          this.svgCanvas.cloneSelectedElements(1, 0)
        }
      },
      {
        id: 'clone_up_big',
        group: 'Clone',
        label: 'hotkeys.clone_up_big',
        key: ['alt+shift+arrowup', true],
        fn: () => {
          this.svgCanvas.cloneSelectedElements(0, -10)
        }
      },
      {
        id: 'clone_down_big',
        group: 'Clone',
        label: 'hotkeys.clone_down_big',
        key: ['alt+shift+arrowdown', true],
        fn: () => {
          this.svgCanvas.cloneSelectedElements(0, 10)
        }
      },
      {
        id: 'clone_left_big',
        group: 'Clone',
        label: 'hotkeys.clone_left_big',
        key: ['alt+shift+arrowleft', true],
        fn: () => {
          this.svgCanvas.cloneSelectedElements(-10, 0)
        }
      },
      {
        id: 'clone_right_big',
        group: 'Clone',
        label: 'hotkeys.clone_right_big',
        key: ['alt+shift+arrowright', true],
        fn: () => {
          this.svgCanvas.cloneSelectedElements(10, 0)
        }
      },
      {
        id: 'flip_horizontal',
        group: 'Edit',
        label: 'hotkeys.flip_horizontal',
        key: 'shift+h',
        fn: () => {
          this.svgCanvas.flipSelectedElements(-1, 1)
        }
      },
      {
        id: 'flip_vertical',
        group: 'Edit',
        label: 'hotkeys.flip_vertical',
        key: 'shift+v',
        fn: () => {
          this.svgCanvas.flipSelectedElements(1, -1)
        }
      },
      {
        id: 'delete_selected',
        group: 'Edit',
        label: 'hotkeys.delete_selected',
        key: ['delete/backspace', true],
        fn: () => {
          if (this.svgCanvas.getMode() === 'pathedit') {
            if (this.svgCanvas.pathActions.canDeleteNodes) {
              this.svgCanvas.pathActions.deletePathNode()
            }
          } else if (this.selectedElement || this.multiselected) {
            this.svgCanvas.deleteSelectedElements()
          }
        }
      },
      {
        id: 'select_all',
        group: 'Selection',
        label: 'hotkeys.select_all',
        key: ['a/mod+a', true],
        fn: () => {
          this.svgCanvas.selectAllInCurrentLayer()
        }
      },
      {
        id: 'cut',
        group: 'Edit',
        label: 'hotkeys.cut',
        key: 'mod+x',
        fn: () => {
          this.cutSelected()
        }
      },
      {
        id: 'copy',
        group: 'Edit',
        label: 'hotkeys.copy',
        key: 'mod+c',
        fn: () => {
          this.copySelected()
        }
      },
      {
        id: 'escape',
        group: 'Selection',
        label: 'hotkeys.escape',
        key: 'escape',
        fn: () => {
          if (this.enableToolCancel) {
            this.cancelTool()
          }
        }
      },
      // Bindable commands that live in dropdowns / the canvas context menu and
      // so have no toolbar button to click. They ship unbound (no `key`); the
      // user can assign one from the Hotkey Manager.
      {
        id: 'move_to_front',
        group: 'Arrange',
        label: 'tools.move_top',
        fn: () => {
          this.svgCanvas.moveToTopSelectedElement()
        }
      },
      {
        id: 'move_to_back',
        group: 'Arrange',
        label: 'tools.move_bottom',
        fn: () => {
          this.svgCanvas.moveToBottomSelectedElement()
        }
      },
      {
        id: 'switch_zorder',
        group: 'Arrange',
        label: 'tools.switch_layers',
        fn: () => {
          this.svgCanvas.switchSelectedZorder()
        }
      },
      {
        id: 'align_left',
        group: 'Align',
        label: 'tools.align_left',
        fn: () => {
          this.topPanel.clickAlign('l')
        }
      },
      {
        id: 'align_center',
        group: 'Align',
        label: 'tools.align_center',
        fn: () => {
          this.topPanel.clickAlign('c')
        }
      },
      {
        id: 'align_right',
        group: 'Align',
        label: 'tools.align_right',
        fn: () => {
          this.topPanel.clickAlign('r')
        }
      },
      {
        id: 'align_top',
        group: 'Align',
        label: 'tools.align_top',
        fn: () => {
          this.topPanel.clickAlign('t')
        }
      },
      {
        id: 'align_middle',
        group: 'Align',
        label: 'tools.align_middle',
        fn: () => {
          this.topPanel.clickAlign('m')
        }
      },
      {
        id: 'align_bottom',
        group: 'Align',
        label: 'tools.align_bottom',
        fn: () => {
          this.topPanel.clickAlign('b')
        }
      },
      {
        id: 'add_to_shape_library',
        group: 'Edit',
        label: 'hotkeys.add_to_shape_library',
        fn: () => {
          this._addSelectedToShapeLibrary()
        }
      }
    ]
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

  /**
   *
   * @param {string} str SVG string
   * @param {PlainObject} [opts={}]
   * @param {boolean} [opts.noAlert]
   * @throws {Error} Upon failure to load SVG
   * @returns {void}
   */
  loadSvgString (str, { noAlert } = {}) {
    const success = this.svgCanvas.setSvgString(str) !== false
    if (success) {
      this.updateCanvas()
      // Loading replaces the whole drawing without firing elementChanged, so
      // refresh the empty-canvas brand watermark to match the new content
      // (otherwise it lingers when a non-empty drawing is loaded).
      this.updateCanvasWatermark()
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
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:saved} svgStr A string of the SVG
   * @listens module:svgcanvas.SvgCanvas#event:saved
   * @returns {void}
   */
  /**
   * Its responsibilities (with regard to the object it is supplied in its 2nd argument) are:
   *  - inform user of any issues supplied via the "issues" property
   *  - convert the "svg" property SVG string into an image for export;
   *    utilize the properties "type" (currently 'PNG', 'JPEG', 'BMP',
   *    'WEBP', 'PDF'), "mimeType", and "quality" (for 'JPEG' and 'WEBP'
   *    types) to determine the proper output.
   * @function module:SVGthis.CustomHandler#exportImage
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:exported} data
   * @listens module:svgcanvas.SvgCanvas#event:exported
   * @returns {void}
   */
  /**
   * @function module:SVGthis.CustomHandler#exportPDF
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:exportedPDF} data
   * @listens module:svgcanvas.SvgCanvas#event:exportedPDF
   * @returns {void}
   */

  /**
   * @function module:SVGthis.randomizeIds
   * @param {boolean} arg
   * @returns {void}
   */
  randomizeIds (arg) {
    this.svgCanvas.randomizeIds(arg)
  }

  /**
   *  @lends module:SVGEditor~Actions */
  /**
   * editor shortcuts init
   * @returns {void}
   */
  setAll () {
    const { $id } = this // container-scoped lookup (see EditorStartup constructor)

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
        evt.currentTarget.dispatchEvent(new Event('change'))
        evt.preventDefault()
      })
    })
    $id('image_url').addEventListener('keydown', function (evt) {
      evt.currentTarget.dispatchEvent(new Event('change'))
      evt.preventDefault()
    })
  }

  /**
   * Tear down document-level listeners this editor registered, so a closed
   * editor never reacts to shortcuts/paste (operating on a torn-down canvas) and
   * isn't left as the "active" editor. Call before discarding the instance.
   * @returns {void}
   */
  destroy () {
    if (this.hotkeys) this.hotkeys.unregister()
    if (this.pasteHandler) document.removeEventListener('paste', this.pasteHandler)
    // Remove all document/window listeners wired through the abort signal
    // (modeChange, key handling, resize, …). Without this they leak onto
    // document/window per editor instance and keep firing on a dead editor.
    this.listenerAbort?.abort()
    setActiveEditor(null)
  }

  // parents() https://stackoverflow.com/a/12981248
  getParents (el, parentSelector /* optional */) {
    // If no parentSelector defined will bubble up all the way to *document*
    if (parentSelector === undefined) {
      parentSelector = document
    }

    const parents = []
    let p = el.parentNode

    while (p !== parentSelector) {
      const o = p
      parents.push(o)
      p = o.parentNode
    }
    parents.push(parentSelector) // Push that parentSelector you wanted to stop at

    return parents
  }

  /**
   * @param {string} sel Selector to match
   * @returns {module:SVGthis.ToolButton}
   */
  getButtonData (sel) {
    return Object.values(this.shortcuts).find((btn) => {
      return btn.sel === sel
    })
  }

  /**
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:exported} data
   * @listens module:svgcanvas.SvgCanvas#event:exported
   * @returns {void}
   */
  exportHandler (win, data) {
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
          this.i18next.t('notification..noteTheseIssues') +
          pre +
          issues.join(pre)
      }
      // Note that this will also prevent the notice even though new issues may appear later.
      // May want to find a way to deal with that without annoying the user
      this.configObj.pref('export_notice_done', 'all')
      seAlert(note)
    }
  }

  /**
   * Rebuild a gradient element from the serialized XML stored in prefs.
   * @param {string} xml
   * @returns {Element|undefined}
   */
  gradientElemFromXml (xml) {
    if (!xml) { return undefined }
    try {
      return new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement
    } catch (_) {
      return undefined
    }
  }

  /**
   *
   * @param {string} color
   * @param {string} url
   * @param {Element} [gradientElem]
   * @param {boolean} [recordUndo] - When true, push the change onto the undo stack
   *   so it can be reverted with the Undo button. Programmatic callers (init,
   *   host restore) leave this false to avoid polluting history.
   * @returns {void}
   */
  setBackground (color, url, gradientElem, recordUndo = false) {
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
    const cmd = new Command()
    cmd.text = 'Change canvas background'
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
    this.svgCanvas.undoMgr.addCommandToHistory(cmd)
  }

  /**
   * Apply a background state to the canvas, prefs, and bottom-panel swatch.
   * Does not touch the undo stack.
   * @param {string} color
   * @param {string} url
   * @param {Element} [gradientElem]
   * @returns {void}
   */
  applyBackgroundState (color, url, gradientElem) {
    const { $id } = this // container-scoped lookup (see EditorStartup constructor)
    // if (color == this.configObj.pref('bkgd_color') && url == this.configObj.pref('bkgd_url')) { return; }
    this.configObj.pref('bkgd_color', color)
    this.configObj.pref('bkgd_url', url, true)
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

  /**
   * @function module:SVGthis.updateCanvas
   * @param {boolean} center
   * @param {module:math.XYObject} newCtr
   * @returns {void}
   */
  updateCanvas (center, newCtr) {
    const { $id } = this // container-scoped lookup (see EditorStartup constructor)
    const zoom = this.svgCanvas.getZoom()
    const { workarea } = this
    const cnvs = $id('svgcanvas')

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

    if (
      this.configObj.urldata.storagePrompt !== true &&
      this.storagePromptState === 'ignore'
    ) {
      if ($id('dialog_box') != null) $id('dialog_box').style.display = 'none'
    }
  }

  /**
   *
   * @returns {void}
   */
  updateWireFrame () {
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
   *
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:selected} elems Array of elements that were selected
   * @listens module:svgcanvas.SvgCanvas#event:selected
   * @fires module:svgcanvas.SvgCanvas#event:ext_selectedChanged
   * @returns {void}
   */
  selectedChanged (win, elems) {
    const mode = this.svgCanvas.getMode()
    if (mode === 'select') {
      this.leftPanel.clickSelect()
    }
    const isNode = mode === 'pathedit'
    // if this.elems[1] is present, then we have more than one element
    this.selectedElement = elems.length === 1 || !elems[1] ? elems[0] : null
    this.multiselected = elems.length >= 2 && !!elems[1]
    if (this.selectedElement && !isNode) {
      this.topPanel.update()
    } // if (elem)

    // Nothing selected anymore: release any panel field still holding focus, so
    // a field can't outlive its element's selection (and keep swallowing keys).
    if (!this.selectedElement && !this.multiselected) {
      blurActiveField()
    }

    // Deal with pathedit mode
    this.topPanel.togglePathEditMode(isNode, elems)
    this.topPanel.updateContextPanel()
    // Switch the right-panel tab to match the selection (text → Text, else
    // Design). Done here, on selection change only — not in updateContextPanel,
    // which also runs on attribute edits and would yank the user off Design
    // mid-edit (e.g. when changing a text object's stroke width).
    this.rightPanel.autoSelectTab(this.selectedElement, this.multiselected)
    // Some tools (e.g. curvature/path, text) commit a new element by firing
    // only 'selected', not 'changed', so refresh the empty-canvas watermark
    // here too — otherwise it lingers after drawing with those tools.
    this.updateCanvasWatermark()
    this.svgCanvas.runExtensions(
      'selectedChanged',
      /** @type {module:svgcanvas.SvgCanvas#event:ext_selectedChanged} */ {
        elems,
        selectedElement: this.selectedElement,
        multiselected: this.multiselected
      }
    )
  }

  // Call when part of element is in process of changing, generally
  // on mousemove actions like rotate, move, etc.
  /**
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:transition} elems
   * @listens module:svgcanvas.SvgCanvas#event:transition
   * @fires module:svgcanvas.SvgCanvas#event:ext_elementTransition
   * @returns {void}
   */
  elementTransition (win, elems) {
    const { $id } = this // container-scoped lookup (see EditorStartup constructor)
    const mode = this.svgCanvas.getMode()
    const elem = elems[0]

    if (!elem) {
      return
    }

    this.multiselected = elems.length >= 2 && elems[1]
    // Only updating fields for single elements for now
    if (!this.multiselected) {
      switch (mode) {
        case 'rotate': {
          const ang = this.svgCanvas.getRotationAngle(elem)
          $id('angle').value = ang
          ang === 0
            ? $id('tool_reorient').classList.add('disabled')
            : $id('tool_reorient').classList.remove('disabled')
          break
        }
      }
    }
    this.svgCanvas.runExtensions(
      'elementTransition',
      /** @type {module:svgcanvas.SvgCanvas#event:ext_elementTransition} */ {
        elems
      }
    )
  }

  // called when any element has changed
  /**
   * @param {external:Window} win
   * @param {Array<PlainObject>} elems
   * @listens module:svgcanvas.SvgCanvas#event:changed
   * @fires module:svgcanvas.SvgCanvas#event:ext_elementChanged
   * @returns {void}
   */
  elementChanged (win, elems) {
    const mode = this.svgCanvas.getMode()
    if (mode === 'select') {
      this.leftPanel.clickSelect()
    }

    elems.forEach((elem) => {
      const isSvgElem = elem?.tagName === 'svg'
      if (isSvgElem || this.svgCanvas.isLayer(elem)) {
        this.rightPanel.populateLayers()
        // if the element changed was the svg, then it could be a resolution change
        if (isSvgElem) {
          this.updateCanvas()
        }
        // Update selectedElement if element is no longer part of the image.
        // This occurs for the text elements in Firefox
      } else if (elem && !this.selectedElement?.parentNode) {
        this.selectedElement = elem
      }
    })

    this.showSaveWarning = true

    // we update the contextual panel with potentially new
    // positional/sizing information (we DON'T want to update the
    // toolbar here as that creates an infinite loop)
    // also this updates the history buttons

    // we tell it to skip focusing the text control if the
    // text element was previously in focus
    this.topPanel.updateContextPanel()

    // In the event a gradient was flipped:
    if (this.selectedElement && mode === 'select') {
      this.bottomPanel.updateColorpickers()
    }

    this.updateCanvasWatermark()

    this.svgCanvas.runExtensions(
      'elementChanged',
      /** @type {module:svgcanvas.SvgCanvas#event:ext_elementChanged} */ {
        elems
      }
    )
  }

  /**
   * @returns {void}
   */
  elementRenamed (win, renameObj) {
    this.svgCanvas.runExtensions(
      'elementRenamed',
      /** @type {module:svgcanvas.SvgCanvas#event:ext_elementRenamed} */ {
        renameObj
      }
    )
  }

  /**
   * Show the faint brand watermark on the canvas only while the drawing has no
   * objects yet (e.g. a freshly opened document). Lazily sets the background
   * image on first call, then toggles visibility on every content change.
   * @returns {void}
   */
  updateCanvasWatermark () {
    const el = this.$id('canvas_watermark')
    if (!el) return
    if (!el.style.backgroundImage) {
      const uri = getIconDataUri('logo.svg')
      if (uri) el.style.backgroundImage = `url("${uri}")`
    }
    const isEmpty = this.svgCanvas.getVisibleElements().length === 0
    el.classList.toggle('visible', isEmpty)
  }

  /**
   * @returns {void}
   */
  afterClear (win) {
    this.updateCanvasWatermark()
    this.svgCanvas.runExtensions('afterClear')
  }

  /**
   * @returns {void}
   */
  beforeClear (win) {
    this.svgCanvas.runExtensions('beforeClear')
  }

  /**
   * @returns {void}
   */
  zoomDone () {
    for (const el of this.svgCanvas.selectedElements) {
      this.svgCanvas.selectorManager.requestSelector(el).resize()
    }
    this.updateWireFrame()
  }

  /**
   * @typedef {PlainObject} module:SVGthis.BBoxObjectWithFactor (like `DOMRect`)
   * @property {Float} x
   * @property {Float} y
   * @property {Float} width
   * @property {Float} height
   * @property {Float} [factor] Needed if width or height are 0
   * @property {Float} [zoom]
   * @see module:svgcanvas.SvgCanvas#event:zoomed
   */

  /**
   * @function module:svgcanvas.SvgCanvas#zoomChanged
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:zoomed} bbox
   * @param {boolean} autoCenter
   * @listens module:svgcanvas.SvgCanvas#event:zoomed
   * @fires module:svgcanvas.SvgCanvas#event:ext_zoomChanged
   * @returns {void}
   */
  zoomChanged (win, bbox, autoCenter) {
    const { $id } = this // container-scoped lookup (see EditorStartup constructor)
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
      this.changeZoom(0.1)
      return
    }

    $id('zoom').value = (this.svgCanvas.getZoom() * 100).toFixed(1)

    if (autoCenter) {
      this.updateCanvas()
    } else {
      this.updateCanvas(false, {
        x: bb.x * zoomlevel + (bb.width * zoomlevel) / 2,
        y: bb.y * zoomlevel + (bb.height * zoomlevel) / 2
      })
    }

    if (this.svgCanvas.getMode() === 'zoom' && bb.width) {
      // Go to select if a zoom box was drawn
      this.leftPanel.clickSelect()
    }

    this.zoomDone()

    this.svgCanvas.runExtensions(
      'zoomChanged',
      /** @type {module:svgcanvas.SvgCanvas#event:ext_zoomChanged} */ this.svgCanvas.getZoom()
    )
  }

  /**
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:contextset} context
   * @listens module:svgcanvas.SvgCanvas#event:contextset
   * @returns {void}
   */
  contextChanged (win, context) {
    const { $id } = this // container-scoped lookup (see EditorStartup constructor)
    let linkStr = ''
    if (context) {
      let str = ''
      linkStr =
        '<a href="#" data-root="y">' +
        this.svgCanvas.getCurrentDrawing().getCurrentLayerName() +
        '</a>'
      const parentsUntil = getParentsUntil(context, '#svgcontent')
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
    $id('cur_context_panel').style.display = 'none'
    $id('cur_context_panel').innerHTML = linkStr
  }

  /**
   * @function module:SVGEditor.setIcon
   * @param {string|Element|external:jQuery} elem
   * @param {string|external:jQuery} iconId
   * @returns {void}
   */
  setIcon (elem, iconId) {
    const { $id } = this // container-scoped lookup (see EditorStartup constructor)
    const img = document.createElement('img')
    img.src = this.configObj.curConfig.imgPath + iconId
    const icon = typeof iconId === 'string' ? img : iconId.cloneNode(true)
    if (!icon) {
      // Todo: Investigate why this still occurs in some cases
      console.warn('NOTE: Icon image missing: ' + iconId)
      return
    }
    // empty()
    while ($id(elem).firstChild) {
      $id(elem).removeChild($id(elem).firstChild)
    }
    $id(elem).appendChild(icon)
  }

  /**
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:extension_added} ext
   * @listens module:svgcanvas.SvgCanvas#event:extension_added
   * @returns {Promise<void>|void} Resolves to `undefined`
   */
  async extAdded (win, ext) {
    if (!ext) {
      return undefined
    }
    let cbCalled = false

    /**
     *
     * @returns {void}
     */
    const runCallback = () => {
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

  /**
   * @param {Float} multiplier
   * @returns {void}
   */
  zoomImage (multiplier) {
    const { $id } = this // container-scoped lookup (see EditorStartup constructor)
    const resolution = this.svgCanvas.getResolution()
    multiplier = multiplier ? resolution.zoom * multiplier : 1
    // setResolution(res.w * multiplier, res.h * multiplier, true);
    $id('zoom').value = (multiplier * 100).toFixed(1)
    this.svgCanvas.setCurrentZoom(multiplier)
    this.zoomDone()
    this.updateCanvas(true)
  }

  /**
   *
   * @returns {void}
   */
  cutSelected () {
    if (this.selectedElement || this.multiselected) {
      this.svgCanvas.cutSelectedElements()
    }
  }

  /**
   * @function copySelected
   * @returns {void}
   */
  copySelected () {
    if (this.selectedElement || this.multiselected) {
      this.svgCanvas.copySelectedElements()
    }
  }

  /**
   *
   * @returns {void}
   */
  pasteInCenter () {
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
    this.svgCanvas.pasteElements('point', x, y)
  }

  /**
   * @param {"Up"|"Down"} dir
   * @returns {void}
   */
  moveUpDownSelected (dir) {
    if (this.selectedElement) {
      this.svgCanvas.moveUpDownSelected(dir)
    }
  }

  /**
   * @param {Float} dx
   * @param {Float} dy
   * @returns {void}
   */
  moveSelected (dx, dy) {
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

  /**
   *
   * @returns {void}
   */
  selectNext () {
    this.svgCanvas.cycleElement(1)
  }

  /**
   *
   * @returns {void}
   */
  selectPrev () {
    this.svgCanvas.cycleElement(0)
  }

  /**
   * @param {0|1} cw
   * @param {Integer} step
   * @returns {void}
   */
  rotateSelected (cw, step) {
    const { $id } = this // container-scoped lookup (see EditorStartup constructor)
    if (!this.selectedElement || this.multiselected) {
      return
    }
    if (!cw) {
      step *= -1
    }
    const angle = Number.parseFloat($id('angle').value) + step
    this.svgCanvas.setRotationAngle(angle)
    this.topPanel.updateContextPanel()
  }

  /**
   *
   * @returns {void}
   */
  hideSourceEditor () {
    const { $id } = this // container-scoped lookup (see EditorStartup constructor)
    const $editorDialog = $id('se-svg-editor-dialog')
    $editorDialog.setAttribute('dialog', 'closed')
  }

  /**
   * @param {Event} e
   * @returns {void} Resolves to `undefined`
   */
  async saveSourceEditor (e) {
    const { $id } = this // container-scoped lookup (see EditorStartup constructor)
    const $editorDialog = $id('se-svg-editor-dialog')
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
      if (ok === false || ok === 'Cancel') {
        return
      }
      saveChanges()
      return
    }
    saveChanges()
    this.leftPanel.clickSelect()
  }

  /**
   * @param {Event} e
   * @returns {void} Resolves to `undefined`
   */
  cancelOverlays (e) {
    const { $id } = this // container-scoped lookup (see EditorStartup constructor)
    if ($id('dialog_box') != null) $id('dialog_box').style.display = 'none'
    const $editorDialog = $id('se-svg-editor-dialog')
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
        const ok = seConfirm(
          this.i18next.t('notification.QignoreSourceChanges')
        )
        if (ok) {
          this.hideSourceEditor()
        }
      } else {
        this.hideSourceEditor()
      }
    }
  }

  /**
   * @returns {void}
   */
  toggleDynamicOutput (e) {
    this.configObj.curConfig.dynamicOutput = e.detail.dynamic
    this.svgCanvas.setConfig(this.configObj.curConfig)
    const $editorDialog = this.$id('se-svg-editor-dialog') // container-scoped (see EditorStartup constructor)
    const origSource = this.svgCanvas.getSvgString()
    $editorDialog.setAttribute('dialog', 'open')
    $editorDialog.setAttribute('value', origSource)
  }

  /**
   * @returns {void}
   */
  enableOrDisableClipboard () {
    let svgeditClipboard
    try {
      svgeditClipboard = this.localStorage.getItem('svgedit_clipboard')
    } catch (err) {
      /* empty fn */
    }
    this.canvMenu.setAttribute(
      (svgeditClipboard ? 'en' : 'dis') + 'ablemenuitems',
      '#paste,#paste_in_place'
    )
  }

  /**
   * @function module:SVGthis.openPrep
   * @returns {boolean|Promise<boolean>} Resolves to boolean indicating `true` if there were no changes
   *  and `false` after the user confirms.
   */
  async openPrep () {
    if (this.svgCanvas.undoMgr.getUndoStackSize() === 0) {
      return true
    }
    return await seConfirm(this.i18next.t('notification.QwantToOpen'))
  }

  /**
   *
   * @param {Event} e
   * @returns {void}
   */
  onDragEnter (e) {
    e.stopPropagation()
    e.preventDefault()
    // and indicator should be displayed here, such as "drop files here"
  }

  /**
   *
   * @param {Event} e
   * @returns {void}
   */
  onDragOver (e) {
    e.stopPropagation()
    e.preventDefault()
  }

  /**
   *
   * @param {Event} e
   * @returns {void}
   */
  onDragLeave (e) {
    e.stopPropagation()
    e.preventDefault()
    // hypothetical indicator should be removed here
  }

  /**
   * @function module:SVGthis.setLang
   * @param {string} lang The language code
   * @param {module:locale.LocaleStrings} allStrings See {@tutorial LocaleDocs}
   * @fires module:svgcanvas.SvgCanvas#event:ext_langReady
   * @fires module:svgcanvas.SvgCanvas#event:ext_langChanged
   * @returns {void} A Promise which resolves to `undefined`
   */
  setLang (lang) {
    const { $id } = this // container-scoped lookup (see EditorStartup constructor)
    this.langChanged = true
    this.configObj.pref('lang', lang)
    const $editDialog = $id('se-edit-prefs')
    $editDialog.setAttribute('lang', lang)
    const oldLayerName = $id('#layerlist')
      ? $id('#layerlist').querySelector('tr.layersel td.layername').textContent
      : ''
    const renameLayer =
      oldLayerName === this.i18next.t('notification.common.layer') + ' 1'

    this.setTitles()

    if (renameLayer) {
      this.svgCanvas.renameCurrentLayer(
        this.i18next.t('notification.common.layer') + ' 1'
      )
      this.rightPanel.populateLayers()
    }

    this.svgCanvas.runExtensions(
      'langChanged',
      /** @type {module:svgcanvas.SvgCanvas#event:ext_langChanged} */ lang
    )
  }

  /**
   * @callback module:SVGthis.ReadyCallback
   * @returns {Promise<void>|void}
   */
  /**
   * Queues a callback to be invoked when the editor is ready (or
   *   to be invoked immediately if it is already ready--i.e.,
   *   if `runCallbacks` has been run).
   * @function module:SVGthis.ready
   * @param {module:SVGthis.ReadyCallback} cb Callback to be queued to invoke
   * @returns {Promise<ArbitraryCallbackResult>} Resolves when all callbacks, including the supplied have resolved
   */
  ready (cb) {
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
   * @returns {Promise<void>} Resolves to `undefined` if all callbacks succeeded and rejects otherwise
   */
  async runCallbacks () {
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
   * @param {string} str The SVG string to load
   * @param {PlainObject} [opts={}]
   * @param {boolean} [opts.noAlert=false] Option to avoid alert to user and instead get rejected promise
   * @returns {Promise<void>}
   */
  loadFromString (str, { noAlert } = {}) {
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
   * @callback module:SVGthis.URLLoadCallback
   * @param {boolean} success
   * @returns {void}
   */
  /**
   * @function module:SVGthis.loadFromURL
   * @param {string} url URL from which to load an SVG string via Ajax
   * @param {PlainObject} [opts={}] May contain properties: `cache`, `callback`
   * @param {boolean} [opts.cache]
   * @param {boolean} [opts.noAlert]
   * @returns {Promise<void>} Resolves to `undefined` or rejects upon bad loading of
   *   the SVG (or upon failure to parse the loaded string) when `noAlert` is
   *   enabled
   */
  loadFromURL (url, { cache, noAlert } = {}) {
    return this.ready(() => {
      return new Promise((resolve, reject) => {
        fetch(url, { cache: cache ? 'force-cache' : 'no-cache' })
          .then((response) => {
            if (!response.ok) {
              if (noAlert) {
                reject(new Error('URLLoadFail'))
                return
              }
              seAlert(this.i18next.t('notification.URLLoadFail'))
              resolve()
            }
            return response.text()
          })
          .then((str) => {
            this.loadSvgString(str, { noAlert })
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
      })
    })
  }

  /**
   * @function module:SVGthis.loadFromDataURI
   * @param {string} str The Data URI to base64-decode (if relevant) and load
   * @param {PlainObject} [opts={}]
   * @param {boolean} [opts.noAlert]
   * @returns {Promise<void>} Resolves to `undefined` and rejects if loading SVG string fails and `noAlert` is enabled
   */
  loadFromDataURI (str, { noAlert } = {}) {
    return this.ready(() => {
      let base64 = false
      let pre = str.match(/^data:image\/svg\+xml;base64,/)
      if (pre) {
        base64 = true
      } else {
        pre = str.match(/^data:image\/svg\+xml(?:;|;utf8)?,/)
      }
      if (pre) {
        pre = pre[0]
      }
      const src = str.slice(pre.length)
      return this.loadSvgString(
        base64 ? decode64(src) : decodeURIComponent(src),
        { noAlert }
      )
    })
  }

  /**
   * @function module:SVGthis.addExtension
   * @param {string} name Used internally; no need for i18n.
   * @param {module:svgcanvas.ExtensionInitCallback} initfn Config to be invoked on this module
   * @param {module:svgcanvas.ExtensionInitArgs} initArgs
   * @throws {Error} If called too early
   * @returns {Promise<void>} Resolves to `undefined`
   */
  addExtension (name, initfn, initArgs) {
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
   *
   * Intended for hosts that back the palette and shape library with a shared
   * store across multiple open editor instances: after one instance writes,
   * the host calls `reloadUserData()` on every OTHER open instance so they
   * drop their stale in-memory copy and re-render. Resolves both components
   * through this instance's own DOM root (`this.$svgEditor`), never a
   * document-wide query, so it can't refresh a sibling instance. Safely
   * no-ops when a component isn't mounted.
   * @function module:SVGEditor.reloadUserData
   * @returns {void}
   */
  reloadUserData () {
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
