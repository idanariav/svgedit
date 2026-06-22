/* globals svgEditor */
import ImageTracer from 'imagetracerjs'
import { insertSvgElements } from './insertImage.js'

/**
 * Map the trace dialog's friendly preset names to an imagetracerjs option-preset
 * to start from. The dialog's color-count slider overrides `numberofcolors`.
 * @type {Record<string, string>}
 */
const PRESET_BASE = {
  lineart: 'grayscale',
  detailed: 'detailed',
  posterized: 'posterized2',
  color: 'default'
}

/**
 * Load an image href into an ImageData via an offscreen canvas. Reading pixels
 * back taints-checks the canvas: data-URL imports (the common case) read fine;
 * a cross-origin remote URL without CORS headers throws a SecurityError, which
 * we translate into a friendly message.
 * @param {string} href - Data URL or remote image URL.
 * @returns {Promise<ImageData>}
 */
const loadImageData = (href) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.addEventListener('load', () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth || img.width
      canvas.height = img.naturalHeight || img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      try {
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height))
      } catch {
        reject(new Error('This image can\'t be traced — its source is cross-origin (CORS). Re-import it as an embedded file.'))
      }
    })
    img.addEventListener('error', () => reject(new Error('Could not load the image to trace.')))
    img.src = href
  })

/**
 * Vectorize a selected `<image>` element into editable `<path>` elements placed
 * over the original. The original image is left untouched (non-destructive); the
 * traced paths are inserted as one undo step and left selected.
 *
 * @param {Element} imageElem - The selected SVG `<image>` to trace.
 * @param {{ preset?: string, numberofcolors?: number }} [opts]
 *   `preset` is one of `lineart`/`detailed`/`posterized`/`color`;
 *   `numberofcolors` overrides the palette size.
 * @returns {Promise<void>}
 */
export const traceImageToSvg = async (imageElem, opts = {}) => {
  const { preset = 'color', numberofcolors } = opts
  const svgCanvas = svgEditor.svgCanvas
  const href = svgCanvas.getHref(imageElem)
  if (!href) throw new Error('No image source to trace.')

  const imagedata = await loadImageData(href)

  const baseName = PRESET_BASE[preset] || 'default'
  const options = { ...(ImageTracer.optionpresets[baseName] || ImageTracer.optionpresets.default) }
  if (preset === 'lineart') options.numberofcolors = 2
  if (typeof numberofcolors === 'number') options.numberofcolors = numberofcolors

  const svgString = ImageTracer.imagedataToSVG(imagedata, options)

  // Position/scale the trace to overlay the source image (user-space rect,
  // transform-aware). insertSvgElements maps the trace's intrinsic pixel size
  // onto this rect instead of centering it on the page.
  const bbox = svgCanvas.getStrokedBBox([imageElem])
  insertSvgElements(svgString, { asPaths: true, fitTo: bbox })
}
