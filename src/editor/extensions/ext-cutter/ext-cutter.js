/**
 * @file ext-cutter.js
 *
 * Cutter (knife) tool — cut shapes along a straight line or a multi-point
 * zigzag line.
 *
 * Behaviour mirrors Illustrator's knife tool, extended with a pen-tool-style
 * multi-point mode:
 *   • Press, drag, release in one motion → an instant straight cut, exactly
 *     like before.
 *   • Press and release without moving (a plain click) → starts a
 *     multi-point line instead: click to add each further vertex, then
 *     press Enter or double-click to cut along the resulting zigzag.
 *     Backspace/Delete removes the last vertex; Escape cancels.
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

import { snapToAngle } from '@svgedit/svgcanvas/core/math.js'

const name = 'cutter'

// Minimum movement (canvas units) to count as an intentional drag/new vertex
// rather than an accidental click-in-place (also absorbs the redundant
// second mousedown of a double-click used to finish a multi-point line).
const MIN_SEGMENT = 2

const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  // Locale files are inlined into the bundle (statically resolved glob).
  const locales = import.meta.glob('./locale/*.js', { eager: true })
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { $id, $click } = svgCanvas

    await loadExtensionTranslation(svgEditor)

    // ── Drawing state ────────────────────────────────────────────────────────
    let active = false // true from the first mousedown until finish/cancel
    let drawing = false // true once committed to multi-point mode
    let pendingStart = null // first click/drag-start point, while active && !drawing
    let points = [] // committed vertices, once drawing
    // The selection when multi-point mode started, so it can be restored
    // right before the actual cut (cutShapes scopes to it) after being
    // cleared for the duration of the draw — see the `drawing` transition in
    // mouseUp for why it's cleared: the global Backspace/Delete "delete
    // selected shape" hotkey would otherwise also fire on the same keypress
    // used here to remove the last vertex.
    let selectionAtStart = []
    /** @type {SVGPathElement|null} */
    let previewPath = null

    // ── Preview path helpers ─────────────────────────────────────────────────

    const buildD = (pts, tail) => {
      if (pts.length === 0) return ''
      let d = `M${pts[0].x},${pts[0].y}`
      for (let i = 1; i < pts.length; i++) d += ` L${pts[i].x},${pts[i].y}`
      if (tail) d += ` L${tail.x},${tail.y}`
      return d
    }

    /**
     * Append a dashed red guide path directly to svgcontent so its coordinates
     * match canvas space. It is removed on finish/cancel without touching history.
     */
    const createPreviewPath = (start) => {
      const svgNS = 'http://www.w3.org/2000/svg'
      const path = document.createElementNS(svgNS, 'path')
      path.setAttribute('d', buildD([start]))
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke', '#e00')
      path.setAttribute('stroke-width', String(1.5 / svgCanvas.getZoom()))
      path.setAttribute('stroke-dasharray', `${6 / svgCanvas.getZoom()},${4 / svgCanvas.getZoom()}`)
      path.setAttribute('opacity', '0.85')
      path.setAttribute('pointer-events', 'none')
      path.setAttribute('id', 'cutter_preview_line')
      // Append to svgcontent (not a layer) — uses canvas coordinates.
      // Elements outside layer <g>s are not included in normal SVG exports.
      svgCanvas.getSvgContent().appendChild(path)
      previewPath = path
    }

    const updateRubberBand = (x, y) => {
      const committed = drawing ? points : [pendingStart]
      previewPath?.setAttribute('d', buildD(committed, { x, y }))
    }

    const updatePreviewPath = () => {
      previewPath?.setAttribute('d', buildD(points))
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

    // Leaving cutter mode by any route (Escape → cancelTool, switching tools)
    // must tear down an in-progress line so no stale state/preview lingers.
    const origSetMode = svgCanvas.setMode.bind(svgCanvas)
    svgCanvas.setMode = (mode) => {
      if (active && mode !== 'cutter') cancel()
      origSetMode(mode)
    }

    // ── Extension object ─────────────────────────────────────────────────────

    return {
      name: svgEditor.i18next.t(`${name}:name`),

      /**
       * Inject the toolbar button into the left panel.
       */
      callback () {
        const title = `${name}:buttons.0.title`
        svgCanvas.insertChildAtIndex(
          $id('tools_left'),
          `<se-button id="tool_cutter" title="${title}" src="cutter.svg"></se-button>`,
          11
        )

        $click($id('tool_cutter'), () => {
          if (this.leftPanel.updateLeftPanel('tool_cutter')) {
            svgCanvas.setMode('cutter')
          }
        })

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
        })
      },

      mouseDown (opts) {
        if (svgCanvas.getMode() !== 'cutter') return undefined

        // mouseDown opts use start_x/start_y (already in canvas coords).
        // mouseMove/mouseUp use mouse_x/mouse_y (screen-pixel coords, need /zoom).
        const x = opts.start_x
        const y = opts.start_y

        if (!active) {
          active = true
          pendingStart = { x, y }
          createPreviewPath(pendingStart)
          return { started: true }
        }

        if (!drawing) return { started: true } // stray mousedown before the first mouseUp resolved

        // Already drawing: commit a new vertex (pen-tool style — click to add a point).
        const last = points[points.length - 1]
        let px = x
        let py = y
        if (opts.event?.shiftKey) {
          ({ x: px, y: py } = snapToAngle(last.x, last.y, px, py))
        }
        const dx = px - last.x
        const dy = py - last.y
        if (Math.sqrt(dx * dx + dy * dy) < MIN_SEGMENT) {
          // Too close to the previous vertex — likely the second mousedown
          // of a double-click finishing the line. Don't add a duplicate.
          return { started: true }
        }

        points.push({ x: px, y: py })
        updatePreviewPath()
        return { started: true }
      },

      mouseMove (opts) {
        if (!active) return undefined

        const zoom = svgCanvas.getZoom()
        let x = opts.mouse_x / zoom
        let y = opts.mouse_y / zoom
        const anchor = drawing ? points[points.length - 1] : pendingStart
        if (opts.event?.shiftKey) {
          ({ x, y } = snapToAngle(anchor.x, anchor.y, x, y))
        }
        updateRubberBand(x, y)
        return { started: true }
      },

      mouseUp (opts) {
        if (!active) return undefined

        if (drawing) {
          // Vertices commit on mouseDown; nothing more to do per click.
          return { keep: true, started: true }
        }

        const zoom = svgCanvas.getZoom()
        let x = opts.mouse_x / zoom
        let y = opts.mouse_y / zoom
        if (opts.event?.shiftKey) {
          ({ x, y } = snapToAngle(pendingStart.x, pendingStart.y, x, y))
        }
        const dx = x - pendingStart.x
        const dy = y - pendingStart.y

        if (Math.sqrt(dx * dx + dy * dy) >= MIN_SEGMENT) {
          // A real drag: instant straight cut, exactly like before.
          const cutPoints = [pendingStart, { x, y }]
          removePreviewPath()
          reset()
          svgCanvas.cutShapes(cutPoints)
          svgEditor.leftPanel.clickSelect()
          return { keep: false, started: false }
        }

        // A plain click: start multi-point mode and keep the tool active.
        // Clear the selection for the duration of the draw so the global
        // Backspace/Delete "delete selected shape" hotkey has nothing to act
        // on — it would otherwise also fire when Backspace removes a vertex
        // here. Restored right before the cut (or on cancel) in finish/cancel.
        selectionAtStart = svgCanvas.getSelectedElements().filter(Boolean)
        svgCanvas.clearSelection()
        points = [pendingStart]
        drawing = true
        return { keep: true, started: true }
      }
    }
  }
}
