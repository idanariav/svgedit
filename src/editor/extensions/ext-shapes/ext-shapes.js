/**
 * @file ext-shapes.js
 *
 * @license MIT
 *
 * @copyright 2010 Christian Tzurcanu, 2010 Alexis Deveria
 *
 */
const name = 'shapes'

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
    const canv = svgEditor.svgCanvas
    const { $id } = canv
    const svgroot = canv.getSvgRoot()
    let lastBBox = {}
    await loadExtensionTranslation(svgEditor)

    const modeId = 'shapelib'
    const startClientPos = {}

    let curShape
    let startX
    let startY
    let _userShapeData = null // non-null when a user shape is selected for insertion
    let _armedDraw = null // path `d` of the armed built-in shape (null for user shapes)

    /**
     * Arm the shape tool from a `shape-insert` event detail. This is the single
     * entry point for the insertion flow — decoupled from any specific DOM
     * element so multiple hosts (the desktop left-panel button AND, e.g., the
     * tablet command bar) can drive it. The next canvas mousedown places the
     * armed shape; geometry comes from the event detail, not a DOM dataset.
     * @param {object} detail - `shape-insert` detail ({ draw } | user-shape data)
     * @param {Element} [target] - originating library element to mark pressed
     * @returns {void}
     */
    const armShapeInsert = (detail = {}, target) => {
      canv.setMode(modeId)
      _userShapeData = detail.isUserShape ? detail : null
      _armedDraw = detail.isUserShape ? null : (detail.draw ?? null)
      // Keep the originating library button visually pressed while armed
      target?.setAttribute?.('pressed', 'true')
    }
    // Expose for programmatic callers (kept element-agnostic)
    svgEditor.armShapeInsert = armShapeInsert

    return {
      callback () {
        if ($id('tool_shapelib') === null) {
          const extPath = svgEditor.configObj.curConfig.extPath
          const buttonTemplate = `
          <se-shape-library id="tool_shapelib"
            title="${svgEditor.i18next.t(`${name}:buttons.0.title`)}"
            lib="${extPath}/ext-shapes/shapelib/"
            src="shapelib.svg"></se-shape-library>
          `
          canv.insertChildAtIndex($id('tools_left'), buttonTemplate, 9)

          // `shape-insert` bubbles + is composed, so a single document-level
          // listener catches every `se-shape-library` instance (desktop or
          // tablet). `e.target` is retargeted to the dispatching host element.
          document.addEventListener('shape-insert', (e) => {
            armShapeInsert(e.detail, e.target)
          })
        }
      },
      mouseDown (opts) {
        const mode = canv.getMode()
        if (mode !== modeId) { return undefined }

        startX = opts.start_x
        const x = startX
        startY = opts.start_y
        const y = startY

        startClientPos.x = opts.event.clientX
        startClientPos.y = opts.event.clientY

        if (_userShapeData) {
          // ── User shape (SVG group) insertion ────────────────────────────────
          const { svgContent, bbox } = _userShapeData
          const parser = new DOMParser()
          const parsed = parser.parseFromString(
            `<svg xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`,
            'image/svg+xml'
          )
          const groupEl = parsed.documentElement.firstElementChild
          const imported = canv.getDOMDocument().importNode(groupEl, true)
          imported.id = canv.getNextId()

          const layer = canv.getCurrentGroup() || canv.getCurrentDrawing().getCurrentLayer()
          layer.appendChild(imported)

          // Apply tiny initial scale anchored at the click point, adjusted for the shape's own origin
          imported.setAttribute(
            'transform',
            `translate(${x},${y}) scale(0.005) translate(${-bbox.x},${-bbox.y})`
          )
          canv.recalculateDimensions(imported)

          // Stamp a provenance link onto the imported root AND every descendant.
          // Stamping every element (not just the wrapper) keeps the link alive
          // through ungroup / partial deletion — the embedding host's save-time
          // scan only drops the link once the last stamped element is gone.
          if (_userShapeData.linkedFile) {
            const stamp = el => {
              el.setAttribute('data-vault-link', _userShapeData.linkedFile)
              for (const child of el.children) stamp(child)
            }
            stamp(imported)
          }

          curShape = imported
        } else {
          // ── Built-in path-based shape (existing flow) ────────────────────────
          const currentD = _armedDraw
          const curStyle = canv.getStyle()

          curShape = canv.addSVGElementsFromJson({
            element: 'path',
            curStyles: true,
            attr: {
              d: currentD,
              id: canv.getNextId(),
              opacity: curStyle.opacity / 2,
              style: 'pointer-events:none'
            }
          })

          curShape.setAttribute('transform', 'translate(' + x + ',' + y + ') scale(0.005) translate(' + -x + ',' + -y + ')')
          canv.recalculateDimensions(curShape)
        }

        lastBBox = curShape.getBBox()

        return {
          started: true
        }
      },
      mouseMove (opts) {
        const mode = canv.getMode()
        if (mode !== modeId) { return }

        const zoom = canv.getZoom()
        const evt = opts.event

        const x = opts.mouse_x / zoom
        const y = opts.mouse_y / zoom

        const tlist = curShape.transform.baseVal
        const box = curShape.getBBox()
        const left = box.x; const top = box.y

        const newbox = {
          x: Math.min(startX, x),
          y: Math.min(startY, y),
          width: Math.abs(x - startX),
          height: Math.abs(y - startY)
        }

        let sx = (newbox.width / lastBBox.width) || 1
        let sy = (newbox.height / lastBBox.height) || 1

        // Not perfect, but mostly works...
        let tx = 0
        if (x < startX) {
          tx = lastBBox.width
        }
        let ty = 0
        if (y < startY) {
          ty = lastBBox.height
        }

        // update the transform list with translate,scale,translate
        const translateOrigin = svgroot.createSVGTransform()
        const scale = svgroot.createSVGTransform()
        const translateBack = svgroot.createSVGTransform()

        translateOrigin.setTranslate(-(left + tx), -(top + ty))
        if (!evt.shiftKey) {
          const max = Math.min(Math.abs(sx), Math.abs(sy))

          sx = max * (sx < 0 ? -1 : 1)
          sy = max * (sy < 0 ? -1 : 1)
        }
        scale.setScale(sx, sy)

        translateBack.setTranslate(left + tx, top + ty)
        tlist.appendItem(translateBack)
        tlist.appendItem(scale)
        tlist.appendItem(translateOrigin)

        canv.recalculateDimensions(curShape)

        lastBBox = curShape.getBBox()
      },
      mouseUp (opts) {
        const mode = canv.getMode()
        if (mode !== modeId) { return undefined }

        const keepObject = (opts.event.clientX !== startClientPos.x && opts.event.clientY !== startClientPos.y)

        return {
          keep: keepObject,
          element: curShape,
          started: false
        }
      }
    }
  }
}
