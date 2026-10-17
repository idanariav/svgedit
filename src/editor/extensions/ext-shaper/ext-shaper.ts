/**
 * @file ext-shaper.ts
 *
 * Shaper tool, after Illustrator's: draw a rough rectangle, ellipse, triangle,
 * polygon or line with the pen / mouse / finger and it becomes a clean native
 * shape; a zig-zag scribbled over existing objects deletes them. A stroke that
 * is none of these is discarded (no freehand path is left behind).
 *
 * The classification is in {@link module:shape-recognize} (DOM-free, ported
 * from VectorCraft); this file captures the stroke, draws its preview and maps
 * the result to `<line>` / `<rect>` / `<ellipse>` / `<polygon>`. Rotated
 * rectangles and ellipses (45° steps) carry a `rotate()` transform. A polygon is
 * a plain `<polygon>`, not a polystar: the polystar panel rebuilds from a fixed
 * orientation, which would turn a triangle that points down upside up on its
 * first edit.
 *
 * Runs on `svgCanvas.registerTool`: one undo step per stroke, Escape or a tool
 * switch mid-stroke rolls back, and the preview lives in the tool overlay.
 *
 * @license MIT
 */

import { recognize } from '@svgedit/svgcanvas/core/shape-recognize.ts'
import { defineFeature, addFeatureLocale } from '../defineFeature.ts'

const name = 'shaper'

/** Preview ink; the overlay is never saved, so a fixed accent colour is fine. */
const PREVIEW_STROKE = '#2b7fff'
/** A scribble is sampled at no fewer than this many document units apart… */
const MIN_SAMPLE_SPACING = 0.5
/** …and into at most this many samples, so a very long scribble stays cheap. */
const MAX_SAMPLES = 2000

const round = (v: number) => Math.round(v * 100) / 100

// ---- scribble hit-testing ---------------------------------------------------

export type Matrix = { a: number, b: number, c: number, d: number, e: number, f: number }

/** @returns the inverse affine transform */
const invert = (m: Matrix): Matrix => {
  const det = m.a * m.d - m.b * m.c
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det
  }
}

/** `p ↦ x · y · p` (apply `y`, then `x`). */
const multiply = (x: Matrix, y: Matrix) => ({
  a: x.a * y.a + x.c * y.b,
  b: x.b * y.a + x.d * y.b,
  c: x.a * y.c + x.c * y.d,
  d: x.b * y.c + x.d * y.d,
  e: x.a * y.e + x.c * y.f + x.e,
  f: x.b * y.e + x.d * y.f + x.f
})

const apply = (m: Matrix, p: { x: number, y: number }) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f })

/**
 * Points along the polyline `pts`, at most `spacing` apart, so no part of a
 * thin line it crosses can fall between two samples.
 */
export const sampleStroke = (pts: { x: number, y: number }[]): { x: number, y: number }[] => {
  let length = 0
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  const spacing = Math.max(MIN_SAMPLE_SPACING, length / MAX_SAMPLES)
  const out = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / spacing))
    for (let s = 1; s <= steps; s++) out.push({ x: a.x + (b.x - a.x) * s / steps, y: a.y + (b.y - a.y) * s / steps })
  }
  return out
}

/**
 * Does any sample lie on `el`'s painted fill or stroke? Geometry elements are
 * tested with the browser's own `isPointInFill` / `isPointInStroke`, but only
 * for paint the element actually has (browsers disagree about `fill="none"`).
 * Groups recurse; anything else (text, images) falls back to its bounding box.
 * @param samples in the space of `base`
 * @param base the screen matrix of the space the samples are in
 */
export const strokeTouches = (el: Element, samples: { x: number, y: number }[], base: Matrix): boolean => {
  if (el.hasAttribute('data-se-ephemeral') || el.hasAttribute('data-frame')) return false
  if (el.tagName === 'g' || el.tagName === 'a') {
    return [...el.children].some((child) => strokeTouches(child, samples, base))
  }
  const geom = el as SVGGeometryElement
  const ctm = geom.getScreenCTM?.()
  if (!ctm || !Number.isFinite(ctm.a * ctm.d - ctm.b * ctm.c) || ctm.a * ctm.d - ctm.b * ctm.c === 0) return false
  const toLocal = multiply(invert(ctm), base)
  const local = samples.map((p) => apply(toLocal, p))
  if (typeof geom.isPointInFill !== 'function') {
    if (typeof geom.getBBox !== 'function') return false
    const box = geom.getBBox()
    return local.some((p) => p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height)
  }
  const style = getComputedStyle(el)
  const filled = style.fill !== 'none' && style.fill !== ''
  const stroked = style.stroke !== 'none' && style.stroke !== '' && parseFloat(style.strokeWidth) !== 0
  return local.some((p) => (filled && geom.isPointInFill(p)) || (stroked && geom.isPointInStroke(p)))
}

// ---- mapping a recognized shape to an element --------------------------------

/**
 * What to draw for a recognized shape, as `addSVGElementsFromJson` takes it
 * (minus id and paint).
 */
