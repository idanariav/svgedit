/**
 * @file ext-width-tool.js
 *
 * Width tool: variable-width strokes edited on the canvas. Hovering a stroke shows a hollow diamond at the
 * closest spot, with the stroke's width there. Drag outward from the path to add a width point (or, on a
 * width point's side handle, to change it): both sides move together, Alt changes only the side being dragged.
 * Drag a width point's diamond along the path to slide it. Click one to select it, Delete removes the
 * selected point. The geometry is `width-outline.js` / `width-profile.js` and the stroke itself is
 * `drawWidthProfile` in `taper-stroke.js`; this file is the gesture, run as one undo step.
 *
 * Acts on the selected stroke, or with none selected on the one under the pointer. A line or polyline
 * becomes a path the first time a width point is made. Not in v1: a numeric editor for a point
 * (double-click), several points at once, a copy by Alt-dragging the diamond, steps (dropping a point on
 * another) and compound paths — see `roadmap.md`.
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft), `crates/tools/src/distort/width.rs`,
 * MIT OR Apache-2.0.
 *
 * @license MIT
 */

import { centerline, pointAt, locate } from '@svgedit/svgcanvas/core/width-outline.js'
import { profileAt, withPoint, withoutPoint, movedPoint, isProfile } from '@svgedit/svgcanvas/core/width-profile.js'
import { getTransformList, transformListToTransform } from '@svgedit/svgcanvas/core/math.js'

const name = 'width-tool'

/** How close (screen px) the pointer must be to a width point's diamond or side handle to take it. */
export const GRAB_PX = 9
/** How close (screen px) to the stroke's edge a press must be to add a width point there. */
export const NEAR_PX = 14
/** A drag shorter than this (screen px) is a click. */
export const CLICK_PX = 3
const INK = '#2b7fff'
const SVG_NS = 'http://www.w3.org/2000/svg'

const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  // Locale files are inlined into the bundle (statically resolved glob).
  const locales = import.meta.glob('./locale/*.js', { eager: true })
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

