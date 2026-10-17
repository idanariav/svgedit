// BottomPanel.js — Color-picker handlers + zoom/stroke/opacity handler methods (listeners bound in TopPanel)
import Paint from '@svgedit/svgcanvas/core/paint.ts'
import BottomPanelHtml from './BottomPanel.html'
import { collectDocumentColors } from '../documentColors.js'

/*
 * register actions for left panel
 */
class BottomPanel {
  /**
   * @param {EditorInstance} editor svgedit handler
   */
  constructor (editor) {
    this.editor = editor
  }

  get selectedElement () {
    return this.editor.selectedElement
  }

  get multiselected () {
    return this.editor.multiselected
  }

  /** @param {Event} e */
  changeStrokeWidth (e) {
    /** @type {*} */
    let val = /** @type {HTMLInputElement} */ (e.target).value
    if (
      val === 0 &&
      this.editor.selectedElement &&
      ['line', 'polyline'].includes(this.editor.selectedElement.nodeName)
    ) {
      val = 1
    }
    this.editor.svgCanvas.setStrokeWidth(val)
  }

  /** @param {string|number} value */
  changeZoom (value) {
    switch (value) {
      case 'canvas':
      case 'selection':
      case 'layer':
      case 'content':
        this.editor.zoomChanged(window, value)
        break
      default: {
        const newZoom = Number(value) > 0.1 ? Number(value) * 0.01 : 0.1
        const zoom = this.editor.svgCanvas.getZoom()
        if (this.editor.svgCanvas.getMode() === 'pathedit') {
          // In pathedit mode, use zoomImage to update path points correctly.
          this.editor.zoomImage(newZoom / zoom)
        } else {
          const { workarea } = this.editor
          // Use helper function to compute center only once.
          const center = getWorkareaCenter(workarea, zoom)
          this.editor.zoomChanged(
            window,
            {
              width: 0,
              height: 0,
              x: center.x,
              y: center.y,
              zoom: newZoom
            },
            true
          )
        }
      }
    }
  }

  /**
   * @fires module:svgcanvas.SvgCanvas#event:ext_toolButtonStateUpdate
   * @returns {void}
   */
  updateToolButtonState () {
    const { $req } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const bNoFill = this.editor.svgCanvas.getColor('fill') === 'none'
    const bNoStroke = this.editor.svgCanvas.getColor('stroke') === 'none'
    const buttonsNeedingStroke = ['tool_fhpath', 'tool_line']
    const buttonsNeedingFillAndStroke = [
      'tools_shapes',
      'tool_text',
      'tool_path'
    ]

    if (bNoStroke) {
      buttonsNeedingStroke.forEach(btn => {
        // if btn is pressed, change to select button
        if (/** @type {*} */ ($req(btn)).pressed) {
          this.editor.leftPanel.clickSelect()
        }
        /** @type {*} */ ($req(btn)).disabled = true
      })
    } else {
      buttonsNeedingStroke.forEach(btn => {
        /** @type {*} */ ($req(btn)).disabled = false
      })
    }
    if (bNoStroke && bNoFill) {
      buttonsNeedingFillAndStroke.forEach(btn => {
        // if btn is pressed, change to select button
        if (/** @type {*} */ ($req(btn)).pressed) {
          this.editor.leftPanel.clickSelect()
        }
        /** @type {*} */ ($req(btn)).disabled = true
      })
    } else {
      buttonsNeedingFillAndStroke.forEach(btn => {
        /** @type {*} */ ($req(btn)).disabled = false
      })
    }
    this.editor.svgCanvas.runExtensions(
      'toolButtonStateUpdate',
      /** @type {module:svgcanvas.SvgCanvas#event:ext_toolButtonStateUpdate} */ {
        nofill: bNoFill,
        nostroke: bNoStroke
      }
    )
  }

  /**
   * @param {string} type
   * @param {Event} evt
   */
  handleColorPicker (type, evt) {
    const { paint } = /** @type {CustomEvent} */ (evt).detail
    this.editor.svgCanvas.setPaint(type, paint)
    this.updateToolButtonState()
  }

  /** @param {Event} evt */
  handleBgColorPicker (evt) {
    const { paint } = /** @type {CustomEvent} */ (evt).detail
    if (paint.type === 'solidColor') {
      const color = paint.solidColor === 'none' ? 'none' : '#' + paint.solidColor
      this.editor.commands.tryRun('canvas_set_background', { color }, 'bg-picker')
    } else if (paint.type === 'linearGradient' || paint.type === 'radialGradient') {
      this.editor.setBackground('gradient', '', paint[paint.type], true)
    }
  }

  /**
   * @param {string} type
   * @param {Event} evt
   */
  handleStrokeAttr (type, evt) {
    // A fitted dash takes the new pattern as the one to fit.
    const { value } = /** @type {CustomEvent} */ (evt).detail
    if (type === 'stroke-dasharray' && this.editor.svgCanvas.setDashPattern(value)) return
    this.editor.svgCanvas.setStrokeAttr(type, value)
  }

