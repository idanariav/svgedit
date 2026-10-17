/**
 * @file ext-distort-tool.js
 *
 * Distort tool: drag the four corners of a shape's box to distort it. The result is the live effect
 * `freeDistort` (bilinear: the shape bends between the corners) or `perspective` (projective: every straight
 * line stays straight) in the shape's `se:fx` stack, so it stays editable (the Effects panel lists it, with the
 * corners as numbers) and node editing or Expand bake it in like any other live effect. The maths is
 * `core/distort.js`; this file is the gesture, run as one undo step per drag.
 *
 * Works on the selected shape, or on the one pressed when it is not a handle of the selected one. A rect,
 * ellipse, line, polyline or polygon becomes a path on the first drag. With another effect already on the shape
 * the corners edit the first distort entry of its stack (the unit box is always the shape's source box, so
 * they do not depend on the effects before it). The mode (Free / Perspective) is on the options bar; with a
 * distorted shape selected it converts that shape's effect.
 *
 * Not in v1: groups (each child would need its own effect), snapping to other objects, a custom cursor, a reset
 * gesture (remove the effect from the Effects panel) — see `roadmap.md`.
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft), `crates/tools/src/xform/free.rs`
 * (the Free Distort and Perspective Distort modes), MIT OR Apache-2.0.
 *
 * @license MIT
 */

import {
  DISTORT_EFFECTS, IDENTITY_CORNERS, cornersFromParams, paramsFromCorners, distortFrame, isConvexQuad
} from '@svgedit/svgcanvas/core/distort.ts'
import { getTransformList, transformListToTransform } from '@svgedit/svgcanvas/core/math.ts'

const name = 'distort-tool'

/** How close (screen px) the pointer must be to a corner's grip to take it. */
export const GRAB_PX = 10
/** A drag shorter than this (screen px) is a click. */
export const CLICK_PX = 3
const INK = '#2b7fff'
const SVG_NS = 'http://www.w3.org/2000/svg'

/** @param {EditorInstance} svgEditor */
const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  const locales = /** @type {Record<string, {default: object}>} */ (import.meta.glob('./locale/*.js', { eager: true }))
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

const apply = (m, p) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f })

const mk = (tag, attrs) => {
  const e = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  return e
}

