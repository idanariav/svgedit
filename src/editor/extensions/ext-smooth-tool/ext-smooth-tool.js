/**
 * @file ext-smooth-tool.js
 *
 * Smooth tool: brush over part of a path and only that part is smoothed. Anchors within a
 * radius of the drag are refit with as few cubics as stay within a tolerance; the rest of
 * the path is untouched, so it is safe on any plain path (unlike Smooth Path, which refits
 * the whole of it). The geometry is `smoothRegion` / `markAnchorsNear` in
 * {@link module:path-fit}; this file is the gesture.
 *
 * It acts on the selected paths, or, with none selected, on the path under the press. The
 * radius and the tolerance are in screen pixels, so the brush feels the same at any zoom.
 * The path is re-smoothed from its state at the press as the brush reaches more of it (so a
 * long drag never compounds), live, inside the tool gesture's single undo step.
 *
 * Paths with live geometry (`se:taper-d`, `se:orig-d`, `se:fx-d`) are skipped: rewriting `d`
 * would orphan their source. Ported from VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/engine/src/cmd/draw2.rs` (`smooth_region`), MIT OR Apache-2.0.
 *
 * @license MIT
 */

import { parseAnchors, anchorsToD } from '@svgedit/svgcanvas/core/anchor-path.js'
import { markAnchorsNear, smoothRegion } from '@svgedit/svgcanvas/core/path-fit.js'
import { LIVE_ATTRS } from '@svgedit/svgcanvas/core/path-join.js'

const name = 'smooth-tool'

/** Brush radius: anchors this close (screen px) to the drag are smoothed. */
export const BRUSH_RADIUS_PX = 18
/** How far (screen px) the smoothed part may stray from the original. */
export const TOLERANCE_PX = 2.5
/** The brush ring's ink; the overlay is never saved. */
const RING_STROKE = '#2b7fff'

const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  // Locale files are inlined into the bundle (statically resolved glob).
  const locales = import.meta.glob('./locale/*.js', { eager: true })
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

/**
 * Can the tool rewrite this element's geometry?
 * @param {?Element} el
 * @returns {boolean}
 */
export const isSmoothable = (el) =>
  Boolean(el) && el.tagName === 'path' && !LIVE_ATTRS.some((a) => el.hasAttribute(a))

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { $id } = svgCanvas
    await loadExtensionTranslation(svgEditor)

    /**
     * The paths being brushed, each with its state at the press and its screen → local mapping.
     * @type {Array<{el: Element, d0: string, subpaths: any[], marks: boolean[][], inverse: DOMMatrix, scale: number, touched: boolean}>}
     */
    let targets = []
    let last = null
    let ring = null

    /** The paths a press brushes: the smoothable ones among the selection, else the one under the pointer. */
    const pickTargets = (ev) => {
      const selected = svgCanvas.getSelectedElements().filter(isSmoothable)
      if (selected.length) return selected
      const under = svgCanvas.getMouseTarget(ev.event)
      return isSmoothable(under) ? [under] : []
    }

    const prepare = (el) => {
      const ctm = el.getScreenCTM?.()
      const det = ctm ? ctm.a * ctm.d - ctm.b * ctm.c : 0
      if (!ctm || !Number.isFinite(det) || det === 0) return null
      const d0 = el.getAttribute('d') || ''
      const subpaths = parseAnchors(d0, 0.1)
      if (!subpaths.length) return null
      return {
        el,
        d0,
        subpaths,
        marks: subpaths.map((sp) => sp.anchors.map(() => false)),
        inverse: ctm.inverse(),
        scale: Math.sqrt(Math.abs(det)),
        touched: false
      }
    }

    /** Brush the step `from` → `to` (client coordinates) over every target. */
    const brush = (from, to) => {
      for (const t of targets) {
        const a = new DOMPoint(from.x, from.y).matrixTransform(t.inverse)
        const b = new DOMPoint(to.x, to.y).matrixTransform(t.inverse)
        if (!markAnchorsNear(t.subpaths, t.marks, a, b, BRUSH_RADIUS_PX / t.scale)) continue
        t.touched = true
        t.el.setAttribute('d', anchorsToD(smoothRegion(t.subpaths, t.marks, TOLERANCE_PX / t.scale)))
      }
    }

    const moveRing = (ctx, ev) => {
      if (!ring) {
        ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        ring.setAttribute('fill', 'none')
        ring.setAttribute('stroke', RING_STROKE)
        ring.setAttribute('stroke-width', '1')
        ring.setAttribute('vector-effect', 'non-scaling-stroke')
        ring.setAttribute('stroke-dasharray', '4 3')
      }
      // The overlay is emptied when a gesture ends: put the ring back.
      if (!ring.isConnected) ctx.addOverlay(ring)
      ring.setAttribute('cx', ev.rawX)
      ring.setAttribute('cy', ev.rawY)
      ring.setAttribute('r', BRUSH_RADIUS_PX / ctx.zoom)
    }

    const reset = () => {
      targets = []
      last = null
    }

    svgCanvas.registerTool({
      id: 'smooth',
      undoLabel: 'Smooth path',
      wantsHover: true,

      activate () { reset() },

      deactivate (ctx) {
        reset()
        ctx.clearOverlays()
        ring = null
      },

      pointerDown (ctx, ev) {
        targets = pickTargets(ev).map(prepare).filter(Boolean)
        last = { x: ev.screenX, y: ev.screenY }
        brush(last, last)
        moveRing(ctx, ev)
      },

      pointerMove (ctx, ev) {
        moveRing(ctx, ev)
        // Hover (no press): only the ring follows.
        if (!last) return
        const here = { x: ev.screenX, y: ev.screenY }
        brush(last, here)
        last = here
      },

      pointerUp (ctx, ev) {
        if (!last) return 'cancel'
        brush(last, { x: ev.screenX, y: ev.screenY })
        const touched = targets.filter((t) => t.touched)
        reset()
        if (!touched.length) return 'cancel'
        const selected = svgCanvas.getSelectedElements()
        for (const { el } of touched) {
          if (selected.includes(el)) svgCanvas.gettingSelectorManager().requestSelector(el).resize()
        }
        svgCanvas.call('changed', touched.map((t) => t.el))
        return undefined
      },

      cancel () { reset() }
    })

    return {
      name: svgEditor.i18next.t(`${name}:name`),

      callback () {
        const title = `${name}:buttons.0.title`
        // Beside the other freehand tools: after the pencil and the Shaper.
        svgCanvas.insertChildAtIndex(
          $id('tools_left'),
          `<se-button id="tool_smooth" command="tool_smooth" title="${title}" src="smooth-tool.svg"></se-button>`,
          3
        )
        svgEditor.leftPanel.addModeCommand('tool_smooth', 'smooth', { label: title })
      }
    }
  }
}
