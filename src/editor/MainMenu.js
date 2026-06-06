/* globals seAlert */
import SvgCanvas from '@svgedit/svgcanvas'
import { isChrome } from '@svgedit/svgcanvas/common/browser.js'
import { applyUiMode } from './uiMode.js'

const { $id, $click } = SvgCanvas

/**
 *
 */
class MainMenu {
  /**
   * @param {PlainObject} editor svgedit handler
   */
  constructor (editor) {
    this.editor = editor
    /**
     * @type {Integer}
     */
    this.editor.exportWindowCt = 0
  }

  /**
   * Toggle the touch-first tablet shell on/off and persist the choice.
   * @returns {void}
   */
  clickTabletMode () {
    const on = !this.editor.configObj.pref('tabletMode')
    this.editor.configObj.pref('tabletMode', on, true)
    applyUiMode(on, this.editor.$svgEditor)
  }

  /**
   *
   * @returns {void}
   */
  hidePreferences () {
    const $editDialog = $id('se-edit-prefs')
    $editDialog.setAttribute('dialog', 'close')
    this.editor.configObj.preferences = false
  }

  /**
   * Save user preferences based on current values in the UI.
   * @param {Event} e
   * @function module:SVGthis.savePreferences
   * @returns {Promise<void>}
   */
  async savePreferences (e) {
    const {
      lang,
      showrulers,
      baseunit
    } = e.detail

    // set language
    if (lang && lang !== this.editor.configObj.pref('lang')) {
      this.editor.configObj.pref('lang', lang)
      seAlert('Changing the language needs reload')
    }

    // set ruler / unit settings (grid settings live in the grid-settings popover)
    this.editor.configObj.curConfig.showRulers = showrulers
    if (this.editor.configObj.curConfig.showRulers) {
      this.editor.rulers.updateRulers()
    }
    this.editor.configObj.curConfig.baseUnit = baseunit
    this.editor.svgCanvas.setConfig(this.editor.configObj.curConfig)
    this.editor.updateCanvas()
    this.hidePreferences()
  }

  /**
   *
   * @param e
   * @returns {Promise<void>} Resolves to `undefined`
   */
  async clickExport (e) {
    if (e?.detail?.trigger !== 'ok' || e?.detail?.imgType === undefined) {
      return
    }
    const imgType = e?.detail?.imgType
    const quality = e?.detail?.quality ? e?.detail?.quality / 100 : 1
    const includeBg = e?.detail?.includeBg ?? false
    const crop = this.resolveFrameCrop(e?.detail?.frameId)
    // Open placeholder window (prevents popup)
    let exportWindowName

    /**
     *
     * @returns {void}
     */
    const openExportWindow = () => {
      if (this.editor.configObj.curConfig.exportWindowType === 'new') {
        this.editor.exportWindowCt++
      }
      this.editor.exportWindowName =
        this.editor.configObj.curConfig.canvasName + this.editor.exportWindowCt
    }
    const chrome = isChrome()
    if (imgType === 'PDF') {
      if (!this.editor.customExportPDF && !chrome) {
        openExportWindow()
      }
      this.editor.svgCanvas.exportPDF(exportWindowName, undefined, crop)
    } else {
      if (!this.editor.customExportImage) {
        openExportWindow()
      }
      const bkgdColor = this.editor.configObj.curPrefs.bkgd_color
      /* const results = */ await this.editor.svgCanvas.rasterExport(
        imgType,
        quality,
        this.editor.exportWindowName,
        { includeBg, bgcolor: bkgdColor, crop }
      )
    }
  }

  /**
   * Resolve an export region picker value to a crop box in viewBox/user-space
   * coordinates. Frames are `[data-frame]` rects whose x/y/width/height
   * attributes are authoritative (svgedit bakes transforms into them on edit);
   * `getBBox()` is used as a fallback.
   * @param {string} [frameId] - The selected frame's element id, or '' for the whole canvas.
   * @returns {?{x: number, y: number, w: number, h: number}} The crop box, or null for the whole canvas.
   */
  resolveFrameCrop (frameId) {
    if (!frameId) return null
    const content = this.editor.svgCanvas.getSvgContent()
    const frame = content?.querySelector(`#${CSS.escape(frameId)}`)
    if (!frame) return null
    const num = (attr) => Number(frame.getAttribute(attr))
    let x = num('x')
    let y = num('y')
    let w = num('width')
    let h = num('height')
    if (!w || !h) {
      const bb = frame.getBBox()
      x = bb.x; y = bb.y; w = bb.width; h = bb.height
    }
    return { x, y, w, h }
  }

  /**
   *
   * @returns {void}
   */
  showPreferences () {
    if (this.editor.configObj.preferences) {
      return
    }
    this.editor.configObj.preferences = true
    const $editDialog = $id('se-edit-prefs')
    $editDialog.setAttribute('dialog', 'open')
  }

  /**
   * @type {module}
   */
  init () {
    // add Top panel
    const template = document.createElement('template')
    template.innerHTML = `
    <se-menu id="main_button" label="SVG-Edit" src="logo.svg" alt="logo">
        <se-menu-item id="tool_export" label="tools.export_img" src="export.svg"></se-menu-item>
        <se-menu-item id="tool_tablet_mode" label="tools.tablet_mode" src="tablet.svg"></se-menu-item>
        <se-menu-item id="tool_editor_prefs" label="config.editor_prefs" src="editPref.svg"></se-menu-item>
    </se-menu>`
    this.editor.$svgEditor.append(template.content.cloneNode(true))

    // register action to main menu entries
    /**
     * Associate all button actions as well as non-button keyboard shortcuts.
     */
    $click($id('tool_export'), function () {
      document
        .getElementById('se-export-dialog')
        .setAttribute('dialog', 'open')
    })
    $id('se-export-dialog').addEventListener(
      'change',
      this.clickExport.bind(this)
    )
    $click($id('tool_tablet_mode'), this.clickTabletMode.bind(this))
    $id('tool_editor_prefs').addEventListener(
      'click',
      this.showPreferences.bind(this)
    )
    $id('se-edit-prefs').addEventListener(
      'change',
      function (e) {
        if (e.detail.dialog === 'closed') {
          this.hidePreferences()
        } else {
          this.savePreferences(e)
        }
      }.bind(this)
    )
  }
}

export default MainMenu
