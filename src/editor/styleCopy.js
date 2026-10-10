/**
 * Copy the look of one element onto others (the eyedropper's "Apply style"
 * actions). Plain attributes are copied (an attribute the source lacks is
 * removed from the target, so the target ends up looking like the source);
 * drop shadow, outline, glow and feather are re-built through the effect
 * extensions' APIs so each target gets its own `<filter>`; markers are cloned
 * per target (their ids are derived from the element id); gradient and pattern
 * fills are shared by reference.
 *
 * Not copied: geometry, the Blur slider (a separate filter), live-effect /
 * corner-radius state. Tapered strokes keep their colour in `fill` and their
 * width in `se:taper-style`, so a tapered *source* is read through that style
 * and a tapered *target* is skipped (writing `fill`/`stroke` would break it).
 *
 * @module styleCopy
 */

import { TAPER_ATTR, TAPER_STYLE_ATTR } from '@svgedit/svgcanvas/core/taper-stroke.js'

/** Paint and stroke attributes copied between any two shapes. */
export const PAINT_ATTRS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'fill-rule',
  'paint-order'
]

/** Copied only when both source and target are text. */
export const TEXT_STYLE_ATTRS = ['font-family', 'font-size', 'font-weight', 'font-style']

const MARKER_POSITIONS = ['start', 'mid', 'end']
const MARKER_TAGS = new Set(['line', 'polyline', 'polygon', 'path'])
const TEXT_TAGS = new Set(['text', 'tspan'])
const GROUP_TAGS = new Set(['g', 'a'])

const NOT_SHAPES = new Set(['title', 'desc', 'defs'])

const tag = (el) => el.tagName.toLowerCase()

/**
 * The element's own look, or the first shape inside a group.
 * @param {Element} el
 * @returns {Element|null}
 */
export const styleSourceOf = (el) => {
  if (!el) return null
  if (!GROUP_TAGS.has(tag(el))) return el
  for (const child of el.children) {
    if (NOT_SHAPES.has(tag(child))) continue
    const leaf = styleSourceOf(child)
    if (leaf) return leaf
  }
  return null
}

/**
 * Shapes to restyle: the element itself, or the shapes inside a group.
 * @param {Element} el
 * @returns {Element[]}
 */
export const styleTargetsOf = (el) => {
  if (!GROUP_TAGS.has(tag(el))) return [el]
  return [...el.children].filter((c) => !NOT_SHAPES.has(tag(c))).flatMap(styleTargetsOf)
}

/**
 * The attribute values that make up a source's look; `null` = "absent".
 * @param {Element} source
 * @returns {Map<string, string|null>}
 */
export const readStyle = (source) => {
  const values = new Map()
  const attrs = [...PAINT_ATTRS, ...(TEXT_TAGS.has(tag(source)) ? TEXT_STYLE_ATTRS : [])]
  for (const attr of attrs) values.set(attr, source.getAttribute(attr))
  const taper = source.getAttribute(TAPER_STYLE_ATTR)
  if (taper) {
    // A tapered path is drawn as a filled outline: its colour is `fill`, its width and original stroke paint are in the style.
    const sep = taper.indexOf('|')
    values.set('stroke', taper.slice(sep + 1))
    values.set('stroke-width', taper.slice(0, sep))
    values.set('fill', 'none')
  }
  return values
}

/** The `<marker>` an element's `marker-<pos>` points at, if it is in the drawing. */
const linkedMarker = (svgCanvas, el, attr) => {
  const m = (el.getAttribute(attr) || '').match(/\(#(.*)\)/)
  return m ? svgCanvas.getElement(m[1]) : null
}

/**
 * Give `target` a copy of `source`'s markers (cloned: marker ids are per element).
 * @param {object} svgCanvas
 * @param {Element} source
 * @param {Element} target
 * @returns {void}
 */
const copyMarkers = (svgCanvas, source, target) => {
  if (!MARKER_TAGS.has(tag(source)) || !MARKER_TAGS.has(tag(target))) return
  for (const pos of MARKER_POSITIONS) {
    if (pos === 'mid' && tag(target) === 'line') continue // a <line> draws no mid markers; the markers extension converts it first
    const attr = `marker-${pos}`
    const old = linkedMarker(svgCanvas, target, attr)
    const from = linkedMarker(svgCanvas, source, attr)
    if (old && old !== from && old.hasAttribute('se_type')) old.remove()
    if (!from) {
      target.removeAttribute(attr)
    } else if (!from.hasAttribute('se_type')) {
      target.setAttribute(attr, source.getAttribute(attr)) // not ours (imported): share it
    } else {
      const id = `mkr_${pos}_${target.id}`
      svgCanvas.getElement(id)?.remove()
      const clone = from.cloneNode(true)
      clone.setAttribute('id', id)
      from.after(clone)
      target.setAttribute(attr, `url(#${id})`)
    }
  }
}

/**
 * Copy shadow, outline, glow and feather through the effect extensions.
 * @param {object} editor
 * @param {Element} source
 * @param {Element} target
 * @returns {void}
 */
const copyEffects = (editor, source, target) => {
  const { BatchCommand } = editor.svgCanvas.history
  const sink = new BatchCommand('Copy style') // the enclosing transaction records the change; the APIs just need somewhere to add to
  for (const api of [editor.shadowApi, editor.outlineApi, editor.glowApi]) {
    if (!api) continue
    const wanted = api.read(source)
    const has = api.read(target)
    if (wanted) api.apply(target, wanted, sink)
    else if (has) api.apply(target, { remove: true }, sink)
  }
}

/**
 * Copy `source`'s look onto `targets` as one undo step.
 * @param {object} editor the Editor (needs `svgCanvas`; `shadowApi`/`outlineApi`/`glowApi` when those extensions are loaded)
 * @param {Element} source
 * @param {Element[]} targets
 * @returns {number} how many shapes were restyled
 */
export const copyStyle = (editor, source, targets) => {
  const { svgCanvas } = editor
  const from = styleSourceOf(source)
  if (!from) return 0
  const shapes = [...new Set(targets.filter(Boolean).flatMap(styleTargetsOf))]
    .filter((el) => el !== from && !el.hasAttribute(TAPER_ATTR))
  if (!shapes.length) return 0
  const style = readStyle(from)
  svgCanvas.transact('Copy style', () => {
    for (const shape of shapes) {
      for (const [attr, value] of style) {
        if (attr.startsWith('font-') && !TEXT_TAGS.has(tag(shape))) continue
        if (value === null) shape.removeAttribute(attr)
        else shape.setAttribute(attr, value)
      }
      copyMarkers(svgCanvas, from, shape)
      copyEffects(editor, from, shape)
    }
  })
  return shapes.length
}
