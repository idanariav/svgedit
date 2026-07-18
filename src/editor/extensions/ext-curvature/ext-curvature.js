/**
 * @file ext-curvature.js
 *
 * Curvature tool — click to place anchor points and draw smooth curves
 * automatically (Spiro/clothoid curves), similar to Adobe Illustrator's
 * Curvature Tool.
 *
 * Interaction:
 *   • Click              → add smooth (mid) anchor point
 *   • Shift+click        → add corner (sharp) anchor point
 *   • Alt+click          → add an "end" anchor — fixes the curve up to this
 *                          point so later points can't reshape it; also acts
 *                          as the start of the next segment. (Not Ctrl+click:
 *                          that maps to a secondary-click/context-menu on
 *                          macOS and some Linux setups.)
 *   • Alt+Shift+click    → add an end anchor that's also a sharp corner
 *   • Click-drag an
 *     existing anchor    → reposition it, reshaping its adjoining segment(s)
 *   • Double-click        → add corner (sharp) anchor point
 *   • Mouse move          → rubber-band preview to cursor
 *   • Click on start      → close path and finalize
 *   • Escape              → finalize as open path
 *   • < 2 points          → abort session
 *
 * @license MIT
 */

import { spiroToBezierOnContext } from 'spiro'

const name = 'curvature'

const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  // Locale files are inlined into the bundle (statically resolved glob).
  const locales = import.meta.glob('./locale/*.js', { eager: true })
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

// ── Path builders (one per smoothing mode) ───────────────────────────────────

const fmt = (n) => Math.round(n * 100) / 100

/**
 * Catmull-Rom → cubic Bézier (interpolating: the curve passes through every
 * anchor). Corner anchors break the curve into straight segments.
 *
 * @param {Array<{x:number, y:number, corner:boolean, end:boolean}>} pts  ≥2 anchors
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
 * @param {Array<{x:number, y:number, corner:boolean, end:boolean}>} pts  ≥2 anchors
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
 * Split a flat anchor array into consecutive sub-arrays ("segments") at each
 * `end`-flagged point. The end anchor is shared: it is both the last point of
 * the segment it closes and the first point of the following segment. This
 * keeps a segment's rendered geometry a pure function of the points strictly
 * within it — later points appended after an `end` anchor cannot retroactively
 * reshape an earlier, already-closed segment.
 *
 * @param {Array<{x:number, y:number, corner:boolean, end:boolean}>} pts
 * @returns {Array<Array<{x:number, y:number, corner:boolean, end:boolean}>>}
 *   Non-empty array of non-empty segments. If `pts` has no interior `end`
 *   flags, returns a single segment === the whole input.
 */
function splitIntoSegments (pts) {
  const segments = []
  let current = [pts[0]]

  for (let i = 1; i < pts.length; i++) {
    current.push(pts[i])
    // An `end` flag on a non-final point starts a new segment; an `end` flag
    // on the last point just marks it as an end anchor with nothing after it
    // yet, and doesn't split anything.
    if (pts[i].end && i < pts.length - 1) {
      segments.push(current)
      current = [pts[i]] // shared point: last of previous segment, first of next
    }
  }
  segments.push(current)
  return segments
}

/**
 * Build the `d` string for a single independent segment (already extracted by
 * `splitIntoSegments`), reusing the existing 1-point / ≥2-point dispatch.
 */
function buildSegmentD (pts, closed) {
  if (pts.length === 1) return `M ${fmt(pts[0].x)},${fmt(pts[0].y)}`
  return buildSpiro(pts, closed)
}

/**
 * Build the SVG path `d` attribute for the given anchor points.
 *
 * If no interior `end` anchor is present, this is identical to today's
 * single global Spiro/Catmull-Rom solve (including a true closed-loop solve
 * when `closed`). Once an interior `end` anchor exists, the points are split
 * into independent segments at each `end` anchor so that a segment's
 * geometry can never be reshaped by points added after it.
 *
 * @param {Array<{x:number, y:number, corner:boolean, end:boolean}>} points  Committed anchors
 * @param {{x:number, y:number}|null} tentative  Cursor position (rubber-band)
 * @param {boolean} closed  Whether to append Z
 * @returns {string}
 */
