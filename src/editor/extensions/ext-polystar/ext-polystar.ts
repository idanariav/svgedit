// ext-polystar.ts — Star and polygon tools
/**
 * @file ext-polystar.ts
 *
 *
 * @copyright 2010 CloudCanvas, Inc. All rights reserved
 * @copyright 2021 Optimistik SAS, Inc. All rights reserved
 * @license MIT
 *
 */

import { defineFeature, addFeatureLocale } from '../defineFeature.ts'

const name = 'polystar'

export default defineFeature({
  name,
  async init (svgEditor) {
    const { svgCanvas } = svgEditor
    const { ChangeElementCommand } = svgCanvas.history
    const addToHistory = (cmd: import('@svgedit/svgcanvas').HistoryCommand) => { svgCanvas.undoMgr.addCommandToHistory(cmd) }
    const { $id, $req } = svgCanvas
    let selElems: Element[] = []
    let newFO: Element | null
    addFeatureLocale(svgEditor, name, import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>)

    /**
 * @param on true=display
 * @param tool "star" or "polygone"
     */
    const showPanel = (on: boolean, tool: string): void => {
      // A torn-down editor's leaked modeChange listener (see below) could reach
      // here after its panel is gone; bail rather than throw on null.style.
      const panel = $id(`${tool}_panel`)
      if (!panel) return
      if (on) {
        panel.style.removeProperty('display')
      } else {
        panel.style.display = 'none'
      }
    }

    /**
 * @param attr attribute to change
 * @param val new value
     */
    const setAttr = (attr: string, val: string | number): void => {
      svgCanvas.changeSelectedAttribute(attr, val)
      svgCanvas.call('changed', selElems)
    }

    /**
 * @param n angle
 * @returns cotangeante
     */
    const cot = (n: number): number => 1 / Math.tan(n)

    /**
 * @param n angle
 * @returns sec
     */
    const sec = (n: number): number => 1 / Math.cos(n)

    /**
     * Recompute a star's `points` from its current attributes
     * (point, r, starRadiusMultiplier, radialshift) about its centroid.
 * @param elem star polygon element
 * @returns new points string, or null if not rebuildable
     */
    const buildStarPoints = (elem: Element): string | null => {
      const polygon = elem as SVGPolygonElement
      if (!polygon.points || !polygon.points.numberOfItems) return null
      const point = Number(elem.getAttribute('point'))
      const orient = elem.getAttribute('orient')
      const radialshift = Number(elem.getAttribute('radialshift'))
      const circumradius = Number(elem.getAttribute('r'))
      const inradius = circumradius / Number(elem.getAttribute('starRadiusMultiplier'))
      const list = polygon.points
      const len = list.numberOfItems
      // The points list closes by repeating the first outer vertex (and the
      // first inner vertex when a star has inner points). Averaging those
      // duplicates would bias the centroid toward the top vertex and drift the
      // shape upward on every live edit, so exclude them from the centroid.
      const dup = isNaN(inradius) ? 1 : 2
      const used = Math.max(len - dup, 1)
      let xpos = 0
      let ypos = 0
      for (let i = 0; i < used; ++i) {
        const pt = list.getItem(i)
        xpos += pt.x
        ypos += pt.y
      }
      const cx = xpos / used
      const cy = ypos / used

      let polyPoints = ''
      for (let s = 0; point >= s; s++) {
        let angle = 2.0 * Math.PI * (s / point)
        if (orient === 'point') {
          angle -= Math.PI / 2
        } else if (orient === 'edge') {
          angle = angle + Math.PI / point - Math.PI / 2
        }

        let x = circumradius * Math.cos(angle) + cx
        let y = circumradius * Math.sin(angle) + cy

        polyPoints += x + ',' + y + ' '

        if (!isNaN(inradius)) {
          angle = 2.0 * Math.PI * (s / point) + Math.PI / point
          if (orient === 'point') {
            angle -= Math.PI / 2
          } else if (orient === 'edge') {
            angle = angle + Math.PI / point - Math.PI / 2
          }
          angle += radialshift

          x = inradius * Math.cos(angle) + cx
          y = inradius * Math.sin(angle) + cy

          polyPoints += x + ',' + y + ' '
        }
      }
      return polyPoints
    }

    /**
     * Apply a star attribute change to the selected star(s) and live-rebuild
     * their geometry so the canvas updates immediately (not only on next draw).
 * @param attr attribute to change
 * @param val new value
     */
    const applyStarAttr = (attr: string, val: string | number): void => {
      setAttr(attr, val)
      let i: number = selElems.length
      while (i--) {
        const elem = selElems[i]
        if (elem?.getAttribute('shape') === 'star') {
          const oldPoints = elem.getAttribute('points')
          const newPoints = buildStarPoints(elem)
          if (newPoints !== null) {
            elem.setAttribute('points', newPoints)
            addToHistory(new ChangeElementCommand(elem, { points: oldPoints }))
          }
        }
      }
    }

    // Both shapes are drawn by dragging from the centre; the pointer is in document units.
    const startStar = (ev: { x: number, y: number }) => {
      const fill = svgCanvas.getColor('fill')
      const stroke = svgCanvas.getColor('stroke')
      const strokeWidth = svgCanvas.getStrokeWidth()
      newFO = svgCanvas.addSVGElementsFromJson({
        element: 'polygon',
        attr: {
          cx: ev.x,
          cy: ev.y,
          id: svgCanvas.getNextId(),
          shape: 'star',
          point: $req('starNumPoints').value,
          r: 0,
          radialshift: $req('radialShift').value,
          r2: 0,
          orient: 'point',
          fill,
          stroke,
          'stroke-width': strokeWidth
        }
      })
    }
    const updateStar = (px: number, py: number) => {
      const fo = newFO as Element
      const cx = Number(fo.getAttribute('cx'))
      const cy = Number(fo.getAttribute('cy'))
      const point = Number(fo.getAttribute('point'))
      const orient = fo.getAttribute('orient')
      const fill = fo.getAttribute('fill')
      const stroke = fo.getAttribute('stroke')
      // A missing stroke-width means the SVG initial value of 1, not 0 —
      // cleanupElement strips the attribute at that value (writing 0 back
      // below would make the shape invisible mid-draw).
      const strokeWidthAttr = fo.getAttribute('stroke-width')
      const strokeWidth = strokeWidthAttr === null ? 1 : Number(strokeWidthAttr)
      const radialshift = Number(fo.getAttribute('radialshift'))

      let x = px
      let y = py

      const circumradius =
      Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / 1.5
      const RadiusMultiplier = $req('RadiusMultiplier').value
      const inradius =
      circumradius / Number(RadiusMultiplier)
      fo.setAttribute('r', String(circumradius))
      fo.setAttribute('r2', String(inradius))
      fo.setAttribute('starRadiusMultiplier', RadiusMultiplier)

      let polyPoints = ''
      for (let s = 0; point >= s; s++) {
        let angle = 2.0 * Math.PI * (s / point)
        if (orient === 'point') {
          angle -= Math.PI / 2
        } else if (orient === 'edge') {
          angle = angle + Math.PI / point - Math.PI / 2
        }

        x = circumradius * Math.cos(angle) + cx
        y = circumradius * Math.sin(angle) + cy

        polyPoints += x + ',' + y + ' '

        if (!isNaN(inradius)) {
          angle = 2.0 * Math.PI * (s / point) + Math.PI / point
          if (orient === 'point') {
            angle -= Math.PI / 2
          } else if (orient === 'edge') {
            angle = angle + Math.PI / point - Math.PI / 2
          }
          angle += radialshift

          x = inradius * Math.cos(angle) + cx
          y = inradius * Math.sin(angle) + cy

          polyPoints += x + ',' + y + ' '
        }
      }
      fo.setAttribute('points', polyPoints)
      fo.setAttribute('fill', String(fill))
      fo.setAttribute('stroke', String(stroke))
      fo.setAttribute('stroke-width', String(strokeWidth))
      /* const shape = */ fo.getAttribute('shape')
    }
    const startPolygon = (ev: { x: number, y: number }) => {
      const fill = svgCanvas.getColor('fill')
      const stroke = svgCanvas.getColor('stroke')
      const strokeWidth = svgCanvas.getStrokeWidth()
      newFO = svgCanvas.addSVGElementsFromJson({
        element: 'polygon',
        attr: {
          cx: ev.x,
          cy: ev.y,
          id: svgCanvas.getNextId(),
          shape: 'regularPoly',
          sides: $req('polySides').value,
          orient: 'x',
          edge: 0,
          fill,
          stroke,
          'stroke-width': strokeWidth
        }
      })
    }
    const updatePolygon = (px: number, py: number) => {
      const fo = newFO as Element
      const cx = Number(fo.getAttribute('cx'))
      const cy = Number(fo.getAttribute('cy'))
      const sides = Number(fo.getAttribute('sides'))
      // const orient = fo.getAttribute('orient');
      const fill = fo.getAttribute('fill')
      const stroke = fo.getAttribute('stroke')
      // A missing stroke-width means the SVG initial value of 1, not 0 —
      // cleanupElement strips the attribute at that value (writing 0 back
      // below would make the shape invisible mid-draw).
      const strokeWidthAttr = fo.getAttribute('stroke-width')
      const strokeWidth = strokeWidthAttr === null ? 1 : Number(strokeWidthAttr)

      let x = px
      let y = py

      const edg =
      Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / 1.5
      fo.setAttribute('edge', String(edg))

      const inradius = (edg / 2) * cot(Math.PI / sides)
      const circumradius = inradius * sec(Math.PI / sides)
      let points = ''
      for (let s = 0; sides >= s; s++) {
        const angle = (2.0 * Math.PI * s) / sides
        x = circumradius * Math.cos(angle) + cx
        y = circumradius * Math.sin(angle) + cy

        points += x + ',' + y + ' '
      }

      // const poly = fo.createElementNS(NS.SVG, 'polygon');
      fo.setAttribute('points', points)
      fo.setAttribute('fill', String(fill))
      fo.setAttribute('stroke', String(stroke))
      fo.setAttribute('stroke-width', String(strokeWidth))
    }

    for (const [mode, start, update, emptyAttr, emptyValue] of ([
      ['star', startStar, updateStar, 'r', '0'],
      ['polygon', startPolygon, updatePolygon, 'edge', '0']
    ] as Array<[string, (ev: { x: number, y: number }) => void, (px: number, py: number) => void, string, string]>)) {
      svgCanvas.registerTool({
        id: mode,
        undoLabel: `Draw ${mode}`,
        snap: true, // the centre and the dragged point snap to other objects
        pointerDown (ctx, ev) { start(ev) },
        pointerMove (ctx, ev) { if (newFO) update(ev.x, ev.y) },
        pointerUp () {
          const el = newFO
          newFO = null
          // a click without a drag leaves a zero-size shape: drop it
          return el && el.getAttribute(emptyAttr) !== emptyValue ? { created: el } : 'cancel'
        },
        cancel () { newFO = null }
      })
    }

    svgCanvas.bind('selectedChanged', (_win: Window, opts: { elems: Element[], selectedElement: Element | null, multiselected: boolean }) => {
      // Use this to update the current selected elements
      selElems = opts.elems
      let i = selElems.length
      // Hide panels if nothing is selected
      if (!i) {
        showPanel(false, 'star')
        showPanel(false, 'polygon')
        return
      }
      while (i--) {
        const elem = selElems[i]
        if (elem?.getAttribute('shape') === 'star') {
          if (opts.selectedElement && !opts.multiselected) {
            $req('starNumPoints').value = elem.getAttribute('point')
            $req('RadiusMultiplier').value = elem.getAttribute('starRadiusMultiplier')
            $req('radialShift').value = elem.getAttribute('radialshift')
            showPanel(true, 'star')
          } else {
            showPanel(false, 'star')
          }
        } else if (elem?.getAttribute('shape') === 'regularPoly') {
          if (opts.selectedElement && !opts.multiselected) {
            $req('polySides').value = elem.getAttribute('sides')
            showPanel(true, 'polygon')
          } else {
            showPanel(false, 'polygon')
          }
        } else {
          showPanel(false, 'star')
          showPanel(false, 'polygon')
        }
      }
    })

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      // The callback should be used to load the DOM with the appropriate UI items
      callback () {
        // Add the button and its handler(s)
        // Note: the star extension needs to be loaded before the polygon extension
        // Star/polygon join the core "shapes" flyout (tools_shapes, built in
        // LeftPanel.html) as two more sub-tools rather than a separate flyout —
        // its <slot> picks up light-DOM children added after it has connected.
        const titleStar = `${name}:buttons.0.title`
        const titlePolygon = `${name}:buttons.1.title`
        const buttonTemplate = document.createElement('template')
        buttonTemplate.innerHTML = `
            <se-button id="tool_star" command="tool_star" title="${titleStar}" src="star.svg">
            </se-button>
            <se-button id="tool_polygon" command="tool_polygon" title="${titlePolygon}" src="polygon.svg">
            </se-button>
          `
        $req('tools_shapes').append(buttonTemplate.content.cloneNode(true))
        // handler
        svgEditor.leftPanel.addModeCommand('tool_star', 'star', {
          label: titleStar,
          onEnter: () => { showPanel(true, 'star'); showPanel(false, 'polygon') }
        })
        svgEditor.leftPanel.addModeCommand('tool_polygon', 'polygon', {
          label: titlePolygon,
          onEnter: () => { showPanel(true, 'polygon'); showPanel(false, 'star') }
        })
        // Hide each context panel when the canvas leaves its drawing mode.
        // setMode dispatches 'modeChange' for every tool switch (button, flyout
        // sub-tool, keyboard), covering switches that don't bubble a click here.
        // These panels double as the editor for an already-selected star/polygon,
        // so keep a panel visible while its shape is selected — setMode('select')
        // also fires on canvas clicks / attribute edits with the shape still
        // selected, and selectedChanged owns the selection-driven display.
        document.addEventListener('modeChange', (evt) => {
          const mode = (evt as CustomEvent).detail.getMode()
          const shapes = (selElems || []).filter(Boolean).map((el) => el.getAttribute?.('shape'))
          if (mode !== 'star' && !shapes.includes('star')) showPanel(false, 'star')
          if (mode !== 'polygon' && !shapes.includes('regularPoly')) showPanel(false, 'polygon')
        }, { signal: svgEditor.listenerAbort.signal })
        const label0 = `${name}:contextTools.0.label`
        const title0 = `${name}:contextTools.0.title`
        const label1 = `${name}:contextTools.1.label`
        const title1 = `${name}:contextTools.1.title`
        const label2 = `${name}:contextTools.2.label`
        const title2 = `${name}:contextTools.2.title`
        const label3 = `${name}:contextTools.3.label`
        const title3 = `${name}:contextTools.3.title`
        // Add the context panel and its handler(s)
        const panelTemplate = document.createElement('template')
        panelTemplate.innerHTML = `
          <div id="star_panel">
            <se-spin-input id="starNumPoints" label="${label0}" min=1 step=1 value=5 title="${title0}">
            </se-spin-input>
            <se-spin-input id="RadiusMultiplier" label="${label1}" min=1 step=2.5 value=3 title="${title1}">
            </se-spin-input>
            <se-spin-input id="radialShift" min=0 step=1 value=0 label="${label2}" title="${title2}">
            </se-spin-input>
          </div>
          <div id="polygon_panel">
            <se-spin-input size="3" id="polySides" min=1 step=1 value=5 label="${label3}" title="${title3}">
            </se-spin-input>
          </div>
        `
        // add handlers for the panel
        $req('tools_top').appendChild(panelTemplate.content.cloneNode(true))
        // don't display the panels on start
        showPanel(false, 'star')
        showPanel(false, 'polygon')
        $req('starNumPoints').addEventListener('change', (event) => {
          applyStarAttr('point', (event.target as HTMLInputElement).value)
        })
        $req('RadiusMultiplier').addEventListener('change', (event) => {
          applyStarAttr('starRadiusMultiplier', (event.target as HTMLInputElement).value)
        })
        $req('radialShift').addEventListener('change', (event) => {
          applyStarAttr('radialshift', (event.target as HTMLInputElement).value)
        })
        $req('polySides').addEventListener('change', (event) => {
          setAttr('sides', (event.target as HTMLInputElement).value)
          const sides = Number((event.target as HTMLInputElement).value)
          let i: number = selElems.length
          while (i--) {
            const elem = selElems[i]
            if (elem.hasAttribute('edge')) {
              const oldSides = elem.getAttribute('sides')
              const oldPoints = elem.getAttribute('points')
              let xpos = 0
              let ypos = 0
              const polygon = elem as SVGPolygonElement
              if (polygon.points) {
                const list = polygon.points
                const len = list.numberOfItems
                for (let i = 0; i < len; ++i) {
                  const pt = list.getItem(i)
                  xpos += pt.x
                  ypos += pt.y
                }
                const cx = xpos / len
                const cy = ypos / len
                const edg = Number(elem.getAttribute('edge'))
                const inradius = (edg / 2) * cot(Math.PI / sides)
                const circumradius = inradius * sec(Math.PI / sides)
                let points = ''
                for (let s = 0; sides >= s; s++) {
                  const angle = (2.0 * Math.PI * s) / sides
                  const x = circumradius * Math.cos(angle) + cx
                  const y = circumradius * Math.sin(angle) + cy
                  points += x + ',' + y + ' '
                }
                elem.setAttribute('points', points)
                addToHistory(new ChangeElementCommand(elem, { sides: oldSides, points: oldPoints }))
              }
            }
          }
        })
      },
    }
  }
})
