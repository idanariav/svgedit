/**
 * @file ext-rotate3d-tool.ts
 *
 * 3D Rotate tool: turn the selected shape or group in 3D by dragging on the canvas, like a card under the pointer.
 * A horizontal drag turns it on the Y axis and a vertical one tilts it on the X axis; with Alt a horizontal drag spins it
 * on the Z axis; Shift snaps the angles to 15°. The result is the live effect `rotate3d` (`core/rotate3d.ts`) in the
 * shape's `se:fx` stack, so it stays editable; a group turns as one piece (`framedTarget.ts`: each shape in it gets the
 * same angles on the group's box; text and images in it stay as they are). One undo step per drag.
 *
 * The options bar has the position presets, the three angles, the perspective (the one new rotations start with when
 * nothing is selected) and Reset. A press on another shape or group that can take the effect selects it; a press
 * anywhere else turns the selection.
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft), the drag-to-orbit gesture and 15° snap of
 * `crates/ui-egui/src/dialogs/revolve_gizmo.rs`, MIT OR Apache-2.0. Divergence: a free drag on the canvas instead of
 * its axis rings.
 *
 * @license MIT
 */

import {
  ROTATE3D_DEFAULTS, ROTATE3D_KEYS, ROTATE3D_PRESETS, MAX_PERSPECTIVE, rotate3dMap
} from '@svgedit/svgcanvas/core/rotate3d.ts'
import type { Rotate3dParams } from '@svgedit/svgcanvas/core/rotate3d.ts'
import { applyMatrix } from '@svgedit/svgcanvas/core/gradient-edit.ts'
import { toolSpace, overlayElement as mk } from '../../toolSpace.ts'
import { framedTargets, frameCorners } from '../../framedTarget.ts'
import type { FramedTarget } from '../../framedTarget.ts'
import { defineFeature, addFeatureLocale } from '../defineFeature.ts'

const name = 'rotate3d-tool'
const NAMES = ['rotate3d']

/** Degrees per screen pixel of drag. */
export const DEG_PER_PX = 0.5
/** Shift snaps an angle to this step (degrees). */
export const SNAP_DEG = 15
/** The perspective a new rotation starts with. */
export const DEFAULT_PERSPECTIVE = 40
const INK = '#2b7fff'

type Pt = { x: number, y: number }

/** An angle in (-180, 180]. */
export const wrapDeg = (a: number): number => {
  const r = ((a + 180) % 360 + 360) % 360 - 180
  return r === -180 ? 180 : r
}

/**
 * The angles after a drag of `dx`, `dy` screen pixels from `p0`: right turns the right side away (Y), down brings the top
 * forward (X); with `spin` a horizontal drag turns it in the page (Z) instead. `snap` rounds the angles that move.
 */
export const dragAngles = (p0: Rotate3dParams, dx: number, dy: number, { spin = false, snap = false } = {}): Rotate3dParams => {
  const round = (a: number) => wrapDeg(snap ? Math.round(a / SNAP_DEG) * SNAP_DEG : a)
  if (spin) return { ...p0, rotationZ: round(p0.rotationZ + dx * DEG_PER_PX) }
  return { ...p0, rotationX: round(p0.rotationX - dy * DEG_PER_PX), rotationY: round(p0.rotationY + dx * DEG_PER_PX) }
}

/** The preset the angles are, or 'custom'. */
export const presetOf = (p: Rotate3dParams): string => {
  const near = (a: number, b: number) => Math.abs(wrapDeg(a - b)) < 0.01
  const hit = ROTATE3D_PRESETS.find(([, [x, y, z]]) => near(p.rotationX, x) && near(p.rotationY, y) && near(p.rotationZ, z))
  return hit ? hit[0] : 'custom'
}