const UNIFORM = [[0, 1, 1], [1, 1, 1]]

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { $id } = svgCanvas
    await loadExtensionTranslation(svgEditor)

    /**
     * The stroke being worked on: its element, its centerline in the element's own coordinates, the stroke's
     * full width, the profile and the element's transform to the layer.
     * @typedef {object} Target
     * @property {Element} el
     * @property {any} line the centerline (see `centerline`)
     * @property {number} half half the stroke's full width
     * @property {Array<[number, number, number]>} points
     * @property {DOMMatrix|SVGMatrix} matrix local → layer
     * @property {DOMMatrix|SVGMatrix} inverse
     */

    /** @type {?Target} */
    let target = null
    /** The width point a click selected (index into the target's profile), and the element it belongs to. */
    let selected = { el: null, index: -1 }
    /** @type {?{mode: 'width'|'move', index: number, side: ?('left'|'right'), t: number, points0: any[], moved: boolean, press: {x: number, y: number}}} */
    let drag = null
    let hover = null

    const matrixOf = (el) => {
      const tlist = getTransformList(el)
      return tlist && tlist.numberOfItems ? transformListToTransform(tlist).matrix : null
    }

    /** The target for an element, or null when it cannot take a width profile. */
    const targetFor = (el) => {
      if (!el || !svgCanvas.canWidthStroke(el)) return null
      let d
      let width
      if (el.hasAttribute('se:taper-d')) {
        d = el.getAttribute('se:taper-d')
        width = parseFloat((el.getAttribute('se:taper-style') || '').split('|')[0])
      } else {
        const real = svgCanvas.getArrowSourcePoints(el)
        const pts = real || (el.tagName === 'line'
          ? [{ x: +el.getAttribute('x1'), y: +el.getAttribute('y1') }, { x: +el.getAttribute('x2'), y: +el.getAttribute('y2') }]
          : el.tagName === 'polyline'
            ? (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number).reduce((acc, v, i, a) => (i % 2 ? acc : [...acc, { x: v, y: a[i + 1] }]), [])
            : null)
        d = pts ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') : el.getAttribute('d')
        width = parseFloat(el.getAttribute('stroke-width'))
      }
      const line = centerline(d)
      if (!line || !(width > 0)) return null
      const m = matrixOf(el)
      const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
      const matrix = m || identity
      const inverse = m ? m.inverse() : identity
      return { el, line, half: width / 2, points: svgCanvas.getWidthProfile(el) ?? UNIFORM.map((p) => [...p]), matrix, inverse }
    }

    const apply = (m, p) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f })
    const toLocal = (t, ev) => apply(t.inverse, { x: ev.rawX, y: ev.rawY })

    /** The stroke a press or hover is about: the selected one, else the one under the pointer. */
    const pickTarget = (ev) => {
      for (const el of svgCanvas.getSelectedElements().filter(Boolean)) {
        const t = targetFor(el)
        if (t) return t
      }
      return targetFor(svgCanvas.getMouseTarget(ev.event))
    }

    /** The width points as the tool shows them: where, the left normal and the two side edges (local coordinates). */
    const marks = (t) => t.points.map(([pt, l, r], index) => {
      const { p, n } = pointAt(t.line, pt)
      return {
        index,
        t: pt,
        p,
        n,
        l: { x: p.x + n.x * t.half * l, y: p.y + n.y * t.half * l },
        r: { x: p.x - n.x * t.half * r, y: p.y - n.y * t.half * r }
      }
    })

    const near = (a, b, radius) => Math.hypot(a.x - b.x, a.y - b.y) <= radius

    /** What is under the pointer: a point's diamond, one of its side handles, the stroke, or nothing. */
    const hit = (t, q, zoom) => {
      const grab = GRAB_PX / zoom
      const list = marks(t)
      for (const m of list) {
        if (near(m.p, q, grab)) return { kind: 'center', m }
      }
      for (const m of list) {
        if (near(m.l, q, grab)) return { kind: 'handle', side: 'left', m }
        if (near(m.r, q, grab)) return { kind: 'handle', side: 'right', m }
      }
      const loc = locate(t.line, q)
      const [l, r] = profileAt(t.points, loc.t)
      if (loc.dist <= t.half * Math.max(l, r) + NEAR_PX / zoom) return { kind: 'stroke', loc }
      return null
    }

    // ---- overlay ---------------------------------------------------------------

    const mk = (tag, attrs) => {
      const e = document.createElementNS(SVG_NS, tag)
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
      return e
    }

    const diamond = (p, s, attrs) => mk('path', { d: `M${p.x},${p.y - s} L${p.x + s},${p.y} L${p.x},${p.y + s} L${p.x - s},${p.y} Z`, 'vector-effect': 'non-scaling-stroke', ...attrs })

    const draw = (ctx) => {
      ctx.clearOverlays()
      const t = target
      if (!t) return
      const s = 5 / ctx.zoom
      const g = mk('g', { transform: `matrix(${t.matrix.a} ${t.matrix.b} ${t.matrix.c} ${t.matrix.d} ${t.matrix.e} ${t.matrix.f})`, 'pointer-events': 'none' })
      const edge = { fill: '#fff', stroke: INK, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }
      for (const m of marks(t)) {
        const on = selected.el === t.el && selected.index === m.index
        g.append(
          mk('line', { x1: m.l.x, y1: m.l.y, x2: m.r.x, y2: m.r.y, stroke: INK, 'stroke-width': 1, 'stroke-dasharray': '3 3', 'vector-effect': 'non-scaling-stroke' }),
          mk('circle', { cx: m.l.x, cy: m.l.y, r: s * 0.7, ...edge }),
          mk('circle', { cx: m.r.x, cy: m.r.y, r: s * 0.7, ...edge }),
          diamond(m.p, s, { ...edge, fill: on ? INK : '#fff' })
        )
      }
      if (hover && !drag) {
        g.append(
          mk('line', { x1: hover.l.x, y1: hover.l.y, x2: hover.r.x, y2: hover.r.y, stroke: INK, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }),
          diamond(hover.p, s, { ...edge, 'fill-opacity': 0 })
        )
      }
      ctx.addOverlay(g)
    }

    const hoverAt = (t, hitResult) => {
      if (!hitResult || hitResult.kind !== 'stroke') return null
      const { loc } = hitResult
      const [l, r] = profileAt(t.points, loc.t)
      return {
        p: loc.p,
        l: { x: loc.p.x + loc.n.x * t.half * l, y: loc.p.y + loc.n.y * t.half * l },
        r: { x: loc.p.x - loc.n.x * t.half * r, y: loc.p.y - loc.n.y * t.half * r }
      }
    }

    // ---- editing ---------------------------------------------------------------

    /** The profile for the drag at pointer `q` (local coordinates). */
    const profileFor = (t, q, alt) => {
      const d = drag
      if (d.mode === 'move') {
        return movedPoint(d.points0, d.index, locate(t.line, q).t)
      }
      const { p, n } = pointAt(t.line, d.t)
      const off = ((q.x - p.x) * n.x + (q.y - p.y) * n.y) / t.half // + on the left side
      const [l0, r0] = profileAt(d.points0, d.t)
      let left = l0
      let right = r0
      if (alt && d.side === 'left') left = Math.max(0, off)
      else if (alt && d.side === 'right') right = Math.max(0, -off)
      else if (alt) {
        left = off > 0 ? off : l0
        right = off < 0 ? -off : r0
      } else {
        left = Math.abs(off)
        right = Math.abs(off)
      }
      return withPoint(d.points0, d.t, left, right)
    }

    const redraw = (t, points) => {
      if (!isProfile(points)) return
      const el = t.el.tagName === 'path' ? t.el : svgCanvas.widthStrokeAsPath(t.el)
      if (!svgCanvas.drawWidthProfile(el, points)) return
      if (el !== t.el) svgCanvas.selectOnly([el], true) // a line became a path
      t.el = el
      t.points = points
    }

    const finish = (changed) => {
      for (const el of changed) {
        if (svgCanvas.getSelectedElements().includes(el)) svgCanvas.gettingSelectorManager().requestSelector(el).resize()
      }
      svgCanvas.call('changed', changed)
    }

    svgCanvas.registerTool({
      id: 'width',
      undoLabel: 'Width',
      wantsHover: true,

      activate () {
        target = null
        drag = null
        hover = null
      },

      deactivate (ctx) {
        target = null
        drag = null
        hover = null
        selected = { el: null, index: -1 }
        ctx.clearOverlays()
      },

      pointerDown (ctx, ev) {
        drag = null
        target = pickTarget(ev)
        if (!target) {
          ctx.clearOverlays()
          return
        }
        if (!svgCanvas.getSelectedElements().includes(target.el)) svgCanvas.selectOnly([target.el], true)
        const q = toLocal(target, ev)
        const h = hit(target, q, ctx.zoom)
        if (!h) {
          draw(ctx)
          return
        }
        const press = { x: ev.screenX, y: ev.screenY }
        const points0 = target.points.map((p) => [...p])
        if (h.kind === 'center') {
          drag = { mode: 'move', index: h.m.index, side: null, t: h.m.t, points0, moved: false, press }
          selected = { el: target.el, index: h.m.index }
        } else if (h.kind === 'handle') {
          drag = { mode: 'width', index: h.m.index, side: h.side, t: h.m.t, points0, moved: false, press }
          selected = { el: target.el, index: h.m.index }
        } else {
          drag = { mode: 'width', index: -1, side: null, t: h.loc.t, points0, moved: false, press }
        }
        draw(ctx)
      },

      pointerMove (ctx, ev) {
        if (!drag) {
          // Hover: the stroke under the pointer, with a diamond where a point would go.
          const t = pickTarget(ev)
          target = t
          hover = t ? hoverAt(t, hit(t, toLocal(t, ev), ctx.zoom)) : null
          draw(ctx)
          return
        }
        if (!target) return
        if (!drag.moved && Math.hypot(ev.screenX - drag.press.x, ev.screenY - drag.press.y) < CLICK_PX) return
        drag.moved = true
        const points = profileFor(target, toLocal(target, ev), ev.mods.alt)
        if (drag.index < 0) drag.index = points.findIndex((p) => Math.abs(p[0] - drag.t) < 1e-6)
        redraw(target, points)
        draw(ctx)
      },

      pointerUp (ctx) {
        const d = drag
        drag = null
        if (!d || !target || !d.moved) {
          // A click: it selected a width point (or nothing) and changes no drawing.
          if (target) draw(ctx)
          return 'cancel'
        }
        selected = { el: target.el, index: d.index }
        finish([target.el])
        draw(ctx)
        return undefined
      },

      keyDown (ctx, ev) {
        if ((ev.key !== 'Delete' && ev.key !== 'Backspace') || !selected.el || selected.index < 0 || !selected.el.isConnected) return false
        const t = targetFor(selected.el)
        const profile = svgCanvas.getWidthProfile(selected.el)
        if (!t || !profile || profile.length <= 2) return false
        const next = withoutPoint(profile, selected.index)
        svgCanvas.transact('Delete width point', () => svgCanvas.drawWidthProfile(selected.el, next))
        selected = { el: selected.el, index: -1 }
        target = targetFor(selected.el)
        finish([selected.el])
        draw(ctx)
        ev.preventDefault()
        return true
      },

      cancel () {
        drag = null
      }
    })

    return {
      name: svgEditor.i18next.t(`${name}:name`),

      callback () {
        const title = `${name}:buttons.0.title`
        // Beside the other stroke tools: after the Smooth tool.
        svgCanvas.insertChildAtIndex(
          $id('tools_left'),
          `<se-button id="tool_width" command="tool_width" title="${title}" src="width-tool.svg"></se-button>`,
          4
        )
        svgEditor.leftPanel.addModeCommand('tool_width', 'width', { label: title })
      }
    }
  }
}