export default {
  name,
  async init () {
    const svgEditor = /** @type {import('../../Editor.js').default} */ (/** @type {unknown} */ (this))
    const { svgCanvas } = svgEditor
    const { $req } = svgCanvas
    await loadExtensionTranslation(svgEditor)
    const tr = (/** @type {string} */ key) => svgEditor.i18next.t(`${name}:${key}`)

    /**
     * The shape being distorted: its element, the frame the unit corners refer to (its source box, local
     * coordinates), its stack and where the distort entry is in it (-1 = none yet), the corners in unit
     * coordinates and the element's transform to the layer.
     * @typedef {object} Target
     * @property {Element} el
     * @property {{x: number, y: number, w: number, h: number}} frame
     * @property {Array<{name: string, params: Object}>} stack
     * @property {number} index
     * @property {string} name `freeDistort` or `perspective`
     * @property {Array<{x: number, y: number}>} corners
     * @property {{a: number, b: number, c: number, d: number, e: number, f: number}} matrix local → layer
     * @property {{a: number, b: number, c: number, d: number, e: number, f: number}} inverse
     */

    /** The mode new distortions start in (an existing one keeps its own). */
    let preferred = 'freeDistort'
    /** @type {?Target} */
    let target = null
    /** @type {?{i: number, corners0: Array<{x: number, y: number}>, press: {x: number, y: number}, moved: boolean}} */
    let drag = null
    let hover = -1
    /**
* @type {import("@svgedit/svgcanvas").ToolContext | null}
*/
    let toolCtx = null

    const matrixOf = (/** @type {Element} */ el) => {
      const tlist = getTransformList(el)
      return tlist && tlist.numberOfItems ? transformListToTransform(tlist).matrix : null
    }

    /** @returns {?Target} */
    const targetFor = (/** @type {Element | null | undefined} */ el) => {
      if (!el || !svgCanvas.canApplyLiveEffect(el)) return null
      const box = svgCanvas.getLiveEffectsBox(el)
      if (!box) return null
      const stack = svgCanvas.getLiveEffects(el)
      const index = stack.findIndex((e) => DISTORT_EFFECTS.includes(e.name))
      const m = matrixOf(el)
      const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
      return {
        el,
        frame: distortFrame(box),
        stack,
        index,
        name: index >= 0 ? stack[index].name : preferred,
        corners: index >= 0 ? cornersFromParams(stack[index].params) : IDENTITY_CORNERS.map((c) => ({ ...c })),
        matrix: m || identity,
        inverse: m ? m.inverse() : identity
      }
    }

    const selectedTarget = () => {
      const elems = svgCanvas.getSelectedElements().filter(Boolean)
      return elems.length === 1 ? targetFor(elems[0]) : null
    }

    /** The corners in the layer's coordinates (document units). */
    const docCorners = (t) => t.corners.map((/** @type {{ x: number; y: number; }} */ c) => apply(t.matrix, { x: t.frame.x + c.x * t.frame.w, y: t.frame.y + c.y * t.frame.h }))

    const hitCorner = (/** @type {{ el: Element; frame: { x: number; y: number; w: number; h: number; }; stack: { name: string; params: Object; }[]; index: number; name: string; corners: { x: number; y: number; }[]; matrix: { a: number; b: number; c: number; d: number; e: number; f: number; }; inverse: { a: number; b: number; c: number; d: number; e: number; f: number; }; }} */ t, /** @type {import("@svgedit/svgcanvas").ToolEvent} */ ev, /** @type {number} */ zoom) => {
      const grab = GRAB_PX / zoom
      let best = -1
      let bestDist = grab
      docCorners(t).forEach((/** @type {{ x: number; y: number; }} */ p, /** @type {number} */ i) => {
        const dist = Math.hypot(p.x - ev.rawX, p.y - ev.rawY)
        if (dist <= bestDist) {
          best = i
          bestDist = dist
        }
      })
      return best
    }

    /** A document point as unit coordinates of the target's frame. */
    const toUnit = (t, p) => {
      const q = apply(t.inverse, p)
      return { x: (q.x - t.frame.x) / t.frame.w, y: (q.y - t.frame.y) / t.frame.h }
    }

    // ---- overlay ---------------------------------------------------------------

    const draw = (/** @type {import("@svgedit/svgcanvas").ToolContext} */ ctx) => {
      ctx.clearOverlays()
      const t = target
      if (!t) return
      const s = 4.5 / ctx.zoom
      const pts = docCorners(t)
      const g = mk('g', { 'pointer-events': 'none' })
      const frame = [
        { x: t.frame.x, y: t.frame.y }, { x: t.frame.x + t.frame.w, y: t.frame.y },
        { x: t.frame.x + t.frame.w, y: t.frame.y + t.frame.h }, { x: t.frame.x, y: t.frame.y + t.frame.h }
      ].map((p) => apply(t.matrix, p))
      const poly = (list) => list.map((p) => `${p.x},${p.y}`).join(' ')
      g.append(
        mk('polygon', { points: poly(frame), fill: 'none', stroke: '#8a8a8a', 'stroke-width': 1, 'stroke-dasharray': '3 3', 'vector-effect': 'non-scaling-stroke' }),
        mk('polygon', { points: poly(pts), fill: 'none', stroke: INK, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' })
      )
      pts.forEach((/** @type {{ x: number; y: number; }} */ p, /** @type {number} */ i) => {
        g.append(mk('rect', {
          x: p.x - s,
          y: p.y - s,
          width: 2 * s,
          height: 2 * s,
          fill: i === hover || (drag && drag.i === i) ? INK : '#fff',
          stroke: INK,
          'stroke-width': 1,
          'vector-effect': 'non-scaling-stroke'
        }))
      })
      ctx.addOverlay(g)
    }

    const redrawIdle = () => {
      if (!toolCtx || drag || svgCanvas.getMode() !== 'distort') return
      target = selectedTarget()
      hover = -1
      draw(toolCtx)
    }

    // ---- editing ---------------------------------------------------------------

    /** The target's stack with the distort entry set to `corners`. */
    const stackWith = (t, corners) => {
      const entry = { name: t.name, params: paramsFromCorners(corners) }
      const stack = t.stack.map((e) => ({ name: e.name, params: { ...e.params } }))
      if (t.index >= 0) stack[t.index] = entry
      else stack.push(entry)
      return stack
    }

    /** Write `corners` into the shape (inside the gesture's transaction). Returns false when it cannot. */
    const write = (t, corners) => {
      if (t.name === 'perspective' && !isConvexQuad(corners)) return false // the projective map folds over
      const stack = stackWith(t, corners)
      const el = svgCanvas.applyLiveEffectsTo(t.el, stack)
      if (!el) return false
      if (el !== t.el) svgCanvas.selectOnly([el], true) // a rect (or other primitive) became a path
      t.el = el
      t.stack = stack
      t.index = t.index >= 0 ? t.index : stack.length - 1
      t.corners = corners
      return true
    }

    const finish = (/** @type {Element | null | undefined} */ el) => {
      if (svgCanvas.getSelectedElements().includes(el)) svgCanvas.selectorManager.requestSelector(el).resize()
      svgCanvas.call('changed', [el])
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
        if (!drag.moved && Math.hypot(ev.screenX - drag.press.x, ev.screenY - drag.press.y) < CLICK_PX) return
        drag.moved = true
        const u = toUnit(target, { x: ev.x, y: ev.y })
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
        finish(target.el)
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
        value: target && target.index >= 0 ? target.name : preferred,
        choices: [{ value: 'freeDistort', label: tr('modeFree') }, { value: 'perspective', label: tr('modePerspective') }]
      }],

      setOption (id, value) {
        if (id !== 'mode') return
        preferred = value === 'perspective' ? 'perspective' : 'freeDistort'
        const t = selectedTarget()
        if (!t || t.index < 0 || t.name === preferred) return
        // A distorted shape changes its effect: the same corners, the other map (one undo step).
        const stack = t.stack.map((e, i) => ({ name: i === t.index ? preferred : e.name, params: { ...e.params } }))
        svgCanvas.applyLiveEffects(stack)
        redrawIdle()
      }
    })

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

      selectedChanged: redrawIdle,
      elementChanged: redrawIdle
    }
  }
}
