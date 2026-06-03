/**
 * PaintModel.js — pure data-transformation layer for the color picker.
 * No DOM side effects; all functions are pure utilities.
 */

import Paint from '@svgedit/svgcanvas/core/paint.js'

// ─── Color math ─────────────────────────────────────────────────────────────

/** @param {number} h 0-360  @param {number} s 0-100  @param {number} v 0-100 */
export function hsvToRgb (h, s, v) {
  const s1 = s / 100
  const v1 = v / 100
  const c = v1 * s1
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v1 - c
  let r = 0; let g = 0; let b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c } else if (h < 180) { g = c; b = x } else if (h < 240) { g = x; b = c } else if (h < 300) { r = x; b = c } else { r = c; b = x }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  }
}

/** @param {number} r 0-255 @param {number} g 0-255 @param {number} b 0-255 */
export function rgbToHsv (r, g, b) {
  const r1 = r / 255; const g1 = g / 255; const b1 = b / 255
  const max = Math.max(r1, g1, b1)
  const min = Math.min(r1, g1, b1)
  const delta = max - min
  let h = 0
  if (delta !== 0) {
    if (max === r1) h = 60 * (((g1 - b1) / delta) % 6)
    else if (max === g1) h = 60 * ((b1 - r1) / delta + 2)
    else h = 60 * ((r1 - g1) / delta + 4)
  }
  if (h < 0) h += 360
  return {
    h: Math.round(h),
    s: max === 0 ? 0 : Math.round((delta / max) * 100),
    v: Math.round(max * 100)
  }
}

/** Hex string (without #) → { h, s, v } */
export function hexToHsv (hex) {
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return rgbToHsv(r, g, b)
}

