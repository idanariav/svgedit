/* globals svgEditor */
/**
 * canvasLayouts.js — saved canvas "layouts" (templates) for the Canvas Settings
 * popover (`seCanvasSettings.js`).
 *
 * A layout captures the whole canvas as-is: its proportions, page background
 * color, and every shape/text object. Applying a layout overwrites *only* the
 * canvas proportions and background color, and re-injects the saved objects onto
 * a separate layer named `Layout: <name>`. That layer is left inactive after
 * apply, so its objects are protected by svgedit's native layer behavior
 * (inactive layers get `pointer-events: none`) — the user must switch to the
 * layer before they can move its placeholders. Pre-existing canvas objects are
 * never touched (we only add a layer; we never call `setSvgString`).
 *
 * Persistence mirrors the canvas-size presets: a host `userDataAdapter`
 * (`getCanvasLayouts`/`setCanvasLayouts`) when present, else `localStorage`.
 */
import { getUserDataAdapter } from './userDataAdapter.js'

const STORAGE_KEY = 'svg-edit-canvas-layouts'
const LAYER_PREFIX = 'Layout: '

/**
 * Keep only well-formed layout entries.
 * @param {Array} arr
 * @returns {Array<{name:string,w:number,h:number,bg:string,svg:string}>}
 */
const sanitizeLayouts = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .filter(l =>
      l && typeof l.name === 'string' && l.name.trim() &&
      Number.isFinite(l.w) && l.w > 0 &&
      Number.isFinite(l.h) && l.h > 0 &&
      typeof l.svg === 'string' && l.svg)
    .map(({ name, w, h, bg, svg }) => ({
      name, w, h, bg: typeof bg === 'string' ? bg : '#FFFFFF', svg
    }))

/**
 * Load saved layouts via the host adapter, else localStorage. Returns [] when
 * nothing valid is stored.
 * @returns {Array<{name:string,w:number,h:number,bg:string,svg:string}>}
 */
export const loadLayouts = () => {
  try {
    const adapter = getUserDataAdapter()
    if (adapter && typeof adapter.getCanvasLayouts === 'function') {
      return sanitizeLayouts(adapter.getCanvasLayouts())
    }
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY)
      return sanitizeLayouts(raw ? JSON.parse(raw) : null)
    }
  } catch (err) {
    console.error('Failed to load canvas layouts', err)
  }
  return []
}

/**
 * Persist layouts via the host adapter, else localStorage.
 * @param {Array} layouts
 * @returns {void}
 */
export const saveLayouts = (layouts) => {
  try {
    const adapter = getUserDataAdapter()
    if (adapter && typeof adapter.setCanvasLayouts === 'function') {
      adapter.setCanvasLayouts(layouts.map(l => ({ ...l })))
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts))
    }
  } catch (err) {
    console.error('Failed to persist canvas layouts', err)
  }
}

/**
 * Capture the current canvas (size, page background, and full SVG) as a layout.
 * @param {string} name
 * @returns {{name:string,w:number,h:number,bg:string,svg:string}}
 */
export const captureCurrentLayout = (name) => {
  const { svgCanvas, configObj } = svgEditor
  const res = svgCanvas.getResolution()
  return {
    name: name.trim(),
    w: Math.round(res.w),
    h: Math.round(res.h),
    bg: configObj.pref('bkgd_color') || '#FFFFFF',
    svg: svgCanvas.getSvgString()
  }
}

/**
 * Apply a layout: overwrite canvas proportions + background, then re-inject the
 * saved objects onto a fresh `Layout: <name>` layer (replacing any same-named
 * layer from a previous apply). Existing canvas objects are preserved.
 * @param {{name:string,w:number,h:number,bg:string,svg:string}} layout
 * @returns {void}
 */
export const applyLayout = (layout) => {
  const { svgCanvas } = svgEditor
  const drawing = svgCanvas.getCurrentDrawing()
  const originalLayer = drawing.getCurrentLayerName()

  // 1. Proportions + background (the only canvas-wide state a layout overwrites).
  svgCanvas.setResolution(layout.w, layout.h)
  svgEditor.updateCanvas()
  svgEditor.setBackground(layout.bg)

  // 2. Parse the saved canvas and collect its drawable objects + defs.
  const doc = new DOMParser().parseFromString(layout.svg, 'image/svg+xml')
  if (doc.querySelector('parsererror')) {
    console.error('Failed to parse layout SVG', layout.name)
    return
  }
  const drawables = []
  doc.querySelectorAll('g.layer').forEach(layer => {
    layer.childNodes.forEach(node => {
      if (node.nodeType === 1 && node.localName !== 'title') drawables.push(node)
    })
  })
  const defs = []
  doc.querySelector('defs')?.childNodes.forEach(node => {
    if (node.nodeType === 1) defs.push(node)
  })
  if (!drawables.length && !defs.length) return

  // 3. Convert to JSON and give every element a fresh unique id, remapping
  //    internal references — same scheme svgedit's paste flow uses
  //    (packages/svgcanvas/core/paste-elem.js).
  const defsJson = defs.map(n => svgCanvas.getJsonFromSvgElements(n))
  const drawJson = drawables.map(n => svgCanvas.getJsonFromSvgElements(n))
  const changedIDs = {}
  const checkIDs = (elem) => {
    if (elem?.attr?.id) {
      changedIDs[elem.attr.id] = svgCanvas.getNextId()
      elem.attr.id = changedIDs[elem.attr.id]
    }
    elem?.children?.forEach(checkIDs)
  }
  const remapReferences = (elem) => {
    const attrs = elem?.attr
    if (attrs) {
      for (const [attrName, attrVal] of Object.entries(attrs)) {
        if (typeof attrVal !== 'string' || !attrVal) continue
        if ((attrName === 'href' || attrName === 'xlink:href') && attrVal.startsWith('#')) {
          const refId = attrVal.slice(1)
          if (refId in changedIDs) attrs[attrName] = `#${changedIDs[refId]}`
          continue
        }
        const m = /url\(#([^)]+)\)/.exec(attrVal)
        if (m && m[1] in changedIDs) {
          attrs[attrName] = attrVal.replace(`#${m[1]}`, `#${changedIDs[m[1]]}`)
        }
      }
    }
    elem?.children?.forEach(remapReferences)
  }
  const all = [...defsJson, ...drawJson]
  all.forEach(checkIDs)
  all.forEach(remapReferences)

  // 4. Replace any same-named layer from a previous apply, then create fresh.
  const layerName = LAYER_PREFIX + layout.name
  if (drawing.hasLayer(layerName)) {
    svgCanvas.setCurrentLayer(layerName)
    svgCanvas.deleteCurrentLayer()
  }
  svgCanvas.createLayer(layerName) // becomes the current/active layer

  // 5. Inject defs (created on the layout layer, then moved into <defs>) and the
  //    drawable objects (which land on the current = layout layer).
  const defsElem = svgCanvas.findDefs()
  defsJson.forEach(j => {
    const el = svgCanvas.addSVGElementsFromJson(j)
    if (el) defsElem.append(el)
  })
  drawJson.forEach(j => svgCanvas.addSVGElementsFromJson(j))

  // 6. Switch back so the layout layer becomes inactive (pointer-events: none),
  //    protecting its placeholders until the user explicitly selects the layer.
  svgCanvas.setCurrentLayer(originalLayer)
  svgEditor.rightPanel.populateLayers()
  svgEditor.updateCanvas()
}
