/**
 * @file ext-corner-tool.ts
 *
 * The Corners tool (`tool_corners`, mode `corners`): a widget inside each corner of the selected shape. Drag one
 * and the radius follows the pointer along the corner's bisector, from square to fully round (one undo step per
 * drag); Alt-click cycles the kind (round, inverted round, chamfer). A click picks a widget (Shift-click adds or
 * removes one; the *Pick several* option is that Shift for touch, and the Corner choice does what Alt-click does): with some picked, a drag, the Radius field and the Kind choice of the options bar edit those
 * corners only; with none picked they edit every corner that shows a widget, as the panel does. The maths is
 * `core/corner-radius.js` (the cuts are `svgCanvas.applyCornerRadius`, which runs inside the gesture's
 * transaction); this file is the gesture and its overlay.
 *
 * Lives apart from `ext-corner-radius` (the panel) so its button sits with the other on-canvas editors; both edit
 * the same `se:corner-radius` attributes.
 *
 * Works on the selected shape (path, polygon, polyline or rect), or the one pressed when it is not a widget of
 * the selection; a polygon, polyline or rect becomes a path on the first cut.
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft), `crates/tools/src/corners.rs`
 * (`CornerWidgets`, `CornerDrag`), MIT OR Apache-2.0. Not ported: widgets in the Selection / Direct Selection
 * tools (this is a tool of its own), the Corners dialog (double-click), Hide Corner Widget for wide angles, and
 * the red outline of corners at their largest radius — see `roadmap.md`.
 *
 * @license MIT
 */

import {
  CORNER_KINDS, CORNER_RADIUS_ATTR, CORNER_SOURCE_ATTR, cornerRadiusChange, isCornerStateCurrent, cornerWidgetAt, fittedCornerRadius, maxCornerRadius
} from '@svgedit/svgcanvas/core/corner-radius.ts'
import { invert } from '@svgedit/svgcanvas/core/gradient-edit.ts'
import { toolSpace } from '../../toolSpace.ts'
import { refreshToolOptions } from '../../panels/toolOptionsBar.ts'
import { defineFeature, addFeatureLocale } from '../defineFeature.ts'

/** How close (screen px) the pointer must be to a widget to take it. */
export const GRAB_PX = 8
/** A drag shorter than this (screen px) is a click. */
export const CLICK_PX = 3
/** Widgets sit at least this far inside their corner (screen px, along each side of a right angle). */
export const MIN_INSET_PX = 10
/** Corners with a side shorter than this on screen (px) hide their widget. */
export const MIN_SIDE_PX = 30
const INK = '#2b7fff'
const SVG_NS = 'http://www.w3.org/2000/svg'
const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

const apply = (m: { a: number, b: number, c: number, d: number, e: number, f: number }, p: import('@svgedit/svgcanvas/core/anchor-path.ts').Pt) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f })

const mk = (tag: string, attrs: Record<string, unknown>) => {
  const e = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  return e
}

const name = 'corner-tool'

