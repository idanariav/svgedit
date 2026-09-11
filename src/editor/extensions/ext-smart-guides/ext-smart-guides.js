/**
 * @file ext-smart-guides.js
 *
 * Renders the smart alignment guides: while dragging a selection, core
 * `event.js` snaps it to other elements' edges/centers (or the page) and to
 * equal spacing between neighbors — see
 * `@svgedit/svgcanvas/core/smart-guides.js` — then calls
 * `svgCanvas.showSmartGuides(payload)`, implemented here. Alignment matches
 * draw as solid lines spanning the moving box and the matched target; equal
 * spacing draws the two gap segments with end ticks.
 *
 * Also owns the `tool_smart_snap` toggle button (view tray) and the
 * `smartSnapping` config flag, persisted as the `smart_snapping` pref.
 *
 * The overlay `<svg>` is appended last into `#svgroot` so guides render above
 * the drawing content (unlike `#canvasBackground` overlays); its position is
 * synced from `#svgcontent` on every draw, and its contents are transient
 * (cleared on every mouse-up by core).
 *
 * @license Apache-2.0
 */

const name = 'smart-guides'

const GUIDE_COLOR = '#e11d48'
const TICK = 4 // spacing-segment end tick half-length, screen px

const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
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
    await loadExtensionTranslation(svgEditor)
    const { svgCanvas } = svgEditor
    const { $id, NS, assignAttributes } = svgCanvas
    const svgdoc = $id('svgcanvas').ownerDocument
    const svgroot = svgCanvas.getSvgRoot()

    // Seed the config flag from the persisted pref (default: on).
    svgCanvas.getCurConfig().smartSnapping = svgEditor.configObj.pref('smart_snapping') !== 'off'

    // Guide overlay — last child of svgroot so it renders above the content.
    const overlay = svgdoc.createElementNS(NS.SVG, 'svg')
    assignAttributes(overlay, {
      id: 'smartGuides',
      overflow: 'visible',
      style: 'pointer-events: none;'
    })
    svgroot.append(overlay)

    const addLine = (frag, x1, y1, x2, y2, dash) => {
      const ln = svgdoc.createElementNS(NS.SVG, 'line')
      assignAttributes(ln, {
        x1, y1, x2, y2, stroke: GUIDE_COLOR, 'stroke-width': 1, ...(dash ? { 'stroke-dasharray': dash } : {})
      })
      frag.append(ln)
    }

    /**
     * Draw the current snap state. Called from core `event.js` on every
     * drag move; `null` (or a payload with no matches) clears the overlay.
     * @param {?{x: ?Object, y: ?Object, spacingX: ?Object, spacingY: ?Object,
     *   moving: {x: Float, y: Float, width: Float, height: Float}}} payload
     * @returns {void}
     */
    svgCanvas.showSmartGuides = (payload) => {
      if (!payload || (!payload.x && !payload.y && !payload.spacingX && !payload.spacingY)) {
        overlay.replaceChildren()
        return
      }
      // Align the overlay with the drawing content (same placement contract
      // as #canvasBackground: x/y/width/height track #svgcontent).
      const content = svgCanvas.getSvgContent()
      for (const attr of ['x', 'y', 'width', 'height']) {
        overlay.setAttribute(attr, content.getAttribute(attr))
      }

      const zoom = svgCanvas.getZoom()
      const frag = svgdoc.createDocumentFragment()
      const m = payload.moving
      const mEdges = {
        left: m.x, right: m.x + m.width, top: m.y, bottom: m.y + m.height
      }

      // Alignment lines span the moving bbox and the matched target bbox.
      if (payload.x) {
        const t = payload.x.target
        const y1 = Math.min(mEdges.top, t.top) * zoom
        const y2 = Math.max(mEdges.bottom, t.bottom) * zoom
        addLine(frag, payload.x.pos * zoom, y1, payload.x.pos * zoom, y2)
      }
      if (payload.y) {
        const t = payload.y.target
        const x1 = Math.min(mEdges.left, t.left) * zoom
        const x2 = Math.max(mEdges.right, t.right) * zoom
        addLine(frag, x1, payload.y.pos * zoom, x2, payload.y.pos * zoom)
      }

      // Equal-spacing gap segments with end ticks.
      const drawSpacing = (spacing, vertical) => {
        for (const seg of spacing.segments) {
          const x1 = seg.x1 * zoom
          const y1 = seg.y1 * zoom
          const x2 = seg.x2 * zoom
          const y2 = seg.y2 * zoom
          addLine(frag, x1, y1, x2, y2, '4 2')
          if (vertical) {
            addLine(frag, x1 - TICK, y1, x1 + TICK, y1)
            addLine(frag, x2 - TICK, y2, x2 + TICK, y2)
          } else {
            addLine(frag, x1, y1 - TICK, x1, y1 + TICK)
            addLine(frag, x2, y2 - TICK, x2, y2 + TICK)
          }
        }
      }
      if (payload.spacingX) drawSpacing(payload.spacingX, false)
      if (payload.spacingY) drawSpacing(payload.spacingY, true)

      overlay.replaceChildren(frag)
    }

    /**
     * Draw the current path-node alignment snap state (pathedit node drag).
     * Same overlay/mechanism as `showSmartGuides`, but for a single dragged
     * anchor node snapping to another node's x/y rather than bbox edges —
     * see `@svgedit/svgcanvas/core/path-node-guides.js`. Called from core
     * `path-actions.js` on every pathedit drag move; `null` (or a payload
     * with no matches) clears the overlay.
     * @param {?{x: ?Object, y: ?Object, from: {x: Float, y: Float}}} payload
     * @returns {void}
     */
    svgCanvas.showPathNodeGuides = (payload) => {
      if (!payload || (!payload.x && !payload.y)) {
        overlay.replaceChildren()
        return
      }
      const content = svgCanvas.getSvgContent()
      for (const attr of ['x', 'y', 'width', 'height']) {
        overlay.setAttribute(attr, content.getAttribute(attr))
      }

      const zoom = svgCanvas.getZoom()
      const frag = svgdoc.createDocumentFragment()
      const { from } = payload

      // A shared coordinate makes the line between the two points already
      // perfectly vertical (x match) or horizontal (y match).
      if (payload.x) {
        const t = payload.x.target
        addLine(frag, t.x * zoom, t.y * zoom, from.x * zoom, from.y * zoom)
      }
      if (payload.y) {
        const t = payload.y.target
        addLine(frag, t.x * zoom, t.y * zoom, from.x * zoom, from.y * zoom)
      }

      overlay.replaceChildren(frag)
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        const buttonTemplate = document.createElement('template')
        const title = `${name}:buttons.0.title`
        buttonTemplate.innerHTML = `
          <se-button id="tool_smart_snap" title="${title}" src="smart_snap.svg"></se-button>
        `
        $id('editor_panel').append(buttonTemplate.content.cloneNode(true))
        const btn = $id('tool_smart_snap')
        btn.pressed = svgCanvas.getCurConfig().smartSnapping
        btn.addEventListener('click', () => {
          const on = !svgCanvas.getCurConfig().smartSnapping
          svgCanvas.getCurConfig().smartSnapping = on
          btn.pressed = on
          svgEditor.configObj.pref('smart_snapping', on ? 'on' : 'off')
        })
      }
    }
  }
}
