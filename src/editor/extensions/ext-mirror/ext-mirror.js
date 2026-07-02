/**
 * @file ext-mirror.js
 *
 * Mirror drawing mode: while active, every newly drawn element gets a
 * reflected twin across the canvas center axis (vertical by default;
 * Shift+click the toggle for horizontal). A dashed axis line is shown while
 * the mode is on.
 *
 * Live linked symmetry: twins are stamped `se:mirror-of="<sourceId>"` +
 * `se:mirror-axis`, and stay synced with their source — editing/moving the
 * source rebuilds the twin's reflected geometry (during the drag too, via
 * `elementTransition`), whether or not the mode is still on. Syncs are
 * deliberately non-undoable (ext-connector's re-routing precedent): undoing
 * a source edit re-fires `elementChanged`, which re-syncs the twin to match.
 * Dragging a twin directly breaks the link so the manual edit sticks;
 * dragging source and twin together also unlinks (both then move normally).
 *
 * Detection: new hand-drawn elements are committed by core `event.js` as a
 * bare `InsertElementCommand` through `svgCanvas.addCommandToHistory`. This
 * extension wraps that method (same precedent as ext-connector wrapping
 * `moveSelectedElements`) and replaces the bare insert with one
 * `BatchCommand` holding the source insert + the twin insert — so undoing a
 * mirrored stroke is a single Ctrl+Z. Batched operations (paste, repeat,
 * boolean ops…) pass through untouched.
 *
 * Also adds a "Mirror-copy selection" button (Object/Combine sections) that
 * reflects a copy of the current selection across the canvas vertical axis,
 * usable without the mode.
 *
 * @license Apache-2.0
 */

const name = 'mirror'

const MIRROR_OF_ATTR = 'se:mirror-of'
const AXIS_ATTR = 'se:mirror-axis'

