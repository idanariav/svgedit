/**
 * @file ext-distort-tool.ts
 *
 * Distort tool: drag the four corners of a shape's box to distort it. The result is the live effect
 * `freeDistort` (bilinear: the shape bends between the corners) or `perspective` (projective: every straight
 * line stays straight) in the shape's `se:fx` stack, so it stays editable (the Effects panel lists it, with the
 * corners as numbers) and node editing or Expand bake it in like any other live effect. The maths is
 * `core/distort.js`; this file is the gesture, run as one undo step per drag.
 *
 * Works on the selected shape or group, or on the one pressed when it is not a handle of the selected one. A rect,
 * ellipse, line, polyline or polygon becomes a path on the first drag. With another effect already on the shape
 * the corners edit the first distort entry of its stack (the unit box is always the shape's source box, so
 * they do not depend on the effects before it). A group distorts as one piece: each shape in it gets the same
 * corners on the group's box (`framedTarget.ts`); text and images in it stay as they are. The mode (Free /
 * Perspective) is on the options bar; with a distorted shape or group selected it converts its effect. Reset takes
 * the distortion off.
 *
 * Not in v1: snapping to other objects — see `roadmap.md`.
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft), `crates/tools/src/xform/free.rs`
 * (the Free Distort and Perspective Distort modes), MIT OR Apache-2.0.
 *
 * @license MIT
 */

import {
  DISTORT_EFFECTS, IDENTITY_CORNERS, cornersFromParams, paramsFromCorners, isConvexQuad
} from '@svgedit/svgcanvas/core/distort.ts'
import { toolSpace, overlayElement as mk } from '../../toolSpace.ts'
import { framedTargets, frameCorners } from '../../framedTarget.ts'
import type { FramedTarget } from '../../framedTarget.ts'
import { defineFeature, addFeatureLocale } from '../defineFeature.ts'

const name = 'distort-tool'

/** How close (screen px) the pointer must be to a corner's grip to take it. */
export const GRAB_PX = 10
const INK = '#2b7fff'

export type Mat = { a: number, b: number, c: number, d: number, e: number, f: number }

export type Pt = { x: number, y: number }

const apply = (m: Mat, p: Pt) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f })

