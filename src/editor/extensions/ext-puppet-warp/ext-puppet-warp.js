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
 * Model: for a *single-shape* selection (one shape, or a group with exactly
 * one warp-able descendant), the rig is persistent — the rest pose and pins
 * are cached as `se:puppet-rest-d`/`se:puppet-pins` on the element (same
 * `se:`-attribute idiom as `core/corner-radius.js`'s `se:orig-d`) and
 * re-hydrated on re-entry, so every session warps from the same canonical
 * rest and pin positions carry over. `geometry-remap-registry.js` hooks
 * (`remapPuppetRestD`/`remapPuppetPins` below) keep that cache in sync when a
 * transform is baked into the shape outside the tool. For a multi-shape
 * selection, the rig stays session-only (per-shape `d` is baked and the pin
 * layout is discarded on exit) — the remap registry only fires for `<path>`
 * elements (`coords.js`'s `case 'g':` never calls it), so a group's rig
 * can't be kept in sync and isn't persisted.
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
const REST_D_ATTR = 'se:puppet-rest-d'
const PINS_ATTR = 'se:puppet-pins'

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

// Both the polyline sample spacing and the on-commit bézier refit tolerance are
// user-unit distances, so a fixed constant over- or under-samples/-smooths
// depending on the target's actual size (a tiny icon vs. a huge path). Instead,
// derive both as a fraction of the target's content-space bbox diagonal — the
// ratios are chosen so a "typical" mid-size shape (~300 unit diagonal) lands on
// the previous fixed defaults (6 units/sample, tolerance 2).
const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
export const sampleStepFor = (diag) => clamp(diag / 50, 1, 20)
export const refitToleranceFor = (diag) => clamp(diag / 150, 0.5, 10)

// ── Persistent-rig helpers ──────────────────────────────────────────────────
// Pure/DOM-light functions, kept at module scope (like corner-radius.js's
// `remapCornerSource`) so they're unit-testable without a svgCanvas mock, and
// so `registerGeometryRemap` can be called once from `init()` per instance
// without re-creating per-instance closures.

/**
 * Reconstruct the affine matrix `{a,b,c,d,e,f}` a `remapElement` `remap(x,y)`
 * function represents, by probing it at the origin and unit axes. `remap` is
 * always affine (`math.js`'s `transformPoint`), so this is exact.
 * @param {(x: number, y: number) => {x: number, y: number}} remap
 * @returns {{a:number,b:number,c:number,d:number,e:number,f:number}}
 */
export const remapAffine = (remap) => {
  const o = remap(0, 0)
  const x = remap(1, 0)
  const y = remap(0, 1)
  return { a: x.x - o.x, b: x.y - o.y, c: y.x - o.x, d: y.y - o.y, e: o.x, f: o.y }
}

/** Serialize pins to the `se:puppet-pins` JSON form (rounded, compact). */
export const serializePins = (pinList) =>
  JSON.stringify(pinList.map((p) => [fmt(p.px), fmt(p.py), fmt(p.qx), fmt(p.qy)]))

/**
 * Parse `se:puppet-pins` JSON back into `{px,py,qx,qy}` objects.
 * @returns {?Array<{px:number,py:number,qx:number,qy:number}>} null on
 *   missing/corrupt input — callers fall back to a fresh empty-pins rig.
 */
export const parsePins = (json) => {
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return null
    return parsed.map(([px, py, qx, qy]) => ({ px, py, qx, qy }))
  } catch {
    return null
  }
}

/**
 * `geometry-remap-registry.js` hook for `se:puppet-pins`: remap every pin's
 * rest/current point through an external transform bake.
 * @param {Element} elem
 * @param {(x: number, y: number) => {x: number, y: number}} remap
 * @returns {void}
 */
export const remapPuppetPins = (elem, remap) => {
  const pinList = parsePins(elem.getAttribute(PINS_ATTR))
  if (!pinList) return
  const remapped = pinList.map((p) => {
    const rest = remap(p.px, p.py)
    const cur = remap(p.qx, p.qy)
    return { px: rest.x, py: rest.y, qx: cur.x, qy: cur.y }
  })
  elem.setAttribute(PINS_ATTR, serializePins(remapped))
}

/**
 * `geometry-remap-registry.js` hook for `se:puppet-rest-d`: remap the stored
 * canonical rest-pose geometry through an external transform bake. Rest-d can
 * contain curves (unlike corner-radius's straight-segment-only source), so
 * this reuses paper.js (already a dependency here) to transform exact
 * control points losslessly rather than resampling into a polyline — see
 * `paper-utils.js`'s `svgToPaper` for the same `item.transform(scope.Matrix)`
 * pattern against an SVGMatrix-shaped object.
 * @param {Element} elem
 * @param {(x: number, y: number) => {x: number, y: number}} remap
 * @returns {void}
 */
export const remapPuppetRestD = (elem, remap) => {
  const restD = elem.getAttribute(REST_D_ATTR)
  if (!restD) return
  const scope = getPaperScope()
  const path = new scope.CompoundPath(restD)
  const { a, b, c, d, e, f } = remapAffine(remap)
  path.transform(new scope.Matrix(a, b, c, d, e, f))
  elem.setAttribute(REST_D_ATTR, path.pathData)
  path.remove()
}

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { $id, $click } = svgCanvas

    await loadExtensionTranslation(svgEditor)

    // Via svgCanvas.registerGeometryRemap (assigned by coords.js's own init),
    // not a direct import of geometry-remap-registry.js: this extension is
    // served from source, separately from the packages/svgcanvas dist bundle
    // coords.js ships in, so a direct deep import would land in a disjoint
    // module-graph copy of the registry that coords.js's runGeometryRemaps
    // never reads from. Routing through the shared svgCanvas instance (the
    // same object coords.js itself holds) reaches the one registry that
    // matters. Idempotent across multiple editor instances (the registry is a
    // shared attrName→fn map; re-registering the same functions is harmless).
    svgCanvas.registerGeometryRemap(REST_D_ATTR, remapPuppetRestD)
    svgCanvas.registerGeometryRemap(PINS_ATTR, remapPuppetPins)

    // ── Session state ──────────────────────────────────────────────────────
    // targets: [{ el, inv, m, diag, rest: [{ pts:[{x,y}…contentSpace], closed }], origD }]
    let targets = []
    // pins in CONTENT coordinates: { px,py (rest), qx,qy (current) }
    let pins = []
    let dragIndex = -1
    let dirty = false
    // Only a single-target session can persist its rig (see file header —
    // the geometry-remap registry only fires for <path>, so a multi-shape
    // rig's metadata can't be kept in sync with external transforms).
    let persistable = false
    // convertToPath auto-commits its own undo command; we capture those here so
    // the whole session is one atomic, cancelable undo step (see startSession).
    let convertCmds = []
    /** @type {SVGCircleElement[]} */
    let pinDots = []

    const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by)

    // Pin overlay lives in #svgroot, outside #svgcontent, so a host autosave /
    // getSvgString() firing mid-session never serializes the pin dots into the
    // saved document (the risk with appending them into the drawing layer).
    // Appended last so it renders above the drawing content, mirroring
    // ext-smart-guides' overlay. Its x/y/width/height/viewBox are kept in sync
    // with #svgcontent (see syncPinOverlay) so overlay-local coordinates equal
    // content coordinates and pins can use `pins[i].qx/qy` unchanged.
    const pinOverlay = document.createElementNS(svgNS, 'svg')
    pinOverlay.setAttribute('id', 'puppetWarpPins')
    pinOverlay.setAttribute('overflow', 'visible')
    pinOverlay.style.pointerEvents = 'none'
    svgCanvas.getSvgRoot().append(pinOverlay)

    const syncPinOverlay = () => {
      const content = svgCanvas.getSvgContent()
      for (const attr of ['x', 'y', 'width', 'height', 'viewBox']) {
        const v = content.getAttribute(attr)
        if (v == null) pinOverlay.removeAttribute(attr)
        else pinOverlay.setAttribute(attr, v)
      }
    }

    /** Content-space bbox diagonal of `el` (local `getBBox()` mapped through `m`). */
    const bboxDiagonal = (el, m) => {
      const b = el.getBBox()
      const p1 = transformPoint(b.x, b.y, m)
      const p2 = transformPoint(b.x + b.width, b.y + b.height, m)
      return dist(p1.x, p1.y, p2.x, p2.y) || 1
    }

    // ── Geometry sampling / rebuild ──────────────────────────────────────────

    /**
     * Resample an element's current `d` into dense content-space polylines.
     * paper.js parses every command (incl. arcs) and splits subpaths; we sample
     * each subpath at uniform arc-length steps — crucially, this subdivides
     * *straight* segments too (paper's own `flatten` only splits curved spans by
     * curvature, leaving a straight limb as 2 points that can never bend).
     * `dOverride` samples a different `d` than the element's live one — used
     * to rehydrate a persistent rig's canonical rest pose (`se:puppet-rest-d`)
     * instead of the (already-warped) live geometry.
     * @param {?string} [dOverride]
     * @returns {Array<{pts:Array<{x:number,y:number}>, closed:boolean}>}
     */
    const sampleRest = (el, m, diag, dOverride) => {
      const d = dOverride ?? getPathDFromElement(el)
      if (!d) return []
      const scope = getPaperScope()
      const compound = new scope.CompoundPath(d)
      const children = compound.children?.length ? compound.children : [compound]
      const subpaths = []
      const step = sampleStepFor(diag)
      for (const ch of children) {
        const len = ch.length
        if (!len) {
          // Degenerate (a lone moveto) — keep its single point.
          const p = ch.segments?.[0]?.point
          if (p) subpaths.push({ pts: [transformPoint(p.x, p.y, m)], closed: false })
          continue
        }
        // Sample spacing scales with the target's own size (see step/tolerance
        // helpers above), clamped so short limbs still bend and long paths stay
        // bounded.
        const n = Math.max(8, Math.min(400, Math.ceil(len / step)))
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
      pinOverlay.appendChild(dot)
      pinDots.push(dot)
    }

    const redrawPins = () => {
      syncPinOverlay()
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
          const diag = bboxDiagonal(el, m)
          return { el, inv, m, diag, rest: sampleRest(el, m, diag), origD: el.getAttribute('d') }
        })
        .filter(Boolean)

      // A persistent rig only exists (and can only be kept in sync — see file
      // header) for a single-target session. Rehydrate its canonical rest
      // pose and last pin layout if present; a fresh/multi-target session
      // starts empty exactly as before.
      persistable = targets.length === 1
      pins = []
      if (persistable) {
        const t = targets[0]
        const storedRestD = t.el.getAttribute(REST_D_ATTR)
        if (storedRestD) {
          const rest = sampleRest(t.el, t.m, t.diag, storedRestD)
          if (rest.length) t.rest = rest
        }
        const storedPins = parsePins(t.el.getAttribute(PINS_ATTR))
        if (storedPins) pins = storedPins
      }

      dragIndex = -1
      dirty = false
      removePins()
      if (pins.length) {
        redrawPins()
        applyWarp()
      }
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
            const refit = svgCanvas.simplifyPathD?.(t.el.getAttribute('d'), refitToleranceFor(t.diag))
            if (refit) t.el.setAttribute('d', refit)
          } catch { /* keep the raw polyline */ }

          // Element now holds the final `d`; snapshot old values for undo, one
          // ChangeElementCommand per target so `d` and the persistent-rig
          // metadata (single-target sessions only) land in the same undo step.
          const oldValues = {}
          // Skip targets that ended up unchanged (dragged then returned to rest).
          if (t.el.getAttribute('d') !== t.origD) oldValues.d = t.origD

          if (persistable && t === targets[0]) {
            // Rest-d is the canonical, never-warped rest pose — written once,
            // at rig creation, and never overwritten so every future session
            // keeps warping from the same rest (see file header).
            if (!t.el.hasAttribute(REST_D_ATTR)) {
              oldValues[REST_D_ATTR] = null
              t.el.setAttribute(REST_D_ATTR, t.origD)
            }
            const oldPins = t.el.getAttribute(PINS_ATTR)
            const newPins = serializePins(pins)
            if (oldPins !== newPins) {
              oldValues[PINS_ATTR] = oldPins
              t.el.setAttribute(PINS_ATTR, newPins)
            }
          }

          if (Object.keys(oldValues).length) {
            batch.addSubCommand(new ChangeElementCommand(t.el, oldValues, 'Puppet Warp'))
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
          `<se-button id="tool_puppet_warp" title="${title}" src="pin.svg"></se-button>`,
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
        syncPinOverlay()
        addPinDot(pins.length - 1)
        return { started: true }
      },

      // Zoom changes #svgcontent's viewBox without a mouse event to piggyback
      // a resync on — keep the overlay (and pin dot radii) aligned.
      zoomChanged () {
        if (pins.length) redrawPins()
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
