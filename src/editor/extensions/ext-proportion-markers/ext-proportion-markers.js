/**
 * @file ext-proportion-markers.js
 *
 * Draws small triangle tick markers along all four canvas edges at canonical
 * proportion points of the canvas width/height (1/2, thirds, quarters, fifths).
 * The markers are visual-only overlays (never saved into the user's SVG) and are
 * shown only while wireframe mode is active.
 *
 * Also renders the snap guide lines: while dragging, core `event.js` snaps the
 * selection to a proportion line and calls `svgCanvas.showSnapGuides(...)`, which
 * draws a dashed line (in the matching marker's color) across the canvas so the
 * user can see which proportion the object snapped to.
 *
 * Tier sizes/colors + the proportion fractions are shared with the snapping code
 * via `@svgedit/svgcanvas/core/proportions.js`.
 *
 * @license Apache-2.0
 */
import { PROPORTION_TIERS } from '@svgedit/svgcanvas/core/proportions.js'

const name = 'proportion-markers'

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
    await loadExtensionTranslation(svgEditor)
    const { svgCanvas } = svgEditor
    const { $id, NS, assignAttributes } = svgCanvas
    const svgdoc = $id('svgcanvas').ownerDocument
    const canvBG = $id('canvasBackground')

    // Overlay layer for the edge markers, sibling to #canvasGrid.
    const markers = svgdoc.createElementNS(NS.SVG, 'svg')
    assignAttributes(markers, {
      id: 'proportionMarkers',
      width: '100%',
      height: '100%',
      x: 0,
      y: 0,
      overflow: 'visible',
      display: 'none',
      style: 'pointer-events: none;'
    })
    canvBG.appendChild(markers)

    // Overlay layer for the transient snap guide lines (drawn on top of markers).
    const guides = svgdoc.createElementNS(NS.SVG, 'svg')
    assignAttributes(guides, {
      id: 'snapGuides',
      width: '100%',
      height: '100%',
      x: 0,
      y: 0,
      overflow: 'visible',
      style: 'pointer-events: none;'
    })
    canvBG.appendChild(guides)

    const isWireframe = () => svgEditor.workarea?.classList.contains('wireframe')

    /**
     * Render the proportion triangles in pixel space (resolution × zoom). Each
     * triangle sits on an edge with its base on the edge and apex pointing into
     * the canvas, centered on the proportion coordinate.
     * @param {Float} zoom
     * @returns {void}
     */
    const drawMarkers = (zoom) => {
      const res = svgCanvas.getResolution()
      const w = res.w * zoom
      const h = res.h * zoom
      const frag = svgdoc.createDocumentFragment()
      const addTri = (points, color) => {
        const tri = svgdoc.createElementNS(NS.SVG, 'polygon')
        assignAttributes(tri, { points, fill: color, 'fill-opacity': 0.9 })
        frag.append(tri)
      }
      PROPORTION_TIERS.forEach(({ fracs, len, base, color }) => {
        const hb = base / 2
        fracs.forEach((f) => {
          const cx = w * f
          const cy = h * f
          // Width-proportion triangles on top + bottom edges (apex points inward).
          addTri(`${cx - hb},0 ${cx + hb},0 ${cx},${len}`, color)
          addTri(`${cx - hb},${h} ${cx + hb},${h} ${cx},${h - len}`, color)
          // Height-proportion triangles on left + right edges (apex points inward).
          addTri(`0,${cy - hb} 0,${cy + hb} ${len},${cy}`, color)
          addTri(`${w},${cy - hb} ${w},${cy + hb} ${w - len},${cy}`, color)
        })
      })
      markers.replaceChildren(frag)
    }

    /**
     * Show/redraw markers when wireframe mode is on; hide otherwise.
     * @returns {void}
     */
    const markersUpdate = () => {
      const on = isWireframe()
      if (on) {
        drawMarkers(svgCanvas.getZoom())
      } else {
        guides.replaceChildren() // clear any lingering guide lines
      }
      markers.style.display = on ? 'block' : 'none'
    }
    // Expose so the editor can refresh markers after a canvas resize (their
    // extent depends on the canvas width/height).
    svgEditor.updateProportionMarkers = markersUpdate

    /**
     * Draw the snap guide line(s) for the currently snapped axes. Called from
     * core `event.js` during a drag; `null`/empty clears the guides.
     * @param {{x?: {pos: Float, color: string}, y?: {pos: Float, color: string}}|null} snap
     * @returns {void}
     */
    svgCanvas.showSnapGuides = (snap) => {
      if (!snap || !isWireframe()) {
        guides.replaceChildren()
        return
      }
      const zoom = svgCanvas.getZoom()
      const res = svgCanvas.getResolution()
      const w = res.w * zoom
      const h = res.h * zoom
      const frag = svgdoc.createDocumentFragment()
      const addLine = (x1, y1, x2, y2, color) => {
        const ln = svgdoc.createElementNS(NS.SVG, 'line')
        assignAttributes(ln, {
          x1, y1, x2, y2, stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '5 3', 'stroke-opacity': 0.9
        })
        frag.append(ln)
      }
      if (snap.x) addLine(snap.x.pos * zoom, 0, snap.x.pos * zoom, h, snap.x.color)
      if (snap.y) addLine(0, snap.y.pos * zoom, w, snap.y.pos * zoom, snap.y.color)
      guides.replaceChildren(frag)
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      zoomChanged (zoom) {
        if (isWireframe()) {
          drawMarkers(zoom)
        }
      }
    }
  }
}
