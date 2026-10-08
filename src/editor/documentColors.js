/**
 * documentColors.js — the distinct solid colours a drawing already uses, for the
 * palette's "in this drawing" row.
 * @module documentColors
 */

const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
const HEX6 = /^#[0-9a-f]{6}$/i
const RGB = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i

/**
 * Normalise a CSS colour to lower-case `#rrggbb`, or null for anything that is not
 * a plain solid colour (none, url(#gradient), currentColor, named colours, …).
 * @param {?string} value
 * @returns {?string}
 */
export const normalizeColor = (value) => {
  const v = (value || '').trim()
  let m = HEX3.exec(v)
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase()
  if (HEX6.test(v)) return v.toLowerCase()
  m = RGB.exec(v)
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number)
    if (r > 255 || g > 255 || b > 255) return null
    return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')
  }
  return null
}

/**
 * Distinct fill/stroke colours under `root`, most used first.
 * @param {?Element} root drawing content element (e.g. `#svgcontent`)
 * @param {number} [limit=10]
 * @returns {string[]} `#rrggbb` values
 */
export const collectDocumentColors = (root, limit = 10) => {
  if (!root) return []
  const counts = new Map()
  const add = (v) => {
    const c = normalizeColor(v)
    if (c) counts.set(c, (counts.get(c) || 0) + 1)
  }
  root.querySelectorAll('*').forEach((el) => {
    if (el.closest('defs')) return
    for (const prop of ['fill', 'stroke']) {
      add(el.getAttribute(prop))
      add(el.style?.getPropertyValue(prop))
    }
  })
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([c]) => c)
}
