/**
 * @file ext-guides.js
 *
 * Draggable ruler guides + composition overlays.
 *
 * Guides: drag from the top ruler to drop a horizontal guide, from the left
 * ruler for a vertical one; drag a guide to reposition it, drag it off the
 * canvas to remove it. Guides live in `#rulerGuides`, an interactive overlay
 * appended into `#svgroot` right before `#smartGuides` so they render above
 * the drawing content. Positions (content units) are stamped on `#svgcontent`
 * as `se:guides="v:…;h:…"` — the `se:` sanitize bypass makes them survive
 * save/load — and re-read whenever a document loads. While dragging objects,
 * guides act as snap targets through `svgCanvas.getRulerGuides()`, consumed
 * by `core/smart-guides.js`.
 *
 * Composition overlays: rule-of-thirds / golden-ratio / center-cross line
 * sets drawn in `#compOverlays` on `#canvasBackground` (view-only, below the
 * content), toggled from the `<se-guides-settings>` popover in the view tray
 * and persisted as `guides_*` prefs.
 *
 * @license Apache-2.0
 */

import '../../components/seGuidesSettings.js'

const name = 'guides'

const GUIDE_COLOR = '#06b6d4'
const HIT_WIDTH = 9 // invisible grab area around a guide, screen px

const OVERLAY_KINDS = {
  thirds: { fractions: [1 / 3, 2 / 3], color: '#f59e0b', dash: '6 4' },
  golden: { fractions: [0.382, 0.618], color: '#a855f7', dash: '6 4' },
  center: { fractions: [0.5], color: '#64748b', dash: '10 5' }
}

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
    const canvBG = $id('canvasBackground')

    const guides = { v: [], h: [] }
    const overlays = {}
    for (const kind of Object.keys(OVERLAY_KINDS)) {
      overlays[kind] = svgEditor.configObj.pref(`guides_${kind}`) === 'on'
    }

    // Interactive guide overlay — above the content, before #smartGuides so
    // transient snap lines still draw on top of resting guides.
    const guideSvg = svgdoc.createElementNS(NS.SVG, 'svg')
    assignAttributes(guideSvg, {
      id: 'rulerGuides',
      overflow: 'visible',
      style: 'pointer-events: none;'
    })
    const smartGuides = $id('smartGuides')
    if (smartGuides) smartGuides.before(guideSvg)
    else svgroot.append(guideSvg)

    // Passive composition overlay — tracks the canvas via #canvasBackground.
    const compSvg = svgdoc.createElementNS(NS.SVG, 'svg')
    assignAttributes(compSvg, {
      id: 'compOverlays',
      width: '100%',
      height: '100%',
      x: 0,
      y: 0,
      overflow: 'visible',
      style: 'pointer-events: none;'
    })
    canvBG.appendChild(compSvg)

    const syncGuidePos = () => {
      const content = svgCanvas.getSvgContent()
      for (const attr of ['x', 'y', 'width', 'height']) {
        guideSvg.setAttribute(attr, content.getAttribute(attr))
      }
    }

    /** Client coords → content units along one axis. */
    const posFromClient = (evt, axis) => {
      const rootRect = svgroot.getBoundingClientRect()
      const content = svgCanvas.getSvgContent()
      const zoom = svgCanvas.getZoom()
      return axis === 'v'
        ? (evt.clientX - rootRect.left - Number(content.getAttribute('x'))) / zoom
        : (evt.clientY - rootRect.top - Number(content.getAttribute('y'))) / zoom
    }

    const persist = () => {
      const content = svgCanvas.getSvgContent()
      const fmt = (arr) => arr.map((n) => Math.round(n * 100) / 100).join(',')
      if (!guides.v.length && !guides.h.length) {
        content.removeAttribute('se:guides')
      } else {
        content.setAttribute('se:guides', `v:${fmt(guides.v)};h:${fmt(guides.h)}`)
      }
    }

    const readStamp = () => {
      const stamp = svgCanvas.getSvgContent().getAttribute('se:guides') || ''
      guides.v = []
      guides.h = []
      for (const part of stamp.split(';')) {
        const [axis, list] = part.split(':')
        if ((axis === 'v' || axis === 'h') && list) {
          guides[axis] = list.split(',').map(Number).filter(Number.isFinite)
        }
      }
    }

    const renderGuides = () => {
      syncGuidePos()
      const zoom = svgCanvas.getZoom()
      const res = svgCanvas.getResolution()
      const frag = svgdoc.createDocumentFragment()
      const addGuide = (axis, index, pos) => {
        const p = pos * zoom
        const ext = (axis === 'v' ? res.h : res.w) * zoom
        const coords = axis === 'v'
          ? { x1: p, y1: 0, x2: p, y2: ext }
          : { x1: 0, y1: p, x2: ext, y2: p }
        const ln = svgdoc.createElementNS(NS.SVG, 'line')
        assignAttributes(ln, { ...coords, stroke: GUIDE_COLOR, 'stroke-width': 1 })
        const hit = svgdoc.createElementNS(NS.SVG, 'line')
        assignAttributes(hit, {
          ...coords,
          stroke: 'rgba(0,0,0,0)',
          'stroke-width': HIT_WIDTH,
          style: `pointer-events: stroke; cursor: ${axis === 'v' ? 'ew-resize' : 'ns-resize'};`
        })
        hit.addEventListener('mousedown', (evt) => {
          if (evt.button !== 0) return
          evt.preventDefault()
          evt.stopPropagation()
          startGuideDrag(axis, index)
        })
        frag.append(ln, hit)
      }
      guides.v.forEach((pos, i) => addGuide('v', i, pos))
      guides.h.forEach((pos, i) => addGuide('h', i, pos))
      guideSvg.replaceChildren(frag)
    }

    const renderComp = () => {
      const zoom = svgCanvas.getZoom()
      const res = svgCanvas.getResolution()
      const w = res.w * zoom
      const h = res.h * zoom
      const frag = svgdoc.createDocumentFragment()
      for (const [kind, spec] of Object.entries(OVERLAY_KINDS)) {
        if (!overlays[kind]) continue
        for (const f of spec.fractions) {
          for (const coords of [
            { x1: w * f, y1: 0, x2: w * f, y2: h },
            { x1: 0, y1: h * f, x2: w, y2: h * f }
          ]) {
            const ln = svgdoc.createElementNS(NS.SVG, 'line')
            assignAttributes(ln, {
              ...coords,
              stroke: spec.color,
              'stroke-width': 1,
              'stroke-dasharray': spec.dash,
              'stroke-opacity': 0.55
            })
            frag.append(ln)
          }
        }
      }
      compSvg.replaceChildren(frag)
    }

    /**
     * Shared drag session for repositioning a guide or dropping a fresh one
     * from a ruler. Dropping outside the canvas removes the guide.
     * @param {'v'|'h'} axis
     * @param {Integer} index - Index into `guides[axis]`.
     * @returns {void}
     */
    const startGuideDrag = (axis, index) => {
      const onMove = (evt) => {
        guides[axis][index] = posFromClient(evt, axis)
        renderGuides()
      }
      const onUp = (evt) => {
        document.removeEventListener('mousemove', onMove, true)
        document.removeEventListener('mouseup', onUp, true)
        const pos = posFromClient(evt, axis)
        const dim = axis === 'v' ? svgCanvas.getResolution().w : svgCanvas.getResolution().h
        if (pos < 0 || pos > dim) {
          guides[axis].splice(index, 1)
        } else {
          guides[axis][index] = pos
        }
        persist()
        renderGuides()
      }
      document.addEventListener('mousemove', onMove, true)
      document.addEventListener('mouseup', onUp, true)
    }

    const attachRulerDrag = (ruler, axis) => {
      if (!ruler) return
      ruler.addEventListener('mousedown', (evt) => {
        if (evt.button !== 0) return
        evt.preventDefault()
        guides[axis].push(posFromClient(evt, axis))
        startGuideDrag(axis, guides[axis].length - 1)
      })
    }

    // ── canvas API for the popover + core snapping ──
    svgCanvas.getRulerGuides = () => guides
    // Rulers are hidden by default in this fork (showRulers: false), so the
    // popover offers "+ Vertical / + Horizontal" drops at canvas center; the
    // guide is then dragged into place on the canvas.
    svgCanvas.addRulerGuide = (axis) => {
      if (axis !== 'v' && axis !== 'h') return
      const res = svgCanvas.getResolution()
      guides[axis].push((axis === 'v' ? res.w : res.h) / 2)
      persist()
      renderGuides()
    }
    svgCanvas.clearRulerGuides = () => {
      guides.v = []
      guides.h = []
      persist()
      renderGuides()
    }
    svgCanvas.getCompOverlays = () => ({ ...overlays })
    svgCanvas.setCompOverlay = (kind, on) => {
      if (!(kind in overlays)) return
      overlays[kind] = !!on
      svgEditor.configObj.pref(`guides_${kind}`, on ? 'on' : 'off')
      renderComp()
    }

    const renderAll = () => {
      renderGuides()
      renderComp()
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      zoomChanged () {
        renderAll()
      },
      canvasUpdated () {
        renderAll()
      },
      elementChanged (opts) {
        // Fired with the <svg> content element on document load and canvas
        // resize — re-read persisted guides and redraw at the new size.
        if (opts.elems.some((el) => el?.tagName === 'svg')) {
          readStamp()
          renderAll()
        }
      },
      callback () {
        const buttonTemplate = document.createElement('template')
        const title = svgEditor.i18next.t(`${name}:toggle`)
        buttonTemplate.innerHTML = `
          <se-guides-settings id="tool_guides" title="${title}" src="guides.svg"></se-guides-settings>
        `
        $id('editor_panel').append(buttonTemplate.content.cloneNode(true))
        attachRulerDrag($id('ruler_x'), 'h')
        attachRulerDrag($id('ruler_y'), 'v')
        readStamp()
        renderAll()
      }
    }
  }
}
