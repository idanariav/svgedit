/**
 * @file ext-ruler-guides.js
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

import { clientToDoc } from '../../automation.js'

const name = 'ruler-guides'

const GUIDE_COLOR = '#00a5e0'
const HIT_WIDTH = 8 // screen px, the grab zone around a guide
/** Guides are drawn this far each way from the page; the pasteboard around it is finite anyway. */
const EXTENT = 100000

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
    const { svgCanvas } = svgEditor
    const { $id, NS, assignAttributes } = svgCanvas
    await loadExtensionTranslation(svgEditor)
    const t = (key) => svgEditor.i18next.t(`${name}:${key}`)
    const svgdoc = $id('svgcanvas').ownerDocument
    const config = svgCanvas.getCurConfig()

    config.showGuides = svgEditor.configObj.pref('guides_show') !== 'off'
    config.lockGuides = svgEditor.configObj.pref('guides_lock') === 'on'

    const overlay = svgdoc.createElementNS(NS.SVG, 'svg')
    assignAttributes(overlay, { id: 'rulerGuides', overflow: 'visible', style: 'pointer-events: none;' })
    svgCanvas.getSvgRoot().append(overlay)

    /** The drag in progress: `{ axis, original, pos, copy, outside }`; `original` is null for a new guide. */
    let drag = null

    const interactive = () => config.showGuides && !config.lockGuides && svgCanvas.getMode() === 'select'

    // ---- drawing ------------------------------------------------------------

    const line = (axis, pos, attrs) => {
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
      for (const attr of ['x', 'y', 'width', 'height']) overlay.setAttribute(attr, content.getAttribute(attr))
      overlay.replaceChildren()
      if (!config.showGuides) return
      const guides = svgCanvas.getGuides()
      const canGrab = interactive() && !drag
      const frag = svgdoc.createDocumentFragment()
      for (const axis of ['v', 'h']) {
        guides[axis].forEach((pos) => {
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

    const position = (e, axis) => {
      const p = clientToDoc(svgEditor.automation.frame(), e.clientX, e.clientY)
      const raw = axis === 'v' ? p.x : p.y
      if (config.gridSnapping) return svgCanvas.snapToGrid(raw)
      return Math.round(raw) // whole units: guides are for aligning, not for sub-pixel placement
    }

    const isOutside = (e, axis) => {
      const r = workareaRect()
      return axis === 'v' ? (e.clientX < r.left || e.clientX > r.right) : (e.clientY < r.top || e.clientY > r.bottom)
    }

    const onMove = (e) => {
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
      const { axis, original, pos, copy, outside } = drag
      const guides = svgCanvas.getGuides()
      const list = guides[axis].filter((p) => !(original && !copy && p === original.pos))
      if (outside) {
        // Dropped back on the ruler: a new guide is never made; an old one is deleted (a copy is just not made).
        if (original && !copy) svgCanvas.setGuides({ ...guides, [axis]: list }, t('undo.remove'))
        return
      }
      list.push(pos)
      svgCanvas.setGuides({ ...guides, [axis]: list }, t(original ? (copy ? 'undo.copy' : 'undo.move') : 'undo.add'))
    }

    function onUp (e) {
      if (!drag) return
      onMove(e)
      try { commit() } finally {
        endDrag()
        render()
      }
    }

    function onKey (e) {
      if (e.key !== 'Escape' || !drag) return
      e.preventDefault()
      e.stopPropagation()
      endDrag()
      render()
    }

    const begin = (axis, original, e) => {
      drag = { axis, original, pos: position(e, axis), copy: false, outside: isOutside(e, axis) }
      window.addEventListener('mousemove', onMove, true)
      window.addEventListener('mouseup', onUp, true)
      window.addEventListener('keydown', onKey, true)
      render()
    }

    function startMove (e, axis, pos) {
      if (e.button !== 0 || !interactive()) return
      e.preventDefault()
      e.stopPropagation() // not a click on the canvas: nothing gets selected or rubber-banded
      begin(axis, { axis, pos }, e)
    }

    const startCreate = (axis) => (e) => {
      if (e.button !== 0 || !config.showGuides) return
      e.preventDefault()
      begin(axis, null, e)
    }

    // ---- commands -----------------------------------------------------------

    const setShown = (on) => {
      config.showGuides = on
      svgEditor.configObj.pref('guides_show', on ? 'on' : 'off')
      render()
    }
    const setLocked = (on) => {
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
    return {
      name: t('name'),
      callback () {
        const rulers = svgEditor.rulers
        for (const [ruler, axis, cursor] of [[rulers.rulerX, 'h', 'ns-resize'], [rulers.rulerY, 'v', 'ew-resize']]) {
          ruler.style.cursor = cursor
          ruler.addEventListener('mousedown', startCreate(axis), { signal: svgEditor.listenerAbort.signal })
        }
        // Whether the guides can be grabbed depends on the tool.
        document.addEventListener('modeChange', render, { signal: svgEditor.listenerAbort.signal })
      },
      zoomChanged: render,
      canvasUpdated: render,
      elementChanged: render,
      onOpenedDocument: render,
      afterClear: render
    }
  }
}
