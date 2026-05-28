/**
 * @file ext-curvature.js
 *
 * Curvature tool — click to place anchor points and draw smooth curves
 * automatically, similar to Adobe Illustrator's Curvature Tool.
 *
 * Handles are auto-computed via the Catmull-Rom → Cubic Bézier conversion:
 *   cp1 = P[i]   + (P[i+1] - P[i-1]) / 6
 *   cp2 = P[i+1] - (P[i+2] - P[i])   / 6
 *
 * Interaction:
 *   • Click          → add smooth anchor point
 *   • Double-click   → add corner (sharp) anchor point
 *   • Mouse move     → rubber-band preview to cursor
 *   • Click on start → close path and finalize
 *   • Escape         → finalize as open path
 *   • < 2 points     → abort session
 *
 * @license MIT
 */

const name = 'curvature'

const loadExtensionTranslation = async function (svgEditor) {
  let translationModule
  const lang = svgEditor.configObj.pref('lang')
  try {
    translationModule = await import(`./locale/${lang}.js`)
  } catch (_error) {
    console.warn(`Missing translation (${lang}) for ${name} - using 'en'`)
    translationModule = await import('./locale/en.js')
  }
  svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
}

// ── Catmull-Rom → Cubic Bézier path builder ──────────────────────────────────

/**
 * Build the SVG path `d` attribute for the given anchor points.
 *
 * @param {Array<{x:number, y:number, corner:boolean}>} points  Committed anchors
 * @param {{x:number, y:number}|null} tentative  Cursor position (rubber-band)
 * @param {boolean} closed  Whether to append Z
 * @returns {string}
 */
