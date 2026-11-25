/**
 * @file ext-cutter.ts
 *
 * Cutter (knife) tool — cut shapes along a straight line, a multi-point
 * zigzag line or a curved line drawn like the pen tool.
 *
 * Behaviour mirrors Illustrator's knife tool, extended with a pen-tool-style
 * multi-point mode:
 *   • Press, drag, release in one motion → an instant straight cut, exactly
 *     like before.
 *   • Press and release without moving (a plain click) → starts a
 *     multi-point line instead: click to add each further vertex, then
 *     press Enter or double-click to cut along the resulting zigzag.
 *     Backspace/Delete removes the last vertex; Escape cancels.
 *   • In multi-point mode, press and drag when placing a vertex → pulls
 *     out symmetric handles (pen-tool style), curving the stretches on
 *     either side of it; Shift snaps the handle to 15°. A plain click
 *     keeps the vertex a corner, so a cut is straight unless you drag.
 *   • If shapes are selected, only those shapes are cut.
 *   • If nothing is selected, every shape in the current layer that the
 *     cut line crosses is split.
 *
 * The dashed red preview path is drawn inside svgcontent (canvas coordinate
 * space) and removed once the cut is committed or cancelled — it is never
 * added to undo history.
 *
 * @license MIT
 */

import { snapToAngle } from '@svgedit/svgcanvas/core/math.ts'
import type { CutPoint } from '@svgedit/svgcanvas/core/cutter.ts'
import { defineFeature, addFeatureLocale } from '../defineFeature.ts'

const name = 'cutter'

// Minimum movement (canvas units) to count as an intentional drag/new vertex
// rather than an accidental click-in-place (also absorbs the redundant
// second mousedown of a double-click used to finish a multi-point line).
const MIN_SEGMENT = 2

