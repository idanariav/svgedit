/**
 * @file ext-gradient-tool.ts
 *
 * Gradient tool: edit the gradient of the selected shape on the canvas. A bar runs from a round start handle to
 * a square end handle; coloured chips under it are the stops. Drag the start handle (or the bar) to move the
 * gradient, the end handle to change its length and angle (Shift = 45° steps; on a radial gradient it sets the
 * radius), click the bar to add a stop, drag a stop to move it (Alt drags a copy), drag it off the bar to delete
 * it, double-click it for its colour, Delete removes the selected one. A radial gradient also shows its extent
 * (a dashed ellipse) and a focal dot to drag off-centre (back onto the centre to centre it again).
 *
 * The maths and the DOM edits are `core/gradient-edit.js`: the units (`objectBoundingBox` / `userSpaceOnUse`)
 * and `gradientTransform` are kept, only the geometry attributes and the stops change. A gradient that other
 * elements share is copied for this one first (clone-on-write). Every gesture is one undo step (the tool
 * registry's transaction).
 *
 * Works on the fill, or the stroke when only that is a gradient (the options bar chooses). Not in v1: making a
 * gradient out of a solid paint by dragging (use the colour picker), snapping, rotating or squashing a radial
 * gradient (its `gradientTransform`), groups — see `roadmap.md`.
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft), `crates/tools/src/xform/gradient.rs`
 * (the annotator), MIT OR Apache-2.0.
 *
 * @license MIT
 */

import {
  multiply, invert, applyMatrix, readGradient, gradientOf, ensureOwnGradient, ownStops, setLinear, setRadial,
  addStop, copyStop, placeStop, removeStop, setStopColor
} from '@svgedit/svgcanvas/core/gradient-edit.ts'
import Paint from '@svgedit/svgcanvas/core/paint.ts'
import { closestRoot } from '../../domScope.ts'

const name = 'gradient-tool'

/** Hit radii and layout, in screen pixels. */
export const HANDLE = 6
const FOCAL_HIT = 4
const CENTRE_HIT = 9
const STOP_GAP = 11
const STOP_HIT = 7
const BAR_HIT = 4
/** A stop dragged farther than this from the bar is deleted on release. */
export const OFF_BAR = 24
/** A drag shorter than this (screen px) is a click. */
export const CLICK_PX = 3
const BAR = '#202020'
const LIGHT = '#f0f0f0'
const SVG_NS = 'http://www.w3.org/2000/svg'
const SHAPES = ['path', 'rect', 'ellipse', 'circle', 'line', 'polyline', 'polygon', 'text']

