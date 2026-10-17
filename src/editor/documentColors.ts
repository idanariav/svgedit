/**
 * documentColors.ts — the distinct solid colours a drawing already uses, for the
 * palette's "Recent" row.
 * @module documentColors
 */

const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
const HEX6 = /^#[0-9a-f]{6}$/i
const RGB = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i

/**
 * Normalise a CSS colour to lower-case `#rrggbb`, or null for anything that is not
 * a plain solid colour (none, url(#gradient), currentColor, named colours, …).
 */
export const normalizeColor = (value: string | null): string | null => {
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
 * Distinct fill/stroke colours under `root`, most recent first. An SVG keeps no
 * history, so "recent" is document order: a colour ranks by the last element that
 * uses it, and later elements (on top, usually drawn last) win.
 * @param root drawing content element (e.g. `#svgcontent`)
 * @returns `#rrggbb` values
 */
export const collectDocumentColors = (root: Element | null, limit: number = 5): string[] => {
  if (!root) return []
  const lastSeen = new Map()
  let pos = 0
  root.querySelectorAll('*').forEach((el) => {
    pos++
    if (el.closest('defs')) return
    for (const prop of ['fill', 'stroke']) {
      for (const v of [el.getAttribute(prop), (el as HTMLElement).style?.getPropertyValue(prop)]) {
        const c = normalizeColor(v)
        if (c) lastSeen.set(c, pos)
      }
    }
  })
  return [...lastSeen.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([c]) => c)
}
