/**
 * Destructive crop for imported raster `<image>` elements.
 *
 * A dashed rect + 8 handles (seeded from the image's current x/y/width/height)
 * is drawn as a sibling of the image so it shares the same local coordinate
 * space with no zoom/pan math needed for its geometry — only screen→local
 * point conversion for mouse drags (via the overlay's own `getScreenCTM`).
 * Handles resize/reposition the crop rect, clamped to the image's original
 * bounds; nothing is written to the element or undo history until Apply.
 *
 * Applying resamples just the cropped region into a new canvas and replaces
 * `href`/`x`/`y`/`width`/`height` in one undoable step — this is what lets a
 * later "Convert to editable SVG" trace operate on far less pixel data.
 *
 * @module image-crop
 * @license MIT
 */

import { getHref, setHref } from './dom-utils.js'
import { loadImage } from './load-image.js'
import { NS } from './namespaces.js'

const MIN_SIZE = 4
const HANDLE_SCREEN_RADIUS = 5
const HANDLE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/**
 * Clamp a candidate crop rect so it never exceeds the image's original bounds,
 * enforcing a minimum size.
 * @param {{x: number, y: number, width: number, height: number}} candidate
 * @param {{x: number, y: number, width: number, height: number}} origBounds
 * @param {number} [minSize]
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export const clampCropRect = (candidate, origBounds, minSize = MIN_SIZE) => {
  const width = Math.max(minSize, Math.min(candidate.width, origBounds.width))
  const height = Math.max(minSize, Math.min(candidate.height, origBounds.height))
  const x = Math.min(Math.max(candidate.x, origBounds.x), origBounds.x + origBounds.width - width)
  const y = Math.min(Math.max(candidate.y, origBounds.y), origBounds.y + origBounds.height - height)
  return { x, y, width, height }
}

/**
 * Map a crop rect (in the image's display/user space) into its natural pixel
 * space, given the source bitmap's natural size.
 * @param {{x: number, y: number, width: number, height: number}} origBounds
 * @param {{x: number, y: number, width: number, height: number}} cropRect
 * @param {number} naturalWidth
 * @param {number} naturalHeight
 * @returns {{sx: number, sy: number, sw: number, sh: number}}
 */
export const computeSourceRect = (origBounds, cropRect, naturalWidth, naturalHeight) => {
  const scaleX = naturalWidth / origBounds.width
  const scaleY = naturalHeight / origBounds.height
  return {
    sx: (cropRect.x - origBounds.x) * scaleX,
    sy: (cropRect.y - origBounds.y) * scaleY,
    sw: cropRect.width * scaleX,
    sh: cropRect.height * scaleY
  }
}

/**
 * Whether an `<image>` element is eligible for cropping in v1: a plain raster
 * import (not vault-linked, not transformed/rotated).
 * @param {Element} elem
 * @returns {boolean}
 */
export const isCropEligible = (elem) =>
  Boolean(elem) &&
  elem.tagName === 'image' &&
  !elem.hasAttribute('data-vault-link') &&
  !elem.hasAttribute('transform')

const sniffMimeType = (href) => {
  const match = /^data:([^;,]+)/.exec(href || '')
  return match ? match[1] : 'image/png'
}

const handlePoint = (rect, dir) => {
  const { x, y, width, height } = rect
  switch (dir) {
    case 'nw': return { x, y }
    case 'n': return { x: x + width / 2, y }
    case 'ne': return { x: x + width, y }
    case 'e': return { x: x + width, y: y + height / 2 }
    case 'se': return { x: x + width, y: y + height }
    case 's': return { x: x + width / 2, y: y + height }
    case 'sw': return { x, y: y + height }
    case 'w': return { x, y: y + height / 2 }
    default: return { x, y }
  }
}