export default defineFeature({
  name,
  async init (svgEditor) {
    const { svgCanvas } = svgEditor
    const { $req } = svgCanvas
    addFeatureLocale(svgEditor, name, import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>)
    const tr = (key: string) => svgEditor.i18next.t(`${name}:${key}`)

    /**
     * The shape or group being distorted (`framedTarget.ts`: its members, the box the unit corners refer to and its
     * matrix to document units), with the effect's name and the corners in unit coordinates.
     */
    interface Target extends FramedTarget {
      /** `freeDistort` or `perspective` */
      name: string
      corners: Array<{ x: number, y: number }>
    }

    /** The mode new distortions start in (an existing one keeps its own). */
    let preferred = 'freeDistort'
    let target: Target | null = null
    let drag: { i: number, corners0: Array<{ x: number, y: number }>, press: { x: number, y: number }, moved: boolean } | null = null
    let hover = -1
    let toolCtx: import('@svgedit/svgcanvas').ToolContext | null = null

    /** Document units for the pointer and the shape alike, through every group above the shape (`toolSpace.ts`). */
    const space = toolSpace(svgCanvas)

    const framed = framedTargets(svgCanvas, space)

    const targetFor = (el: Element | null | undefined): Target | null => {
      const t = framed.targetFor(el, DISTORT_EFFECTS)
      if (!t) return null
      return Object.assign(t, {
        name: t.entry ? t.entry.name : preferred,
        corners: t.entry ? cornersFromParams(t.entry.params as Record<string, number>) : IDENTITY_CORNERS.map((c) => ({ ...c }))
      })
    }

    const selectedTarget = () => {
      const elems = svgCanvas.getSelectedElements().filter(Boolean)
      return elems.length === 1 ? targetFor(elems[0]) : null
    }

    /** The corners in document units. */
    const docCorners = (t: Target) => t.corners.map((c: Pt) => apply(t.matrix, { x: t.frame.x + c.x * t.frame.w, y: t.frame.y + c.y * t.frame.h }))

    const hitCorner = (t: Target, ev: import('@svgedit/svgcanvas').ToolEvent, zoom: number) => {
      const grab = GRAB_PX / zoom
      const at = space.docPoint(ev)
      let best = -1
      let bestDist = grab
      docCorners(t).forEach((p: { x: number; y: number; }, i: number) => {
        const dist = Math.hypot(p.x - at.x, p.y - at.y)
        if (dist <= bestDist) {
          best = i
          bestDist = dist
        }
      })
      return best
    }

    /** A document point as unit coordinates of the target's frame. */
    const toUnit = (t: Target, p: Pt) => {
      const q = apply(t.inverse, p)
      return { x: (q.x - t.frame.x) / t.frame.w, y: (q.y - t.frame.y) / t.frame.h }
    }

    // ---- overlay ---------------------------------------------------------------

    const draw = (ctx: import('@svgedit/svgcanvas').ToolContext) => {
      ctx.clearOverlays()
      const t = target
      if (!t) return
      const s = 4.5 / ctx.zoom
      const pts = docCorners(t)
      const poly = (list: Pt[]) => list.map((p) => `${p.x},${p.y}`).join(' ')
      ctx.addOverlay(mk('g', { 'pointer-events': 'none' }, [
        mk('polygon', { points: poly(frameCorners(t)), fill: 'none', stroke: '#8a8a8a', 'stroke-width': 1, 'stroke-dasharray': '3 3', 'vector-effect': 'non-scaling-stroke' }),
        mk('polygon', { points: poly(pts), fill: 'none', stroke: INK, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }),
        ...pts.map((p: Pt, i: number) => mk('rect', {
          x: p.x - s,
          y: p.y - s,
          width: 2 * s,
          height: 2 * s,
          fill: i === hover || (drag && drag.i === i) ? INK : '#fff',
          stroke: INK,
          'stroke-width': 1,
          'vector-effect': 'non-scaling-stroke'
        }))
      ]))
    }

    const redrawIdle = () => {
      if (!toolCtx || drag || svgCanvas.getMode() !== 'distort') return
      target = selectedTarget()
      hover = -1
      draw(toolCtx)
    }

    // ---- editing ---------------------------------------------------------------

    /** Write `corners` into the shape or group (inside a transaction). Returns false when it cannot. */
    const write = (t: Target, corners: Pt[]) => {
      if (t.name === 'perspective' && !isConvexQuad(corners)) return false // the projective map folds over
      const el = t.el
      if (!framed.write(t, DISTORT_EFFECTS, t.name, paramsFromCorners(corners))) return false
      if (t.el !== el) svgCanvas.selectOnly([t.el], true) // a rect (or other primitive) became a path
      t.corners = corners
      return true
    }

    const finish = (t: Target) => {
      if (svgCanvas.getSelectedElements().includes(t.el)) svgCanvas.selectorManager.requestSelector(t.el).resize()
    }

    /** Run `fn` on the selected target as one undo step. */
    const editSelected = (fn: (t: Target) => void) => {
      const t = selectedTarget()
      if (!t) return
      svgCanvas.transact('Distort', () => fn(t))
      finish(t)
      redrawIdle()
    }

    svgCanvas.registerTool({
      id: 'distort',
      undoLabel: 'Distort',
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
        ctx.clearOverlays()
      },

      pointerDown (ctx, ev) {
        drag = null
        let t = selectedTarget()
        let i = t ? hitCorner(t, ev, ctx.zoom) : -1
        if (i < 0) {
          // Not on a handle of the selection: a pressed shape that can take the effect becomes the target.
          const other = targetFor(svgCanvas.getMouseTarget(ev.event))
          if (other) {
            t = other
            i = hitCorner(t, ev, ctx.zoom)
          }
        }
        target = t
        if (!t) {
          ctx.clearOverlays()
          return
        }
        if (svgCanvas.getSelectedElements().filter(Boolean)[0] !== t.el) svgCanvas.selectOnly([t.el], true)
        if (i >= 0) svgCanvas.setCursorHint('grabbing')
        if (i >= 0) drag = { i, corners0: t.corners.map((c) => ({ ...c })), press: { x: ev.screenX, y: ev.screenY }, moved: false }
        draw(ctx)
      },

      pointerMove (ctx, ev) {
        if (!drag) {
          const i = target ? hitCorner(target, ev, ctx.zoom) : -1
          svgCanvas.setCursorHint(i >= 0 ? 'grab' : null) // a drag on the handle moves the corner
          if (i !== hover) {
            hover = i
            draw(ctx)
          }
          return
        }
        if (!target) return
        if (!drag.moved && !ev.dragging) return
        drag.moved = true
        const u = toUnit(target, ctx.snap(space.docPoint(ev)))
        const from = drag.corners0[drag.i]
        // Shift moves the corner along its dominant axis only.
        if (ev.mods.shift) {
          if (Math.abs(u.x - from.x) * target.frame.w >= Math.abs(u.y - from.y) * target.frame.h) u.y = from.y
          else u.x = from.x
        }
        const corners = drag.corners0.map((c) => ({ ...c }))
        corners[drag.i] = u
        write(target, corners)
        draw(ctx)
      },

      pointerUp (ctx) {
        const d = drag
        drag = null
        svgCanvas.setCursorHint(null) // the pointer moves again before it needs a hint
        if (!d || !target || !d.moved) {
          // A click: it may have selected a shape (a rollback would undo that) and changes no drawing.
          draw(ctx)
          return undefined
        }
        finish(target)
        target = targetFor(target.el)
        draw(ctx)
        return undefined
      },

      cancel () {
        drag = null
        redrawIdle()
      },

      options: () => [{
        id: 'mode',
        type: 'select',
        label: tr('mode'),
        title: tr('modeTitle'),
        value: target?.entry ? target.name : preferred,
        choices: [{ value: 'freeDistort', label: tr('modeFree') }, { value: 'perspective', label: tr('modePerspective') }]
      }, {
        id: 'reset',
        type: 'button',
        label: tr('reset'),
        title: tr('resetTitle'),
        value: false,
        hidden: !target?.entry
      }],

      setOption (id, value) {
        if (id === 'reset') {
          editSelected((t) => framed.remove(t, DISTORT_EFFECTS))
          return
        }
        if (id !== 'mode') return
        preferred = value === 'perspective' ? 'perspective' : 'freeDistort'
        // A distorted shape or group changes its effect: the same corners, the other map (one undo step).
        const t = selectedTarget()
        if (!t?.entry || t.name === preferred) return
        editSelected((s) => {
          s.name = preferred
          write(s, s.corners)
        })
      }
    })

    svgCanvas.bind('selectedChanged', () => redrawIdle())

    svgCanvas.bind('elementChanged', () => redrawIdle())

    return {
      name: svgEditor.i18next.t(`${name}:name`),

      callback () {
        const title = `${name}:buttons.0.title`
        // Beside the other path-reshaping tools: after the Width tool.
        svgCanvas.insertChildAtIndex(
          $req('tools_left'),
          `<se-button id="tool_distort" command="tool_distort" title="${title}" src="distort-tool.svg"></se-button>`,
          5
        )
        svgEditor.leftPanel.addModeCommand('tool_distort', 'distort', { label: title })
      },
    }
  }
})
