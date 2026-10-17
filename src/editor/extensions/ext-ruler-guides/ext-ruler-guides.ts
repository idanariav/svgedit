/**
 * @file ext-ruler-guides.ts
 *
 * Ruler guides: drag from the top ruler for a horizontal guide, from the left
 * ruler for a vertical one. With the Select tool, drag a guide to move it (Alt
 * copies it), drag it back onto the ruler (out of the work area) to delete it.
 * Escape cancels a drag. Guides snap what is drawn and moved next to them.
 *
 * The guides are drawing data (`se:guides` on the root, see core/guides.js),
 * drawn here in an overlay `<svg id="rulerGuides">` inside `#svgroot` (outside
 * `#svgcontent`, so never exported). Each guide is a thin visible line plus a
 * wider transparent hit line that takes the pointer only in Select mode with
 * the guides unlocked, so a drawing tool can still start a shape on a guide.
 * Show / lock are the user's view settings (`guides_show` / `guides_lock`
 * prefs, `curConfig.showGuides` / `lockGuides`), toggled by commands.
 *
 * @license MIT
 */

import { clientToDoc } from '../../automation.ts'
import { defineFeature, addFeatureLocale } from '../defineFeature.ts'

const name = 'ruler-guides'

const GUIDE_COLOR = '#00a5e0'
const HIT_WIDTH = 8 // screen px, the grab zone around a guide
/** Guides are drawn this far each way from the page; the pasteboard around it is finite anyway. */
const EXTENT = 100000

