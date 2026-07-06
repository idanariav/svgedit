import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import * as history from '../../packages/svgcanvas/core/history.js'
import {
  init as initImageCrop,
  clampCropRect,
  computeSourceRect,
  isCropEligible
} from '../../packages/svgcanvas/core/image-crop.js'

const createSvgElement = (name) => document.createElementNS(NS.SVG, name)

describe('image-crop: pure geometry', () => {
  const origBounds = { x: 10, y: 20, width: 100, height: 50 }

  it('clampCropRect leaves an in-bounds rect unchanged', () => {
    const rect = { x: 20, y: 30, width: 50, height: 20 }
    expect(clampCropRect(rect, origBounds)).toEqual(rect)
  })

  it('clampCropRect clamps each edge individually', () => {
    // Left edge pushed past the original left bound.
    expect(clampCropRect({ x: -5, y: 30, width: 50, height: 20 }, origBounds))
      .toEqual({ x: 10, y: 30, width: 50, height: 20 })
    // Right edge (x + width) pushed past the original right bound.
    expect(clampCropRect({ x: 90, y: 30, width: 50, height: 20 }, origBounds))
      .toEqual({ x: 60, y: 30, width: 50, height: 20 })
    // Top edge pushed past the original top bound.
    expect(clampCropRect({ x: 20, y: 0, width: 50, height: 20 }, origBounds))
      .toEqual({ x: 20, y: 20, width: 50, height: 20 })
    // Bottom edge (y + height) pushed past the original bottom bound.
    expect(clampCropRect({ x: 20, y: 60, width: 50, height: 20 }, origBounds))
      .toEqual({ x: 20, y: 50, width: 50, height: 20 })
  })

  it('clampCropRect enforces the minimum size floor', () => {
    const result = clampCropRect({ x: 20, y: 30, width: 1, height: 1 }, origBounds, 4)
    expect(result.width).toBe(4)
    expect(result.height).toBe(4)
  })

  it('clampCropRect never exceeds the original bounds even at full size', () => {
    const result = clampCropRect({ x: 10, y: 20, width: 500, height: 500 }, origBounds)
    expect(result).toEqual(origBounds)
  })

  it('computeSourceRect is the identity mapping for a full, 1:1 crop', () => {
    const result = computeSourceRect(origBounds, origBounds, 100, 50)
    expect(result).toEqual({ sx: 0, sy: 0, sw: 100, sh: 50 })
  })

  it('computeSourceRect maps an offset crop into natural pixel space', () => {
    const cropRect = { x: 20, y: 30, width: 50, height: 20 }
    const result = computeSourceRect(origBounds, cropRect, 100, 50)
    // scaleX = 100/100 = 1, scaleY = 50/50 = 1
    expect(result).toEqual({ sx: 10, sy: 10, sw: 50, sh: 20 })
  })

  it('computeSourceRect accounts for a non-1:1 natural-vs-display scale', () => {
    const cropRect = { x: 10, y: 20, width: 50, height: 25 } // half the display bounds
    const result = computeSourceRect(origBounds, cropRect, 200, 100) // natural is 2x display
    expect(result).toEqual({ sx: 0, sy: 0, sw: 100, sh: 50 })
  })

  it('isCropEligible accepts a plain imported image', () => {
    const image = createSvgElement('image')
    expect(isCropEligible(image)).toBe(true)
  })

  it('isCropEligible rejects a vault-linked image', () => {
    const image = createSvgElement('image')
    image.setAttribute('data-vault-link', 'notes/foo.png')
    expect(isCropEligible(image)).toBe(false)
  })

  it('isCropEligible rejects a transformed image', () => {
    const image = createSvgElement('image')
    image.setAttribute('transform', 'rotate(45)')
    expect(isCropEligible(image)).toBe(false)
  })

  it('isCropEligible rejects non-image elements', () => {
    expect(isCropEligible(createSvgElement('rect'))).toBe(false)
    expect(isCropEligible(null)).toBe(false)
  })
})

