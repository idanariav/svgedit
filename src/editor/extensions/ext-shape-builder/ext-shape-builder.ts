/**
 * @file ext-shape-builder.ts
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
 * with the resulting shapes; press Escape, switch tool, or click **Done** on
 * the `#shape_builder_hint` bar (`toolHint.ts`) to leave — that same bar shows the usage
 * instructions and a live picked-region count so the click/drag/Alt
 * distinctions aren't only discoverable via the toolbar tooltip. The mode
 * also exits when fewer than 2 shapes remain or an outside change (e.g.
 * undo) invalidates the session.
 *
 * @license Apache-2.0
 */

import { defineFeature, addFeatureLocale } from '../defineFeature.ts'
import { createToolHint } from '../../toolHint.ts'

const name = 'shape-builder'

const HOVER_FILL = 'rgba(41, 98, 255, 0.22)'
const PICK_FILL = 'rgba(41, 98, 255, 0.55)'
const STROKE = '#2962FF'
/** A region's outline: dashed while idle, solid under the pointer, solid and heavier once picked. */
const OUTLINE = { idle: ['1.25', '4 3'], hover: ['2', 'none'], picked: ['2.75', 'none'] } as const

export default defineFeature({
  name,
  async init (svgEditor) {
    addFeatureLocale(svgEditor, name, import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>)
    const { svgCanvas } = svgEditor
    const { $id, $req, NS, assignAttributes } = svgCanvas
    const svgdoc = $req('svgcanvas').ownerDocument
    const svgroot = svgCanvas.getSvgRoot()

    let active = false
    let busy = false // our own apply is mutating the document
    let regionPaths: SVGPathElement[] = [] // overlay <path> per region index
    let picked = new Set<number>()
    let started = false
    const hint = createToolHint(svgEditor, 'shape_builder_hint')

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

    // On-canvas hint: usage instructions + a live picked-region count + an
    // explicit "Done" exit, so the mode's flexibility (single click vs. drag
    // vs. Alt) and how to leave it aren't only discoverable via a tooltip.
    const updateHintCount = (n: number) => {
      hint.show(svgEditor.i18next.t(`${name}:hint`), n > 0 ? svgEditor.i18next.t(`${name}:picked`, { count: n }) : '')
    }

    const renderRegions = (descs: { index: number; d: string; }[]) => {
      regionPaths = []
      const frag = svgdoc.createDocumentFragment()
      for (const { d } of descs) {
        const p = svgdoc.createElementNS(NS.SVG, 'path')
        assignAttributes(p, {
          d,
          fill: 'transparent',
          stroke: STROKE,
          'stroke-width': OUTLINE.idle[0],
          'stroke-dasharray': OUTLINE.idle[1],
          'vector-effect': 'non-scaling-stroke'
        })
        frag.append(p)
        regionPaths.push(p)
      }
      scaleGroup.replaceChildren(frag)
      syncOverlay()
      overlay.style.display = 'block'
      updateHintCount(0)
    }

    const paintStates = (hoverIndex: number) => {
      regionPaths.forEach((p, i) => {
        const state = picked.has(i) ? 'picked' : i === hoverIndex ? 'hover' : 'idle'
        p.setAttribute('fill', state === 'picked' ? PICK_FILL : state === 'hover' ? HOVER_FILL : 'transparent')
        p.setAttribute('stroke-width', OUTLINE[state][0])
        p.setAttribute('stroke-dasharray', OUTLINE[state][1])
      })
      // a picked or hovered region's outline is drawn over its neighbours' shared edges
      for (const i of [hoverIndex, ...picked]) regionPaths[i]?.parentNode?.append(regionPaths[i])
      updateHintCount(picked.size)
    }

    /** Client coords → content units (CLAUDE.md coordinate contract). */
    const contentPoint = (evt: { clientX: number; clientY: number; }) => {
      const rootRect = svgroot.getBoundingClientRect()
      const content = svgCanvas.getSvgContent()
      const zoom = svgCanvas.getZoom()
      return {
        x: (evt.clientX - rootRect.left - Number(content.getAttribute('x'))) / zoom,
        y: (evt.clientY - rootRect.top - Number(content.getAttribute('y'))) / zoom
      }
    }

    const onHover = (evt: { clientX: number; clientY: number; }) => {
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
      hint.hide()
      svgCanvas.shapeBuilder.end()
    }

    /** (Re)start the session from the given elements; exits when impossible. */
    const startSession = (elems: Element[]) => {
      const descs = svgCanvas.shapeBuilder.begin(elems)
      if (!descs || descs.length === 0) {
        teardown()
        if (svgCanvas.getMode() === 'shapebuilder') svgCanvas.setMode('select')
        if (elems?.length) svgCanvas.selectOnly(elems.filter((el: Element) => el.parentNode), true)
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

    // Each pick gesture (click, or drag across regions) is one transaction: merging or
    // deleting the picked regions is a single undo step, and the session carries on
    // with the resulting shapes.
    svgCanvas.registerTool({
      id: 'shapebuilder',
      undoLabel: 'Shape builder',

      // Leaving the mode by any route (Escape, tool switch, our own exits) tears the session down.
      deactivate () { teardown() },
      cancel () { started = false; picked = new Set(); if (active) paintStates(-1) },

      pointerDown (ctx, ev) {
        if (!active) return false
        started = true
        picked = new Set()
        const hit = svgCanvas.shapeBuilder.hitTest(ev.x, ev.y)
        if (hit >= 0) picked.add(hit)
        paintStates(-1)
      },

      pointerMove (ctx, ev) {
        if (!started) return
        const hit = svgCanvas.shapeBuilder.hitTest(ev.rawX, ev.rawY)
        if (hit >= 0 && !picked.has(hit)) {
          picked.add(hit)
          paintStates(-1)
        }
      },

      pointerUp (ctx, ev) {
        if (!started) return
        started = false
        const indices = [...picked]
        picked = new Set()
        if (!indices.length) {
          paintStates(-1)
          return
        }
        busy = true
        let result
        try {
          result = svgCanvas.shapeBuilder.apply(indices, ev.mods.alt ? 'delete' : 'merge')
        } finally {
          busy = false
        }
        if (!result) return
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
    })

    svgCanvas.bind('zoomChanged', (_win: Window) => {
      if (active) syncOverlay()
    })

    svgCanvas.bind('elementChanged', (_win: Window) => {
      // An outside mutation (undo/redo, panel edit) invalidates the
      // precomputed regions — bail out rather than act on stale geometry.
      if (active && !busy) {
        teardown()
        if (svgCanvas.getMode() === 'shapebuilder') svgCanvas.setMode('select')
      }
    })

    svgCanvas.bind('canvasUpdated', (_win: Window) => {
      if (active) syncOverlay()
    })

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        const combine = $id('tool_clip_set')?.parentElement
        if (!combine) return
        const btn = document.createElement('se-button')
        btn.id = 'tool_shape_builder'
        btn.setAttribute('command', 'tool_shape_builder')
        btn.setAttribute('size', 'small')
        btn.setAttribute('title', svgEditor.i18next.t(`${name}:title`))
        btn.setAttribute('src', 'shape_builder.svg')
        combine.append(btn)
        svgEditor.commands.register({
          id: 'tool_shape_builder',
          label: `${name}:title`,
          group: 'Tools',
          pd: true,
          enabled: () => svgCanvas.getSelectedElements().filter(Boolean).length >= 2 ? true : 'Select two or more shapes',
          run: enter
        })
        svgEditor.workarea?.addEventListener('mousemove', onHover)
      }
    }
  }
})
