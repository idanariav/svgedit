/**
 * @file ext-shape-builder.js
 *
 * Interactive shape builder (Illustrator-style paint-to-merge), the UI/mode
 * for `@svgedit/svgcanvas/core/shape-builder.js`.
 *
 * `tool_shape_builder` (Combine section, 2+ selection) enters the
 * `shapebuilder` mode: the selection is decomposed into atomic regions,
 * outlined in the `#shapeBuilderOverlay` overlay. Hovering highlights the
 * region under the cursor; click or drag across regions and release to
 * **merge** them into one shape (carved out of the sources), or hold **Alt**
 * to delete them. Each gesture is one undo step and the session continues
 * with the resulting shapes; press Escape (or switch tool) to leave, and the
 * mode also exits when fewer than 2 shapes remain or an outside change
 * (e.g. undo) invalidates the session.
 *
 * @license Apache-2.0
 */

const name = 'shape-builder'

const HOVER_FILL = 'rgba(41, 98, 255, 0.28)'
const PICK_FILL = 'rgba(41, 98, 255, 0.5)'
const STROKE = '#2962FF'

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
    const svgroot = svgCanvas.getSvgRoot()

    let active = false
    let busy = false // our own apply is mutating the document
    let regionPaths = [] // overlay <path> per region index
    let picked = new Set()
    let started = false

    // Overlay: a zoom-scaled group inside an svg aligned with #svgcontent.
    const overlay = svgdoc.createElementNS(NS.SVG, 'svg')
    assignAttributes(overlay, {
      id: 'shapeBuilderOverlay',
      overflow: 'visible',
      display: 'none',
      style: 'pointer-events: none;'
    })
    const scaleGroup = svgdoc.createElementNS(NS.SVG, 'g')
    overlay.append(scaleGroup)
    const smartGuides = $id('smartGuides')
    if (smartGuides) smartGuides.before(overlay)
    else svgroot.append(overlay)

    const syncOverlay = () => {
      const content = svgCanvas.getSvgContent()
      for (const attr of ['x', 'y', 'width', 'height']) {
        const v = content.getAttribute(attr)
        if (v !== null) overlay.setAttribute(attr, v)
      }
      scaleGroup.setAttribute('transform', `scale(${svgCanvas.getZoom()})`)
    }

    const renderRegions = (descs) => {
      regionPaths = []
      const frag = svgdoc.createDocumentFragment()
      for (const { d } of descs) {
        const p = svgdoc.createElementNS(NS.SVG, 'path')
        assignAttributes(p, {
          d,
          fill: 'transparent',
          stroke: STROKE,
          'stroke-width': 1.25,
          'stroke-dasharray': '4 3',
          'vector-effect': 'non-scaling-stroke'
        })
        frag.append(p)
        regionPaths.push(p)
      }
      scaleGroup.replaceChildren(frag)
      syncOverlay()
      overlay.style.display = 'block'
    }

    const paintStates = (hoverIndex) => {
      regionPaths.forEach((p, i) => {
        p.setAttribute('fill', picked.has(i)
          ? PICK_FILL
          : i === hoverIndex ? HOVER_FILL : 'transparent')
      })
    }

    /** Client coords → content units (CLAUDE.md coordinate contract). */
    const contentPoint = (evt) => {
      const rootRect = svgroot.getBoundingClientRect()
      const content = svgCanvas.getSvgContent()
      const zoom = svgCanvas.getZoom()
      return {
        x: (evt.clientX - rootRect.left - Number(content.getAttribute('x'))) / zoom,
        y: (evt.clientY - rootRect.top - Number(content.getAttribute('y'))) / zoom
      }
    }

    const onHover = (evt) => {
      if (!active || started) return
      const { x, y } = contentPoint(evt)
      paintStates(svgCanvas.shapeBuilder.hitTest(x, y))
    }

    const teardown = () => {
      if (!active) return
      active = false
      started = false
      picked = new Set()
      regionPaths = []
      scaleGroup.replaceChildren()
      overlay.style.display = 'none'
      svgCanvas.shapeBuilder.end()
    }

    /** (Re)start the session from the given elements; exits when impossible. */
    const startSession = (elems) => {
      const descs = svgCanvas.shapeBuilder.begin(elems)
      if (!descs || descs.length === 0) {
        teardown()
        if (svgCanvas.getMode() === 'shapebuilder') svgCanvas.setMode('select')
        if (elems?.length) svgCanvas.selectOnly(elems.filter((el) => el.parentNode), true)
        return false
      }
      active = true
      picked = new Set()
      renderRegions(descs)
      return true
    }

    const enter = () => {
      const elems = svgCanvas.getSelectedElements().filter(Boolean)
      if (elems.length < 2) return
      svgCanvas.clearSelection()
      svgCanvas.setMode('shapebuilder')
      if (!startSession(elems)) return
      svgEditor.leftPanel?.updateLeftPanel?.('tool_select') // unpress draw tools
    }

    // Leaving the mode by any route (Escape → cancelTool, tool switch, our
    // own exits) tears the session down.
    const origSetMode = svgCanvas.setMode.bind(svgCanvas)
    svgCanvas.setMode = (mode) => {
      if (active && mode !== 'shapebuilder') teardown()
      origSetMode(mode)
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      zoomChanged () {
        if (active) syncOverlay()
      },
      canvasUpdated () {
        if (active) syncOverlay()
      },
      elementChanged () {
        // An outside mutation (undo/redo, panel edit) invalidates the
        // precomputed regions — bail out rather than act on stale geometry.
        if (active && !busy) {
          teardown()
          if (svgCanvas.getMode() === 'shapebuilder') svgCanvas.setMode('select')
        }
      },
      mouseDown (opts) {
        if (svgCanvas.getMode() !== 'shapebuilder' || !active) return undefined
        started = true
        picked = new Set()
        const hit = svgCanvas.shapeBuilder.hitTest(opts.start_x, opts.start_y)
        if (hit >= 0) picked.add(hit)
        paintStates(-1)
        return { started: true }
      },
      mouseMove (opts) {
        if (!started || svgCanvas.getMode() !== 'shapebuilder') return undefined
        const zoom = svgCanvas.getZoom()
        const hit = svgCanvas.shapeBuilder.hitTest(opts.mouse_x / zoom, opts.mouse_y / zoom)
        if (hit >= 0 && !picked.has(hit)) {
          picked.add(hit)
          paintStates(-1)
        }
        return { started: true }
      },
      mouseUp (opts) {
        if (svgCanvas.getMode() !== 'shapebuilder' || !started) return undefined
        started = false
        const indices = [...picked]
        picked = new Set()
        if (indices.length) {
          busy = true
          let result
          try {
            result = svgCanvas.shapeBuilder.apply(indices, opts.event?.altKey ? 'delete' : 'merge')
          } finally {
            busy = false
          }
          if (result) {
            const alive = result.filter((el) => el.parentNode)
            if (alive.length >= 2) {
              busy = true
              try {
                startSession(alive)
              } finally {
                busy = false
              }
            } else {
              teardown()
              svgCanvas.setMode('select')
              if (alive.length) svgCanvas.selectOnly(alive, true)
            }
          }
        } else {
          paintStates(-1)
        }
        return { keep: true, element: null, started: false }
      },
      callback () {
        const combine = $id('tool_bool_union')?.parentElement
        if (!combine) return
        const btn = document.createElement('se-button')
        btn.id = 'tool_shape_builder'
        btn.setAttribute('size', 'small')
        btn.setAttribute('title', svgEditor.i18next.t(`${name}:title`))
        btn.setAttribute('src', 'shape_builder.svg')
        combine.append(btn)
        btn.addEventListener('click', enter)
        svgEditor.workarea?.addEventListener('mousemove', onHover)
      }
    }
  }
}
