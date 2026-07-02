/**
 * @file ext-mirror.js
 *
 * Mirror drawing mode: while active, every newly drawn element gets a
 * reflected twin across the canvas center axis (vertical by default;
 * Shift+click the toggle for horizontal). A dashed axis line is shown while
 * the mode is on. Twins are independent elements after creation (stamped
 * `se:mirror-of="<sourceId>"`, no live link — that's the Wave 2 upgrade).
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