export const describeShape = (shape: import('@svgedit/svgcanvas/core/shape-recognize.ts').Recognized): { element: string, attr: Record<string, string | number | undefined>, open?: boolean } | null => {
  const rotate = (rotation: number, cx: number, cy: number) => (rotation ? { transform: `rotate(${rotation} ${round(cx)} ${round(cy)})` } : {})
  switch (shape.type) {
    case 'line':
      return {
        element: 'line',
        open: true,
        attr: { x1: round(shape.a.x), y1: round(shape.a.y), x2: round(shape.b.x), y2: round(shape.b.y) }
      }
    case 'rectangle': {
      const { cx, cy, width, height } = shape.rect
      return {
        element: 'rect',
        attr: { x: round(cx - width / 2), y: round(cy - height / 2), width: round(width), height: round(height), ...rotate(shape.rotation, cx, cy) }
      }
    }
    case 'ellipse': {
      const { cx, cy, width, height } = shape.rect
      return {
        element: 'ellipse',
        attr: { cx: round(cx), cy: round(cy), rx: round(width / 2), ry: round(height / 2), ...rotate(shape.rotation, cx, cy) }
      }
    }
    case 'polygon': {
      const { center, radius, sides, rotation } = shape
      const points = []
      for (let i = 0; i < sides; i++) {
        const angle = (rotation - 90) * Math.PI / 180 + 2 * Math.PI * i / sides
        points.push(`${round(center.x + radius * Math.cos(angle))},${round(center.y + radius * Math.sin(angle))}`)
      }
      return { element: 'polygon', attr: { points: points.join(' ') } }
    }
    default:
      return null
  }
}

export default defineFeature({
  name,
  async init (svgEditor) {
    const { svgCanvas } = svgEditor
    const { $req } = svgCanvas
    addFeatureLocale(svgEditor, name, import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>)

    /** In-progress stroke: document points, the preview polyline and the last client point kept. */
    let stroke: { points: { x: number, y: number }[], line: SVGPolylineElement, lastScreen: { x: number, y: number } } | null = null

    const createShape = (desc: { element: string; attr: Record<string, string | number | undefined>; open?: boolean; }) => {
      const attr: Record<string, string | number | undefined> = { id: svgCanvas.getNextId(), ...desc.attr }
      // An open line is only visible with a stroke; the others take the current paint.
      if (desc.open) {
        attr.fill = 'none'
        const color = svgCanvas.getColor('stroke')
        if (!color || color === 'none') attr.stroke = '#000000'
      }
      return svgCanvas.addSVGElementsFromJson({ element: desc.element, curStyles: true, attr: attr as Record<string, string | number> })
    }

    /** The elements a scribble covers: children of the current group / layer it touches. */
    const covered = (points: { x: number; y: number; }[]) => {
      const parent = svgCanvas.getCurrentGroup() || svgCanvas.getCurrentDrawing().getCurrentLayer()
      const base = (parent as SVGGraphicsElement | null)?.getScreenCTM?.()
      if (!parent || !base) return []
      const samples = sampleStroke(points)
      const box = samples.reduce((b, p) => ({
        x1: Math.min(b.x1, p.x), y1: Math.min(b.y1, p.y), x2: Math.max(b.x2, p.x), y2: Math.max(b.y2, p.y)
      }), { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity })
      // A cheap bounding-box cull; inside a transformed group the boxes are in another space, so skip it there.
      const inLayer = !svgCanvas.getCurrentGroup()
      return svgCanvas.getVisibleElements(parent).filter((el) => {
        if (inLayer) {
          const bb = svgCanvas.getStrokedBBoxDefaultVisible([el])
          if (!bb || bb.x > box.x2 || bb.y > box.y2 || bb.x + bb.width < box.x1 || bb.y + bb.height < box.y1) return false
        }
        return strokeTouches(el, samples, base)
      })
    }

    svgCanvas.registerTool({
      id: 'shaper',
      undoLabel: 'Shape stroke',

      pointerDown (ctx, ev) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
        line.setAttribute('fill', 'none')
        line.setAttribute('stroke', PREVIEW_STROKE)
        line.setAttribute('stroke-width', '2')
        line.setAttribute('stroke-linecap', 'round')
        line.setAttribute('stroke-linejoin', 'round')
        line.setAttribute('vector-effect', 'non-scaling-stroke')
        ctx.addOverlay(line)
        stroke = { points: [{ x: ev.rawX, y: ev.rawY }], line, lastScreen: { x: ev.screenX, y: ev.screenY } }
        line.setAttribute('points', `${ev.rawX},${ev.rawY}`)
      },

      pointerMove (ctx, ev) {
        if (!stroke) return
        // Skip sub-pixel jitter; the recognizer resamples by distance anyway.
        if (Math.hypot(ev.screenX - stroke.lastScreen.x, ev.screenY - stroke.lastScreen.y) < 1) return
        stroke.lastScreen = { x: ev.screenX, y: ev.screenY }
        stroke.points.push({ x: ev.rawX, y: ev.rawY })
        stroke.line.setAttribute('points', stroke.points.map((p: { x: number, y: number }) => `${p.x},${p.y}`).join(' '))
      },

      pointerUp (ctx, ev) {
        if (!stroke) return 'cancel'
        const { points } = stroke
        points.push({ x: ev.rawX, y: ev.rawY })
        stroke = null
        ctx.clearOverlays()
        const shape = recognize(points)
        if (!shape) return 'cancel'
        if (shape.type === 'scribble') {
          const hit = covered(points)
          if (!hit.length) return 'cancel'
          svgCanvas.selectOnly(hit, false)
          svgCanvas.deleteSelectedElements()
          return undefined
        }
        const desc = describeShape(shape)
        if (!desc) return 'cancel'
        return { created: createShape(desc) }
      },

      cancel () { stroke = null }
    })

    return {
      name: svgEditor.i18next.t(`${name}:name`),

      callback () {
        const title = `${name}:buttons.0.title`
        // Beside the other freehand tools: right after the pencil.
        svgCanvas.insertChildAtIndex(
          $req('tools_left'),
          `<se-button id="tool_shaper" command="tool_shaper" title="${title}" src="shaper.svg" shortcut="shift+N"></se-button>`,
          2
        )
        svgEditor.leftPanel.addModeCommand('tool_shaper', 'shaper', { label: title })
      }
    }
  }
})