const loadExtensionTranslation = function (svgEditor: EditorInstance) {
  const lang = svgEditor.configObj.pref('lang')
  const locales = import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

const mk = (tag: string, attrs: Record<string, unknown>) => {
  const e = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  return e
}

const toMatrix = (m: DOMMatrix) => ({ a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f })
const sub = (p: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point, q: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point) => ({ x: p.x - q.x, y: p.y - q.y })
const add = (p: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point, q: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point) => ({ x: p.x + q.x, y: p.y + q.y })
const dist = (p: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point, q: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point) => Math.hypot(p.x - q.x, p.y - q.y)

/** `#rrggbb` for any CSS colour (named, rgb(), …); black when the browser cannot parse it. */
const toHex = (color: string | CanvasGradient | CanvasPattern) => {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return '#000000'
  ctx.fillStyle = '#000000'
  ctx.fillStyle = color
  const parsed = ctx.fillStyle
  return typeof parsed === 'string' && /^#[0-9a-f]{6}$/i.test(parsed) ? parsed : '#000000'
}

export default {
  name,
  async init () {
    const svgEditor = (this as unknown) as import('../../Editor.ts').default
    const { svgCanvas } = svgEditor
    const { $req } = svgCanvas
    await loadExtensionTranslation(svgEditor)
    const tr = (key: string) => svgEditor.i18next.t(`${name}:${key}`)

    interface Target {
      el: Element
      prop: 'fill' | 'stroke'
      grad: Element
      model: import('@svgedit/svgcanvas/core/gradient-edit.ts').GradientModel
      /** gradient space → document */
      T: { a: number, b: number, c: number, d: number, e: number, f: number }
      Tinv: { a: number, b: number, c: number, d: number, e: number, f: number } | null
    }
    /**
     * The gradient being edited: the element and paint, the gradient element, its model (`readGradient`), and the
     * matrix from gradient space to document units (the model's `toLocal` under the element's transform).
     */

    type Part = { kind: string, index?: number, t?: number }
    /** Where a press landed on the annotator. */

    interface Drag {
      part: Part
      /** where the pointer went down, in document units */
      press: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point
      /** handle position minus `press` */
      grab: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point
      /** the geometry before the drag, in gradient space */
      base: { p1: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point, p2: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point, r: number, focal: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point }
      /** where the pointer went down, in screen pixels */
      screen: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point
      /** passed the click threshold */
      moved: boolean
      /** Alt held on a stop: drag a copy */
      copy: boolean
      /** the stop being dragged */
      node: Element | null
      index: number | undefined
      copied?: boolean
      pendingDelete?: boolean
    }
    /** A drag in progress. */

    /** Which paint the tool edits when both are gradients. */
    let preferred: 'fill' | 'stroke' = 'fill'
    let target: Target | null = null
    /** The selected stop's element (follows a clone-on-write by index). */
    let selectedStop: Element | null = null
    let drag: Drag | null = null
    let hover: string | null = null
    let toolCtx: import('@svgedit/svgcanvas').ToolContext | null = null

    const scope = () => svgCanvas.getSvgContent()

    // ---- coordinates ------------------------------------------------------------

    /** The first layer's screen matrix: the one every pointer event is mapped through. */
    const rootMatrix = () => {
      const g = scope().querySelector('g')
      const m = g?.getScreenCTM?.()
      return m ? toMatrix(m) : null
    }

    /** A pointer event in document units. */
    const docPoint = (ev: import('@svgedit/svgcanvas').ToolEvent) => {
      const inv = invert(rootMatrix() ?? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
      return inv ? applyMatrix(inv, { x: ev.screenX, y: ev.screenY }) : { x: ev.rawX, y: ev.rawY }
    }

    /** The element's local space → document units, through every group above it. */
    const localToDoc = (el: Element) => {
      const root = rootMatrix()
      const own = (el as SVGGraphicsElement).getScreenCTM?.()
      const inv = root && invert(root)
      return inv && own ? multiply(inv, toMatrix(own)) : null
    }

    // ---- target ------------------------------------------------------------------

    const targetFor = (el: Element, wanted = preferred): Target | null => {
      if (!el || !SHAPES.includes(el.tagName.toLowerCase())) return null
      const order: Array<'fill' | 'stroke'> = wanted === 'stroke' ? ['stroke', 'fill'] : ['fill', 'stroke']
      const prop = order.find((p) => gradientOf(scope(), el, p))
      if (!prop) return null
      return read(el, prop, (gradientOf(scope(), el, prop) as Element))
    }

    /** Read `grad` for `(el, prop)` into a target (null when the gradient cannot be edited). */
    const read = (el: Element, prop: 'fill' | 'stroke', grad: Element): Target | null => {
      let box = null
      try {
        const b = (el as SVGGraphicsElement).getBBox()
        box = { x: b.x, y: b.y, width: b.width, height: b.height }
      } catch (e) { /* not rendered */ }
      const model = readGradient(scope(), grad, box)
      const L = localToDoc(el)
      if (!model || !L) return null
      const T = multiply(L, model.toLocal)
      return { el, prop, grad, model, T, Tinv: invert(T) }
    }

    const selectedTarget = () => {
      const elems = svgCanvas.getSelectedElements().filter(Boolean)
      return elems.length === 1 ? targetFor(elems[0]) : null
    }

    /** Re-read the target's gradient after an edit. */
    const reread = (t: Target) => {
      const fresh = read(t.el, t.prop, t.grad)
      if (fresh) Object.assign(t, fresh)
      return fresh
    }

    // ---- geometry in document units ------------------------------------------------

    /** Bar start / end (a radial's centre and the point `r` to its right), focal point, stop positions. */
    const parts = (t: Target) => {
      const { model, T } = t
      const start = applyMatrix(T, model.p1)
      const end = applyMatrix(T, model.p2)
      const v = sub(end, start)
      const len = Math.hypot(v.x, v.y)
      const normal = len < 1e-9 ? { x: 0, y: 1 } : { x: -v.y / len, y: v.x / len }
      return { start, end, v, len, normal, focal: applyMatrix(T, model.focal), radial: model.kind === 'radial' }
    }

    const barPoint = (p: ReturnType<typeof parts>, offset: number) => ({ x: p.start.x + p.v.x * offset, y: p.start.y + p.v.y * offset })

    const hit = (t: Target, pt: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point, zoom: number): Part | null => {
      const p = parts(t)
      const near = (q: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point, px: number) => dist(q, pt) <= px / zoom
      const stops = t.model.stops
      for (let i = stops.length - 1; i >= 0; i--) {
        const q = barPoint(p, stops[i].offset)
        if (near({ x: q.x + p.normal.x * STOP_GAP / zoom, y: q.y + p.normal.y * STOP_GAP / zoom }, STOP_HIT)) return { kind: 'stop', index: i }
      }
      if (near(p.end, HANDLE)) return { kind: 'end' }
      if (p.radial && near(p.focal, FOCAL_HIT)) return { kind: 'focal' }
      if (near(p.start, p.radial ? CENTRE_HIT : HANDLE)) return { kind: 'start' }
      if (p.len > 1e-9) {
        const d = sub(pt, p.start)
        const along = (d.x * p.v.x + d.y * p.v.y) / (p.len * p.len)
        const across = d.x * p.normal.x + d.y * p.normal.y
        if (along >= 0 && along <= 1 && across >= -BAR_HIT / zoom && across <= (STOP_GAP + STOP_HIT) / zoom) return { kind: 'bar', t: along }
      }
      return null
    }

    // ---- overlay ----------------------------------------------------------------------

    const draw = (ctx: import('@svgedit/svgcanvas').ToolContext) => {
      ctx.clearOverlays()
      const t = target
      if (!t) return
      const z = ctx.zoom
      const p = parts(t)
      const g = mk('g', { 'pointer-events': 'none' })
      const line = (a: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point, b: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point, color: string, extra = {}) => mk('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: color, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', ...extra })
      if (p.radial) {
        const pts = []
        for (let i = 0; i < 64; i++) {
          const a = (i / 64) * Math.PI * 2
          const q = applyMatrix(t.T, { x: t.model.p1.x + t.model.r * Math.cos(a), y: t.model.p1.y + t.model.r * Math.sin(a) })
          pts.push(`${q.x},${q.y}`)
        }
        const ring = { points: pts.join(' '), fill: 'none', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }
        g.append(mk('polygon', { ...ring, stroke: LIGHT }), mk('polygon', { ...ring, stroke: BAR, 'stroke-dasharray': '4 3' }))
      }
      const shade = 1 / z
      g.append(
        line({ x: p.start.x, y: p.start.y + shade }, { x: p.end.x, y: p.end.y + shade }, LIGHT),
        line(p.start, p.end, BAR)
      )
      const r = 4.5 / z
      t.model.stops.forEach((s, i) => {
        const q = barPoint(p, s.offset)
        const c = { x: q.x + p.normal.x * STOP_GAP / z, y: q.y + p.normal.y * STOP_GAP / z }
        const picked = s.node === selectedStop
        const pending = drag && drag.pendingDelete && drag.node === s.node
        g.append(
          line(q, c, BAR),
          mk('rect', {
            x: c.x - r,
            y: c.y - r,
            width: 2 * r,
            height: 2 * r,
            fill: s.color,
            'fill-opacity': pending ? 0.25 : Math.max(s.opacity, 0.15),
            stroke: picked ? '#2b7fff' : BAR,
            'stroke-width': picked ? 2 : 1,
            'vector-effect': 'non-scaling-stroke'
          })
        )
        if (hover === `stop${i}`) (g.lastChild as Element).setAttribute('stroke-width', '2')
      })
      const dot = (q: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point, rad: number, fill: string, key: string | null) => mk('circle', { cx: q.x, cy: q.y, r: rad / z, fill: hover === key ? BAR : fill, stroke: BAR, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' })
      g.append(
        p.radial ? mk('circle', { cx: p.start.x, cy: p.start.y, r: 4.5 / z, fill: 'none', stroke: BAR, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }) : dot(p.start, 4.5, '#fff', 'start'),
        mk('rect', { x: p.end.x - 4 / z, y: p.end.y - 4 / z, width: 8 / z, height: 8 / z, fill: hover === 'end' ? '#fff' : BAR, stroke: '#fff', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' })
      )
      if (p.radial) g.append(dot(p.focal, 2.5, '#fff', 'focal'))
      ctx.addOverlay(g)
    }

    const redrawIdle = () => {
      if (!toolCtx || drag || svgCanvas.getMode() !== 'gradient') return
      target = selectedTarget()
      if (!target || !target.model.stops.some((s) => s.node === selectedStop)) selectedStop = null
      hover = null
      draw(toolCtx)
    }

    // ---- editing -------------------------------------------------------------------------

    /**
     * Before the first change of a gesture (once): an unshared gradient with its own stops. Returns false if the
     * gradient cannot be read afterwards. The selected stop is carried over to the copy by index.
     */
    const own = (t: Target) => {
      const stopIndex = selectedStop ? t.model.stops.findIndex((s: { node: Element | null; }) => s.node === selectedStop) : -1
      t.grad = ensureOwnGradient(scope(), t.el, t.prop, t.grad, () => svgCanvas.getNextId())
      const stops = ownStops(scope(), t.grad)
      if (!reread(t)) return false
      selectedStop = stopIndex >= 0 ? stops[stopIndex] : null
      return true
    }

    /** Write the geometry in gradient space. */
    const writeGeometry = (t: Target, p1: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point, p2: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point | null, r: number, focal: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point) => {
      if (t.model.kind === 'linear') setLinear(t.grad, p1, (p2 as import('@svgedit/svgcanvas/core/gradient-edit.ts').Point))
      else setRadial(t.grad, p1, r, focal)
    }

    const finish = (el: Element) => {
      svgCanvas.call('changed', [el])
    }

    // ---- gestures ------------------------------------------------------------------------

    const moveGesture = (ctx: import('@svgedit/svgcanvas').ToolContext, ev: import('@svgedit/svgcanvas').ToolEvent, d: Drag) => {
      const t = target
      if (!t || !t.Tinv) return
      const { Tinv } = t
      const cur = docPoint(ev)
      const m = d.base
      const g = (q: import('@svgedit/svgcanvas/core/gradient-edit.ts').Point) => applyMatrix(Tinv, q)
      switch (d.part.kind) {
        case 'start':
        case 'bar': {
          const delta = sub(g(cur), g(d.press))
          writeGeometry(t, add(m.p1, delta), add(m.p2, delta), m.r, add(m.focal, delta))
          break
        }
        case 'end': {
          let q = add(cur, d.grab)
          if (ev.mods.shift && t.model.kind === 'linear') {
            const s = applyMatrix(t.T, m.p1)
            const v = sub(q, s)
            const step = Math.PI / 4
            const a = Math.round(Math.atan2(v.y, v.x) / step) * step
            const len = Math.hypot(v.x, v.y)
            q = { x: s.x + len * Math.cos(a), y: s.y + len * Math.sin(a) }
          }
          const gq = g(q)
          if (t.model.kind === 'linear') writeGeometry(t, m.p1, gq, 0, m.focal)
          else writeGeometry(t, m.p1, null, Math.max(dist(gq, m.p1), 1e-4), m.focal)
          break
        }
        case 'focal': {
          let f = g(add(cur, d.grab))
          const off = sub(f, m.p1)
          const len = Math.hypot(off.x, off.y)
          const max = m.r * 0.98
          if (len > max && len > 0) f = { x: m.p1.x + off.x / len * max, y: m.p1.y + off.y / len * max }
          if (dist(applyMatrix(t.T, f), applyMatrix(t.T, m.p1)) < 6 / ctx.zoom) f = { ...m.p1 }
          writeGeometry(t, m.p1, null, m.r, f)
          break
        }
        case 'stop': {
          const p = parts(t)
          if (p.len < 1e-9) break
          const dd = sub(cur, p.start)
          const along = (dd.x * p.v.x + dd.y * p.v.y) / (p.len * p.len)
          const across = Math.abs(dd.x * p.normal.x + dd.y * p.normal.y)
          if (d.copy && !d.copied) {
            d.node = copyStop((d.node as Element), along)
            d.copied = true
          }
          d.pendingDelete = across > OFF_BAR / ctx.zoom && t.model.stops.length > 2
          if (!d.pendingDelete) placeStop((d.node as Element), along)
          selectedStop = d.node
          break
        }
      }
      reread(t)
    }

    /** Open the colour dialog on a stop; applying is its own undo step. */
    const editStopColor = (stopNode: Element) => {
      const t = target
      if (!t) return
      const stop = t.model.stops.find((s) => s.node === stopNode)
      if (!stop) return
      const root = closestRoot($req('svgcanvas'))
      const dialog = document.createElement('se-color-dialog')
      dialog.paint = new Paint({ alpha: Math.round(stop.opacity * 100), solidColor: toHex(stop.color).slice(1) })
      dialog.type = 'fill'
      dialog.i18next = svgEditor.i18next
      dialog.addEventListener('change', (evt) => {
        const paint = (evt as CustomEvent).detail.paint
        if (paint.type !== 'solidColor' || paint.solidColor === 'none') return
        const index = t.model.stops.indexOf(stop)
        svgCanvas.transact('Gradient stop colour', () => {
          if (!own(t)) return
          const node = ownStops(scope(), t.grad)[index]
          setStopColor(node, `#${paint.solidColor}`, paint.alpha / 100)
          selectedStop = node
        })
        finish(t.el)
        redrawIdle()
      })
      ;(('body' in root ? root.body : null) ?? root).appendChild(dialog)
    }

    svgCanvas.registerTool({
      id: 'gradient',
      undoLabel: 'Edit gradient',
      wantsHover: true,

      activate (ctx) {
        toolCtx = ctx
        drag = null
        hover = null
        selectedStop = null
        target = selectedTarget()
        draw(ctx)
      },

      deactivate (ctx) {
        target = null
        drag = null
        hover = null
        selectedStop = null
        ctx.clearOverlays()
      },

      pointerDown (ctx, ev) {
        drag = null
        let t = selectedTarget()
        let part = t ? hit(t, docPoint(ev), ctx.zoom) : null
        if (!part) {
          // Not on the annotator of the selection: a pressed shape with a gradient becomes the target.
          const other = targetFor(svgCanvas.getMouseTarget(ev.event))
          if (other) {
            t = other
            part = hit(t, docPoint(ev), ctx.zoom)
          }
        }
        target = t
        if (!t) {
          selectedStop = null
          ctx.clearOverlays()
          return
        }
        if (svgCanvas.getSelectedElements().filter(Boolean)[0] !== t.el) svgCanvas.selectOnly([t.el], true)
        if (part) {
          svgCanvas.setCursorHint(part.kind === 'bar' ? 'add' : 'grabbing')
          const press = docPoint(ev)
          const m = t.model
          const handle = part.kind === 'end' ? parts(t).end : part.kind === 'focal' ? parts(t).focal : press
          drag = {
            part,
            press,
            grab: sub(handle, press),
            base: { p1: { ...m.p1 }, p2: { ...m.p2 }, r: m.r, focal: { ...m.focal } },
            screen: { x: ev.screenX, y: ev.screenY },
            moved: false,
            copy: part.kind === 'stop' && ev.mods.alt,
            node: part.kind === 'stop' ? m.stops[part.index as number].node : null,
            index: part.index
          }
          if (part.kind === 'stop') selectedStop = drag.node
        }
        draw(ctx)
      },

      pointerMove (ctx, ev) {
        if (!drag) {
          const part = target ? hit(target, docPoint(ev), ctx.zoom) : null
          const key = part ? (part.kind === 'stop' ? `stop${part.index}` : part.kind) : null
          // On the bar a press adds a stop; on a stop or a handle a drag moves it.
          svgCanvas.setCursorHint(part ? (part.kind === 'bar' ? 'add' : 'grab') : null)
          if (key !== hover) {
            hover = key
            draw(ctx)
          }
          return
        }
        if (!target) return
        if (!drag.moved) {
          if (Math.hypot(ev.screenX - drag.screen.x, ev.screenY - drag.screen.y) < CLICK_PX) return
          drag.moved = true
          if (!own(target)) return
          // The copy of a shared gradient has its own stop nodes: find ours again by index.
          if (drag.part.kind === 'stop') drag.node = target.model.stops[drag.index as number].node
        }
        moveGesture(ctx, ev, drag)
        draw(ctx)
      },

      pointerUp (ctx, ev) {
        const d = drag
        drag = null
        svgCanvas.setCursorHint(null) // the pointer moves again before it needs a hint
        const t = target
        if (!d || !t) {
          draw(ctx)
          return undefined
        }
        if (!d.moved) {
          // A click: on the bar it adds a stop; on a stop it selects (a second click asks for the colour).
          if (d.part.kind === 'bar' && own(t)) {
            selectedStop = addStop(t.grad, (d.part.t as number))
            reread(t)
            finish(t.el)
          } else if (d.part.kind === 'stop' && ev.event.detail >= 2) {
            const node = d.node as Element
            setTimeout(() => editStopColor(node), 0)
          }
          draw(ctx)
          return undefined
        }
        if (d.pendingDelete && d.node) {
          removeStop(d.node)
          selectedStop = null
          reread(t)
        }
        finish(t.el)
        draw(ctx)
        return undefined
      },

      keyDown (ctx, ev) {
        const t = target
        if (!t || !selectedStop || (ev.key !== 'Delete' && ev.key !== 'Backspace')) return false
        const index = t.model.stops.findIndex((s) => s.node === selectedStop)
        if (index < 0 || t.model.stops.length <= 2) return true
        svgCanvas.transact('Delete gradient stop', () => {
          if (!own(t)) return
          removeStop(ownStops(scope(), t.grad)[index])
        })
        selectedStop = null
        reread(t)
        finish(t.el)
        draw(ctx)
        return true
      },

      cancel () {
        drag = null
        redrawIdle()
      },

      options: () => [{
        id: 'paint',
        type: 'select',
        label: tr('paint'),
        title: tr('paintTitle'),
        value: target ? target.prop : preferred,
        choices: [{ value: 'fill', label: tr('fill') }, { value: 'stroke', label: tr('stroke') }]
      }],

      setOption (id, value) {
        if (id !== 'paint') return
        preferred = value === 'stroke' ? 'stroke' : 'fill'
        selectedStop = null
        redrawIdle()
      }
    })

    return {
      name: svgEditor.i18next.t(`${name}:name`),

      callback () {
        const title = `${name}:buttons.0.title`
        // Beside the other on-canvas editors: after the Distort tool.
        svgCanvas.insertChildAtIndex(
          $req('tools_left'),
          `<se-button id="tool_gradient" command="tool_gradient" title="${title}" src="gradient-tool.svg"></se-button>`,
          6
        )
        svgEditor.leftPanel.addModeCommand('tool_gradient', 'gradient', { label: title })
      },

      selectedChanged: redrawIdle,
      elementChanged: redrawIdle
    }
  }
}
