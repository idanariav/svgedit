// elem-get-set.js — `changeSelectedAttribute()` and attribute I/O
/**
 * @module elem-get-set get and set methods.
 * @license MIT
 * @copyright 2011 Jeff Schiller
 */

import Paint from './paint.ts'
import { NS } from './namespaces.ts'
import { createTextAttrs } from './text-attrs.ts'
import {
  walkTree, getHref, setHref
} from './dom-utils.ts'
import { getUnits } from './units.ts'
import { getParents } from '../common/util.ts'
import type SvgCanvas from '../svgcanvas.ts'
import type { BBoxObject } from './bbox-utils.ts'
import type { BatchCommand as BatchCommandType } from './history.js'
import type { Resolution } from '../svgcanvas.ts'
import type { BBox } from '../svgcanvas.ts'

/** A bounding box to zoom to, optionally with the zoom/factor to use when the box is empty. */
type ZoomBox = BBoxObject & { zoom?: number, factor?: number }
type ZoomTarget = 'selection' | 'canvas' | 'content' | 'layer' | ZoomBox
interface ZoomAndBBox { zoom: number, bbox: ZoomBox }

/** The members `elem-get-set.ts` gives its canvas. */
export interface ElemGetSetApi {
  setImageURL(val: string): void
  setLinkURL(val: string): void
  setRectRadius(val: number | string): void
  makeHyperlink(url: string): void
  removeHyperlink(): void
  setSegType(newType: number): void
  setStrokeWidth(val: number): void
  getResolution(): Resolution
  // Attributes / metadata
  getTitle(elem?: Element): string | undefined
  setGroupTitle(val: string): void
  setStrokeAttr(attr: string, val: string | number): void
  setBackground(color: string, url?: string, gradientElem?: Element): void
  setDocumentTitle(newTitle: string): void
  getEditorNS(add?: boolean): string
  setResolution(width: number | string, height: number | string): boolean
  setBBoxZoom(val: 'selection' | 'canvas' | 'content' | 'layer' | object, editorW: number, editorH: number): { zoom: number, bbox: BBox } | void
  setCurrentZoom(zoomLevel: number): void
  setColor(type: 'fill' | 'stroke' | string, val: string, preventUndo?: boolean): void
  setGradient(type: 'fill' | 'stroke'): void
  setPaint(type: 'fill' | 'stroke' | string, paint: unknown): void
  setCircleArc(arcDegrees: number): void
  setCircleArcAttr(attr: string, val: number): void
}