  /**
* @param {Event} evt
*/
  handleOpacity (evt) {
    const val = Number.parseInt(/** @type {HTMLInputElement} */ (evt.currentTarget).value.split('%')[0])
    this.editor.svgCanvas.setOpacity(val / 100)
  }

  /** @param {Event} e */
  handlePalette (e) {
    const { $req } = this.editor // container-scoped lookups (see EditorStartup constructor)
    e.preventDefault()
    // `picker` is the destination chosen by the palette (Alt/Shift-click = stroke).
    const { picker, color, paint: incomingPaint } = /** @type {CustomEvent} */ (e).detail
    // Gradient swatches dispatch a ready-made Paint instead of a color string.
    if (incomingPaint) {
      if (picker === 'background') {
        $req('bg_color').setPaint(incomingPaint)
        if (incomingPaint.type === 'linearGradient' || incomingPaint.type === 'radialGradient') {
          this.editor.setBackground('gradient', '', incomingPaint[incomingPaint.type], true)
        }
        return
      }
      $req(picker === 'fill' ? 'fill_color' : 'stroke_color').setPaint(incomingPaint)
      this.editor.svgCanvas.setPaint(picker, incomingPaint)
      this.updateToolButtonState()
      return
    }
    // Webkit-based browsers returned 'initial' here for no stroke
    const paint =
      color === 'none'
        ? new Paint()
        : new Paint({ alpha: 100, solidColor: color.substr(1) })
    if (picker === 'background') {
      $req('bg_color').setPaint(paint)
      this.editor.commands.tryRun('canvas_set_background', { color }, 'palette')
      return
    }
    if (picker === 'fill') {
      $req('fill_color').setPaint(paint)
    } else {
      $req('stroke_color').setPaint(paint)
    }
    this.editor.svgCanvas.setColor(picker, color)
    this.updateToolButtonState()
  }

  init () {
    const { $id, $req } = this.editor // container-scoped lookups (see EditorStartup constructor)
    // register actions for Bottom panel
    const template = document.createElement('template')
    const { i18next } = this.editor

    template.innerHTML = BottomPanelHtml
    this.editor.$svgEditor.append(template.content.cloneNode(true))
    $req('palette').addEventListener('change', this.handlePalette.bind(this))
    $req('palette').init(i18next)
    // "Colors in this drawing" row: refresh (coalesced to one scan per frame) whenever
    // the drawing, the selection or the loaded document changes.
    let docColorsQueued = false
    const refreshDocColors = () => {
      if (docColorsQueued) return
      docColorsQueued = true
      requestAnimationFrame(() => {
        docColorsQueued = false
        $id('palette')?.setDocumentColors?.(collectDocumentColors(this.editor.svgCanvas.getSvgContent()))
      })
    }
    ;['changed', 'elementInserted', 'selected', 'updateCanvas'].forEach(ev =>
      this.editor.svgCanvas.bind(ev, refreshDocColors))
    const { curConfig } = this.editor.configObj
    $req('fill_color').setPaint(
      new Paint({ alpha: 100, solidColor: curConfig.initFill.color })
    )
    $req('stroke_color').setPaint(
      new Paint({
        alpha: 100,
        solidColor: curConfig.initStroke.color
      })
    )
    $req('stroke_color').addEventListener('change', evt =>
      this.handleColorPicker.bind(this)('stroke', evt)
    )
    $req('fill_color').addEventListener('change', evt =>
      this.handleColorPicker.bind(this)('fill', evt)
    )
    // NOTE: zoom, stroke_width/style/linejoin/linecap and opacity now live in the
    // top bar / right panel. Their `change` listeners are bound in TopPanel.init()
    // (the last panel to initialise) so the elements exist by then; they still call
    // back into these BottomPanel handlers.
    $req('fill_color').init(i18next)
    $req('stroke_color').init(i18next)
    $req('bg_color').init(i18next)
    // Initialize background color picker from saved preference
    const initBgColor = this.editor.configObj.curPrefs.bkgd_color || '#ffffff'
    $req('bg_color').setPaint(
      new Paint({ alpha: 100, solidColor: initBgColor.replace('#', '') })
    )
    $req('bg_color').addEventListener('change', (evt) => {
      this.handleBgColorPicker(evt)
    })
  }

  /**
   * @param {boolean} [apply]
   */
  updateColorpickers (apply) {
    const { $req } = this.editor // container-scoped lookups (see EditorStartup constructor)
    $req('fill_color').update(
      this.editor.svgCanvas,
      this.editor.selectedElement,
      apply
    )
    $req('stroke_color').update(
      this.editor.svgCanvas,
      this.editor.selectedElement,
      apply
    )
  }
}

// Helper function to get the center of the workarea
const getWorkareaCenter = (/** @type {Element} */ workarea, /** @type {number} */ zoom) => {
  const width = parseFloat(getComputedStyle(workarea).width.replace('px', ''))
  const height = parseFloat(getComputedStyle(workarea).height.replace('px', ''))
  return {
    x: (workarea.scrollLeft + width / 2) / zoom,
    y: (workarea.scrollTop + height / 2) / zoom
  }
}

export default BottomPanel