describe('image-crop: apply/cancel', () => {
  /** @type {any} */
  let canvas
  /** @type {any[]} */
  let historyStack
  /** @type {SVGSVGElement} */
  let svgContent
  let originalImage
  let originalGetContext
  let originalToDataURL

  beforeEach(() => {
    historyStack = []
    svgContent = /** @type {SVGSVGElement} */ (createSvgElement('svg'))
    document.body.append(svgContent)

    canvas = {
      history,
      zoom: 1,
      selectorManager: {
        releaseSelector () {},
        requestSelector () {
          return { resize () {} }
        }
      },
      currentMode: 'select',
      getMode () { return this.currentMode },
      setMode (mode) { this.currentMode = mode },
      getZoom () { return this.zoom },
      getSvgContent () { return svgContent },
      call () {},
      addCommandToHistory (cmd) {
        historyStack.push(cmd)
      }
    }
    initImageCrop(canvas)

    // Stub Image to resolve immediately with a fixed natural size.
    originalImage = globalThis.Image
    globalThis.Image = class FakeImage {
      constructor () {
        this.naturalWidth = 200
        this.naturalHeight = 100
      }

      set src (_value) {
        // Resolve asynchronously, like a real image load.
        setTimeout(() => this.onload && this.onload(), 0)
      }

      addEventListener (type, cb) {
        if (type === 'load') this.onload = cb
        if (type === 'error') this.onerror = cb
      }
    }

    // Stub canvas 2d context + toDataURL (jsdom has no real canvas backend).
    originalGetContext = globalThis.HTMLCanvasElement.prototype.getContext
    originalToDataURL = globalThis.HTMLCanvasElement.prototype.toDataURL
    globalThis.HTMLCanvasElement.prototype.getContext = function () {
      return { drawImage () {} }
    }
    globalThis.HTMLCanvasElement.prototype.toDataURL = function (mime) {
      return `data:${mime || 'image/png'};base64,CROPPED`
    }
  })

  afterEach(() => {
    svgContent.remove()
    globalThis.Image = originalImage
    globalThis.HTMLCanvasElement.prototype.getContext = originalGetContext
    globalThis.HTMLCanvasElement.prototype.toDataURL = originalToDataURL
  })

  const makeImage = (attrs) => {
    const image = createSvgElement('image')
    Object.entries(attrs).forEach(([k, v]) => image.setAttribute(k, String(v)))
    svgContent.append(image)
    return image
  }

  it('startImageCrop seeds an overlay and enters imagecrop mode', () => {
    const image = makeImage({ x: 0, y: 0, width: 100, height: 50, href: 'data:image/png;base64,AAA' })
    canvas.startImageCrop(image)
    expect(canvas.getMode()).toBe('imagecrop')
    expect(svgContent.querySelector('#se-imagecrop-overlay')).not.toBeNull()
  })

  it('startImageCrop is a no-op for an ineligible image', () => {
    const image = makeImage({ x: 0, y: 0, width: 100, height: 50, href: 'data:image/png;base64,AAA' })
    image.setAttribute('data-vault-link', 'notes/foo.png')
    canvas.startImageCrop(image)
    expect(canvas.getMode()).toBe('select')
    expect(svgContent.querySelector('#se-imagecrop-overlay')).toBeNull()
  })

  it('cancelImageCrop removes the overlay without touching history', () => {
    const image = makeImage({ x: 0, y: 0, width: 100, height: 50, href: 'data:image/png;base64,AAA' })
    canvas.startImageCrop(image)
    canvas.cancelImageCrop()
    expect(canvas.getMode()).toBe('select')
    expect(svgContent.querySelector('#se-imagecrop-overlay')).toBeNull()
    expect(historyStack).toHaveLength(0)
  })

  it('applyImageCrop is a no-op (cancels) when the crop rect is unchanged', async () => {
    const image = makeImage({ x: 0, y: 0, width: 100, height: 50, href: 'data:image/png;base64,AAA' })
    canvas.startImageCrop(image)
    await canvas.applyImageCrop()
    expect(historyStack).toHaveLength(0)
    expect(canvas.getMode()).toBe('select')
  })

  it('dragging the se handle then applying resamples just the cropped region into one undoable BatchCommand', async () => {
    const image = makeImage({ x: 0, y: 0, width: 100, height: 50, href: 'data:image/png;base64,AAA' })
    canvas.startImageCrop(image)

    const overlay = svgContent.querySelector('#se-imagecrop-overlay')
    // Identity CTM so clientX/clientY map 1:1 onto local (image) coordinates.
    const identityCTM = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse () { return identityCTM } }
    overlay.getScreenCTM = () => identityCTM

    // Handles are appended in HANDLE_DIRS order (nw,n,ne,e,se,s,sw,w) right
    // after the rect body, so index 5 (0=rect) is the 'se' (bottom-right) handle.
    const seHandle = overlay.children[5]
    seHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 60, clientY: 30 }))
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 60, clientY: 30 }))

    await canvas.applyImageCrop()

    expect(historyStack).toHaveLength(1)
    expect(image.getAttribute('x')).toBe('0')
    expect(image.getAttribute('y')).toBe('0')
    expect(image.getAttribute('width')).toBe('60')
    expect(image.getAttribute('height')).toBe('30')
    expect(image.getAttribute('href')).toBe('data:image/png;base64,CROPPED')
    expect(canvas.getMode()).toBe('select')
    expect(svgContent.querySelector('#se-imagecrop-overlay')).toBeNull()

    // Undo restores the original image; redo re-applies the crop.
    historyStack[0].unapply(null)
    expect(image.getAttribute('href')).toBe('data:image/png;base64,AAA')
    expect(image.getAttribute('width')).toBe('100')
    expect(image.getAttribute('height')).toBe('50')

    historyStack[0].apply(null)
    expect(image.getAttribute('href')).toBe('data:image/png;base64,CROPPED')
    expect(image.getAttribute('width')).toBe('60')
    expect(image.getAttribute('height')).toBe('30')
  })

  it('applyImageCrop rejects and leaves the element untouched when the source cannot be loaded', async () => {
    const image = makeImage({ x: 0, y: 0, width: 100, height: 50, href: 'data:image/png;base64,AAA' })
    canvas.startImageCrop(image)

    const overlay = svgContent.querySelector('#se-imagecrop-overlay')
    const identityCTM = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse () { return identityCTM } }
    overlay.getScreenCTM = () => identityCTM
    const seHandle = overlay.children[5]
    seHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 60, clientY: 30 }))
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 60, clientY: 30 }))

    // Make the next Image load fail (simulates a CORS/network failure).
    globalThis.Image = class FailingImage {
      set src (_value) {
        setTimeout(() => this.onerror && this.onerror(new Error('boom')), 0)
      }

      addEventListener (type, cb) {
        if (type === 'load') this.onload = cb
        if (type === 'error') this.onerror = cb
      }
    }

    await expect(canvas.applyImageCrop()).rejects.toThrow()
    expect(historyStack).toHaveLength(0)
    expect(image.getAttribute('href')).toBe('data:image/png;base64,AAA')
    expect(image.getAttribute('width')).toBe('100')
  })
})