export default defineFeature({
  name,
  async init (svgEditor) {
    const { svgCanvas } = svgEditor
    const { $req, NS, assignAttributes } = svgCanvas
    addFeatureLocale(svgEditor, name, import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>)
    const t = (key: string) => svgEditor.i18next.t(`${name}:${key}`)
    const svgdoc = $req('svgcanvas').ownerDocument
    const config = svgCanvas.getCurConfig()

    config.showGuides = svgEditor.configObj.pref('guides_show') !== 'off'
    config.lockGuides = svgEditor.configObj.pref('guides_lock') === 'on'

    const overlay = svgdoc.createElementNS(NS.SVG, 'svg')
    assignAttributes(overlay, { id: 'rulerGuides', overflow: 'visible', style: 'pointer-events: none;' })
    svgCanvas.getSvgRoot().append(overlay)

    type Axis = 'v' | 'h'

    interface Drag {
      axis: Axis
      original: { axis: Axis, pos: number } | null
      pos: number
      copy: boolean
      outside: boolean
    }
    /** The drag in progress; `original` is null for a new guide. */
    let drag: Drag | null = null

    const interactive = () => config.showGuides && !config.lockGuides && svgCanvas.getMode() === 'select'

    // ---- drawing ------------------------------------------------------------

    const line = (axis: Axis, pos: number, attrs: Record<string, string | number | undefined>) => {
      const zoom = svgCanvas.getZoom()
      const p = pos * zoom
      const ln = svgdoc.createElementNS(NS.SVG, 'line')
      assignAttributes(ln, axis === 'v'
        ? { x1: p, x2: p, y1: -EXTENT, y2: EXTENT }
        : { y1: p, y2: p, x1: -EXTENT, x2: EXTENT })
      assignAttributes(ln, attrs)
      return ln
    }

    const render = () => {
      const content = svgCanvas.getSvgContent()
      for (const attr of ['x', 'y', 'width', 'height']) overlay.setAttribute(attr, content.getAttribute(attr) ?? '')
      overlay.replaceChildren()
      if (!config.showGuides) return
      const guides = svgCanvas.getGuides()
      const canGrab = interactive() && !drag
      const frag = svgdoc.createDocumentFragment()
      for (const axis of (['v', 'h'] as Axis[])) {
        guides[axis].forEach((pos: number) => {
          if (drag && !drag.copy && drag.original && drag.original.axis === axis && drag.original.pos === pos) return // being dragged: the preview stands in
          frag.append(line(axis, pos, { stroke: GUIDE_COLOR, 'stroke-width': 1 }))
          if (canGrab) {
            const hit = line(axis, pos, { stroke: 'transparent', 'stroke-width': HIT_WIDTH, 'data-guide-axis': axis, 'data-guide-pos': pos })
            hit.style.pointerEvents = 'stroke'
            hit.style.cursor = axis === 'v' ? 'ew-resize' : 'ns-resize'
            hit.addEventListener('mousedown', (e) => startMove(e, axis, pos))
            frag.append(hit)
          }
        })
      }
      if (drag && !drag.outside) {
        frag.append(line(drag.axis, drag.pos, { stroke: GUIDE_COLOR, 'stroke-width': 1, 'stroke-dasharray': '4 3' }))
      }
      overlay.append(frag)
    }

    // ---- dragging -------------------------------------------------------------

    const workareaRect = () => svgEditor.workarea.getBoundingClientRect()

    const position = (e: { clientX: number; clientY: number; }, axis: Axis) => {
      const p = clientToDoc(svgEditor.automation.frame(), e.clientX, e.clientY)
      const raw = axis === 'v' ? p.x : p.y
      if (config.gridSnapping) return svgCanvas.snapToGrid(raw)
      return Math.round(raw) // whole units: guides are for aligning, not for sub-pixel placement
    }

    const isOutside = (e: { clientX: number; clientY: number; }, axis: Axis) => {
      const r = workareaRect()
      return axis === 'v' ? (e.clientX < r.left || e.clientX > r.right) : (e.clientY < r.top || e.clientY > r.bottom)
    }

    const onMove = (e: MouseEvent) => {
      if (!drag) return
      drag.pos = position(e, drag.axis)
      drag.outside = isOutside(e, drag.axis)
      drag.copy = Boolean(e.altKey) && drag.original !== null
      render()
    }

    const endDrag = () => {
      window.removeEventListener('mousemove', onMove, true)
      window.removeEventListener('mouseup', onUp, true)
      window.removeEventListener('keydown', onKey, true)
      drag = null
    }

    const commit = () => {
      if (!drag) return
      const { axis, original, pos, copy, outside } = drag
      const guides = svgCanvas.getGuides()
      const list = guides[axis].filter((p: number) => !(original && !copy && p === original.pos))
      if (outside) {
        // Dropped back on the ruler: a new guide is never made; an old one is deleted (a copy is just not made).
        if (original && !copy) svgCanvas.setGuides({ ...guides, [axis]: list }, t('undo.remove'))
        return
      }
      list.push(pos)
      svgCanvas.setGuides({ ...guides, [axis]: list }, t(original ? (copy ? 'undo.copy' : 'undo.move') : 'undo.add'))
    }

    function onUp (e: MouseEvent) {
      if (!drag) return
      onMove(e)
      try { commit() } finally {
        endDrag()
        render()
      }
    }

    function onKey (e: { key: string; preventDefault: () => void; stopPropagation: () => void; }) {
      if (e.key !== 'Escape' || !drag) return
      e.preventDefault()
      e.stopPropagation()
      endDrag()
      render()
    }

    const begin = (axis: Axis, original: Drag['original'], e: MouseEvent) => {
      drag = { axis, original, pos: position(e, axis), copy: false, outside: isOutside(e, axis) }
      window.addEventListener('mousemove', onMove, true)
      window.addEventListener('mouseup', onUp, true)
      window.addEventListener('keydown', onKey, true)
      render()
    }

    function startMove (e: MouseEvent, axis: Axis, pos: number) {
      if (e.button !== 0 || !interactive()) return
      e.preventDefault()
      e.stopPropagation() // not a click on the canvas: nothing gets selected or rubber-banded
      begin(axis, { axis, pos }, e)
    }

    const startCreate = (axis: Axis) => (e: MouseEvent) => {
      if (e.button !== 0 || !config.showGuides) return
      e.preventDefault()
      begin(axis, null, e)
    }

    // ---- commands -----------------------------------------------------------

    const setShown = (on: boolean | undefined) => {
      config.showGuides = on
      svgEditor.configObj.pref('guides_show', on ? 'on' : 'off')
      render()
    }
    const setLocked = (on: boolean) => {
      config.lockGuides = on
      svgEditor.configObj.pref('guides_lock', on ? 'on' : 'off')
      render()
    }
    const hasGuides = () => {
      const g = svgCanvas.getGuides()
      return g.v.length + g.h.length > 0
    }

    svgEditor.commands.register({
      id: 'guides_toggle_show',
      label: `${name}:commands.toggle_show`,
      group: 'View',
      keys: 'mod+;',
      run: () => setShown(!config.showGuides)
    })
    svgEditor.commands.register({
      id: 'guides_toggle_lock',
      label: `${name}:commands.toggle_lock`,
      group: 'View',
      run: () => setLocked(!config.lockGuides)
    })
    svgEditor.commands.register({
      id: 'guides_clear',
      label: `${name}:commands.clear`,
      group: 'View',
      enabled: () => (hasGuides() ? true : t('noGuides')),
      run: () => {
        svgCanvas.setGuides({}, t('undo.clear'))
        render()
      }
    })

    render()
    svgCanvas.bind('zoomChanged', () => render())

    svgCanvas.bind('elementChanged', () => render())

    svgCanvas.bind('canvasUpdated', () => render())

    svgCanvas.bind('onOpenedDocument', () => render())

    svgCanvas.bind('afterClear', () => (render)())

    return {
      name: t('name'),
      callback () {
        const rulers = svgEditor.rulers
        for (const [ruler, axis, cursor] of ([[rulers.rulerX, 'h', 'ns-resize'], [rulers.rulerY, 'v', 'ew-resize']] as Array<[HTMLElement, Axis, string]>)) {
          ruler.style.cursor = cursor
          ruler.addEventListener('mousedown', startCreate(axis), { signal: svgEditor.listenerAbort.signal })
        }
        // Whether the guides can be grabbed depends on the tool.
        document.addEventListener('modeChange', render, { signal: svgEditor.listenerAbort.signal })
      },
    }
  }
})
