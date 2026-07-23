/**
 * @file ext-puppet-warp.js
 *
 * Puppet Warp tool — Illustrator-style mesh deformation. Select an object (or a
 * group of shapes), drop "pins" on it, then drag a pin to bend the shape
 * smoothly around the pins you leave fixed — the way a puppet's limbs move.
 *
 * Interaction:
 *   • Click empty space  → drop a pin (acts as a fixed anchor)
 *   • Drag a pin         → deform: the shape follows the dragged pin, bending
 *                          around the fixed pins
 *   • Escape             → cancel the session (restore the shape) and exit
 *   • Switch tools       → commit the current pose as one undo step
 *
 * Model (per project decision — "re-pose from current shape each time"): the
 * shape's geometry at tool-entry is the *rest pose* for the whole session; every
 * pin drag warps from that rest. Leaving the tool bakes the result. There is no
 * persistent saved rig — next time you enter the tool, the baked shape is the new
 * rest.
 *
 * Deformation: Moving Least Squares rigid (see ./mls.js).
 * Geometry is subdivided (paper.js flatten) so straight limbs bend smoothly.
 *
 * @license MIT
 */

import { deformPoint } from './mls.js'
import { getMatrixToContent, getMatrix, matrixMultiply, transformPoint } from '@svgedit/svgcanvas/core/math.js'
import { getPaperScope } from '@svgedit/svgcanvas/core/paper-utils.js'
import { getPathDFromElement } from '@svgedit/svgcanvas/core/path-utils.js'

const name = 'puppetwarp'
const svgNS = 'http://www.w3.org/2000/svg'

const loadExtensionTranslation = async function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  const locales = import.meta.glob('./locale/*.js', { eager: true })
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

const fmt = (n) => Math.round(n * 100) / 100

// Element types that carry warp-able geometry (everything convertToPath handles).
const WARPABLE = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'])