export default defineFeature({
  name,
  async init (svgEditor) {
    addFeatureLocale(svgEditor, name, import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>)
    const tr = (key: string) => svgEditor.i18next.t(`${name}:${key}`)

    /**
     * Drop stale corner attributes when the element's `d` was rewritten outside the corner pipeline (the panel's
     * `ext-corner-radius` does the same on selection; the tool may be asked first).
 * @returns true when the element still carries valid corners.
     */
    const reconcile = (elem: Element): boolean => {
      const stacked = svgEditor.svgCanvas.reconcileLiveStack(elem)
      if (stacked !== null) return stacked
      if (isCornerStateCurrent(elem)) return true
      elem.removeAttribute(CORNER_SOURCE_ATTR)
      elem.removeAttribute(CORNER_RADIUS_ATTR)
      return false
    }

    const { svgCanvas } = svgEditor
    const { $req } = svgCanvas

    type Matrix = { a: number, b: number, c: number, d: number, e: number, f: number }

    type Widget = { index: number, radius: number, kind: import('@svgedit/svgcanvas/core/corner-radius.ts').CornerKind, max: number, corner: import('@svgedit/svgcanvas/core/corner-radius.ts').Corner, at: { x: number, y: number } }

    interface Target {
      el: Element
      /** the corners that show a widget */
      widgets: Widget[]
      /** local → layer */
      matrix: Matrix
      inverse: Matrix
    }
    /**
     * The shape being edited: its element, its corners (`getCornerSettings`) with their widgets' places in the
     * layer's coordinates, and the element's transform to the layer.
     */

    /** The kind a corner gets when it is first cut. */
    let preferredKind: import('@svgedit/svgcanvas/core/corner-radius.ts').CornerKind = 'r'
    /** The "Pick several" option: Shift held for good, for a screen with no Shift key (the Corner choice stands in for Alt-click). */
    let pickMore = false
    let target: Target | null = null
    /** Picked corners (anchor indices) of `target.el`; empty = every corner that shows a widget. */
    let picked: Set<number> = new Set()
    let pickedEl: Element | null = null
    let hover = -1
    let toolCtx: import('@svgedit/svgcanvas').ToolContext | null = null
    let drag: { w: Widget, press: { x: number, y: number }, start: { x: number, y: number }, radius0: number, targets: number[], fresh: boolean, alt: boolean, shift: boolean, moved: boolean, radius: number, at: { x: number, y: number } } | null = null

    /** Document units for the pointer and the shape alike, through every group above the shape (`toolSpace.ts`). */
    const space = toolSpace(svgCanvas)

    const targetFor = (el: Element | null | undefined): Target | null => {
      if (!el || el.nodeType !== 1) return null
      if (el.tagName === 'path' && el.hasAttribute(CORNER_SOURCE_ATTR)) reconcile(el)
      if (!svgCanvas.canRoundCorners(el)) return null
      const matrix = space.localToDoc(el)
      if (!matrix) return null
      const det = Math.abs(matrix.a * matrix.d - matrix.b * matrix.c)
      if (det < 1e-12) return null
      // Screen pixels per unit of the element's own space.
      const scale = svgCanvas.getZoom() * Math.sqrt(det)
      const widgets = svgCanvas.getCornerSettings(el)
        .filter((s) => Math.min(s.corner.lu, s.corner.lv) * scale >= MIN_SIDE_PX)
        .map((s) => ({ ...s, at: apply(matrix, cornerWidgetAt(s.corner, s.radius, MIN_INSET_PX / scale)) }))
      if (!widgets.length) return null
      if (el !== pickedEl) {
        picked = new Set()
        pickedEl = el
      }
      return { el, widgets, matrix, inverse: invert(matrix) ?? IDENTITY }
    }

    const selectedTarget = () => {
      const elems = svgCanvas.getSelectedElements().filter(Boolean)
      return elems.length === 1 ? targetFor(elems[0]) : null
    }

    const hit = (t: Target, ev: { screenX: number, screenY: number, rawX: number, rawY: number }, zoom: number) => {
      let best: Widget | null = null
      let bestDist = GRAB_PX / zoom
      const at = space.docPoint(ev)
      for (const w of t.widgets) {
        const dist = Math.hypot(w.at.x - at.x, w.at.y - at.y)
        if (dist <= bestDist) {
          best = w
          bestDist = dist
        }
      }
      return best
    }

    /** The corners an edit reaches: the picked ones that show, else every one that shows. */
    const targetsOf = (t: Target) => {
      const shown = t.widgets.map((w) => w.index)
      const some = shown.filter((i) => picked.has(i))
      return some.length ? some : shown
    }

    // ---- overlay ---------------------------------------------------------------

    const draw = (ctx: import('@svgedit/svgcanvas').ToolContext) => {
      ctx.clearOverlays()
      const t = target
      if (!t) return
      const s = 5 / ctx.zoom
      const g = mk('g', { 'pointer-events': 'none' })
      for (const w of t.widgets) {
        const on = picked.has(w.index) || w.index === hover || (drag && drag.w.index === w.index)
        g.append(mk('circle', {
          cx: w.at.x,
          cy: w.at.y,
          r: s,
          fill: on ? INK : '#fff',
          stroke: INK,
          'stroke-width': picked.has(w.index) ? 2 : 1,
          'vector-effect': 'non-scaling-stroke'
        }))
      }
      if (drag && drag.moved) {
        const text = mk('text', {
          x: drag.at.x + 12 / ctx.zoom,
          y: drag.at.y - 8 / ctx.zoom,
          'font-size': 11 / ctx.zoom,
          'font-family': 'sans-serif',
          fill: INK,
          stroke: '#fff',
          'stroke-width': 3 / ctx.zoom,
          'paint-order': 'stroke'
        })
        text.textContent = `${tr('radius')} ${Math.round(drag.radius * 100) / 100}`
        g.append(text)
      }
      ctx.addOverlay(g)
    }

    const redrawIdle = () => {
      if (!toolCtx || drag || svgCanvas.getMode() !== 'corners') return
      target = selectedTarget()
      hover = -1
      draw(toolCtx)
      refreshToolOptions(svgEditor)
    }

    // ---- editing ---------------------------------------------------------------

    /**
     * Cut the `corners` of `t` to `radius` (and give corners that were not cut yet the preferred kind), inside the
     * caller's transaction or as its own undo step. Returns the shape afterwards (a rect becomes a path).
     */
    const cut = (t: Target, radius: number, corners: number[], fresh: boolean) => {
      if (svgCanvas.getSelectedElements().filter(Boolean)[0] !== t.el) svgCanvas.selectOnly([t.el], true)
      const el = svgCanvas.applyCornerRadius(radius, fresh ? { kind: preferredKind, corners } : { corners })
      if (el && el !== t.el) pickedEl = el // a rect became a path: the picks carry over
      return el || t.el
    }

    const radiusOf = (t: Target, index: number) => t.widgets.find((w) => w.index === index)?.radius ?? 0

    /** Every targeted corner is still square: they get the preferred kind. */
    const isFresh = (t: Target, corners: number[]) => corners.every((i) => radiusOf(t, i) === 0)

    const nextKind = (kind: import('@svgedit/svgcanvas/core/corner-radius.ts').CornerKind) => CORNER_KINDS[(CORNER_KINDS.indexOf(kind) + 1) % CORNER_KINDS.length]

    /** Change only the kind of the cut `corners` of `t`. */
    const setKind = (t: Target, kind: import('@svgedit/svgcanvas/core/corner-radius.ts').CornerKind, corners: number[]) => {
      if (svgCanvas.getSelectedElements().filter(Boolean)[0] !== t.el) svgCanvas.selectOnly([t.el], true)
      svgCanvas.applyCornerRadius(undefined, { kind, corners })
    }

    svgCanvas.registerTool({
      id: 'corners',
      undoLabel: 'Corner radius',
      wantsHover: true,

      activate (ctx) {
        toolCtx = ctx
        drag = null
        hover = -1
        target = selectedTarget()
        draw(ctx)
      },

      deactivate (ctx) {
        target = null
        drag = null
        hover = -1
        picked = new Set()
        pickedEl = null
        ctx.clearOverlays()
      },

      pointerDown (ctx, ev) {
        drag = null
        let t = selectedTarget()
        let w = t ? hit(t, ev, ctx.zoom) : null
        if (!w) {
        // Not on a widget of the selection: a pressed shape that can take corners becomes the target.
          const other = targetFor(svgCanvas.getMouseTarget(ev.event))
          if (other) {
            t = other
            w = hit(t, ev, ctx.zoom)
          }
        }
        target = t
        if (!t) {
          picked = new Set()
          ctx.clearOverlays()
          return
        }
        if (svgCanvas.getSelectedElements().filter(Boolean)[0] !== t.el) svgCanvas.selectOnly([t.el], true)
        if (!w) {
          picked = new Set()
        } else {
          const targets = picked.has(w.index) ? targetsOf(t) : (picked.size ? [w.index] : targetsOf(t))
          svgCanvas.setCursorHint('grabbing')
          drag = {
            w,
            press: { x: ev.screenX, y: ev.screenY },
            start: space.docPoint(ev),
            radius0: fittedCornerRadius(w.corner, w.radius),
            targets,
            fresh: isFresh(t, targets),
            alt: ev.mods.alt,
            shift: ev.mods.shift || pickMore,
            moved: false,
            radius: w.radius,
            at: space.docPoint(ev)
          }
        }
        draw(ctx)
      },

      pointerMove (ctx, ev) {
        if (!drag) {
          const w = target ? hit(target, ev, ctx.zoom) : null
          const i = w ? w.index : -1
          svgCanvas.setCursorHint(w ? 'grab' : null) // a drag on the widget rounds the corner
          if (i !== hover) {
            hover = i
            draw(ctx)
          }
          return
        }
        if (!target) return
        if (!drag.moved && Math.hypot(ev.screenX - drag.press.x, ev.screenY - drag.press.y) < CLICK_PX) return
        drag.moved = true
        // The pointer's travel in the element's own space, along the corner's bisector.
        const a = apply(target.inverse, drag.start)
        const b = apply(target.inverse, space.docPoint(ev))
        const radius = Math.round(
          Math.min(Math.max(drag.radius0 + cornerRadiusChange(drag.w.corner, { x: b.x - a.x, y: b.y - a.y }), 0), maxCornerRadius(drag.w.corner)) * 100
        ) / 100
        drag.radius = radius
        drag.at = space.docPoint(ev)
        const el = cut(target, radius, drag.targets, drag.fresh)
        const t = targetFor(el)
        if (t) {
          target = t
          const d = drag
          const w = t.widgets.find((x) => x.index === d.w.index)
          if (w) d.w = { ...w, corner: d.w.corner }
        }
        draw(ctx)
      },

      pointerUp () {
        const d = drag
        drag = null
        svgCanvas.setCursorHint(null) // the pointer moves again before it needs a hint
        // The registry clears the overlays, then commits (which does not report a shape it replaced, nor a
        // click that changed nothing): draw again once it is done.
        queueMicrotask(redrawIdle)
        if (!d || !target) return undefined
        if (d.moved) return undefined
        if (d.alt) {
          // Alt-click: the next kind for the targeted corners (a square corner keeps it for when it is cut).
          const kind = nextKind(d.w.radius > 0 ? d.w.kind : preferredKind)
          preferredKind = kind
          if (!d.fresh) setKind(target, kind, d.targets)
        } else if (picked.has(d.w.index) && (d.shift || picked.size === 1)) {
          // A click picks the widget; Shift adds it to (or takes it from) the picked ones.
          picked.delete(d.w.index)
        } else if (d.shift) {
          picked.add(d.w.index)
        } else {
          picked = new Set([d.w.index])
        }
        return undefined
      },

      cancel () {
        drag = null
        svgCanvas.setCursorHint(null)
        redrawIdle()
      },

      options () {
        const t = target
        const corners = t ? targetsOf(t) : []
        const cutOnes = t ? t.widgets.filter((w) => corners.includes(w.index) && w.radius > 0) : []
        const kinds = new Set(cutOnes.map((w) => w.kind))
        return [{
          id: 'radius',
          type: 'number',
          label: tr('radius'),
          title: tr('radiusTitle'),
          value: cutOnes.length ? cutOnes[0].radius : 0,
          min: 0,
          max: 500,
          step: 1
        }, {
          id: 'kind',
          type: 'select',
          label: tr('kind'),
          title: tr('kindTitle'),
          value: kinds.size === 1 ? [...kinds][0] : preferredKind,
          choices: CORNER_KINDS.map((k) => ({ value: k, label: tr(`kind_${k}`) }))
        }, {
          id: 'pickMore',
          type: 'checkbox',
          label: tr('pickMore'),
          title: tr('pickMoreTitle'),
          value: pickMore
        }]
      },

      setOption (id, value) {
        if (id === 'pickMore') {
          pickMore = Boolean(value)
          return
        }
        if (id === 'kind' && CORNER_KINDS.includes((String(value) as import('@svgedit/svgcanvas/core/corner-radius.ts').CornerKind))) preferredKind = (String(value) as import('@svgedit/svgcanvas/core/corner-radius.ts').CornerKind)
        const t = selectedTarget()
        if (!t) return
        const corners = targetsOf(t)
        if (id === 'radius') {
          const radius = Math.max(0, Number(value) || 0)
          cut(t, radius, corners, isFresh(t, corners))
        } else if (id === 'kind' && !isFresh(t, corners)) {
          setKind(t, preferredKind, corners)
        }
        redrawIdle()
      }
    })

    svgCanvas.bind('selectedChanged', () => redrawIdle())

    svgCanvas.bind('elementChanged', () => redrawIdle())

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        const title = `${name}:tool`
        // After the Gradient tool, the last of the on-canvas shape editors.
        svgCanvas.insertChildAtIndex(
          $req('tools_left'),
          `<se-button id="tool_corners" command="tool_corners" title="${title}" src="corner-tool.svg"></se-button>`,
          7
        )
        svgEditor.leftPanel.addModeCommand('tool_corners', 'corners', { label: title })
      },
    }
  }
})
