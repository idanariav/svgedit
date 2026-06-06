/**
 * @file ext-grid.js
 *
 * @license Apache-2.0
 *
 * @copyright 2010 Redou Mine, 2010 Alexis Deveria
 *
 */

const name = 'grid'

const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  // Locale files are inlined into the bundle (statically resolved glob).
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
    const { $id, NS } = svgCanvas
    const svgdoc = $id('svgcanvas').ownerDocument
    const { assignAttributes } = svgCanvas
    const hcanvas = document.createElement('canvas')
    const canvBG = $id('canvasBackground')
    const units = svgCanvas.getTypeMap() // Assumes prior `init()` call on `units.js` module
    const intervals = [0.01, 0.1, 1, 10, 100, 1000]
    const curConfig = svgEditor.configObj.curConfig

    hcanvas.style.display = 'none'
    svgEditor.$svgEditor.appendChild(hcanvas)

    const canvasGrid = svgdoc.createElementNS(NS.SVG, 'svg')
    assignAttributes(canvasGrid, {
      id: 'canvasGrid',
      width: '100%',
      height: '100%',
      x: 0,
      y: 0,
      overflow: 'visible',
      display: 'none'
    })
    canvBG.appendChild(canvasGrid)
    const gridDefs = svgdoc.createElementNS(NS.SVG, 'defs')
    // grid-pattern
    const gridPattern = svgdoc.createElementNS(NS.SVG, 'pattern')
    assignAttributes(gridPattern, {
      id: 'gridpattern',
      patternUnits: 'userSpaceOnUse',
      x: 0, // -(value.strokeWidth / 2), // position for strokewidth
      y: 0, // -(value.strokeWidth / 2), // position for strokewidth
      width: 100,
      height: 100
    })

    const gridimg = svgdoc.createElementNS(NS.SVG, 'image')
    assignAttributes(gridimg, {
      x: 0,
      y: 0,
      width: 100,
      height: 100
    })
    gridPattern.append(gridimg)
    gridDefs.append(gridPattern)
    // clip-path keeps the angled / radiating line grids inside the canvas extent
    const gridClip = svgdoc.createElementNS(NS.SVG, 'clipPath')
    gridClip.setAttribute('id', 'gridclip')
    const gridClipRect = svgdoc.createElementNS(NS.SVG, 'rect')
    assignAttributes(gridClipRect, { x: 0, y: 0, width: 100, height: 100 })
    gridClip.append(gridClipRect)
    gridDefs.append(gridClip)
    $id('canvasGrid').appendChild(gridDefs)

    // grid-box (used by the square pattern grid)
    const gridBox = svgdoc.createElementNS(NS.SVG, 'rect')
    assignAttributes(gridBox, {
      width: '100%',
      height: '100%',
      x: 0,
      y: 0,
      'stroke-width': 0,
      stroke: 'none',
      fill: 'url(#gridpattern)',
      style: 'pointer-events: none; display:visible;'
    })
    $id('canvasGrid').appendChild(gridBox)

    // grid-lines group (used by the non-square line grids)
    const gridLines = svgdoc.createElementNS(NS.SVG, 'g')
    assignAttributes(gridLines, {
      id: 'gridLines',
      'clip-path': 'url(#gridclip)',
      style: 'pointer-events: none;'
    })
    $id('canvasGrid').appendChild(gridLines)

    /**
     * Build the line segments for the active non-square grid shape.
     * Coordinates are in the canvasGrid pixel space (canvas resolution × zoom).
     * @param {string} shape
     * @param {Float} w canvas width in px
     * @param {Float} h canvas height in px
     * @param {Float} d line spacing in px
     * @returns {Array<[Float,Float,Float,Float]>}
     */
    const buildShapeLines = (shape, w, h, d) => {
      const lines = []
      // Parallel lines at `angleDeg`, spaced `d`, long enough to cross the
      // whole canvas (clipped to it by #gridclip).
      const parallel = (angleDeg) => {
        const a = (angleDeg * Math.PI) / 180
        const dir = { x: Math.cos(a), y: Math.sin(a) }
        const n = { x: -Math.sin(a), y: Math.cos(a) }
        const corners = [[0, 0], [w, 0], [0, h], [w, h]]
        const proj = corners.map(([x, y]) => x * n.x + y * n.y)
        const pMin = Math.min(...proj)
        const pMax = Math.max(...proj)
        const L = Math.hypot(w, h)
        for (let p = Math.floor(pMin / d) * d; p <= pMax; p += d) {
          const px = p * n.x
          const py = p * n.y
          lines.push([px - L * dir.x, py - L * dir.y, px + L * dir.x, py + L * dir.y])
        }
      }
      // Evenly spaced target points around the canvas perimeter.
      const perimeter = () => {
        const pts = []
        for (let x = 0; x <= w; x += d) { pts.push([x, 0], [x, h]) }
        for (let y = 0; y <= h; y += d) { pts.push([0, y], [w, y]) }
        return pts
      }
      switch (shape) {
        case 'isometric':
          parallel(30)
          parallel(-30)
          break
        case 'triangle':
          parallel(0)
          parallel(60)
          parallel(120)
          break
        case 'perspective1': {
          const vp = [w / 2, h / 2]
          lines.push([0, h / 2, w, h / 2]) // horizon
          perimeter().forEach(([x, y]) => lines.push([vp[0], vp[1], x, y]))
          break
        }
        case 'perspective2': {
          const vpL = [0, h / 2]
          const vpR = [w, h / 2]
          lines.push([0, h / 2, w, h / 2]) // horizon
          const edges = []
          for (let x = 0; x <= w; x += d) { edges.push([x, 0], [x, h]) }
          edges.forEach(([x, y]) => {
            lines.push([vpL[0], vpL[1], x, y])
            lines.push([vpR[0], vpR[1], x, y])
          })
          break
        }
      }
      return lines
    }

    /**
     * Render the active non-square grid as <line> elements.
     * @param {string} shape
     * @param {Float} zoom
     * @returns {void}
     */
    const updateLineGrid = (shape, zoom) => {
      const res = svgCanvas.getResolution()
      const w = res.w * zoom
      const h = res.h * zoom
      const stepPx = (curConfig.snappingStep || 10) * zoom
      let d
      if (shape === 'isometric' || shape === 'triangle') {
        // Perpendicular line spacing chosen so the line intersections coincide
        // exactly with the snapToGrid lattice nodes (which are `step` apart along
        // each ±30°/60° axis). Must NOT be rescaled, or snapping won't match.
        d = stepPx * Math.sin(Math.PI / 3) // step · sin(60°)
      } else {
        // Perspective grids are visual-only (square-step snapping); keep the
        // radiating-line density sane when zoomed far out.
        d = stepPx
        while (d > 0 && d < 8) { d *= 2 }
      }
      gridClipRect.setAttribute('width', w)
      gridClipRect.setAttribute('height', h)
      const segs = buildShapeLines(shape, w, h, d)
      const frag = svgdoc.createDocumentFragment()
      segs.forEach(([x1, y1, x2, y2]) => {
        const ln = svgdoc.createElementNS(NS.SVG, 'line')
        assignAttributes(ln, {
          x1, y1, x2, y2, stroke: curConfig.gridColor, 'stroke-width': 1, 'stroke-opacity': 0.3
        })
        frag.append(ln)
      })
      gridLines.replaceChildren(frag)
    }

    /**
     * Render the classic square grid as a repeating canvas→PNG pattern tile.
     * @param {Float} zoom
     * @returns {void}
     */
    const updateSquareGrid = (zoom) => {
      // TODO: Try this with <line> elements, then compare performance difference
      const unit = units[svgEditor.configObj.curConfig.baseUnit] // 1 = 1px
      const uMulti = unit * zoom
      // Calculate the main number interval
      const rawM = 100 / uMulti
      let multi = 1
      intervals.some((num) => {
        multi = num
        return rawM <= num
      })
      const bigInt = multi * uMulti

      // Set the canvas size to the width of the container
      hcanvas.width = bigInt
      hcanvas.height = bigInt
      const ctx = hcanvas.getContext('2d')
      const curD = 0.5
      const part = bigInt / 10

      ctx.globalAlpha = 0.2
      ctx.strokeStyle = svgEditor.configObj.curConfig.gridColor
      for (let i = 1; i < 10; i++) {
        const subD = Math.round(part * i) + 0.5
        // const lineNum = (i % 2)?12:10;
        const lineNum = 0
        ctx.moveTo(subD, bigInt)
        ctx.lineTo(subD, lineNum)
        ctx.moveTo(bigInt, subD)
        ctx.lineTo(lineNum, subD)
      }
      ctx.stroke()
      ctx.beginPath()
      ctx.globalAlpha = 0.5
      ctx.moveTo(curD, bigInt)
      ctx.lineTo(curD, 0)

      ctx.moveTo(bigInt, curD)
      ctx.lineTo(0, curD)
      ctx.stroke()

      const datauri = hcanvas.toDataURL('image/png')
      gridimg.setAttribute('width', bigInt)
      gridimg.setAttribute('height', bigInt)
      gridimg.parentNode.setAttribute('width', bigInt)
      gridimg.parentNode.setAttribute('height', bigInt)
      svgCanvas.setHref(gridimg, datauri)
    }

    /**
     * Render the grid for the active shape, toggling between the square pattern
     * tile and the explicit line grids used by every other shape.
     * @param {Float} zoom
     * @returns {void}
     */
    const updateGrid = (zoom) => {
      const shape = curConfig.gridShape || 'square'
      if (shape === 'square') {
        gridBox.style.display = ''
        gridLines.style.display = 'none'
        gridLines.replaceChildren()
        updateSquareGrid(zoom)
      } else {
        gridBox.style.display = 'none'
        gridLines.style.display = ''
        updateLineGrid(shape, zoom)
      }
    }

    /**
     *
     * @returns {void}
     */
    const gridUpdate = () => {
      const showGrid = curConfig.showGrid
      if (showGrid) {
        updateGrid(svgCanvas.getZoom())
      }
      $id('canvasGrid').style.display = (showGrid) ? 'block' : 'none'
    }
    // Expose so the editor can refresh the grid after a canvas resize, which
    // changes the extent the non-square line grids are drawn over.
    svgEditor.updateGrid = gridUpdate
    return {
      name: svgEditor.i18next.t(`${name}:name`),
      zoomChanged (zoom) {
        if (curConfig.showGrid) { updateGrid(zoom) }
      },
      callback () {
        // Add the grid-settings popover and its handler(s)
        const buttonTemplate = document.createElement('template')
        const title = `${name}:buttons.0.title`
        buttonTemplate.innerHTML = `
          <se-grid-settings id="grid_settings" title="${title}" src="grid.svg"></se-grid-settings>
        `
        $id('editor_panel').append(buttonTemplate.content.cloneNode(true))
        $id('grid_settings').addEventListener('change', () => {
          gridUpdate()
        })
        if (curConfig.showGrid) {
          gridUpdate()
        }
      }
    }
  }
}
