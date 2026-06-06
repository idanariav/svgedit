/**
 * @file ext-cutter.js
 *
 * Cutter (knife) tool — drag a straight line over shapes to split them.
 *
 * Behaviour mirrors Illustrator's knife tool:
 *   • If shapes are selected, only those shapes are cut.
 *   • If nothing is selected, every shape in the current layer that the
 *     cut line crosses is split.
 *
 * The dashed red preview line is drawn inside svgcontent (canvas coordinate
 * space) and removed on mouseUp — it is never added to undo history.
 *
 * @license MIT
 */

const name = 'cutter'

const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  // Locale files are inlined into the bundle (statically resolved glob).
  const locales = import.meta.glob('./locale/*.js', { eager: true })
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { $id, $click } = svgCanvas

    await loadExtensionTranslation(svgEditor)

    // ── Drag state ──────────────────────────────────────────────────────────
    let started = false
    let startX = 0
    let startY = 0
    /** @type {SVGLineElement|null} */
    let previewLine = null

    // ── Preview line helpers ─────────────────────────────────────────────────

    /**
     * Append a dashed red guide line directly to svgcontent so its coordinates
     * match canvas space. It is removed on mouseup without touching history.
     */
    const createPreviewLine = (x1, y1) => {
      const svgNS = 'http://www.w3.org/2000/svg'
      const line = document.createElementNS(svgNS, 'line')
      line.setAttribute('x1', x1)
      line.setAttribute('y1', y1)
      line.setAttribute('x2', x1)
      line.setAttribute('y2', y1)
      line.setAttribute('stroke', '#e00')
      line.setAttribute('stroke-width', String(1.5 / svgCanvas.getZoom()))
      line.setAttribute('stroke-dasharray', `${6 / svgCanvas.getZoom()},${4 / svgCanvas.getZoom()}`)
      line.setAttribute('opacity', '0.85')
      line.setAttribute('pointer-events', 'none')
      line.setAttribute('id', 'cutter_preview_line')
      // Append to svgcontent (not a layer) — uses canvas coordinates.
      // Elements outside layer <g>s are not included in normal SVG exports.
      svgCanvas.getSvgContent().appendChild(line)
      previewLine = line
    }

    const removePreviewLine = () => {
      previewLine?.remove()
      previewLine = null
    }

    // ── Extension object ─────────────────────────────────────────────────────

    return {
      name: svgEditor.i18next.t(`${name}:name`),

      /**
       * Inject the toolbar button into the left panel.
       */
      callback () {
        const title = `${name}:buttons.0.title`
        svgCanvas.insertChildAtIndex(
          $id('tools_left'),
          `<se-button id="tool_cutter" title="${title}" src="cutter.svg"></se-button>`,
          11
        )

        $click($id('tool_cutter'), () => {
          if (this.leftPanel.updateLeftPanel('tool_cutter')) {
            svgCanvas.setMode('cutter')
          }
        })
      },

      mouseDown (opts) {
        if (svgCanvas.getMode() !== 'cutter') return undefined

        // mouseDown opts use start_x/start_y (already in canvas coords).
        // mouseMove/mouseUp use mouse_x/mouse_y (screen-pixel coords, need /zoom).
        startX = opts.start_x
        startY = opts.start_y

        createPreviewLine(startX, startY)
        started = true
        return { started: true }
      },

      mouseMove (opts) {
        if (!started) return undefined

        const zoom = svgCanvas.getZoom()
        previewLine?.setAttribute('x2', opts.mouse_x / zoom)
        previewLine?.setAttribute('y2', opts.mouse_y / zoom)
        return { started: true }
      },

      mouseUp (opts) {
        if (!started) return undefined

        started = false
        removePreviewLine()

        const zoom = svgCanvas.getZoom()
        const endX = opts.mouse_x / zoom
        const endY = opts.mouse_y / zoom

        // Skip accidental single clicks (drag shorter than 2 SVG units)
        const dx = endX - startX
        const dy = endY - startY
        if (Math.sqrt(dx * dx + dy * dy) >= 2) {
          svgCanvas.cutShapes(startX, startY, endX, endY)
        }

        // keep:false — no element for the event loop to manage
        return { keep: false, started: false }
      }
    }
  }
}
