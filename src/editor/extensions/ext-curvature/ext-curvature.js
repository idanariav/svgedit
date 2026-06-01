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

import { spiroToBezierOnContext } from 'spiro'

const name = 'curvature'

/**
 * Active smoothing mode shared by the path builders below. Set from the
 * tool's mode-selector panel (see callback) and persisted via prefs.
 * @type {'catmull'|'bspline'|'spiro'}
 */
let curveMode = 'catmull'

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

// ── Path builders (one per smoothing mode) ───────────────────────────────────

const fmt = (n) => Math.round(n * 100) / 100

/**
 * Catmull-Rom → cubic Bézier (interpolating: the curve passes through every
 * anchor). Corner anchors break the curve into straight segments.
 *
 * @param {Array<{x:number, y:number, corner:boolean}>} pts  ≥2 anchors
 * @param {boolean} closed  Whether to append Z
 * @returns {string}
 */
function buildCatmullRom (pts, closed) {
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

/**
 * Uniform cubic B-spline → piecewise cubic Bézier (approximating: the curve is
 * pulled toward the anchors as a "cage", giving a looser, more organic feel).
 *
 * Endpoints of an open path and corner anchors get knot multiplicity 3 so the
 * curve passes exactly through them (clamped ends / sharp corners). Conversion
 * matrix per Romani & Sabin, CAGD 2004.
 *
 * @param {Array<{x:number, y:number, corner:boolean}>} pts  ≥2 anchors
 * @param {boolean} closed  Whether to wrap and append Z
 * @returns {string}
 */
function buildBSpline (pts, closed) {
  // A cubic needs a window of 4 control points; with 2 anchors fall back to a line.
  if (pts.length === 2) {
    return `M ${fmt(pts[0].x)},${fmt(pts[0].y)} L ${fmt(pts[1].x)},${fmt(pts[1].y)}${closed ? ' Z' : ''}`
  }

  // Expand anchors into a control sequence with multiplicities.
  const ctrl = []
  pts.forEach((p, i) => {
    const isEnd = !closed && (i === 0 || i === pts.length - 1)
    const mult = (p.corner || isEnd) ? 3 : 1
    for (let k = 0; k < mult; k++) ctrl.push(p)
  })
  // Periodic wrap for closed loops (cubic → repeat first 3 control points).
  if (closed) ctrl.push(ctrl[0], ctrl[1], ctrl[2])

  // B-spline → Bézier conversion of one 4-point window.
  const joint = (a, b, c) => ({ x: (a.x + 4 * b.x + c.x) / 6, y: (a.y + 4 * b.y + c.y) / 6 })
  const ctrl1 = (b, c) => ({ x: (2 * b.x + c.x) / 3, y: (2 * b.y + c.y) / 3 })
  const ctrl2 = (b, c) => ({ x: (b.x + 2 * c.x) / 3, y: (b.y + 2 * c.y) / 3 })

  const start = joint(ctrl[0], ctrl[1], ctrl[2])
  let d = `M ${fmt(start.x)},${fmt(start.y)}`

  for (let i = 0; i < ctrl.length - 3; i++) {
    const p1 = ctrl[i + 1]
    const p2 = ctrl[i + 2]
    const p3 = ctrl[i + 3]
    const c1 = ctrl1(p1, p2)
    const c2 = ctrl2(p1, p2)
    const end = joint(p1, p2, p3)
    d += ` C ${fmt(c1.x)},${fmt(c1.y)} ${fmt(c2.x)},${fmt(c2.y)} ${fmt(end.x)},${fmt(end.y)}`
  }

  if (closed) d += ' Z'
  return d
}

/**
 * Collects the cubic Bézier output of `spiroToBezierOnContext` into an SVG
 * `d` string (same command vocabulary as the other builders).
 */
class SpiroPathContext {
  constructor () { this.d = '' }
  beginShape () {}
  endShape () {}
  moveTo (x, y) { this.d += `M ${fmt(x)},${fmt(y)}` }
  lineTo (x, y) { this.d += ` L ${fmt(x)},${fmt(y)}` }
  cubicTo (x1, y1, x2, y2, x, y) {
    this.d += ` C ${fmt(x1)},${fmt(y1)} ${fmt(x2)},${fmt(y2)} ${fmt(x)},${fmt(y)}`
  }
}

/**
 * Spiro (clothoid-based, curvature-continuous) → cubic Bézier via libspiro.
 * Highest aesthetic quality for organic curves. Falls back to Catmull-Rom if
 * the solver fails to converge on a degenerate input.
 *
 * @param {Array<{x:number, y:number, corner:boolean}>} pts  ≥2 anchors
 * @param {boolean} closed  Whether the contour is closed
 * @returns {string}
 */
function buildSpiro (pts, closed) {
  const last = pts.length - 1
  const knots = pts.map((p, i) => {
    // 'g2' (curvature-continuous) is the robust smooth knot; the higher-order
    // 'g4' diverges to NaN on many configurations.
    let type = 'g2'
    if (p.corner) type = 'corner'
    else if (!closed && i === 0) type = 'open'
    else if (!closed && i === last) type = 'open_end'
    return { x: p.x, y: p.y, type }
  })

  const ctx = new SpiroPathContext()
  try {
    spiroToBezierOnContext(knots, closed, ctx)
  } catch (_err) {
    // Spiro can fail to converge; degrade gracefully rather than break drawing.
    return buildCatmullRom(pts, closed)
  }

  let d = ctx.d
  // The solver can still emit NaN control points without throwing; guard against it.
  if (!d || d.includes('NaN')) return buildCatmullRom(pts, closed)
  if (closed) d += ' Z'
  return d
}

/**
 * Build the SVG path `d` attribute for the given anchor points, dispatching to
 * the builder for the active {@link curveMode}.
 *
 * @param {Array<{x:number, y:number, corner:boolean}>} points  Committed anchors
 * @param {{x:number, y:number}|null} tentative  Cursor position (rubber-band)
 * @param {boolean} closed  Whether to append Z
 * @returns {string}
 */
function buildPathD (points, tentative = null, closed = false) {
  const pts = tentative ? [...points, { x: tentative.x, y: tentative.y, corner: false }] : [...points]

  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${fmt(pts[0].x)},${fmt(pts[0].y)}`

  switch (curveMode) {
    case 'bspline': return buildBSpline(pts, closed)
    case 'spiro': return buildSpiro(pts, closed)
    default: return buildCatmullRom(pts, closed)
  }
}

// ── Extension ────────────────────────────────────────────────────────────────

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { $id, $click } = svgCanvas

    await loadExtensionTranslation(svgEditor)

    // svgedit's native double-click handler switches the canvas mode to
    // 'select' (and may enter path-edit). While the curvature tool is active
    // that desyncs the canvas mode from the still-pressed toolbar button,
    // leaving the tool visually selected but inert. We finalize paths via our
    // own dblclick (detail>=2) logic in mouseDown, so swallow the native
    // dblclick over the canvas to keep the mode intact between shapes.
    const suppressNativeDblClick = (evt) => {
      if (svgCanvas.getMode() !== 'curvature') return
      const root = $id('svgcanvas')
      if (!root || root.contains(evt.target)) {
        evt.stopPropagation()
      }
    }
    window.addEventListener('dblclick', suppressNativeDblClick, true)

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
          id: svgCanvas.getNextId(),
          opacity: svgCanvas.getCurShape().opacity // override the /2 halving applied by curStyles
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

        // Mode-selector tray — shown only while the curvature tool is active.
        const panel = document.createElement('template')
        panel.innerHTML = `
          <div id="curvature_panel" class="quick_tray">
            <se-select id="curvature_mode" label="${name}:modes.label"
              options="Catmull-Rom,B-spline,Spiro" values="catmull::bspline::spiro"></se-select>
          </div>`
        $id('tools_top').appendChild(panel.content.cloneNode(true))

        const showPanel = (on) => {
          const p = $id('curvature_panel')
          if (!p) return
          if (on) p.style.removeProperty('display')
          else p.style.display = 'none'
        }
        showPanel(false)

        // Restore the persisted mode (default Catmull-Rom).
        curveMode = svgEditor.configObj.pref('curvatureMode') || 'catmull'
        $id('curvature_mode').value = curveMode

        $id('curvature_mode').addEventListener('change', (evt) => {
          curveMode = evt.detail.value
          svgEditor.configObj.pref('curvatureMode', curveMode)
          updatePreview(null, false) // re-render any in-progress preview in the new mode
        })

        $click($id('tool_curvature'), () => {
          if (this.leftPanel.updateLeftPanel('tool_curvature')) {
            svgCanvas.setMode('curvature')
          }
        })

        // The tray is bound to the canvas mode: setMode dispatches 'modeChange'
        // for every tool switch (button, flyout sub-tool, keyboard), so this is
        // the single reliable source of truth for showing/hiding it.
        document.addEventListener('modeChange', (evt) => {
          showPanel(evt.detail.getMode() === 'curvature')
        })
      },

      mouseDown (opts) {
        if (svgCanvas.getMode() !== 'curvature') return undefined

        const evt = opts.event
        const isDoubleClick = evt.detail >= 2
        const isCorner = evt.shiftKey // Shift+click = corner (sharp) anchor
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
