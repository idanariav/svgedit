/* globals svgEditor */
import ImageTracer from 'imagetracerjs'
import { insertSvgElements } from './insertImage.js'
import { loadImage } from '@svgedit/svgcanvas/core/load-image.js'

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
 * Curve-fitting overrides applied on top of the 'grayscale' base for the
 * 'lineart' preset. imagetracerjs's own defaults (ltres/qtres:1,
 * rightangleenhance:true) are tuned for flat/geometric art; they let
 * hand-drawn or organic strokes get oversimplified into straight segments
 * and forced corners. imagetracerjs tries a straight-line fit within `ltres`
 * first and only falls back to a quadratic fit (within `qtres`) when that
 * fails, recursively splitting wherever both fail. Keeping `ltres` at its
 * default keeps that straight-line fit tolerant of ordinary rasterization/
 * anti-aliasing noise so straight strokes (limbs, edges) stay a single
 * segment instead of fragmenting into many tiny jittery ones; only `qtres`
 * is lowered so real curves still get fit tightly once a segment fails the
 * straight-line check. Disabling rightangleenhance stops real curves from
 * being snapped into right angles.
 * @type {Record<string, number|boolean>}
 */
const LINEART_OVERRIDES = {
  numberofcolors: 2,
  ltres: 1,
  qtres: 0.2,
  pathomit: 2,
  rightangleenhance: false,
  roundcoords: 2
}

/**
 * Build the imagetracerjs options object for a given dialog preset.
 * @param {string} preset - One of `lineart`/`detailed`/`posterized`/`color`.
 * @param {number} [numberofcolors] - Overrides the preset's palette size.
 * @returns {object} imagetracerjs options.
 */
export const buildTraceOptions = (preset, numberofcolors) => {
  const baseName = PRESET_BASE[preset] || 'default'
  const options = { ...(ImageTracer.optionpresets[baseName] || ImageTracer.optionpresets.default) }
  if (preset === 'lineart') Object.assign(options, LINEART_OVERRIDES)
  if (typeof numberofcolors === 'number') options.numberofcolors = numberofcolors
  return options
}

/**
 * Load an image href into an ImageData via an offscreen canvas. Reading pixels
 * back taints-checks the canvas: data-URL imports (the common case) read fine;
 * a cross-origin remote URL without CORS headers throws a SecurityError, which
 * we translate into a friendly message.
 * @param {string} href - Data URL or remote image URL.
 * @returns {Promise<ImageData>}
 */
const loadImageData = async (href) => {
  const img = await loadImage(href)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  try {
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  } catch {
    throw new Error('This image can\'t be traced — its source is cross-origin (CORS). Re-import it as an embedded file.')
  }
}

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

  const options = buildTraceOptions(preset, numberofcolors)

  const svgString = ImageTracer.imagedataToSVG(imagedata, options)

  // Position/scale the trace to overlay the source image (user-space rect,
  // transform-aware). insertSvgElements maps the trace's intrinsic pixel size
  // onto this rect instead of centering it on the page.
  const bbox = svgCanvas.getStrokedBBox([imageElem])
  insertSvgElements(svgString, { asPaths: true, fitTo: bbox })
}