/**
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  const svgCanvas = canvas

  /** @type {?{imageElem: Element, origBounds: object, cropRect: object, overlayGroup: SVGGElement, rectEl: SVGRectElement, handleEls: Record<string, SVGCircleElement>}} */
  let session = null

  const renderOverlay = () => {
    const { rectEl, handleEls, cropRect } = session
    const zoom = svgCanvas.getZoom()
    rectEl.setAttribute('x', cropRect.x)
    rectEl.setAttribute('y', cropRect.y)
    rectEl.setAttribute('width', cropRect.width)
    rectEl.setAttribute('height', cropRect.height)
    rectEl.setAttribute('stroke-width', 1.5 / zoom)
    rectEl.setAttribute('stroke-dasharray', `${6 / zoom},${4 / zoom}`)
    HANDLE_DIRS.forEach((dir) => {
      const p = handlePoint(cropRect, dir)
      const handle = handleEls[dir]
      handle.setAttribute('cx', p.x)
      handle.setAttribute('cy', p.y)
      handle.setAttribute('r', HANDLE_SCREEN_RADIUS / zoom)
      handle.setAttribute('stroke-width', 1 / zoom)
    })
  }

  /** Screen coords → the overlay's own local (= image's) coordinate space. */
  const clientToLocal = (evt) => {
    const pt = svgCanvas.getSvgContent().createSVGPoint()
    pt.x = evt.clientX
    pt.y = evt.clientY
    return pt.matrixTransform(session.overlayGroup.getScreenCTM().inverse())
  }

  const startHandleDrag = (dir) => {
    const startRect = { ...session.cropRect }
    const right = startRect.x + startRect.width
    const bottom = startRect.y + startRect.height
    const onMove = (evt) => {
      const p = clientToLocal(evt)
      let { x, y, width, height } = startRect
      if (dir.includes('w')) { x = p.x; width = right - p.x }
      if (dir.includes('e')) { width = p.x - startRect.x }
      if (dir.includes('n')) { y = p.y; height = bottom - p.y }
      if (dir.includes('s')) { height = p.y - startRect.y }
      session.cropRect = clampCropRect({ x, y, width, height }, session.origBounds)
      renderOverlay()
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseup', onUp, true)
    }
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseup', onUp, true)
  }

  const startBodyDrag = (evt0) => {
    const startRect = { ...session.cropRect }
    const startP = clientToLocal(evt0)
    const onMove = (evt) => {
      const p = clientToLocal(evt)
      session.cropRect = clampCropRect({
        x: startRect.x + (p.x - startP.x),
        y: startRect.y + (p.y - startP.y),
        width: startRect.width,
        height: startRect.height
      }, session.origBounds)
      renderOverlay()
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseup', onUp, true)
    }
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseup', onUp, true)
  }

  const removeOverlay = () => {
    session?.overlayGroup.remove()
  }

  /**
   * Enter crop mode for the given `<image>` element.
   * @param {Element} imageElem
   * @returns {void}
   */
  const startImageCrop = (imageElem) => {
    if (!isCropEligible(imageElem)) return
    if (session) removeOverlay()

    const origBounds = {
      x: Number(imageElem.getAttribute('x')) || 0,
      y: Number(imageElem.getAttribute('y')) || 0,
      width: Number(imageElem.getAttribute('width')) || 0,
      height: Number(imageElem.getAttribute('height')) || 0
    }

    const overlayGroup = document.createElementNS(NS.SVG, 'g')
    overlayGroup.setAttribute('id', 'se-imagecrop-overlay')

    const rectEl = document.createElementNS(NS.SVG, 'rect')
    rectEl.setAttribute('fill', 'transparent')
    rectEl.setAttribute('stroke', '#3b82f6')
    rectEl.setAttribute('pointer-events', 'fill')
    rectEl.style.cursor = 'move'
    rectEl.addEventListener('mousedown', (evt) => {
      if (evt.button !== 0) return
      evt.preventDefault()
      evt.stopPropagation()
      startBodyDrag(evt)
    })
    overlayGroup.append(rectEl)

    const handleEls = {}
    HANDLE_DIRS.forEach((dir) => {
      const handle = document.createElementNS(NS.SVG, 'circle')
      handle.setAttribute('fill', '#3b82f6')
      handle.setAttribute('stroke', '#fff')
      handle.style.cursor = `${dir}-resize`
      handle.addEventListener('mousedown', (evt) => {
        if (evt.button !== 0) return
        evt.preventDefault()
        evt.stopPropagation()
        startHandleDrag(dir)
      })
      handleEls[dir] = handle
      overlayGroup.append(handle)
    })

    imageElem.parentNode.insertBefore(overlayGroup, imageElem.nextSibling)
    svgCanvas.selectorManager.releaseSelector(imageElem)

    session = { imageElem, origBounds, cropRect: { ...origBounds }, overlayGroup, rectEl, handleEls }
    renderOverlay()
    svgCanvas.setMode('imagecrop')
  }

  /**
   * Exit crop mode without applying any change.
   * @returns {void}
   */
  const cancelImageCrop = () => {
    if (!session) return
    const { imageElem } = session
    removeOverlay()
    session = null
    if (svgCanvas.getMode() === 'imagecrop') svgCanvas.setMode('select')
    svgCanvas.selectorManager.requestSelector(imageElem)?.resize()
  }

  /**
   * Bake the current crop rect into the image: resample the source pixels to
   * just the cropped region and rewrite href/x/y/width/height as one undoable
   * `BatchCommand`.
   * @returns {Promise<void>}
   */
  const applyImageCrop = async () => {
    if (!session) return
    const { imageElem, origBounds, cropRect } = session
    const unchanged = cropRect.x === origBounds.x && cropRect.y === origBounds.y &&
      cropRect.width === origBounds.width && cropRect.height === origBounds.height
    if (unchanged) {
      cancelImageCrop()
      return
    }

    const href = getHref(imageElem)
    const img = await loadImage(href)

    const { sx, sy, sw, sh } = computeSourceRect(
      origBounds, cropRect, img.naturalWidth || img.width, img.naturalHeight || img.height
    )
    const canvasEl = document.createElement('canvas')
    canvasEl.width = Math.max(1, Math.round(sw))
    canvasEl.height = Math.max(1, Math.round(sh))
    const ctx = canvasEl.getContext('2d')
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvasEl.width, canvasEl.height)

    let newHref
    try {
      newHref = canvasEl.toDataURL(sniffMimeType(href))
    } catch {
      throw new Error('This image can\'t be cropped — its source is cross-origin (CORS). Re-import it as an embedded file.')
    }

    const { ChangeElementCommand, BatchCommand } = svgCanvas.history
    const oldValues = {
      x: origBounds.x,
      y: origBounds.y,
      width: origBounds.width,
      height: origBounds.height,
      '#href': href
    }
    setHref(imageElem, newHref)
    imageElem.setAttribute('x', cropRect.x)
    imageElem.setAttribute('y', cropRect.y)
    imageElem.setAttribute('width', cropRect.width)
    imageElem.setAttribute('height', cropRect.height)

    const batchCmd = new BatchCommand('Crop Image')
    batchCmd.addSubCommand(new ChangeElementCommand(imageElem, oldValues))
    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.call('changed', [imageElem])

    removeOverlay()
    session = null
    if (svgCanvas.getMode() === 'imagecrop') svgCanvas.setMode('select')
    svgCanvas.selectorManager.requestSelector(imageElem)?.resize()
  }

  document.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape' && svgCanvas.getMode() === 'imagecrop') cancelImageCrop()
  })

  svgCanvas.startImageCrop = startImageCrop
  svgCanvas.applyImageCrop = applyImageCrop
  svgCanvas.cancelImageCrop = cancelImageCrop
  svgCanvas.isImageCropEligible = isCropEligible
}