function buildPathD (points, tentative = null, closed = false) {
  const pts = tentative ? [...points, { x: tentative.x, y: tentative.y, corner: false, end: false }] : [...points]

  if (pts.length === 0) return ''

  const hasInteriorEnd = pts.some((p, i) => p.end && i < pts.length - 1)

  // No interior `end` anchors anywhere: identical to today's behavior.
  if (!hasInteriorEnd) {
    return buildSegmentD(pts, closed)
  }

  let segments = splitIntoSegments(pts)

  if (closed) {
    // Closing while interior `end` anchors exist: treat the close gesture as
    // an implicit `end` anchor at points[0]'s coordinates rather than a
    // global closed-loop solve, so the fixed-segment guarantee still holds.
    const start = pts[0]
    const lastSegment = segments[segments.length - 1]
    const lastPoint = lastSegment[lastSegment.length - 1]
    const alreadyAtStart = lastPoint.x === start.x && lastPoint.y === start.y
    if (!alreadyAtStart) {
      segments = [...segments.slice(0, -1), [...lastSegment, { x: start.x, y: start.y, corner: start.corner, end: true }]]
    }
  }

  let d = ''
  segments.forEach((seg, i) => {
    const segD = buildSegmentD(seg, false) // each segment is always built "open"
    d += i === 0 ? segD : segD.replace(/^M\s*[\d.-]+,[\d.-]+\s*/, '')
  })

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
    window.addEventListener('dblclick', suppressNativeDblClick, { capture: true, signal: svgEditor.listenerAbort.signal })

    // Switching to another tool mid-session must not leave the dashed
    // preview / anchor dots behind in the layer (they'd otherwise be real
    // content, serialized by getSvgString() and persisted by a host
    // autosave). Mirrors the Escape-key behavior: finalize as an open path.
    document.addEventListener('modeChange', (evt) => {
      if (evt.detail.getMode() !== 'curvature' && isDrawing) {
        finalize(false)
      }
    }, { signal: svgEditor.listenerAbort.signal })

    // ── Session state ──────────────────────────────────────────────────────
    /** @type {Array<{x:number, y:number, corner:boolean, end:boolean}>} */
    let points = []
    /** @type {SVGPathElement|null} */
    let previewEl = null
    let isDrawing = false
    // Anchor-drag state: index into `points` currently being repositioned (-1
    // when idle), the mousedown position (for points[0] close-vs-drag
    // disambiguation), and the index hit-tested at mousedown time.
    let draggingIndex = -1
    let mouseDownPos = null
    let mouseDownHitIndex = -1
    // Whether the pointer has moved past the click-vs-drag threshold since
    // the current drag began — the dragged anchor is left untouched until
    // this flips true, so a click that merely lands within the (larger) hit
    // radius but not exactly on the anchor doesn't register as a drag.
    let dragMoved = false

    // ── Helpers ────────────────────────────────────────────────────────────

    const dist = (ax, ay, bx, by) => Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)

    const getLayer = () => svgCanvas.getCurrentDrawing().getCurrentLayer()

    const getMoveThreshold = () => 3 / svgCanvas.getZoom()

    /** Return the index of the first placed anchor within hit range of (x, y), or -1. */
    const hitTestAnchor = (x, y) => {
      const hitRadius = 8 / svgCanvas.getZoom()
      for (let i = 0; i < points.length; i++) {
        if (dist(x, y, points[i].x, points[i].y) <= hitRadius) return i
      }
      return -1
    }

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
    const resetDragState = () => {
      draggingIndex = -1
      mouseDownPos = null
      mouseDownHitIndex = -1
      dragMoved = false
    }

    const finalize = (closed) => {
      removeAnchorDots()
      resetDragState()
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

      // Return to the select tool once a shape is finalized (mirrors pen/pencil).
      svgEditor.leftPanel.clickSelect()
    }

    // ── Anchor-point indicators (small circles drawn over the layer) ───────
    /** @type {SVGCircleElement[]} */
    let anchorDots = []

    const svgNS = 'http://www.w3.org/2000/svg'

    /** Whether points[i] behaves as an implicit segment "start": index 0, or
     * immediately follows an `end`-flagged point. */
    const isImplicitStart = (i) => i === 0 || points[i - 1].end

    const addAnchorDot = (i) => {
      const p = points[i]
      const zoom = svgCanvas.getZoom()
      const isBoundary = p.end || isImplicitStart(i)
      const r = (isBoundary ? 4.5 : 3.5) / zoom
      const dot = document.createElementNS(svgNS, 'circle')
      dot.setAttribute('cx', p.x)
      dot.setAttribute('cy', p.y)
      dot.setAttribute('r', r)
      dot.setAttribute('fill', p.corner ? '#e00' : '#06f')
      // Start/end anchors get a heavier, higher-contrast ring; plain mid
      // anchors keep the thin white ring.
      dot.setAttribute('stroke', isBoundary ? '#000' : '#fff')
      dot.setAttribute('stroke-width', String((isBoundary ? 2 : 1) / zoom))
      dot.setAttribute('pointer-events', 'none')
      getLayer().appendChild(dot)
      anchorDots.push(dot)
    }

    const removeAnchorDots = () => {
      anchorDots.forEach(d => d.remove())
      anchorDots = []
    }

    const redrawAnchorDots = () => {
      removeAnchorDots()
      points.forEach((_, i) => addAnchorDot(i))
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
        const isCorner = evt.shiftKey // Shift+click = corner (sharp) anchor
        const isEnd = evt.altKey // Alt+click = end anchor (combinable with corner)
        const x = opts.start_x
        const y = opts.start_y

        mouseDownPos = { x, y }
        mouseDownHitIndex = -1

        // Double-click finalizes the path open. Checked before hit-testing:
        // the double-click's own first (detail=1) click just placed a point
        // at this exact location, so the second (detail=2) click would
        // otherwise always hit-test against that just-placed point and be
        // mistaken for a drag/close gesture instead of reaching this check.
        if (isDoubleClick && isDrawing) {
          finalize(false)
          return { started: false }
        }

        // Clicking on an already-placed anchor picks it up for dragging
        // instead of adding a new point. points[0] is ambiguous with the
        // "click near start closes the path" gesture, so its close-vs-drag
        // decision is deferred to mouseUp (movement threshold); it's still
        // live-updated during the drag via the shared draggingIndex path.
        if (isDrawing) {
          const hitIndex = hitTestAnchor(x, y)
          if (hitIndex !== -1) {
            draggingIndex = hitIndex
            mouseDownHitIndex = hitIndex
            return { started: true }
          }
        }

        if (!isDrawing) {
          isDrawing = true
          createPreview(x, y)
        }

        points.push({ x, y, corner: isCorner, end: isEnd })
        addAnchorDot(points.length - 1)
        updatePreview(null, false)

        return { started: true }
      },

      mouseMove (opts) {
        if (!isDrawing) return undefined

        const zoom = svgCanvas.getZoom()
        const mx = opts.mouse_x / zoom
        const my = opts.mouse_y / zoom

        if (draggingIndex >= 0) {
          // Leave the anchor untouched until the pointer clears the
          // click-vs-drag threshold, so a click landing anywhere within the
          // (larger) hit radius — not necessarily exactly on the anchor —
          // doesn't itself register as a move.
          if (!dragMoved) {
            if (dist(mx, my, mouseDownPos.x, mouseDownPos.y) <= getMoveThreshold()) {
              return { started: true }
            }
            dragMoved = true
          }
          points[draggingIndex].x = mx
          points[draggingIndex].y = my
          redrawAnchorDots()
          updatePreview(null, false) // no tentative point while repositioning a placed anchor
          return { started: true }
        }

        updatePreview({ x: mx, y: my }, false)
        return { started: true }
      },

      mouseUp (_opts) {
        if (!isDrawing) return undefined

        // points[0] is ambiguous between "close the path" (never crossed the
        // drag threshold, mirrors today's click-near-start gesture) and
        // "drag the start anchor" (crossed it — already live-updated by
        // mouseMove above).
        if (draggingIndex === 0 && mouseDownHitIndex === 0) {
          const wasMoved = dragMoved
          resetDragState()

          if (!wasMoved && points.length >= 2) {
            finalize(true)
            return { keep: false, started: false }
          }

          // Either a genuine drag (points[0] already holds its live-updated
          // position) or too few points to close yet — leave session open.
          redrawAnchorDots()
          updatePreview(null, false)
          return { keep: false, started: false }
        }

        if (draggingIndex >= 0) {
          resetDragState()
          return { keep: false, started: false }
        }

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