/** { h, s, v } → hex string (without #) */
export function hsvToHex (h, s, v) {
  const { r, g, b } = hsvToRgb(h, s, v)
  return [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
}

/** alpha 0-100 → 2-char hex (e.g. 100→'ff', 50→'80', 0→'00') */
export function alphaToHex (alpha) {
  return Math.round((alpha / 100) * 255).toString(16).padStart(2, '0')
}

/** Blend two hex colors (without #) by fraction t 0-1 (0 = a, 1 = b) */
function blendHex (a, b, t) {
  const ra = parseInt(a.slice(0, 2), 16)
  const ga = parseInt(a.slice(2, 4), 16)
  const ba = parseInt(a.slice(4, 6), 16)
  const rb = parseInt(b.slice(0, 2), 16)
  const gb = parseInt(b.slice(2, 4), 16)
  const bb = parseInt(b.slice(4, 6), 16)
  const r = Math.round(ra + (rb - ra) * t)
  const g = Math.round(ga + (gb - ga) * t)
  const bl = Math.round(ba + (bb - ba) * t)
  return [r, g, bl].map(x => x.toString(16).padStart(2, '0')).join('')
}

/**
 * Interpolate a new stop color at `position` (0-100) from existing sorted stops.
 * @param {{color:string,position:number,alpha:number}[]} stops sorted by position
 * @param {number} position 0-100
 */
export function interpolateStopColor (stops, position) {
  if (!stops.length) return '808080'
  if (position <= stops[0].position) return stops[0].color
  if (position >= stops[stops.length - 1].position) return stops[stops.length - 1].color
  for (let i = 0; i < stops.length - 1; i++) {
    const s0 = stops[i]; const s1 = stops[i + 1]
    if (position >= s0.position && position <= s1.position) {
      const span = s1.position - s0.position
      const t = span === 0 ? 0 : (position - s0.position) / span
      return blendHex(s0.color, s1.color, t)
    }
  }
  return stops[stops.length - 1].color
}

// ─── Gradient geometry ───────────────────────────────────────────────────────

/**
 * Convert dial angle (0=up, clockwise) to SVG gradient x1/y1/x2/y2 (0-1 range).
 * @param {number} angleDeg
 */
export function angleToCoords (angleDeg) {
  const a = angleDeg * (Math.PI / 180)
  return {
    x1: (0.5 - Math.sin(a) * 0.5).toFixed(4),
    y1: (0.5 + Math.cos(a) * 0.5).toFixed(4),
    x2: (0.5 + Math.sin(a) * 0.5).toFixed(4),
    y2: (0.5 - Math.cos(a) * 0.5).toFixed(4)
  }
}

/**
 * Convert SVG x1/y1/x2/y2 back to dial angle in degrees.
 * @param {{x1:string|number,y1:string|number,x2:string|number,y2:string|number}} coords
 */
export function coordsToAngle ({ x1, y1, x2, y2 }) {
  const dx = parseFloat(x2) - parseFloat(x1)
  const dy = parseFloat(y1) - parseFloat(y2) // SVG y-axis is inverted relative to math
  let angle = Math.atan2(dx, dy) * (180 / Math.PI)
  if (angle < 0) angle += 360
  return Math.round(angle)
}

// ─── Stop extraction from SVG gradient element ───────────────────────────────

/**
 * Extract stops from an SVG gradient element.
 * @param {SVGGradientElement} el
 * @returns {{color:string,position:number,alpha:number}[]}
 */
function extractStops (el) {
  const stopEls = Array.from(el.querySelectorAll('stop'))
  return stopEls.map(stop => {
    const offset = parseFloat(stop.getAttribute('offset') || '0')
    const style = stop.getAttribute('style') || ''
    const colorMatch = style.match(/stop-color:\s*#?([0-9a-fA-F]{6})/)
    const opacMatch = style.match(/stop-opacity:\s*([\d.]+)/)
    // Also check presentation attributes as fallback
    const colorAttr = stop.getAttribute('stop-color')
    const opacAttr = stop.getAttribute('stop-opacity')
    let color = '000000'
    if (colorMatch) {
      color = colorMatch[1].toLowerCase()
    } else if (colorAttr) {
      color = colorAttr.replace('#', '').toLowerCase()
    }
    let alpha = 100
    if (opacMatch) {
      alpha = Math.round(parseFloat(opacMatch[1]) * 100)
    } else if (opacAttr) {
      alpha = Math.round(parseFloat(opacAttr) * 100)
    }
    return {
      color,
      position: Math.round(offset * 100),
      alpha: Math.max(0, Math.min(100, alpha))
    }
  })
}

// ─── Paint → dialog state ────────────────────────────────────────────────────

/**
 * Convert a Paint object to internal dialog state.
 * @param {Paint} paint
 */
export function paintToState (paint) {
  if (!paint || paint.type === 'none' || paint.type === 'solidColor') {
    const hex = (paint?.solidColor && paint.solidColor !== 'none')
      ? paint.solidColor
      : '2962ff'
    return {
      tab: 'solid',
      hex,
      alpha: paint?.alpha ?? 100
    }
  }

  const isLinear = paint.type === 'linearGradient'
  const el = isLinear ? paint.linearGradient : paint.radialGradient
  if (!el) {
    return { tab: 'solid', hex: '2962ff', alpha: 100 }
  }

  const stops = extractStops(el)
  const safeStops = stops.length >= 2
    ? stops
    : [
        { color: '000000', position: 0, alpha: 100 },
        { color: 'ffffff', position: 100, alpha: 100 }
      ]

  const monoColor = el.getAttribute('data-monocolor')
  const monoMode = el.getAttribute('data-monomode') || 'white'
  const hasMonoData = !!monoColor
  const mode = hasMonoData ? 'mono' : (safeStops.length > 2 ? 'multi' : 'two')

  const spreadMethod = el.getAttribute('spreadMethod') || 'pad'
  const alpha = paint.alpha ?? 100

  if (isLinear) {
    const x1 = el.getAttribute('x1') ?? '0'
    const y1 = el.getAttribute('y1') ?? '0'
    const x2 = el.getAttribute('x2') ?? '1'
    const y2 = el.getAttribute('y2') ?? '0'
    const angle = coordsToAngle({ x1, y1, x2, y2 })
    return {
      tab: 'linear',
      mode,
      stops: safeStops,
      angle,
      spreadMethod,
      alpha,
      ...(hasMonoData ? { monoColor, monoMode } : {})
    }
  } else {
    // radial
    const cx = parseFloat(el.getAttribute('cx') ?? '0.5')
    const cy = parseFloat(el.getAttribute('cy') ?? '0.5')
    const fx = parseFloat(el.getAttribute('fx') ?? String(cx))
    const fy = parseFloat(el.getAttribute('fy') ?? String(cy))
    const r = parseFloat(el.getAttribute('r') ?? '0.5')
    const ellip = parseFloat(el.getAttribute('data-ellip') ?? '1')
    const angle = parseFloat(el.getAttribute('data-angle') ?? '0')
    const matchCenter = fx === cx && fy === cy
    return {
      tab: 'radial',
      mode,
      stops: safeStops,
      cx,
      cy,
      fx,
      fy,
      r: Math.round(r * 100),
      ellip: Math.round(ellip * 100),
      angle: Math.round(angle),
      spreadMethod,
      alpha,
      matchCenter,
      ...(hasMonoData ? { monoColor, monoMode } : {})
    }
  }
}

// ─── Dialog state → Paint ────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Build a `<stop>` SVG element */
function makeStop (doc, color, position, alpha) {
  const stop = doc.createElementNS(SVG_NS, 'stop')
  stop.setAttribute('offset', (position / 100).toFixed(4))
  stop.setAttribute('style', `stop-color:#${color};stop-opacity:${(alpha / 100).toFixed(4)}`)
  return stop
}

/**
 * Convert dialog state to a Paint object.
 * @param {object} state
 */
export function stateToPaint (state) {
  if (state.tab === 'solid') {
    return new Paint({ solidColor: state.solidColor || state.hex, alpha: state.alpha })
  }

  const doc = document
  const isLinear = state.tab === 'linear'
  const tag = isLinear ? 'linearGradient' : 'radialGradient'
  const el = doc.createElementNS(SVG_NS, tag)

  // Geometry
  if (isLinear) {
    const coords = angleToCoords(state.angle ?? 0)
    el.setAttribute('x1', coords.x1)
    el.setAttribute('y1', coords.y1)
    el.setAttribute('x2', coords.x2)
    el.setAttribute('y2', coords.y2)
    el.setAttribute('gradientUnits', 'objectBoundingBox')
  } else {
    const cx = (state.cx ?? 0.5).toFixed(4)
    const cy = (state.cy ?? 0.5).toFixed(4)
    const fx = state.matchCenter ? cx : (state.fx ?? state.cx ?? 0.5).toFixed(4)
    const fy = state.matchCenter ? cy : (state.fy ?? state.cy ?? 0.5).toFixed(4)
    const r = ((state.r ?? 50) / 100).toFixed(4)
    el.setAttribute('cx', cx)
    el.setAttribute('cy', cy)
    el.setAttribute('fx', fx)
    el.setAttribute('fy', fy)
    el.setAttribute('r', r)
    el.setAttribute('gradientUnits', 'objectBoundingBox')
    if (state.ellip !== undefined && state.ellip !== 100) {
      el.setAttribute('data-ellip', (state.ellip / 100).toFixed(4))
    }
    if (state.angle) {
      el.setAttribute('data-angle', String(state.angle))
    }
  }

  el.setAttribute('spreadMethod', state.spreadMethod || 'pad')

  // Stops
  let stops = state.stops || [
    { color: '000000', position: 0, alpha: 100 },
    { color: 'ffffff', position: 100, alpha: 100 }
  ]

  // In mono mode, auto-generate the second stop
  if (state.mode === 'mono') {
    const firstStop = stops[0] || { color: '000000', position: 0, alpha: 100 }
    const monoMode = state.monoMode || 'white'
    let secondColor; let secondAlpha = 100
    if (monoMode === 'white') { secondColor = 'ffffff' } else if (monoMode === 'black') { secondColor = '000000' } else { secondColor = firstStop.color; secondAlpha = 0 }
    stops = [
      { color: firstStop.color, position: 0, alpha: firstStop.alpha },
      { color: secondColor, position: 100, alpha: secondAlpha }
    ]
    el.setAttribute('data-monocolor', firstStop.color)
    el.setAttribute('data-monomode', monoMode)
  }

  for (const stop of stops) {
    el.appendChild(makeStop(doc, stop.color, stop.position, stop.alpha))
  }

  if (isLinear) {
    return new Paint({ linearGradient: el, alpha: state.alpha ?? 100 })
  } else {
    return new Paint({ radialGradient: el, alpha: state.alpha ?? 100 })
  }
}