const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
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
    await loadExtensionTranslation(svgEditor)
    const { svgCanvas } = svgEditor
    const { $id, NS, assignAttributes } = svgCanvas
    const svgdoc = $id('svgcanvas').ownerDocument
    const canvBG = $id('canvasBackground')

    let axis = null // null | 'v' | 'h'
    let busy = false // reentrancy guard while creating a twin

    // Dashed center-axis overlay (proportion-markers overlay pattern).
    const overlay = svgdoc.createElementNS(NS.SVG, 'svg')
    assignAttributes(overlay, {
      id: 'mirrorAxis',
      width: '100%',
      height: '100%',
      x: 0,
      y: 0,
      overflow: 'visible',
      display: 'none',
      style: 'pointer-events: none;'
    })
    canvBG.appendChild(overlay)

    const drawAxis = () => {
      if (!axis) {
        overlay.style.display = 'none'
        return
      }
      const zoom = svgCanvas.getZoom()
      const res = svgCanvas.getResolution()
      const w = res.w * zoom
      const h = res.h * zoom
      const ln = svgdoc.createElementNS(NS.SVG, 'line')
      assignAttributes(ln, axis === 'v'
        ? { x1: w / 2, y1: 0, x2: w / 2, y2: h }
        : { x1: 0, y1: h / 2, x2: w, y2: h / 2 })
      assignAttributes(ln, {
        stroke: 'var(--accent, #2962FF)',
        'stroke-width': 1.5,
        'stroke-dasharray': '8 5',
        'stroke-opacity': 0.8
      })
      overlay.replaceChildren(ln)
      overlay.style.display = 'block'
    }

    /**
     * Create the reflected twin of one element across the canvas center
     * axis. Text is position-mirrored only (no negative scale — glyphs must
     * stay readable). The reflection transform is baked via
     * recalculateDimensions where possible so the twin has clean geometry.
     * @param {Element} src
     * @param {'v'|'h'} ax
     * @returns {?Element}
     */
    const makeTwin = (src, ax) => {
      const res = svgCanvas.getResolution()
      const clone = src.cloneNode(true)
      svgCanvas.remapElementIdsAndRefs([clone], () => svgCanvas.getNextId())
      clone.setAttribute(MIRROR_OF_ATTR, src.id)
      clone.setAttribute(AXIS_ATTR, ax)
      const own = clone.getAttribute('transform')
      let tf
      if (clone.tagName === 'text') {
        const bb = svgCanvas.getStrokedBBox([src])
        if (!bb) return null
        tf = ax === 'v'
          ? `translate(${2 * (res.w / 2 - (bb.x + bb.width / 2))} 0)`
          : `translate(0 ${2 * (res.h / 2 - (bb.y + bb.height / 2))})`
      } else {
        tf = ax === 'v'
          ? `translate(${res.w} 0) scale(-1 1)`
          : `translate(0 ${res.h}) scale(1 -1)`
      }
      clone.setAttribute('transform', own ? `${tf} ${own}` : tf)
      src.parentNode.append(clone)
      // Bake the reflection into clean geometry; the discarded command is
      // fine — the twin's InsertElementCommand holds the final node.
      try {
        svgCanvas.recalculateDimensions(clone)
      } catch { /* keep the transform form */ }
      return clone
    }

    /** Find the live twin of an element (the element mirroring `src`). */
    const findTwin = (src) => {
      if (!src.id) return null
      for (const el of svgCanvas.getSvgContent().querySelectorAll('g > *')) {
        if (el.getAttribute(MIRROR_OF_ATTR) === src.id) return el
      }
      return null
    }

    /**
     * Rebuild `twin`'s reflected geometry/style from its source. Builds a
     * fresh reflected clone, copies its attributes and subtree onto the
     * existing twin node (keeping the twin's id + link stamps), then drops
     * the temp. Non-undoable by design — undo of the source edit re-fires
     * elementChanged, which re-syncs.
     * @param {Element} src
     * @param {Element} twin
     * @returns {void}
     */
    const syncTwin = (src, twin) => {
      const ax = twin.getAttribute(AXIS_ATTR) === 'h' ? 'h' : 'v'
      busy = true
      try {
        const fresh = makeTwin(src, ax)
        if (!fresh) return
        const keep = new Set([MIRROR_OF_ATTR, AXIS_ATTR, 'id'])
        for (const attr of Array.from(twin.attributes)) {
          if (!keep.has(attr.name) && !fresh.hasAttribute(attr.name)) {
            twin.removeAttribute(attr.name)
          }
        }
        for (const attr of Array.from(fresh.attributes)) {
          if (!keep.has(attr.name)) twin.setAttribute(attr.name, attr.value)
        }
        if (fresh.childNodes.length || twin.childNodes.length) {
          twin.replaceChildren(...Array.from(fresh.childNodes))
        }
        fresh.remove()
      } finally {
        busy = false
      }
    }

    /**
     * Live-link dispatcher for elementChanged/elementTransition: sources
     * re-sync their twins; a twin the user drags directly is unlinked so the
     * manual edit sticks (interactive only — undo/programmatic changes must
     * not sever links).
     * @param {Element[]} elems
     * @param {boolean} interactive - True during a live drag.
     * @returns {void}
     */
    const handleLinkedElems = (elems, interactive) => {
      if (busy) return
      for (const el of elems) {
        if (!el || el.nodeType !== 1 || el.tagName === 'svg') continue
        if (el.hasAttribute(MIRROR_OF_ATTR)) {
          if (interactive) {
            el.removeAttribute(MIRROR_OF_ATTR)
            el.removeAttribute(AXIS_ATTR)
          }
          continue
        }
        const twin = findTwin(el)
        // Skip when source and twin move together (both selected): the twin
        // is being dragged in its own right, not shadowing the source.
        if (twin && !elems.includes(twin)) syncTwin(el, twin)
      }
    }

    // Wrap history: a bare InsertElementCommand while the mode is on is a
    // freshly drawn element — replace it with a batch of source + twin.
    const origAddCommand = svgCanvas.addCommandToHistory.bind(svgCanvas)
    svgCanvas.addCommandToHistory = (cmd) => {
      const { InsertElementCommand, BatchCommand } = svgCanvas.history
      if (!axis || busy || !(cmd instanceof InsertElementCommand)) {
        origAddCommand(cmd)
        return
      }
      const elem = cmd.elem
      const parent = elem?.parentNode
      const isLayerChild = parent?.tagName === 'g' &&
        parent.parentNode === svgCanvas.getSvgContent()
      if (!isLayerChild || elem.hasAttribute(MIRROR_OF_ATTR) ||
        elem.hasAttribute('data-frame') || svgCanvas.getCurrentGroup()) {
        origAddCommand(cmd)
        return
      }
      busy = true
      try {
        const twin = makeTwin(elem, axis)
        if (twin) {
          const batchCmd = new BatchCommand('Draw mirrored')
          batchCmd.addSubCommand(cmd)
          batchCmd.addSubCommand(new InsertElementCommand(twin))
          origAddCommand(batchCmd)
        } else {
          origAddCommand(cmd)
        }
      } finally {
        busy = false
      }
    }

    const setAxis = (ax) => {
      axis = ax
      const btn = $id('tool_mirror')
      if (btn) btn.pressed = !!axis
      drawAxis()
    }

    /**
     * Mirror-copy the current selection across the canvas vertical axis as
     * one undo step (works without the mode).
     * @returns {void}
     */
    const mirrorSelection = () => {
      const selected = svgCanvas.getSelectedElements().filter(Boolean)
        .filter((el) => !el.hasAttribute('data-frame'))
      if (!selected.length) return
      const { BatchCommand, InsertElementCommand } = svgCanvas.history
      const batchCmd = new BatchCommand('Mirror selection')
      busy = true
      try {
        for (const el of selected) {
          const twin = makeTwin(el, axis || 'v')
          if (twin) batchCmd.addSubCommand(new InsertElementCommand(twin))
        }
      } finally {
        busy = false
      }
      if (!batchCmd.isEmpty()) {
        origAddCommand(batchCmd)
        svgCanvas.call('changed', selected)
      }
    }

    svgCanvas.setMirrorAxis = setAxis
    svgCanvas.getMirrorAxis = () => axis
    svgCanvas.mirrorSelection = mirrorSelection

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      zoomChanged () {
        drawAxis()
      },
      elementChanged (opts) {
        // Canvas resize fires elementChanged with the <svg> element — the
        // axis position depends on the resolution.
        if (opts.elems.some((el) => el?.tagName === 'svg')) drawAxis()
        handleLinkedElems(opts.elems, false)
      },
      elementTransition (opts) {
        handleLinkedElems(opts.elems, true)
      },
      callback () {
        const buttonTemplate = document.createElement('template')
        buttonTemplate.innerHTML = `
          <se-button id="tool_mirror" title="${name}:toggle" src="mirror.svg"></se-button>
        `
        $id('editor_panel').append(buttonTemplate.content.cloneNode(true))
        $id('tool_mirror').addEventListener('click', (e) => {
          const want = e.shiftKey ? 'h' : 'v'
          setAxis(axis === want ? null : want)
        })

        // Mirror-copy buttons in the Object (single) + Combine (multi) rows.
        const title = svgEditor.i18next.t(`${name}:mirrorSelection`)
        const addBtn = (id, anchor, after) => {
          if (!anchor) return
          const btn = document.createElement('se-button')
          btn.id = id
          btn.setAttribute('size', 'small')
          btn.setAttribute('title', title)
          btn.setAttribute('src', 'mirror_copy.svg')
          if (after) anchor.after(btn)
          else anchor.append(btn)
          btn.addEventListener('click', mirrorSelection)
        }
        addBtn('tool_mirror_copy', $id('tool_repeat') || $id('tool_path_offset'), true)
        addBtn('tool_mirror_copy_multi', $id('tool_repeat_multi')?.parentElement || $id('tool_bool_union')?.parentElement, false)
      }
    }
  }
}