export const createElemGetSet = (canvas: SvgCanvas): ElemGetSetApi => {
  const svgCanvas = canvas // per-instance; methods below are closed over it
  const { convertToNum } = getUnits(canvas)
  Object.assign(canvas, createTextAttrs(canvas))
  // The method attachments are at the end of init (after the function
  // declarations) so each instance binds its own closures.

  // Monotonic counter for the canvas-background gradient id (see
  // setBackgroundMethod) — a fresh id per application forces the rect's fill
  // paint server to re-resolve.
  let bgGradientSeq = 0

  /**
* @returns The current dimensions and zoom level in an object
*/
  const getResolutionMethod = (): { w: number, h: number, zoom: number } => {
    const zoom = svgCanvas.getZoom()
    const w = Number(svgCanvas.getSvgContent().getAttribute('width')) / zoom
    const h = Number(svgCanvas.getSvgContent().getAttribute('height')) / zoom

    return {
      w,
      h,
      zoom
    }
  }

  /**
* @returns the current group/SVG's title contents or
* `undefined` if no element is passed nd there are no selected elements.
*/
  const getTitleMethod = (elem?: Element): string | undefined => {
    const selectedElements = svgCanvas.getSelectedElements()
    const dataStorage = svgCanvas.getDataStorage()
    elem = elem || selectedElements[0]
    if (!elem) { return undefined }
    if (dataStorage.has(elem, 'gsvg')) {
      elem = dataStorage.get(elem, 'gsvg')
    } else if (dataStorage.has(elem, 'symbol')) {
      elem = dataStorage.get(elem, 'symbol')
    }
    const childs = (elem as Element).childNodes
    for (const child of childs) {
      if (child.nodeName === 'title') {
        return child.textContent as string
      }
    }
    return ''
  }

  /**
* Sets the group/SVG's title content.
* @todo Combine this with `setDocumentTitle`
*/
  const setGroupTitleMethod = (val: string): void => {
    const {
      InsertElementCommand, RemoveElementCommand,
      ChangeElementCommand, BatchCommand
    } = svgCanvas.history
    const selectedElements = svgCanvas.getSelectedElements()
    const dataStorage = svgCanvas.getDataStorage()
    let elem = selectedElements[0]
    if (!elem) { return }
    if (dataStorage.has(elem, 'gsvg')) {
      elem = dataStorage.get(elem, 'gsvg')
    } else if (dataStorage.has(elem, 'symbol')) {
      elem = dataStorage.get(elem, 'symbol')
    }
    if (!elem) { return }

    const batchCmd = new BatchCommand('Set Label')

    let title: Element | null = null
    for (const child of elem.childNodes as NodeListOf<Element>) {
      if (child.nodeName === 'title') {
        title = child
        break
      }
    }

    if (val.length === 0) {
      if (!title) { return }
      // Remove title element
      const { nextSibling } = title
      title.remove()
      batchCmd.addSubCommand(new RemoveElementCommand(title, nextSibling, elem))
    } else if (title) {
    // Change title contents
      const oldText = title.textContent
      if (oldText === val) { return }
      title.textContent = val
      batchCmd.addSubCommand(new ChangeElementCommand(title, { '#text': oldText }))
    } else {
    // Add title element
      title = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'title')
      title.textContent = val
      elem.insertBefore(title, elem.firstChild)
      batchCmd.addSubCommand(new InsertElementCommand(title))
    }

    if (!batchCmd.isEmpty()) {
      svgCanvas.addCommandToHistory(batchCmd)
    }
  }

  /**
* Adds/updates a title element for the document with the given name.
* This is an undoable action.
* @param newTitle - String with the new title
*/
  const setDocumentTitleMethod = (newTitle: string): void => {
    const {
      InsertElementCommand, RemoveElementCommand,
      ChangeElementCommand, BatchCommand
    } = svgCanvas.history
    const svgContent = svgCanvas.getSvgContent()

    const batchCmd = new BatchCommand('Change Image Title')

    let docTitle: Element | null = null
    for (const child of [...svgContent.childNodes] as Element[]) {
      if (child.nodeName === 'title') {
        docTitle = child
        break
      }
    }

    if (!docTitle) {
      if (!newTitle.length) { return }
      docTitle = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'title') as Element
      docTitle.textContent = newTitle
      svgContent.insertBefore(docTitle, svgContent.firstChild)
      batchCmd.addSubCommand(new InsertElementCommand(docTitle))
    } else if (newTitle.length) {
      const oldTitle = docTitle.textContent
      if (oldTitle === newTitle) { return }
      docTitle.textContent = newTitle
      batchCmd.addSubCommand(new ChangeElementCommand(docTitle, { '#text': oldTitle }))
    } else {
    // No title given, so element is not necessary
      const { nextSibling } = docTitle
      docTitle.remove()
      batchCmd.addSubCommand(new RemoveElementCommand(docTitle, nextSibling, svgContent))
    }

    if (!batchCmd.isEmpty()) {
      svgCanvas.addCommandToHistory(batchCmd)
    }
  }

  /**
* Changes the document's dimensions to the given size.
* @param x - Number with the width of the new dimensions in user units.
* Can also be the string "fit" to indicate "fit to content".
* @param y - Number with the height of the new dimensions in user units.
* @returns Indicates if resolution change was successful.
* It will fail on "fit to content" option with no content to fit to.
*/
  const setResolutionMethod = (x: number | string, y: number | string): boolean => {
    const { ChangeElementCommand, BatchCommand } = svgCanvas.history
    const res = svgCanvas.getResolution()
    const { w, h } = res
    let batchCmd: BatchCommandType | undefined

    if (x === 'fit') {
    // Get bounding box
      const bbox = svgCanvas.getStrokedBBoxDefaultVisible()

      if (bbox) {
        batchCmd = new BatchCommand('Fit Canvas to Content') as BatchCommandType
        const visEls = svgCanvas.getVisibleElements()
        svgCanvas.addToSelection(visEls)
        const dx: number[] = []
        const dy: number[] = []
        visEls.forEach(() => {
          dx.push(bbox.x * -1)
          dy.push(bbox.y * -1)
        })

        const cmd = svgCanvas.moveSelectedElements(dx, dy, false)
        if (cmd) {
          batchCmd.addSubCommand(cmd)
        }
        svgCanvas.clearSelection()

        x = Math.round(bbox.width)
        y = Math.round(bbox.height)
      } else {
        return false
      }
    }
    const newW = convertToNum('width', x)
    const newH = convertToNum('height', y)
    if (newW !== w || newH !== h) {
      if (!batchCmd) {
        batchCmd = new BatchCommand('Change Image Dimensions') as BatchCommandType
      }
      const svgContent = svgCanvas.getSvgContent()
      const oldViewBox = svgContent.getAttribute('viewBox')

      svgContent.setAttribute('width', String(newW))
      svgContent.setAttribute('height', String(newH))

      svgCanvas.contentW = newW
      svgCanvas.contentH = newH
      svgContent.setAttribute('viewBox', [0, 0, newW, newH].join(' '))
      batchCmd.addSubCommand(new ChangeElementCommand(svgContent, { width: w, height: h, viewBox: oldViewBox } as unknown as Record<string, string | null>))

      svgCanvas.addCommandToHistory(batchCmd)
      svgCanvas.call('changed', [svgContent])
    }
    return true
  }

  /**
* Returns the editor's namespace URL, optionally adding it to the root element.
* @param add - Indicates whether or not to add the namespace value
* @returns The editor's namespace URL
*/
  const getEditorNSMethod = (add?: boolean): string => {
    if (add) {
      svgCanvas.getSvgContent().setAttribute('xmlns:se', NS.SE)
    }
    return NS.SE
  }

  /**
* Sets the zoom level on the canvas-side based on the given value.
* @param val - Bounding box object to zoom to or string indicating zoom option. Note: the object value type is defined in `svg-editor.js`
* @param editorW - The editor's workarea box's width
* @param editorH - The editor's workarea box's height
*/
  const setBBoxZoomMethod = (val: ZoomTarget, editorW: number, editorH: number): ZoomAndBBox | void => {
    const zoom = svgCanvas.getZoom()
    const selectedElements = svgCanvas.getSelectedElements()
    let spacer = 0.85
    let bb: ZoomBox | null | undefined
    const calcZoom = (bb: ZoomBox | null | undefined): ZoomAndBBox | undefined => {
      if (!bb) { return undefined }
      if (!Number.isFinite(editorW) || !Number.isFinite(editorH) || editorW <= 0 || editorH <= 0) {
        return undefined
      }
      if (!Number.isFinite(bb.width) || !Number.isFinite(bb.height) || bb.width <= 0 || bb.height <= 0) {
        return undefined
      }
      const wZoom = Math.round((editorW / bb.width) * 100 * spacer) / 100
      const hZoom = Math.round((editorH / bb.height) * 100 * spacer) / 100
      const zoom = Math.min(wZoom, hZoom)
      if (!Number.isFinite(zoom) || zoom <= 0) {
        return undefined
      }
      svgCanvas.setZoom(zoom)
      return { zoom, bbox: bb }
    }

    if (val && typeof val === 'object') {
      bb = val
      if (bb.width === 0 || bb.height === 0) {
        let newzoom = zoom
        if (Number.isFinite(bb.zoom) && (bb.zoom as number) > 0) {
          newzoom = bb.zoom as number
        } else if (Number.isFinite(bb.factor) && (bb.factor as number) > 0) {
          newzoom = zoom * (bb.factor as number)
        }
        if (Number.isFinite(newzoom) && newzoom > 0) {
          svgCanvas.setZoom(newzoom)
        }
        return { zoom: newzoom, bbox: bb }
      }
      return calcZoom(bb)
    }

    switch (val) {
      case 'selection': {
        if (!selectedElements[0]) { return undefined }
        const selectedElems = selectedElements.filter(Boolean)
        bb = svgCanvas.getStrokedBBoxDefaultVisible(selectedElems)
        break
      } case 'canvas': {
        const res = svgCanvas.getResolution()
        spacer = 0.95
        bb = { width: res.w, height: res.h, x: 0, y: 0 }
        break
      } case 'content':
        bb = svgCanvas.getStrokedBBoxDefaultVisible()
        break
      case 'layer':
        bb = svgCanvas.getStrokedBBoxDefaultVisible(svgCanvas.getVisibleElements(svgCanvas.getCurrentDrawing().getCurrentLayer() as Element))
        break
      default:
        return undefined
    }
    return calcZoom(bb)
  }

  /**
* Sets the zoom to the given level.
* @param zoomLevel - number indicating the zoom level to change to
*/
  const setZoomMethod = (zoomLevel: number): void => {
    if (!Number.isFinite(zoomLevel) || zoomLevel <= 0) {
      return
    }
    const selectedElements = svgCanvas.getSelectedElements()
    const res = svgCanvas.getResolution()
    const w = res.w / zoomLevel
    const h = res.h / zoomLevel
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      return
    }
    svgCanvas.getSvgContent().setAttribute('viewBox', `0 0 ${w} ${h}`)
    svgCanvas.setZoom(zoomLevel)
    selectedElements.forEach((elem) => {
      if (!elem) { return }
      const selector = svgCanvas.selectorManager.requestSelector(elem)
      selector && selector.resize()
    })
    svgCanvas.pathActions.zoomChange()
    svgCanvas.call('zoomChanged', zoomLevel)
  }

  /**
* Change the current stroke/fill color/gradient value.
* @param type - String indicating fill or stroke
* @param val - The value to set the stroke attribute to
* @param preventUndo - Boolean indicating whether or not svgCanvas should be an undoable option
*/
  const setColorMethod = (type: 'fill' | 'stroke', val: string, preventUndo?: boolean): void => {
    const selectedElements = svgCanvas.getSelectedElements()
    svgCanvas.setCurShape(type, val)
    svgCanvas.setCurProperties(`${type}_paint`, { type: 'solidColor' })
    const elems: Element[] = []
    const addNonG = (e: Element): void => {
      if (e.nodeName !== 'g') {
        elems.push(e)
      }
    }
    let i = selectedElements.length
    while (i--) {
      const elem = selectedElements[i]
      if (elem) {
        if (elem.tagName === 'g') {
          walkTree(elem, addNonG)
        } else if (type === 'fill') {
          if (elem.tagName !== 'polyline' && elem.tagName !== 'line') {
            elems.push(elem)
          }
        } else {
          elems.push(elem)
        }
      }
    }
    if (elems.length === 0) return
    if (preventUndo) {
      svgCanvas.changeSelectedAttributeNoUndo(type, val, elems)
    } else {
      svgCanvas.changeSelectedAttribute(type, val, elems)
      svgCanvas.call('changed', elems)
    }
  }

  /**
* Apply the current gradient to selected element's fill or stroke.
* @param type - String indicating "fill" or "stroke" to apply to an element
*/
  const setGradientMethod = (type: 'fill' | 'stroke'): void => {
    const curPaint = svgCanvas.getCurProperties(`${type}_paint`)
    if (!curPaint || curPaint.type === 'solidColor') { return }
    const canvas = svgCanvas
    let grad = (canvas as unknown as Record<string, SVGGradientElement | undefined>)[type + 'Grad']
    if (!grad) { return }
    // find out if there is a duplicate gradient already in the defs
    const duplicateGrad = findDuplicateGradient(grad)
    const defs = svgCanvas.findDefs()
    // no duplicate found, so import gradient into defs
    if (!duplicateGrad) {
    // const origGrad = grad;
      grad = svgCanvas.getDOMDocument().importNode(grad, true)
      defs.append(grad)
      // get next id and set it on the grad
      grad.id = svgCanvas.getNextId()
    } else { // use existing gradient
      grad = duplicateGrad
    }
    svgCanvas.setColor(type, `url(#${grad.id})`)
  }

  /**
* Read a stop's effective color/opacity, whether stored as presentation
* attributes (`stop-color`/`stop-opacity`) or inline in the `style` attribute.
*/
  const readStop = (stop: SVGStopElement): { color: string | null, opacity: string | null } => {
    const style = stop.getAttribute('style') || ''
    const colorMatch = style.match(/stop-color\s*:\s*([^;]+)/i)
    const opacityMatch = style.match(/stop-opacity\s*:\s*([^;]+)/i)
    const color = (colorMatch ? colorMatch[1] : stop.getAttribute('stop-color'))?.trim().toLowerCase() ?? null
    const opacity = (opacityMatch ? opacityMatch[1] : stop.getAttribute('stop-opacity'))?.trim() ?? null
    return { color, opacity }
  }

  /**
* Check if exact gradient already exists.
* @param grad - The gradient DOM element to compare to others
* @returns The existing gradient if found, `null` if not
*/
  const findDuplicateGradient = (grad: SVGGradientElement): SVGGradientElement | null => {
    if (!grad) {
      return null
    }
    if (!['linearGradient', 'radialGradient'].includes(grad.tagName)) {
      return null
    }
    const defs = svgCanvas.findDefs()
    const existingGrads = defs.querySelectorAll('linearGradient, radialGradient')
    let i = existingGrads.length
    const radAttrs = ['r', 'cx', 'cy', 'fx', 'fy']
    while (i--) {
      const og = existingGrads[i] as SVGGradientElement
      if (og.tagName !== grad.tagName) {
        continue
      }
      if (grad.tagName === 'linearGradient') {
        if (grad.getAttribute('x1') !== og.getAttribute('x1') ||
        grad.getAttribute('y1') !== og.getAttribute('y1') ||
        grad.getAttribute('x2') !== og.getAttribute('x2') ||
        grad.getAttribute('y2') !== og.getAttribute('y2')
        ) {
          continue
        }
      } else {
        const gradAttrs = {
          r: Number(grad.getAttribute('r')),
          cx: Number(grad.getAttribute('cx')),
          cy: Number(grad.getAttribute('cy')),
          fx: Number(grad.getAttribute('fx')),
          fy: Number(grad.getAttribute('fy'))
        }
        const ogAttrs = {
          r: Number(og.getAttribute('r')),
          cx: Number(og.getAttribute('cx')),
          cy: Number(og.getAttribute('cy')),
          fx: Number(og.getAttribute('fx')),
          fy: Number(og.getAttribute('fy'))
        }

        let diff = false
        radAttrs.forEach((attr) => {
          if ((gradAttrs as Record<string, number>)[attr] !== (ogAttrs as Record<string, number>)[attr]) { diff = true }
        })

        if (diff) { continue }
      }

      // else could be a duplicate, iterate through stops
      const stops = grad.getElementsByTagNameNS(NS.SVG, 'stop')
      const ostops = og.getElementsByTagNameNS(NS.SVG, 'stop')

      if (stops.length !== ostops.length) {
        continue
      }

      let j = stops.length
      while (j--) {
        const stop = stops[j]
        const ostop = ostops[j]
        const sVals = readStop(stop as SVGStopElement)
        const oVals = readStop(ostop as SVGStopElement)

        if (stop.getAttribute('offset') !== ostop.getAttribute('offset') ||
        sVals.opacity !== oVals.opacity ||
        sVals.color !== oVals.color) {
          break
        }
      }

      if (j === -1) {
        return og
      }
    } // for each gradient in defs

    return null
  }

  /**
* Set a color/gradient to a fill/stroke.
* @param type - String with "fill" or "stroke"
* @param paint - The paint object to apply
*/
  const setPaintMethod = (type: 'fill' | 'stroke', paint: ConstructorParameters<typeof Paint>[0]): void => {
  // make a copy
    const p = new Paint(paint)
    svgCanvas.setPaintOpacity(type, p.alpha / 100, true)

    // now set the current paint object
    svgCanvas.setCurProperties(`${type}_paint`, p)
    switch (p.type) {
      case 'solidColor':
        svgCanvas.setColor(type, p.solidColor !== 'none' ? `#${p.solidColor}` : 'none')
        break
      case 'linearGradient':
      case 'radialGradient':
        svgCanvas.setCanvas(type + 'Grad', p[p.type])
        svgCanvas.setGradient(type)
        break
    }
  }

  /**
* Sets the stroke width for the current selected elements.
* When attempting to set a line's width to 0, this changes it to 1 instead.
* @param val - A number indicating the new stroke width value
*/
  const setStrokeWidthMethod = (val: number): void => {
    const selectedElements = svgCanvas.getSelectedElements()
    if (val === 0 && ['line', 'path'].includes(svgCanvas.getMode())) {
      svgCanvas.setStrokeWidth(1)
      return
    }
    svgCanvas.setCurProperties('stroke_width', val)

    const elems: Element[] = []
    const addNonG = (e: Element): void => {
      if (e.nodeName !== 'g') {
        elems.push(e)
      }
    }
    let i = selectedElements.length
    while (i--) {
      const elem = selectedElements[i]
      if (elem) {
        if (elem.tagName === 'g') {
          walkTree(elem, addNonG)
        } else {
          elems.push(elem)
        }
      }
    }
    if (elems.length > 0) {
      svgCanvas.changeSelectedAttribute('stroke-width', val, elems)
      // Paint the stroke beneath the fill so it grows outward rather than
      // shrinking the visible fill (matters most for outlined text).
      svgCanvas.changeSelectedAttribute('paint-order', 'stroke', elems)
      svgCanvas.call('changed', selectedElements)
    }
  }

  /**
* Set the given stroke-related attribute the given value for selected elements.
* @param attr - String with the attribute name
* @param val - String or number with the attribute value
*/
  const setStrokeAttrMethod = (attr: string, val: string | number): void => {
    const selectedElements = svgCanvas.getSelectedElements()
    svgCanvas.setCurShape(attr.replace('-', '_') as 'stroke_width', val as number)
    const elems: Element[] = []

    let i = selectedElements.length
    while (i--) {
      const elem = selectedElements[i]
      if (elem) {
        if (elem.tagName === 'g') {
          walkTree(elem, (e) => { if (e.nodeName !== 'g') { elems.push(e) } })
        } else {
          elems.push(elem)
        }
      }
    }
    if (elems.length > 0) {
      svgCanvas.changeSelectedAttribute(attr, val, elems)
      svgCanvas.call('changed', selectedElements)
    }
  }

  /**
* Sets the new image URL for the selected image element. Updates its size if
* a new URL is given.
* @param val - String with the image URL/path
*/
  const setImageURLMethod = (val: string): void => {
    const { ChangeElementCommand, BatchCommand } = svgCanvas.history
    const selectedElements = svgCanvas.getSelectedElements()
    const elem = selectedElements[0]
    if (!elem) { return }

    const attrs = {
      width: elem.getAttribute('width'),
      height: elem.getAttribute('height')
    }
    const setsize = (!attrs.width || !attrs.height)

    const curHref = getHref(elem)
    const hrefChanged = curHref !== val

    // Do nothing if no URL change or size change
    if (!hrefChanged && !setsize) {
      return
    }

    const batchCmd = new BatchCommand('Change Image URL')

    if (hrefChanged) {
      setHref(elem, val)
      batchCmd.addSubCommand(new ChangeElementCommand(elem, {
        '#href': curHref
      }))
    }

    let finalized = false
    const finalize = () => {
      if (finalized) { return }
      finalized = true
      if (batchCmd.isEmpty()) { return }
      svgCanvas.addCommandToHistory(batchCmd)
      svgCanvas.call('changed', [elem])
    }

    const img = new Image()
    img.onload = () => {
      const changes = {
        width: elem.getAttribute('width'),
        height: elem.getAttribute('height')
      }
      elem.setAttribute('width', String(img.width))
      elem.setAttribute('height', String(img.height))

      const selector = svgCanvas.selectorManager.requestSelector(elem)
      selector && selector.resize()

      batchCmd.addSubCommand(new ChangeElementCommand(elem, changes))
      finalize()
    }
    img.onerror = () => {
      finalize()
    }
    img.src = val
  }

  /**
* Sets the new link URL for the selected anchor element.
* @param val - String with the link URL/path
*/
  const setLinkURLMethod = (val: string): void => {
    const { ChangeElementCommand, BatchCommand } = svgCanvas.history
    const selectedElements = svgCanvas.getSelectedElements()
    let elem = selectedElements[0]
    if (!elem) { return }
    if (elem.tagName !== 'a') {
    // See if parent is an anchor
      const parentsA = getParents(elem.parentNode as Node, 'a')
      if (parentsA?.length) {
        elem = parentsA[0]
      } else {
        return
      }
    }

    const curHref = getHref(elem)

    if (curHref === val) { return }

    const batchCmd = new BatchCommand('Change Link URL')

    setHref(elem, val)
    batchCmd.addSubCommand(new ChangeElementCommand(elem, {
      '#href': curHref
    }))

    svgCanvas.addCommandToHistory(batchCmd)
  }

  /**
* Sets the `rx` and `ry` values to the selected `rect` element
* to change its corner radius.
* @param val - The new radius
*/
  const setRectRadiusMethod = (val: string | number): void => {
    const { ChangeElementCommand } = svgCanvas.history
    const selectedElements = svgCanvas.getSelectedElements()
    const selected = selectedElements[0]
    if (selected?.tagName !== 'rect') { return }

    const radius = Number(val)
    if (!Number.isFinite(radius) || radius < 0) {
      return
    }

    const oldRx = selected.getAttribute('rx')
    const oldRy = selected.getAttribute('ry')
    const currentRx = Number(oldRx)
    const currentRy = Number(oldRy)
    const hasCurrentRx = oldRx !== null && Number.isFinite(currentRx)
    const hasCurrentRy = oldRy !== null && Number.isFinite(currentRy)
    const already = (radius === 0 && oldRx === null && oldRy === null) ||
    (hasCurrentRx && hasCurrentRy && currentRx === radius && currentRy === radius)
    if (already) { return }

    if (!svgCanvas.setElementAttributes('Radius', selected, { rx: String(radius), ry: String(radius) })) {
      selected.setAttribute('rx', String(radius))
      selected.setAttribute('ry', String(radius))
      svgCanvas.addCommandToHistory(new ChangeElementCommand(selected, { rx: oldRx, ry: oldRy }, 'Radius'))
    }
    svgCanvas.call('changed', [selected])
  }

  /**
* Wraps the selected element(s) in an anchor element or converts group to one.
*/
  const makeHyperlinkMethod = (url: string): void => {
    svgCanvas.groupSelectedElements('a', url)
  }

  /**
*/
  const removeHyperlinkMethod = (): void => {
    svgCanvas.ungroupSelectedElement()
  }

  /**
* Group: Element manipulation.
*/

  /**
* Sets the new segment type to the selected segment(s).
* @param newType - New segment type. See {@link https://www.w3.org/TR/SVG/paths.html#InterfaceSVGPathSeg} for list
*/
  const setSegTypeMethod = (newType: number): void => {
    svgCanvas.pathActions.setSegType(newType)
  }

  /**
* Set the background of the editor (NOT the actual document).
* @param color - String with fill color to apply
* @param url - URL or path to image to use
*/
  const setBackgroundMethod = (color: string, url?: string, gradientElem?: Element, _recordUndo?: boolean): void => {
    const bg = svgCanvas.getElement('canvasBackground')
    if (!bg) { return }
    const border = bg.querySelector('rect')
    if (!border) { return }
    let bgImg = svgCanvas.getElement('background_image')
    let bgPattern = svgCanvas.getElement('background_pattern')

    // Handle gradient fill
    let bgDefs = bg.querySelector('defs')
    if (gradientElem) {
    // Replace the <defs> NODE on every application rather than swapping its
    // children. Some engines (Electron/Obsidian) cache a rect's paint-server
    // resolution against the <defs> node identity: if the gradient reference is
    // ever evaluated while unresolved (e.g. restored during load before the
    // canvas paints), reusing the same <defs> node — even with a fresh child id
    // and a changed `fill` string — won't re-resolve it, so the background
    // stays white. This is exactly why a solid→gradient toggle recovers (the
    // solid branch removes the <defs> node) but gradient→gradient does not.
    // Recreating the node forces the re-resolution.
      if (bgDefs) { bgDefs.remove() }
      bgDefs = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'defs')
      bg.insertBefore(bgDefs, border)
      const grad = gradientElem.cloneNode(true)
      // A fresh id per application keeps the `fill` reference string unique
      // (see the <defs>-identity comment above). getNonceId additionally
      // namespaces it by the drawing's nonce so multiple editors mounted into
      // one host document — where SVG `url(#id)` paint refs resolve
      // document-wide — can't have a second canvas's background rect bind to
      // the first's gradient.
      const gradId = svgCanvas.getNonceId(`background_gradient_${++bgGradientSeq}`)
      ;(grad as Element).id = gradId
      bgDefs.appendChild(grad)
      border.setAttribute('fill', `url(#${gradId})`)
    } else {
      if (bgDefs) { bgDefs.remove() }
      // 'gradient' without a gradientElem (e.g. missing saved data) → fall back to white
      const fillColor = (color === 'chessboard' || color === 'gradient') ? '#fff' : color
      border.setAttribute('fill', fillColor)
    }

    if (color === 'chessboard') {
      if (!bgPattern) {
        bgPattern = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'foreignObject')
        svgCanvas.assignAttributes(bgPattern, {
          id: 'background_pattern',
          width: '100%',
          height: '100%',
          preserveAspectRatio: 'xMinYMin',
          style: 'pointer-events:none'
        })
        const div = document.createElement('div')
        svgCanvas.assignAttributes(div, {
          style: 'pointer-events:none;width:100%;height:100%;' +
          'background-image:url(data:image/gif;base64,' +
          'R0lGODlhEAAQAIAAAP///9bW1iH5BAAAAAAALAAAAAAQABAAAAIfjG+' +
          'gq4jM3IFLJgpswNly/XkcBpIiVaInlLJr9FZWAQA7);'
        })
        bgPattern.append(div)
        bg.append(bgPattern)
      }
    } else if (bgPattern) {
      bgPattern.remove()
    }
    if (url) {
      if (!bgImg) {
        bgImg = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'image')
        svgCanvas.assignAttributes(bgImg, {
          id: 'background_image',
          width: '100%',
          height: '100%',
          preserveAspectRatio: 'xMinYMin',
          style: 'pointer-events:none'
        })
      }
      setHref(bgImg, url)
      bg.append(bgImg)
    } else if (bgImg) {
      bgImg.remove()
    }
  }

  // ---------------------------------------------------------------------------
  // Circle arc (pie-sector) support
  // ---------------------------------------------------------------------------

  /**
 * Presentational SVG attributes copied when converting circle/ellipse ↔ arc path.
 */
  const ARC_PRES_ATTRS = [
    'fill', 'fill-opacity', 'stroke', 'stroke-width',
    'stroke-dasharray', 'stroke-linejoin', 'stroke-linecap',
    'stroke-opacity', 'opacity', 'style'
  ]

  /**
 * Compute the SVG path `d` string for a symmetric pie-sector (pacman) arc.
 * Works for both circles (rx === ry) and ellipses (rx !== ry) — SVG's
 * elliptical-arc command takes independent radii.
 * The "mouth" is centred at 3-o'clock (angle 0, rightward).
 * A single SVG arc cannot represent a full ellipse (coincident start/end point),
 * so this function must only be called for arcDeg in the range [1, 359].
 * @param arcDeg - arc span in degrees (1–359)
 */
  const computeArcPathD = (cx: number, cy: number, rx: number, ry: number, arcDeg: number): string => {
    const halfGap = ((360 - arcDeg) / 2) * (Math.PI / 180)
    const startX = cx + rx * Math.cos(halfGap)
    const startY = cy + ry * Math.sin(halfGap)
    const endX = cx + rx * Math.cos(-halfGap)
    const endY = cy + ry * Math.sin(-halfGap)
    const large = arcDeg > 180 ? 1 : 0
    return `M ${cx} ${cy} L ${startX} ${startY} A ${rx} ${ry} 0 ${large} 1 ${endX} ${endY} Z`
  }

  /**
 * Read the centre and radii of a circle, ellipse, or arc path as
 * `{ cx, cy, rx, ry }`. Arc paths store geometry in `data-*` attributes;
 * legacy arc paths used a single `data-r`, read as a fallback for both radii.
 */
  const readArcGeom = (elem: Element): { cx: number, cy: number, rx: number, ry: number } => {
    const num = (a: string): number => Number(elem.getAttribute(a)) || 0
    if (elem.tagName === 'circle') {
      const r = num('r')
      return { cx: num('cx'), cy: num('cy'), rx: r, ry: r }
    }
    if (elem.tagName === 'ellipse') {
      return { cx: num('cx'), cy: num('cy'), rx: num('rx'), ry: num('ry') }
    }
    // arc path
    const rFallback = num('data-r')
    return {
      cx: num('data-cx'),
      cy: num('data-cy'),
      rx: elem.hasAttribute('data-rx') ? Number(elem.getAttribute('data-rx')) : rFallback,
      ry: elem.hasAttribute('data-ry') ? Number(elem.getAttribute('data-ry')) : rFallback
    }
  }

  /**
 * Convert the selected circle/ellipse to a pie-sector arc path (or vice-versa)
 * based on the given arc angle in degrees.
 * - arcDegrees === 360 converts an arc path back to a <circle> (when rx === ry)
 *   or an <ellipse>.
 * - arcDegrees < 360 converts a <circle>/<ellipse> to a <path data-arc> (or
 *   updates an existing arc path in place).
 * Supports full undo/redo via BatchCommand / ChangeElementCommand.
 */
  const setCircleArcMethod = (arcDegrees: number): void => {
    const selected = svgCanvas.getSelectedElements()[0]
    if (!selected) return
    const { tagName } = selected
    const isArcPath = tagName === 'path' && selected.hasAttribute('data-arc')
    if (tagName !== 'circle' && tagName !== 'ellipse' && !isArcPath) return

    const arc = Math.max(1, Math.min(360, Math.round(Number(arcDegrees))))
    if (!Number.isFinite(arc)) return

    const { cx, cy, rx, ry } = readArcGeom(selected)
    const currentArc = isArcPath ? Number(selected.getAttribute('data-arc')) : 360
    if (arc === currentArc) return

    const { BatchCommand, RemoveElementCommand, InsertElementCommand, ChangeElementCommand } = svgCanvas.history

    // Collect presentational attributes from elem
    const collectPresAttrs = (elem: Element): Record<string, string> => ARC_PRES_ATTRS.reduce((o, a) => {
      const v = elem.getAttribute(a)
      if (v !== null) o[a] = v
      return o
    }, {} as Record<string, string>)

    // Swap `selected` out for `replacement`, preserving id/transform, as one undo step.
    const replaceSelected = (replacement: Element, label: string): void => {
      const batchCmd = new BatchCommand(label)
      const eltrans = selected.getAttribute('transform')
      if (eltrans) replacement.setAttribute('transform', eltrans)
      const { id, parentNode, nextSibling } = selected
      batchCmd.addSubCommand(new RemoveElementCommand(selected, nextSibling, parentNode))
      svgCanvas.clearSelection()
      selected.remove()
      batchCmd.addSubCommand(new InsertElementCommand(replacement))
      replacement.setAttribute('id', id)
      svgCanvas.addToSelection([replacement], true)
      svgCanvas.addCommandToHistory(batchCmd)
      svgCanvas.call('changed', [replacement])
    }

    if (arc === 360) {
    // arc path → full circle (rx === ry) or ellipse
      const isCircle = rx === ry
      const shape = svgCanvas.addSVGElementsFromJson(
        isCircle
          ? { element: 'circle', attr: { cx, cy, r: rx, ...collectPresAttrs(selected) } }
          : { element: 'ellipse', attr: { cx, cy, rx, ry, ...collectPresAttrs(selected) } }
      )
      replaceSelected(shape, isCircle ? 'Restore Circle' : 'Restore Ellipse')
    } else if (tagName === 'circle' || tagName === 'ellipse') {
    // full circle/ellipse → arc path
      const d = computeArcPathD(cx, cy, rx, ry, arc)
      const path = svgCanvas.addSVGElementsFromJson({
        element: 'path',
        attr: { d, 'data-cx': cx, 'data-cy': cy, 'data-rx': rx, 'data-ry': ry, 'data-arc': arc, ...collectPresAttrs(selected) }
      })
      replaceSelected(path, 'Create Arc')
    } else {
    // arc path → update arc in place
      const oldArc = selected.getAttribute('data-arc')
      const oldD = selected.getAttribute('d')
      const newD = computeArcPathD(cx, cy, rx, ry, arc)
      if (!svgCanvas.setElementAttributes('Arc', selected, { 'data-arc': String(arc), d: newD })) {
        selected.setAttribute('data-arc', String(arc))
        selected.setAttribute('d', newD)
        svgCanvas.addCommandToHistory(
          new ChangeElementCommand(selected, { 'data-arc': oldArc, d: oldD }, 'Arc')
        )
      }
      svgCanvas.call('changed', [selected])
    }
  }

  /**
 * Update the geometry (cx, cy, r, rx, or ry) of an arc path element, recomputing
 * the path `d` attribute accordingly. Used when the user edits the cx/cy/r
 * (circular arc) or cx/cy/rx/ry (elliptical arc) fields in the panel while an
 * arc path is selected. An `r` edit sets both radii (keeps the arc circular).
 */
  const setCircleArcAttrMethod = (attr: 'cx' | 'cy' | 'r' | 'rx' | 'ry', val: number): void => {
    const selected = svgCanvas.getSelectedElements()[0]
    if (!selected || selected.tagName !== 'path' || !selected.hasAttribute('data-arc')) return

    const oldD = selected.getAttribute('d')
    const geom = readArcGeom(selected)
    // The data-* attributes this edit will write (snapshotted for undo).
    const changedAttrs = attr === 'r' ? ['data-rx', 'data-ry'] : [`data-${attr}`]
    const oldVals = changedAttrs.reduce((o, a) => {
      o[a] = selected.getAttribute(a)
      return o
    }, {} as Record<string, string | null>)

    if (attr === 'cx') {
      geom.cx = val
    } else if (attr === 'cy') {
      geom.cy = val
    } else if (attr === 'r') {
      geom.rx = val
      geom.ry = val
    } else if (attr === 'rx') {
      geom.rx = val
    } else if (attr === 'ry') {
      geom.ry = val
    }

    const arc = Number(selected.getAttribute('data-arc')) || 360
    const newD = computeArcPathD(geom.cx, geom.cy, geom.rx, geom.ry, arc)
    const values = Object.fromEntries(changedAttrs.map(a => [a, String(attr === 'r' ? val : geom[attr])]))
    if (!svgCanvas.setElementAttributes(attr, selected, { ...values, d: newD })) {
      changedAttrs.forEach(a => selected.setAttribute(a, values[a]))
      selected.setAttribute('d', newD)
      const { ChangeElementCommand } = svgCanvas.history
      svgCanvas.addCommandToHistory(
        new ChangeElementCommand(selected, { ...oldVals, d: oldD }, attr)
      )
    }
    svgCanvas.call('changed', [selected])
  }

  return {
    setImageURL: setImageURLMethod, // Sets the new image URL for the selected image element
    setLinkURL: setLinkURLMethod, // Sets the new link URL for the selected anchor element.
    setRectRadius: setRectRadiusMethod, // Sets the `rx` and `ry` values to the selected `rect` element
    makeHyperlink: makeHyperlinkMethod, // Wraps the selected element(s) in an anchor element or converts group to one.
    removeHyperlink: removeHyperlinkMethod,
    setSegType: setSegTypeMethod, // Sets the new segment type to the selected segment(s).
    setStrokeWidth: setStrokeWidthMethod, // Sets the stroke width for the current selected elements.
    getResolution: getResolutionMethod, // The current dimensions and zoom level in an object
    getTitle: getTitleMethod, // the current group/SVG's title contents or `undefined` if no element
    setGroupTitle: setGroupTitleMethod, // Sets the group/SVG's title content.
    setStrokeAttr: setStrokeAttrMethod, // Set the given stroke-related attribute the given value for selected elements.
    setBackground: setBackgroundMethod, // Set the background of the editor (NOT the actual document).
    setDocumentTitle: setDocumentTitleMethod, // Adds/updates a title element for the document with the given name.
    getEditorNS: getEditorNSMethod, // Returns the editor's namespace URL, optionally adding it to the root element.
    setResolution: setResolutionMethod, // Changes the document's dimensions to the given size.
    setBBoxZoom: setBBoxZoomMethod, // Sets the zoom level on the canvas-side based on the given value.
    setCurrentZoom: setZoomMethod, // Sets the zoom to the given level.
    setColor: setColorMethod, // Change the current stroke/fill color/gradien
    setGradient: setGradientMethod, // Apply the current gradient to selected element's fill or stroke.
    setPaint: setPaintMethod, // Set a color/gradient to a fill/stroke.
    setCircleArc: setCircleArcMethod, // Convert a circle/ellipse to a pie-sector arc path (or back) with the given arc angle.
    setCircleArcAttr: setCircleArcAttrMethod // Update cx/cy/r/rx/ry on an arc path element.
  }
}
