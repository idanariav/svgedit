import SvgCanvas from '@svgedit/svgcanvas'
import Paint from '@svgedit/svgcanvas/core/paint.js'
import BottomPanelHtml from './BottomPanel.html'

const { $id } = SvgCanvas

/*
 * register actions for left panel
 */
/**
 * @type {module}
 */
class BottomPanel {
  /**
   * @param {PlainObject} editor svgedit handler
   */
  constructor (editor) {
    this.editor = editor
  }

  /**
   * @type {module}
   */
  get selectedElement () {
    return this.editor.selectedElement
  }

  /**
   * @type {module}
   */
  get multiselected () {
    return this.editor.multiselected
  }

  /**
   * @type {module}
   */
  changeStrokeWidth (e) {
    let val = e.target.value
    if (
      val === 0 &&
      this.editor.selectedElement &&
      ['line', 'polyline'].includes(this.editor.selectedElement.nodeName)
    ) {
      val = 1
    }
    this.editor.svgCanvas.setStrokeWidth(val)
  }

  /**
   * @type {module}
   */
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
    const bNoFill = this.editor.svgCanvas.getColor('fill') === 'none'
    const bNoStroke = this.editor.svgCanvas.getColor('stroke') === 'none'
    const buttonsNeedingStroke = ['tool_fhpath', 'tool_line']
    const buttonsNeedingFillAndStroke = [
      'tools_rect',
      'tools_ellipse',
      'tool_text',
      'tool_path'
    ]

    if (bNoStroke) {
      buttonsNeedingStroke.forEach(btn => {
        // if btn is pressed, change to select button
        if ($id(btn).pressed) {
          this.editor.leftPanel.clickSelect()
        }
        $id(btn).disabled = true
      })
    } else {
      buttonsNeedingStroke.forEach(btn => {
        $id(btn).disabled = false
      })
    }
    if (bNoStroke && bNoFill) {
      buttonsNeedingFillAndStroke.forEach(btn => {
        // if btn is pressed, change to select button
        if ($id(btn).pressed) {
          this.editor.leftPanel.clickSelect()
        }
        $id(btn).disabled = true
      })
    } else {
      buttonsNeedingFillAndStroke.forEach(btn => {
        $id(btn).disabled = false
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
   * @type {module}
   */
  handleColorPicker (type, evt) {
    const { paint } = evt.detail
    this.editor.svgCanvas.setPaint(type, paint)
    this.updateToolButtonState()
  }

  /**
   * @type {module}
   */
  handleBgColorPicker (evt) {
    const { paint } = evt.detail
    if (paint.type === 'solidColor') {
      const color = paint.solidColor === 'none' ? 'none' : '#' + paint.solidColor
      this.editor.setBackground(color, '')
    } else if (paint.type === 'linearGradient' || paint.type === 'radialGradient') {
      this.editor.setBackground('gradient', '', paint[paint.type])
    }
  }

  /**
   * @type {module}
   */
  handleStrokeAttr (type, evt) {
    this.editor.svgCanvas.setStrokeAttr(type, evt.detail.value)
  }

  /**
   * @type {module}
   */
  handleOpacity (evt) {
    const val = Number.parseInt(evt.currentTarget.value.split('%')[0])
    this.editor.svgCanvas.setOpacity(val / 100)
  }

  /**
   * @type {module}
   */
  handlePalette (e) {
    e.preventDefault()
    // shift key or right click for stroke
    const { picker, color } = e.detail
    // Webkit-based browsers returned 'initial' here for no stroke
    const paint =
      color === 'none'
        ? new Paint()
        : new Paint({ alpha: 100, solidColor: color.substr(1) })
    if (picker === 'fill') {
      $id('fill_color').setPaint(paint)
    } else {
      $id('stroke_color').setPaint(paint)
    }
    this.editor.svgCanvas.setColor(picker, color)
    if (
      color !== 'none' &&
      this.editor.svgCanvas.getPaintOpacity(picker) !== 1
    ) {
      this.editor.svgCanvas.setPaintOpacity(picker, 1.0)
    }
    this.updateToolButtonState()
  }

  /**
   * @type {module}
   */
  init () {
    // register actions for Bottom panel
    const template = document.createElement('template')
    const { i18next } = this.editor

    template.innerHTML = BottomPanelHtml
    this.editor.$svgEditor.append(template.content.cloneNode(true))
    $id('palette').addEventListener('change', this.handlePalette.bind(this))
    $id('palette').init(i18next)
    const { curConfig } = this.editor.configObj
    $id('fill_color').setPaint(
      new Paint({ alpha: 100, solidColor: curConfig.initFill.color })
    )
    $id('stroke_color').setPaint(
      new Paint({
        alpha: 100,
        solidColor: curConfig.initStroke.color
      })
    )
    $id('stroke_color').addEventListener('change', evt =>
      this.handleColorPicker.bind(this)('stroke', evt)
    )
    $id('fill_color').addEventListener('change', evt =>
      this.handleColorPicker.bind(this)('fill', evt)
    )
    // NOTE: zoom, stroke_width/style/linejoin/linecap and opacity now live in the
    // top bar / right panel. Their `change` listeners are bound in TopPanel.init()
    // (the last panel to initialise) so the elements exist by then; they still call
    // back into these BottomPanel handlers.
    $id('fill_color').init(i18next)
    $id('stroke_color').init(i18next)
    $id('bg_color').init(i18next)
    // Initialize background color picker from saved preference
    const initBgColor = this.editor.configObj.curPrefs.bkgd_color || '#ffffff'
    $id('bg_color').setPaint(
      new Paint({ alpha: 100, solidColor: initBgColor.replace('#', '') })
    )
    $id('bg_color').addEventListener('change', (evt) => {
      this.handleBgColorPicker(evt)
    })
  }

  /**
   * @type {module}
   */
  updateColorpickers (apply) {
    $id('fill_color').update(
      this.editor.svgCanvas,
      this.editor.selectedElement,
      apply
    )
    $id('stroke_color').update(
      this.editor.svgCanvas,
      this.editor.selectedElement,
      apply
    )
  }
}

// Helper function to get the center of the workarea
const getWorkareaCenter = (workarea, zoom) => {
  const width = parseFloat(getComputedStyle(workarea).width.replace('px', ''))
  const height = parseFloat(getComputedStyle(workarea).height.replace('px', ''))
  return {
    x: (workarea.scrollLeft + width / 2) / zoom,
    y: (workarea.scrollTop + height / 2) / zoom
  }
}

export default BottomPanel