// Curve-fit tolerance (user units) for the on-commit bézier refit. Small enough
// to stay faithful to the pose, large enough to collapse the dense warp polyline
// back into a handful of smooth cubics. (paper's freehand default is 2.5.)
const REFIT_TOLERANCE = 2

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { $id, $click } = svgCanvas

    await loadExtensionTranslation(svgEditor)

    // ── Session state ──────────────────────────────────────────────────────
    // targets: [{ el, inv, rest: [{ pts:[{x,y}…contentSpace], closed }], origD }]
    let targets = []
    // pins in CONTENT coordinates: { px,py (rest), qx,qy (current) }
    let pins = []
    let dragIndex = -1
    let dirty = false
    // convertToPath auto-commits its own undo command; we capture those here so
    // the whole session is one atomic, cancelable undo step (see startSession).
    let convertCmds = []
    /** @type {SVGCircleElement[]} */
    let pinDots = []

    const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by)
    const getLayer = () => svgCanvas.getCurrentDrawing().getCurrentLayer()

    // ── Geometry sampling / rebuild ──────────────────────────────────────────

    /**
     * Resample an element's current `d` into dense content-space polylines.
     * paper.js parses every command (incl. arcs) and splits subpaths; we sample
     * each subpath at uniform arc-length steps — crucially, this subdivides
     * *straight* segments too (paper's own `flatten` only splits curved spans by
     * curvature, leaving a straight limb as 2 points that can never bend).
     * @returns {Array<{pts:Array<{x:number,y:number}>, closed:boolean}>}
     */
    const sampleRest = (el, m) => {
      const d = getPathDFromElement(el)
      if (!d) return []
      const scope = getPaperScope()
      const compound = new scope.CompoundPath(d)
      const children = compound.children?.length ? compound.children : [compound]
      const subpaths = []
      for (const ch of children) {
        const len = ch.length
        if (!len) {
          // Degenerate (a lone moveto) — keep its single point.
          const p = ch.segments?.[0]?.point
          if (p) subpaths.push({ pts: [transformPoint(p.x, p.y, m)], closed: false })
          continue
        }
        // ~6 local units per sample, clamped so short limbs still bend and long
        // paths stay bounded.
        const n = Math.max(8, Math.min(400, Math.ceil(len / 6)))
        const last = ch.closed ? n - 1 : n
        const pts = []
        for (let i = 0; i <= last; i++) {
          const pt = ch.getPointAt((i / n) * len)
          if (pt) pts.push(transformPoint(pt.x, pt.y, m))
        }
        if (pts.length) subpaths.push({ pts, closed: ch.closed })
      }
      compound.remove()
      return subpaths
    }

    /** Build a local-space `d` (M/L polyline) from warped content points. */
    const buildD = (subpaths, inv) => {
      let d = ''
      for (const sp of subpaths) {
        sp.pts.forEach((p, i) => {
          const l = transformPoint(p.x, p.y, inv)
          d += (i === 0 ? `M${fmt(l.x)},${fmt(l.y)}` : ` L${fmt(l.x)},${fmt(l.y)}`)
        })
        if (sp.closed) d += ' Z'
        d += ' '
      }
      return d.trim()
    }

    /** Re-warp every target from its rest pose using the current pins. */
    const applyWarp = () => {
      for (const t of targets) {
        const warped = t.rest.map((sp) => ({
          pts: sp.pts.map((p) => deformPoint(p, pins)),
          closed: sp.closed
        }))
        t.el.setAttribute('d', buildD(warped, t.inv))
      }
    }

    // ── Pin overlay ──────────────────────────────────────────────────────────

    const addPinDot = (i) => {
      const zoom = svgCanvas.getZoom()
      const p = pins[i]
      const dot = document.createElementNS(svgNS, 'circle')
      dot.setAttribute('cx', p.qx)
      dot.setAttribute('cy', p.qy)
      dot.setAttribute('r', 5 / zoom)
      // Dragged pin: solid accent. Anchors: hollow. Use the theme accent token
      // via `style` (SVG presentation attributes don't resolve var()); the
      // custom property inherits through the SVG DOM, falling back to blue.
      const dragging = i === dragIndex
      const accent = 'var(--accent, #06f)'
      dot.style.fill = dragging ? accent : '#fff'
      dot.style.stroke = dragging ? '#fff' : accent
      dot.setAttribute('stroke-width', String(2 / zoom))
      dot.setAttribute('pointer-events', 'none')
      getLayer().appendChild(dot)
      pinDots.push(dot)
    }

    const redrawPins = () => {
      pinDots.forEach((d) => d.remove())
      pinDots = []
      pins.forEach((_, i) => addPinDot(i))
    }

    const removePins = () => {
      pinDots.forEach((d) => d.remove())
      pinDots = []
    }

    const hitTestPin = (x, y) => {
      const r = 8 / svgCanvas.getZoom()
      for (let i = 0; i < pins.length; i++) {
        if (dist(x, y, pins[i].qx, pins[i].qy) <= r) return i
      }
      return -1
    }

    // ── Session lifecycle ────────────────────────────────────────────────────

    /**
     * Resolve the current selection into warp-able path targets, converting
     * primitives to paths and caching each one's rest geometry. Returns the
     * number of targets prepared.
     */
    const startSession = () => {
      const sel = svgCanvas.getSelectedElements().filter(Boolean)
      if (!sel.length) return 0

      // Expand a group into its descendant shapes; keep single shapes as-is.
      const shapes = []
      for (const el of sel) {
        if (el.tagName === 'g') {
          el.querySelectorAll('*').forEach((c) => {
            if (WARPABLE.has(c.tagName)) shapes.push(c)
          })
        } else if (WARPABLE.has(el.tagName)) {
          shapes.push(el)
        }
      }
      if (!shapes.length) return 0

      // Convert primitives to paths up front. convertToPath pushes its own undo
      // command immediately; capture and detach each so the session controls
      // atomicity (folded into the warp batch on commit, reverted on cancel).
      convertCmds = []
      const { undoMgr } = svgCanvas
      const paths = shapes
        .map((el) => {
          if (el.tagName === 'path') return el
          const before = undoMgr.getUndoStackSize()
          const path = svgCanvas.convertToPath(el)
          if (path && undoMgr.getUndoStackSize() > before) {
            convertCmds.push(undoMgr.undoStack[undoMgr.getUndoStackSize() - 1])
            undoMgr.undoStack.length = before // detach — the session owns it now
            undoMgr.undoStackPointer = before
          }
          return path
        })
        .filter(Boolean)

      svgCanvas.clearSelection() // drop selector grips so they don't eat our drags

      // Map element-local (`d`) coords all the way to content space: the element's
      // OWN transform (getMatrix) then its ancestors' (getMatrixToContent, which
      // covers only `<g>`/`<a>` parents). Skip any target whose matrix is singular.
      targets = paths
        .map((el) => {
          const m = matrixMultiply(getMatrixToContent(el), getMatrix(el))
          let inv
          try { inv = m.inverse() } catch { return null }
          return { el, inv, rest: sampleRest(el, m), origD: el.getAttribute('d') }
        })
        .filter(Boolean)
      pins = []
      dragIndex = -1
      dirty = false
      removePins()
      return targets.length
    }

    /** Undo (in reverse) the primitive→path conversions made this session. */
    const revertConversions = () => {
      const handler = svgCanvas.undoMgr.handler_
      convertCmds.slice().reverse().forEach((cmd) => cmd.unapply(handler))
      convertCmds = []
    }

    /** Bake the current pose as one atomic undo step. */
    const commit = () => {
      if (dirty && targets.length) {
        const { BatchCommand, ChangeElementCommand } = svgCanvas.history
        const batch = new BatchCommand('Puppet Warp')
        // Conversions (already applied to the DOM) go first so undo reverses
        // warp→convert and the whole session is one step.
        convertCmds.forEach((cmd) => batch.addSubCommand(cmd))
        targets.forEach((t) => {
          // Refit the dense warp polyline into smooth cubic béziers so the baked
          // path is compact (and doesn't grow each re-pose session). Falls back
          // to the raw polyline if the fit fails.
          try {
            const refit = svgCanvas.simplifyPathD?.(t.el.getAttribute('d'), REFIT_TOLERANCE)
            if (refit) t.el.setAttribute('d', refit)
          } catch { /* keep the raw polyline */ }
          // Element now holds the final `d`; snapshot old value for undo. Skip
          // targets that ended up unchanged (dragged then returned to rest).
          if (t.el.getAttribute('d') !== t.origD) {
            batch.addSubCommand(new ChangeElementCommand(t.el, { d: t.origD }, 'Puppet Warp'))
          }
        })
        convertCmds = [] // ownership transferred into the batch
        if (!batch.isEmpty()) svgCanvas.addCommandToHistory(batch)
      } else {
        // Entered but never warped — undo the conversions so it's a true no-op.
        revertConversions()
      }
      teardown()
    }

    /** Discard the session: restore rest geometry, revert conversions, no undo entry. */
    const cancel = () => {
      targets.forEach((t) => t.el.setAttribute('d', t.origD))
      revertConversions()
      teardown()
    }

    const teardown = () => {
      removePins()
      targets = []
      pins = []
      dragIndex = -1
      dirty = false
      convertCmds = []
    }

    // Any exit from puppetwarp mode commits the pose (mirrors ext-curvature's
    // modeChange teardown; critical so overlay dots aren't serialized).
    document.addEventListener('modeChange', (evt) => {
      if (evt.detail.getMode() !== name && targets.length) {
        commit()
      }
    }, { signal: svgEditor.listenerAbort.signal })

    // Escape cancels the session (restore geometry, no undo entry). The
    // extension `keyDown` hook is dead code in this build (`runExtensions
    // ('keyDown', …)` is never dispatched), so — like ext-curvature's dblclick
    // handler — we bind a real window listener guarded on our mode.
    window.addEventListener('keydown', (evt) => {
      if (svgCanvas.getMode() !== name) return
      if (evt.key === 'Escape') {
        evt.preventDefault()
        cancel()
        svgEditor.leftPanel.clickSelect()
      }
    }, { capture: true, signal: svgEditor.listenerAbort.signal })

    // ── Extension object ─────────────────────────────────────────────────────

    return {
      name: svgEditor.i18next.t(`${name}:name`),

      callback () {
        const title = `${name}:buttons.0.title`
        svgCanvas.insertChildAtIndex(
          $id('tools_left'),
          `<se-button id="tool_puppet_warp" title="${title}" src="puppet-warp.svg"></se-button>`,
          13
        )

        $click($id('tool_puppet_warp'), () => {
          if (svgCanvas.getMode() === name) return
          if (!this.leftPanel.updateLeftPanel('tool_puppet_warp')) return
          if (startSession() === 0) {
            // Nothing warp-able selected — bail back to select.
            svgEditor.leftPanel.clickSelect()
            return
          }
          svgCanvas.setMode(name)
        })
      },

      mouseDown (opts) {
        if (svgCanvas.getMode() !== name) return undefined
        if (!targets.length) return undefined

        const x = opts.start_x
        const y = opts.start_y

        const hit = hitTestPin(x, y)
        if (hit !== -1) {
          dragIndex = hit
          redrawPins()
          return { started: true }
        }

        // Empty space → drop a new anchor pin (rest === current).
        pins.push({ px: x, py: y, qx: x, qy: y })
        addPinDot(pins.length - 1)
        return { started: true }
      },

      mouseMove (opts) {
        if (svgCanvas.getMode() !== name) return undefined
        if (dragIndex < 0) return undefined

        const zoom = svgCanvas.getZoom()
        pins[dragIndex].qx = opts.mouse_x / zoom
        pins[dragIndex].qy = opts.mouse_y / zoom
        dirty = true
        applyWarp()
        redrawPins()
        return { started: true }
      },

      mouseUp () {
        if (svgCanvas.getMode() !== name) return undefined
        if (dragIndex < 0) return { keep: false, started: false }
        dragIndex = -1
        redrawPins()
        return { keep: false, started: false }
      }
    }
  }
}