function buildPathD (points, tentative = null, closed = false) {
  const pts = tentative ? [...points, { x: tentative.x, y: tentative.y, corner: false }] : [...points]

  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`

  const fmt = (n) => Math.round(n * 100) / 100

  let d = `M ${fmt(pts[0].x)},${fmt(pts[0].y)}`

  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i]
    const p2 = pts[i + 1]

    // Corner → corner or into a corner: use a straight line
    if (p1.corner || p2.corner) {
      d += ` L ${fmt(p2.x)},${fmt(p2.y)}`
      continue
    }

    // Catmull-Rom neighbours (clamped at boundaries)
    const p0 = pts[Math.max(0, i - 1)]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    d += ` C ${fmt(cp1x)},${fmt(cp1y)} ${fmt(cp2x)},${fmt(cp2y)} ${fmt(p2.x)},${fmt(p2.y)}`
  }

  if (closed) d += ' Z'
  return d
}

// ── Extension ────────────────────────────────────────────────────────────────

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { $id, $click } = svgCanvas

    await loadExtensionTranslation(svgEditor)

    // ── Session state ──────────────────────────────────────────────────────
    /** @type {Array<{x:number, y:number, corner:boolean}>} */
    let points = []
    /** @type {SVGPathElement|null} */
    let previewEl = null
    let isDrawing = false

    // ── Helpers ────────────────────────────────────────────────────────────

    const dist = (ax, ay, bx, by) => Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)

    const getLayer = () => svgCanvas.getCurrentDrawing().getCurrentLayer()

    /** Create a dashed preview path appended directly to the current layer. */
    const createPreview = (x, y) => {
      const svgNS = 'http://www.w3.org/2000/svg'
      const el = document.createElementNS(svgNS, 'path')
      const zoom = svgCanvas.getZoom()
      el.setAttribute('d', `M ${x},${y}`)
      el.setAttribute('fill', 'none')
      el.setAttribute('stroke', svgCanvas.getColor('stroke') || '#000')
      el.setAttribute('stroke-width', String(svgCanvas.getStrokeWidth() || 1))
      el.setAttribute('stroke-dasharray', `${6 / zoom},${3 / zoom}`)
      el.setAttribute('opacity', '0.75')
      el.setAttribute('pointer-events', 'none')
      el.setAttribute('id', 'curvature_preview')
      getLayer().appendChild(el)
      previewEl = el
    }

    const updatePreview = (tentative, closed) => {
      if (!previewEl) return
      previewEl.setAttribute('d', buildPathD(points, tentative, closed))
    }

    const removePreview = () => {
      previewEl?.remove()
      previewEl = null
    }

    /**
     * Finalise the drawing session: create the permanent path element (with
     * undo support) from the accumulated points, then reset state.
     */
    const finalize = (closed) => {
      removeAnchorDots()
      if (points.length < 2) {
        removePreview()
        points = []
        isDrawing = false
        return
      }

      const finalD = buildPathD(points, null, closed)
      removePreview()

      const { InsertElementCommand } = svgCanvas.history
      const el = svgCanvas.addSVGElementsFromJson({
        element: 'path',
        curStyles: true,
        attr: {
          d: finalD,
          id: svgCanvas.getNextId()
        }
      })

      if (el) {
        svgCanvas.undoMgr.addCommandToHistory(new InsertElementCommand(el))
      }

      points = []
      isDrawing = false
    }

    // ── Anchor-point indicators (small circles drawn over the layer) ───────
    /** @type {SVGCircleElement[]} */
    let anchorDots = []

    const svgNS = 'http://www.w3.org/2000/svg'

    const addAnchorDot = (x, y, corner) => {
      const zoom = svgCanvas.getZoom()
      const r = 3.5 / zoom
      const dot = document.createElementNS(svgNS, 'circle')
      dot.setAttribute('cx', x)
      dot.setAttribute('cy', y)
      dot.setAttribute('r', r)
      dot.setAttribute('fill', corner ? '#e00' : '#06f')
      dot.setAttribute('stroke', '#fff')
      dot.setAttribute('stroke-width', String(1 / zoom))
      dot.setAttribute('pointer-events', 'none')
      getLayer().appendChild(dot)
      anchorDots.push(dot)
    }

    const removeAnchorDots = () => {
      anchorDots.forEach(d => d.remove())
      anchorDots = []
    }

    // ── Extension object ───────────────────────────────────────────────────

    return {
      name: svgEditor.i18next.t(`${name}:name`),

      callback () {
        const title = `${name}:buttons.0.title`
        svgCanvas.insertChildAtIndex(
          $id('tools_left'),
          `<se-button id="tool_curvature" title="${title}" src="curvature.svg"></se-button>`,
          12
        )

        $click($id('tool_curvature'), () => {
          if (this.leftPanel.updateLeftPanel('tool_curvature')) {
            svgCanvas.setMode('curvature')
          }
        })
      },

      mouseDown (opts) {
        if (svgCanvas.getMode() !== 'curvature') return undefined

        const evt = opts.event
        const isDoubleClick = evt.detail >= 2
        const isCorner = evt.shiftKey  // Shift+click = corner (sharp) anchor
        const x = opts.start_x
        const y = opts.start_y

        // Close path when clicking near the first point (≥2 points already placed)
        if (isDrawing && points.length >= 2) {
          const closeRadius = 8 / svgCanvas.getZoom()
          if (dist(x, y, points[0].x, points[0].y) <= closeRadius) {
            finalize(true)
            return { started: false }
          }
        }

        // Double-click finalizes the path open. The preceding detail=1 click
        // already placed the final anchor, so we just end the session here.
        if (isDoubleClick && isDrawing) {
          finalize(false)
          return { started: false }
        }

        if (!isDrawing) {
          isDrawing = true
          createPreview(x, y)
        }

        points.push({ x, y, corner: isCorner })
        addAnchorDot(x, y, isCorner)
        updatePreview(null, false)

        return { started: true }
      },

      mouseMove (opts) {
        if (!isDrawing) return undefined

        const zoom = svgCanvas.getZoom()
        const mx = opts.mouse_x / zoom
        const my = opts.mouse_y / zoom

        updatePreview({ x: mx, y: my }, false)
        return { started: true }
      },

      mouseUp (_opts) {
        if (!isDrawing) return undefined
        // Each click is a complete editor drag from svgedit's perspective.
        // We signal "no new element created" and keep our own session alive.
        return { keep: false, started: false }
      },

      keyDown (opts) {
        if (svgCanvas.getMode() !== 'curvature') return undefined
        if (!isDrawing) return undefined

        if (opts.event.key === 'Escape') {
          finalize(false)
          return { preventDefault: true }
        }
        return undefined
      }
    }
  }
}