export default defineFeature({
  name,
  async init (svgEditor) {
    const { svgCanvas } = svgEditor
    const { $req } = svgCanvas
    addFeatureLocale(svgEditor, name, import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>)
    const tr = (key: string) => svgEditor.i18next.t(`${name}:${key}`)

    let perspective = DEFAULT_PERSPECTIVE
    let target: FramedTarget | null = null
    let drag: { press: Pt, p0: Rotate3dParams, moved: boolean } | null = null
    let toolCtx: import('@svgedit/svgcanvas').ToolContext | null = null

    const space = toolSpace(svgCanvas)
    const framed = framedTargets(svgCanvas, space)

    const selectedTarget = () => {
      const elems = svgCanvas.getSelectedElements().filter(Boolean)
      return elems.length === 1 ? framed.targetFor(elems[0], NAMES) : null
    }

    /** The target's angles, or where a new rotation starts. */
    const paramsOf = (t: FramedTarget | null): Rotate3dParams => {
      if (!t?.entry) return { ...ROTATE3D_DEFAULTS, perspective }
      const p = t.entry.params
      return Object.fromEntries(ROTATE3D_KEYS.map((k) => [k, Number(p[k] ?? 0)])) as unknown as Rotate3dParams
    }

    // ---- overlay ---------------------------------------------------------------

    const draw = (ctx: import('@svgedit/svgcanvas').ToolContext) => {
      ctx.clearOverlays()
      const t = target
      if (!t) return
      const { x, y, w, h } = t.frame
      const map = rotate3dMap(paramsOf(t), w, h)
      // The box as it is turned, through the same map as the shape.
      const turned = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
        .map((p) => map(p))
        .map((p) => applyMatrix(t.matrix, { x: x + p.x, y: y + p.y }))
      const centre = applyMatrix(t.matrix, { x: x + w / 2, y: y + h / 2 })
      const poly = (list: Pt[]) => list.map((p) => `${p.x},${p.y}`).join(' ')
      const r = 4 / ctx.zoom
      ctx.addOverlay(mk('g', { 'pointer-events': 'none' }, [
        mk('polygon', { points: poly(frameCorners(t)), fill: 'none', stroke: '#8a8a8a', 'stroke-width': 1, 'stroke-dasharray': '3 3', 'vector-effect': 'non-scaling-stroke' }),
        mk('polygon', { points: poly(turned), fill: 'none', stroke: INK, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }),
        mk('circle', { cx: centre.x, cy: centre.y, r, fill: '#fff', stroke: INK, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' })
      ]))
    }

    const redrawIdle = () => {
      if (!toolCtx || drag || svgCanvas.getMode() !== 'rotate3d') return
      target = selectedTarget()
      draw(toolCtx)
    }

    // ---- editing ---------------------------------------------------------------

    const finish = (t: FramedTarget) => {
      if (svgCanvas.getSelectedElements().includes(t.el)) svgCanvas.selectorManager.requestSelector(t.el).resize()
    }

    /** Write the angles (inside a transaction); a primitive that became a path is selected again. */
    const write = (t: FramedTarget, p: Rotate3dParams) => {
      const el = t.el
      const ok = framed.write(t, NAMES, 'rotate3d', { ...p })
      if (t.el !== el) svgCanvas.selectOnly([t.el], true)
      return ok
    }

    /** Run `fn` on the selected target as one undo step. */
    const editSelected = (fn: (t: FramedTarget) => void) => {
      const t = selectedTarget()
      if (!t) return
      svgCanvas.transact('3D rotate', () => fn(t))
      finish(t)
      redrawIdle()
    }

    svgCanvas.registerTool({
      id: 'rotate3d',
      undoLabel: '3D rotate',

      activate (ctx) {
        toolCtx = ctx
        drag = null
        target = selectedTarget()
        draw(ctx)
      },

      deactivate (ctx) {
        target = null
        drag = null
        ctx.clearOverlays()
      },

      pointerDown (ctx, ev) {
        drag = null
        let t = selectedTarget()
        // A press on another shape or group that can take the effect makes it the target; elsewhere the selection turns.
        const pressed = svgCanvas.getMouseTarget(ev.event)
        if (pressed && !(t && (pressed === t.el || t.el.contains(pressed)))) {
          const other = framed.targetFor(pressed, NAMES)
          if (other) t = other
        }
        target = t
        if (!t) {
          ctx.clearOverlays()
          return
        }
        if (svgCanvas.getSelectedElements().filter(Boolean)[0] !== t.el) svgCanvas.selectOnly([t.el], true)
        svgCanvas.setCursorHint('grabbing')
        drag = { press: { x: ev.screenX, y: ev.screenY }, p0: paramsOf(t), moved: false }
        draw(ctx)
      },

      pointerMove (ctx, ev) {
        if (!drag || !target) return
        const dx = ev.screenX - drag.press.x
        const dy = ev.screenY - drag.press.y
        if (!drag.moved && !ev.dragging) return
        drag.moved = true
        write(target, dragAngles(drag.p0, dx, dy, { spin: ev.mods.alt, snap: ev.mods.shift }))
        draw(ctx)
      },

      pointerUp (ctx) {
        const d = drag
        drag = null
        svgCanvas.setCursorHint(null)
        if (!d || !target || !d.moved) {
          // A click: it may have selected a shape (a rollback would undo that) and changes no drawing.
          draw(ctx)
          return undefined
        }
        finish(target)
        target = framed.targetFor(target.el, NAMES)
        draw(ctx)
        return undefined
      },

      cancel () {
        drag = null
        redrawIdle()
      },

      options: () => {
        const p = paramsOf(target)
        const angle = (id: keyof Rotate3dParams, key: string) => ({ id, type: 'number' as const, label: tr(key), title: tr(`${key}Title`), value: Math.round(p[id] * 100) / 100, min: -180, max: 180, step: 1 })
        return [{
          id: 'preset',
          type: 'select' as const,
          label: tr('preset'),
          title: tr('presetTitle'),
          value: presetOf(p),
          choices: [{ value: 'custom', label: tr('preset_custom') }, ...ROTATE3D_PRESETS.map(([id]) => ({ value: id, label: tr(`preset_${id}`) }))]
        },
        angle('rotationX', 'x'),
        angle('rotationY', 'y'),
        angle('rotationZ', 'z'),
        { id: 'perspective', type: 'number' as const, label: tr('perspective'), title: tr('perspectiveTitle'), value: p.perspective, min: 0, max: MAX_PERSPECTIVE, step: 1 },
        { id: 'reset', type: 'button' as const, label: tr('reset'), title: tr('resetTitle'), value: false, hidden: !target?.entry }]
      },

      setOption (id, value) {
        if (id === 'reset') {
          editSelected((t) => framed.remove(t, NAMES))
          return
        }
        if (id === 'perspective') perspective = Math.min(Math.max(Number(value) || 0, 0), MAX_PERSPECTIVE)
        const t = selectedTarget()
        if (!t) return
        const p = paramsOf(t)
        if (id === 'preset') {
          const preset = ROTATE3D_PRESETS.find(([k]) => k === value)
          if (!preset) return
          ;[p.rotationX, p.rotationY, p.rotationZ] = preset[1]
        } else if (id === 'perspective') {
          p.perspective = perspective
        } else if (ROTATE3D_KEYS.includes(id) && Number.isFinite(Number(value))) {
          p[id as keyof Rotate3dParams] = wrapDeg(Number(value))
        } else {
          return
        }
        editSelected((s) => { write(s, p) })
      }
    })

    svgCanvas.bind('selectedChanged', () => redrawIdle())

    svgCanvas.bind('elementChanged', () => redrawIdle())

    return {
      name: svgEditor.i18next.t(`${name}:name`),

      callback () {
        const title = `${name}:buttons.0.title`
        // Beside the Distort tool.
        svgCanvas.insertChildAtIndex(
          $req('tools_left'),
          `<se-button id="tool_rotate3d" command="tool_rotate3d" title="${title}" src="rotate3d-tool.svg"></se-button>`,
          6
        )
        svgEditor.leftPanel.addModeCommand('tool_rotate3d', 'rotate3d', { label: title })
      },
    }
  }
})
