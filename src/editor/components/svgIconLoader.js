/**
 * svgIconLoader.js
 *
 * Shared utility for loading SVG icon files as inline DOM elements.
 * Uses currentColor so icons inherit their color from CSS `color:` on the host.
 */

import { getRawIcon } from '../images/iconRegistry.js'

// Cache fetched+serialised SVG strings keyed by URL to avoid re-fetching
const svgCache = new Map()

/**
 * Fetch an SVG file and return a freshly-parsed <svg> element (cloned from cache).
 * Ensures stroke="currentColor" and fill="none" so the icon picks up CSS color.
 * @param {string} url - Absolute or relative URL of the SVG file.
 * @returns {Promise<SVGElement|null>}
 */
export async function fetchSvgEl (url) {
  if (!svgCache.has(url)) {
    try {
      // Inlined icons resolve synchronously from the bundle; only fall back to
      // fetch for data: URIs or icons not present in the registry.
      let text = getRawIcon(url)
      if (text == null) {
        const res = await fetch(url)
        text = await res.text()
      }
      const parser = new DOMParser()
      const doc = parser.parseFromString(text, 'image/svg+xml')
      const svgEl = doc.querySelector('svg')
      if (svgEl) {
        // Remove any embedded <style> blocks — they may contain hardcoded colors
        svgEl.querySelectorAll('style').forEach(s => s.remove())
        // Remove class attributes (they referenced the now-removed styles)
        svgEl.querySelectorAll('[class]').forEach(el => el.removeAttribute('class'))
        // Remove <defs> that only contained style rules (now empty)
        svgEl.querySelectorAll('defs').forEach(d => {
          if (!d.children.length) d.remove()
        })

        // Ensure currentColor inheritance on the root
        svgEl.setAttribute('stroke', 'currentColor')
        svgEl.setAttribute('fill', 'none')

        // Normalise all child elements: remove hardcoded colors; keep fill="none"
        svgEl.querySelectorAll('*').forEach(el => {
          const stroke = el.getAttribute('stroke')
          if (stroke && stroke !== 'currentColor' && stroke !== 'none') {
            el.setAttribute('stroke', 'currentColor')
          }
          const fill = el.getAttribute('fill')
          if (fill && fill !== 'none' && fill !== 'currentColor') {
            // Decorative fills (solid shapes inside the icon) → currentColor
            el.setAttribute('fill', 'currentColor')
          }
          // Strip inline style color declarations
          const style = el.getAttribute('style')
          if (style) {
            const cleaned = style
              .split(';')
              .filter(s => !/\b(fill|stroke|color)\s*:/.test(s))
              .join(';')
            if (cleaned.trim()) {
              el.setAttribute('style', cleaned)
            } else {
              el.removeAttribute('style')
            }
          }
        })

        // Ensure consistent stroke-width for a clean look
        if (!svgEl.getAttribute('stroke-width')) {
          svgEl.setAttribute('stroke-width', '1.6')
        }
        svgEl.setAttribute('stroke-linecap', 'round')
        svgEl.setAttribute('stroke-linejoin', 'round')

        // If the icon declares width/height but no viewBox, synthesise one so its
        // content scales into the rendered box. Without a viewBox the inner shapes
        // render at native coordinates and, combined with overflow:visible below,
        // spill outside the icon's box (e.g. context_menu.svg overflowing the panel).
        if (!svgEl.getAttribute('viewBox')) {
          const w = parseFloat(svgEl.getAttribute('width'))
          const h = parseFloat(svgEl.getAttribute('height'))
          if (w && h) svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`)
        }

        // iOS/Android WebView (Obsidian mobile) does not reliably resolve the
        // `width:100%/height:100%` inline style below when the icon sits in a
        // centered flex/grid button, collapsing it to a near-zero intrinsic
        // size. Stamp explicit width/height attributes from the viewBox so the
        // WebView has a sane intrinsic fallback; Chromium (desktop) still
        // honors the percentage style and is unaffected.
        if (!svgEl.getAttribute('width') && !svgEl.getAttribute('height')) {
          const vb = svgEl.getAttribute('viewBox')
          if (vb) {
            const [, , w, h] = vb.split(/[\s,]+/).map(Number)
            if (w && h) {
              svgEl.setAttribute('width', String(w))
              svgEl.setAttribute('height', String(h))
            }
          }
        }

        svgEl.style.cssText = 'width:100%;height:100%;display:block;overflow:visible;'
        svgCache.set(url, svgEl.outerHTML)
      } else {
        svgCache.set(url, null)
      }
    } catch (_e) {
      svgCache.set(url, null)
    }
  }
  const cached = svgCache.get(url)
  if (!cached) return null
  const parser = new DOMParser()
  const doc = parser.parseFromString(cached, 'image/svg+xml')
  return doc.querySelector('svg')
}