export default defineFeature({
  name,
  async init (svgEditor) {
    const { svgCanvas } = svgEditor
    const { $req } = svgCanvas

    addFeatureLocale(svgEditor, name, import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>)

    // ── Drawing state ────────────────────────────────────────────────────────
    let active = false // true from the first mousedown until finish/cancel
    let drawing = false // true once committed to multi-point mode
    let pendingStart: { x: number, y: number } | null = null // first click/drag-start point, while active && !drawing
    let points: CutPoint[] = [] // committed vertices, once drawing
    let pulling: CutPoint | null = null // the vertex just placed, while its handles follow the pressed pointer
    // The selection when multi-point mode started, so it can be restored
    // right before the actual cut (cutShapes scopes to it) after being
    // cleared for the duration of the draw — see the `drawing` transition in
    // mouseUp for why it's cleared: the global Backspace/Delete "delete
    // selected shape" hotkey would otherwise also fire on the same keypress
    // used here to remove the last vertex.
    let selectionAtStart: Element[] = []
    let previewPath: SVGPathElement | null = null

    // ── Preview path helpers ─────────────────────────────────────────────────

    /** One stretch from `a` to `b`: a line, or a cubic when either end has a handle. */
    const stretch = (a: CutPoint, b: CutPoint) => {
      if (!a.handleOut && !b.handleIn) return ` L${b.x},${b.y}`
      const c1 = { x: a.x + (a.handleOut?.x ?? 0), y: a.y + (a.handleOut?.y ?? 0) }
      const c2 = { x: b.x + (b.handleIn?.x ?? 0), y: b.y + (b.handleIn?.y ?? 0) }
      return ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`
    }

    const buildD = (pts: CutPoint[], tail: { x: number, y: number } | undefined) => {
      if (pts.length === 0) return ''
      let d = `M${pts[0].x},${pts[0].y}`
      for (let i = 1; i < pts.length; i++) d += stretch(pts[i - 1], pts[i])
      if (tail) d += stretch(pts[pts.length - 1], tail)
      return d
    }

    /**
     * Append a dashed red guide path directly to svgcontent so its coordinates
     * match canvas space. It is removed on finish/cancel without touching history.
     */
    const createPreviewPath = (start: { x: number; y: number; }) => {
      const svgNS = 'http://www.w3.org/2000/svg'
      const path = document.createElementNS(svgNS, 'path')
      path.setAttribute('d', buildD([start], undefined))
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke', '#e00')
      path.setAttribute('stroke-width', String(1.5 / svgCanvas.getZoom()))
      path.setAttribute('stroke-dasharray', `${6 / svgCanvas.getZoom()},${4 / svgCanvas.getZoom()}`)
      path.setAttribute('opacity', '0.85')
      path.setAttribute('pointer-events', 'none')
      path.setAttribute('id', 'cutter_preview_line')
      path.setAttribute('data-se-ephemeral', '') // scaffolding: never part of a save or an undo step
      // Append to svgcontent (not a layer) — uses canvas coordinates.
      // Elements outside layer <g>s are not included in normal SVG exports.
      svgCanvas.getSvgContent().appendChild(path)
      previewPath = path
    }

    const updateRubberBand = (x: number, y: number) => {
      const committed = drawing ? points : (pendingStart ? [pendingStart] : [])
      previewPath?.setAttribute('d', buildD(committed, { x, y }))
    }

    const updatePreviewPath = () => {
      previewPath?.setAttribute('d', buildD(points, undefined))
    }

    const removePreviewPath = () => {
      previewPath?.remove()
      previewPath = null
    }

    // ── Drawing lifecycle ────────────────────────────────────────────────────

    const reset = () => {
      active = false
      drawing = false
      pendingStart = null
      points = []
      pulling = null
      selectionAtStart = []
    }

    /** Cancel the in-progress line without cutting anything. */
    const cancel = () => {
      removePreviewPath()
      if (selectionAtStart.length) svgCanvas.selectOnly(selectionAtStart, true)
      reset()
    }

    /** Commit the in-progress multi-point line as a cut, or cancel if too short. */
    const finish = () => {
      if (points.length < 2) {
        cancel()
        return
      }
      const cutPoints = points
      const selection = selectionAtStart
      removePreviewPath()
      reset()
      // Restore the selection cutShapes should scope to (cleared while
      // drawing so Backspace/Delete couldn't also delete the selected shape).
      if (selection.length) svgCanvas.selectOnly(selection, true)
      svgCanvas.cutShapes(cutPoints)
      // Return to the select tool once a cut is made (mirrors pen/pencil).
      svgEditor.leftPanel.clickSelect()
    }

    const removeLastPoint = () => {
      if (!drawing) return
      if (points.length > 1) {
        points.pop()
        updatePreviewPath()
      } else {
        cancel()
      }
    }

    // ── The tool ─────────────────────────────────────────────────────────────

    const rubberBand = (ev: import('@svgedit/svgcanvas').ToolEvent) => {
      if (!active) return
      let { x, y } = ev
      const anchor = drawing ? points[points.length - 1] : pendingStart
      if (ev.mods.shift && anchor) ({ x, y } = snapToAngle(anchor.x, anchor.y, x, y))
      updateRubberBand(x, y)
    }

    /**
     * Pen-tool style: dragging from the vertex just placed pulls its handles,
     * the out handle toward the pointer and the in handle mirrored. Back within
     * `MIN_SEGMENT` of the vertex, it is a corner again.
     */
    const pullHandles = (vertex: CutPoint, ev: import('@svgedit/svgcanvas').ToolEvent) => {
      let { x, y } = ev
      if (ev.mods.shift) ({ x, y } = snapToAngle(vertex.x, vertex.y, x, y))
      const dx = x - vertex.x
      const dy = y - vertex.y
      if (Math.hypot(dx, dy) < MIN_SEGMENT) {
        delete vertex.handleIn
        delete vertex.handleOut
      } else {
        vertex.handleOut = { x: dx, y: dy }
        vertex.handleIn = { x: -dx, y: -dy }
      }
      updatePreviewPath()
    }

    svgCanvas.registerTool({
      id: 'cutter',
      undoLabel: 'Cut shapes',
      wantsHover: true, // the rubber band follows the pointer between clicks
      snap: true, // vertices and the rubber band snap to other objects

      // Leaving cutter mode by any route (Escape, switching tools) tears down an
      // in-progress line so no stale state or preview lingers.
      deactivate () { if (active) cancel() },
      cancel () { if (active) cancel() },

      pointerDown (ctx, ev) {
        const { x, y } = ev

        if (!active) {
          active = true
          pendingStart = { x, y }
          createPreviewPath(pendingStart)
          return
        }

        if (!drawing) return // stray mousedown before the first mouseUp resolved

        // Already drawing: commit a new vertex (pen-tool style — click to add a point).
        const last = points[points.length - 1]
        let px = x
        let py = y
        if (ev.mods.shift) ({ x: px, y: py } = snapToAngle(last.x, last.y, px, py))
        const dx = px - last.x
        const dy = py - last.y
        if (Math.sqrt(dx * dx + dy * dy) < MIN_SEGMENT) {
          // Too close to the previous vertex — likely the second mousedown
          // of a double-click finishing the line. Don't add a duplicate.
          return
        }

        pulling = { x: px, y: py }
        points.push(pulling)
        updatePreviewPath()
      },

      pointerMove (ctx, ev) {
        if (pulling) pullHandles(pulling, ev)
        else rubberBand(ev)
      },

      pointerUp (ctx, ev) {
        if (!active) return
        if (drawing) { // vertices commit on mouseDown; a release only ends a handle pull
          pulling = null
          return
        }
        const start = pendingStart
        if (!start) return

        let { x, y } = ev
        if (ev.mods.shift) ({ x, y } = snapToAngle(start.x, start.y, x, y))
        const dx = x - start.x
        const dy = y - start.y

        if (Math.sqrt(dx * dx + dy * dy) >= MIN_SEGMENT) {
          // A real drag: instant straight cut, exactly like before.
          const cutPoints = [start, { x, y }]
          removePreviewPath()
          reset()
          svgCanvas.cutShapes(cutPoints)
          svgEditor.leftPanel.clickSelect()
          return
        }

        // A plain click: start multi-point mode and keep the tool active.
        // Clear the selection for the duration of the draw so the global
        // Backspace/Delete "delete selected shape" hotkey has nothing to act
        // on — it would otherwise also fire when Backspace removes a vertex
        // here. Restored right before the cut (or on cancel) in finish/cancel.
        selectionAtStart = svgCanvas.getSelectedElements().filter(Boolean)
        svgCanvas.clearSelection()
        points = [start]
        drawing = true
      }
    })

    // ── Extension object ─────────────────────────────────────────────────────

    return {
      name: svgEditor.i18next.t(`${name}:name`),

      /**
       * Inject the toolbar button into the left panel.
       */
      callback () {
        const title = `${name}:buttons.0.title`
        svgCanvas.insertChildAtIndex(
          $req('tools_left'),
          `<se-button id="tool_cutter" command="tool_cutter" title="${title}" src="cutter.svg" shortcut="C"></se-button>`,
          11
        )

        svgEditor.leftPanel.addModeCommand('tool_cutter', 'cutter', { label: title })

        // Finish a multi-point line via double-click.
        svgEditor.workarea?.addEventListener('dblclick', () => {
          if (svgCanvas.getMode() !== 'cutter' || !drawing) return
          finish()
        })

        // Finish via Enter, undo the last vertex via Backspace/Delete.
        document.addEventListener('keydown', (evt) => {
          if (svgCanvas.getMode() !== 'cutter' || !drawing) return
          if (evt.key === 'Enter') {
            evt.preventDefault()
            finish()
          } else if (evt.key === 'Backspace' || evt.key === 'Delete') {
            evt.preventDefault()
            removeLastPoint()
          }
        }, { signal: svgEditor.listenerAbort?.signal })
      }
    }
  }
})
