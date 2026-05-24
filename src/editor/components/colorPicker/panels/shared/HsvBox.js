/**
 * HsvBox.js — HSV color picker with hue strip, alpha strip, numeric inputs,
 * and preset palette. Factory function — not a custom element.
 */

import { hsvToRgb, rgbToHsv, hexToHsv, hsvToHex } from '../../PaintModel.js'

const PRESETS = [
  '#000000', '#3F3F3F', '#7A7A7A', '#B5B5B5', '#D5D5D5', '#E5E5E5', '#F2F2F2', '#FFFFFF',
  '#7F0000', '#B71C1C', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#0A84FF',
  '#5856D6', '#AF52DE', '#FF2D55', '#1B5E20', '#004D40', '#003F66', '#0D1B5E', '#2E1065',
  '#FFB3B3', '#FFE0B5', '#FFF0B5', '#C9F2D5', '#B5EFEB', '#C2E5EE', '#C7D7FF', '#D9D7F5',
  '#FFC9D6', '#7B3F00', '#A66A2E', '#C99063', '#D7B98C', '#EDD8B5', '#F5E4C3', '#4A0D2E'
]

/**
 * Create an HSV color picker widget.
 * @param {string} initialHex  6-char hex without #
 * @param {number} initialAlpha  0-100
 * @param {string} [currentHex]  original/current color for the split preview
 * @returns {HTMLElement & { hex: string, alpha: number, setHex(h:string):void, setAlpha(a:number):void }}
 */
export function createHsvBox (initialHex, initialAlpha = 100, currentHex = null) {
  const safeHex = /^[0-9a-fA-F]{6}$/.test(initialHex) ? initialHex : '2962ff'
  const { h: initH, s: initS, v: initV } = hexToHsv(safeHex)
  let state = { h: initH, s: initS, v: initV, a: initialAlpha }
  const origHex = currentHex || safeHex

  // ── DOM structure ──────────────────────────────────────────────────────────
  const container = document.createElement('div')
  container.style.cssText = 'display:flex;flex:1;min-width:0;gap:22px;align-items:flex-start;'
  container.innerHTML = `
    <div class="cp-canvas-col">
      <div class="cp-canvas-row">
        <div class="cp-hsv" tabindex="0" role="slider" aria-label="Color saturation and brightness">
          <div class="cp-hsv-hue"></div>
          <div class="cp-hsv-sat"></div>
          <div class="cp-hsv-val"></div>
          <div class="cp-hsv-dot"></div>
        </div>
        <div class="cp-hue" tabindex="0" role="slider" aria-label="Hue">
          <div class="cp-hue-grad"></div>
          <div class="cp-hue-marker"></div>
        </div>
      </div>
      <div class="cp-alpha-row">
        <span class="cp-alpha-icon" aria-hidden="true"><em>A</em></span>
        <div class="cp-alpha" tabindex="0" role="slider" aria-label="Alpha" style="position:relative;flex:1;height:16px;">
          <div class="cp-alpha-grad"></div>
          <div class="cp-alpha-marker"></div>
        </div>
      </div>
    </div>
    <div class="cp-side-col">
      <div class="cp-preview">
        <div class="cp-preview-row">
          <div class="cp-preview-cell cp-preview-current">
            <div class="cp-preview-chk"></div>
            <div class="cp-preview-fill" data-role="current-fill"></div>
          </div>
          <div class="cp-preview-cell cp-preview-new">
            <div class="cp-preview-chk"></div>
            <div class="cp-preview-fill" data-role="new-fill"></div>
          </div>
        </div>
        <div class="cp-preview-labels">
          <span>Current</span><span>New</span>
        </div>
      </div>
      <div class="cp-inputs">
        <div class="cp-input-group">
          <label class="cp-num" data-field="h"><span class="cp-num-label">H</span><input class="cp-num-value" type="number" min="0" max="360" style="all:unset;flex:1;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;"><span class="cp-num-unit">°</span></label>
          <label class="cp-num" data-field="s"><span class="cp-num-label">S</span><input class="cp-num-value" type="number" min="0" max="100" style="all:unset;flex:1;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;"><span class="cp-num-unit">%</span></label>
          <label class="cp-num" data-field="v"><span class="cp-num-label">V</span><input class="cp-num-value" type="number" min="0" max="100" style="all:unset;flex:1;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;"><span class="cp-num-unit">%</span></label>
        </div>
        <div class="cp-input-group">
          <label class="cp-num" data-field="r"><span class="cp-num-label">R</span><input class="cp-num-value" type="number" min="0" max="255" style="all:unset;flex:1;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;"></label>
          <label class="cp-num" data-field="g"><span class="cp-num-label">G</span><input class="cp-num-value" type="number" min="0" max="255" style="all:unset;flex:1;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;"></label>
          <label class="cp-num" data-field="b"><span class="cp-num-label">B</span><input class="cp-num-value" type="number" min="0" max="255" style="all:unset;flex:1;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;"></label>
        </div>
        <div class="cp-input-group" style="grid-template-columns:1fr 1fr 2fr;">
          <label class="cp-num" data-field="a"><span class="cp-num-label">A</span><input class="cp-num-value" type="number" min="0" max="100" style="all:unset;flex:1;text-align:right;font-size:13px;font-weight:500;font-variant-numeric:tabular-nums;"><span class="cp-num-unit">%</span></label>
          <div style="display:none"></div>
          <label class="cp-num cp-hex" data-field="hex"><span class="cp-num-label">#</span><input class="cp-num-value" type="text" maxlength="6" style="all:unset;flex:1;font-size:13px;font-weight:500;font-family:ui-monospace,monospace;letter-spacing:-0.005em;"></label>
        </div>
      </div>
      <div class="cp-preset"></div>
    </div>
  `

  // ── Element refs ───────────────────────────────────────────────────────────
  const hsvBox = container.querySelector('.cp-hsv')
  const hsvHue = container.querySelector('.cp-hsv-hue')
  const hsvDot = container.querySelector('.cp-hsv-dot')
  const hueStrip = container.querySelector('.cp-hue')
  const hueMarker = container.querySelector('.cp-hue-marker')
  const alphaStrip = container.querySelector('.cp-alpha')
  const alphaGrad = container.querySelector('.cp-alpha-grad')
  const alphaMarker = container.querySelector('.cp-alpha-marker')
  const currentFill = container.querySelector('[data-role="current-fill"]')
  const newFill = container.querySelector('[data-role="new-fill"]')
  const presetGrid = container.querySelector('.cp-preset')

  // Input refs by field name
  const inputs = {}
  container.querySelectorAll('.cp-num').forEach(label => {
    const field = label.dataset.field
    inputs[field] = label.querySelector('input')
  })

  // ── Preset palette ─────────────────────────────────────────────────────────
  presetGrid.className = 'cp-preset'
  PRESETS.forEach(color => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'cp-preset-swatch'
    btn.style.background = color
    btn.title = color
    btn.addEventListener('click', () => {
      const hex = color.replace('#', '')
      setHexInternal(hex)
      _emit()
    })
    presetGrid.appendChild(btn)
  })

  // ── Visuals update ─────────────────────────────────────────────────────────
  function _updateVisuals () {
    const { h, s, v, a } = state
    const hex = hsvToHex(h, s, v)
    const { r, g, b } = hsvToRgb(h, s, v)
    const rgbaFull = `rgba(${r},${g},${b},${a / 100})`
    const rgbFull = `rgb(${r},${g},${b})`

    // HSV box
    hsvHue.style.background = `hsl(${h},100%,50%)`
    hsvDot.style.left = `${s}%`
    hsvDot.style.top = `${(1 - v / 100) * 100}%`

    // Hue strip
    hueMarker.style.top = `${(h / 360) * 100}%`

    // Alpha strip
    alphaGrad.style.background = `linear-gradient(to right, transparent, ${rgbFull})`
    alphaMarker.style.left = `${a}%`

    // Preview
    currentFill.style.background = `#${origHex}`
    newFill.style.background = rgbaFull

    // Inputs
    if (inputs.h && document.activeElement !== inputs.h) inputs.h.value = h
    if (inputs.s && document.activeElement !== inputs.s) inputs.s.value = s
    if (inputs.v && document.activeElement !== inputs.v) inputs.v.value = v
    if (inputs.r && document.activeElement !== inputs.r) inputs.r.value = r
    if (inputs.g && document.activeElement !== inputs.g) inputs.g.value = g
    if (inputs.b && document.activeElement !== inputs.b) inputs.b.value = b
    if (inputs.a && document.activeElement !== inputs.a) inputs.a.value = a
    if (inputs.hex && document.activeElement !== inputs.hex) inputs.hex.value = hex

    // Selected preset highlight
    presetGrid.querySelectorAll('.cp-preset-swatch').forEach(btn => {
      btn.classList.toggle('is-selected', btn.title.toLowerCase() === '#' + hex)
    })
  }

  function _emit () {
    const hex = hsvToHex(state.h, state.s, state.v)
    container.dispatchEvent(new CustomEvent('color-change', {
      detail: { ...state, hex },
      bubbles: true
    }))
  }

  // ── Internal setters ───────────────────────────────────────────────────────
  function setHexInternal (hex) {
    const { h, s, v } = hexToHsv(hex)
    state.h = h; state.s = s; state.v = v
    _updateVisuals()
  }

  // ── Drag helpers ───────────────────────────────────────────────────────────
  function makeDrag (el, onMove) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      onMove(e)
      const move = (me) => { onMove(me); _emit() }
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', () => el.removeEventListener('pointermove', move), { once: true })
    })
  }

  // HSV box drag
  makeDrag(hsvBox, (e) => {
    const rect = hsvBox.getBoundingClientRect()
    state.s = Math.round(Math.min(100, Math.max(0, (e.clientX - rect.left) / rect.width * 100)))
    state.v = Math.round(Math.min(100, Math.max(0, (1 - (e.clientY - rect.top) / rect.height) * 100)))
    _updateVisuals()
  })

  // Hue strip drag
  makeDrag(hueStrip, (e) => {
    const rect = hueStrip.getBoundingClientRect()
    state.h = Math.round(Math.min(360, Math.max(0, (e.clientY - rect.top) / rect.height * 360)))
    _updateVisuals()
  })

  // Alpha strip drag
  makeDrag(alphaStrip, (e) => {
    const rect = alphaStrip.getBoundingClientRect()
    state.a = Math.round(Math.min(100, Math.max(0, (e.clientX - rect.left) / rect.width * 100)))
    _updateVisuals()
  })

  // HSV box keyboard navigation
  hsvBox.addEventListener('keydown', (e) => {
    const step = e.key.startsWith('Page') ? 10 : 1
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      state.s = Math.min(100, Math.max(0, state.s + (e.key === 'ArrowRight' ? step : -step)))
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      state.v = Math.min(100, Math.max(0, state.v + (e.key === 'ArrowUp' ? step : -step)))
    } else { return }
    e.preventDefault()
    _updateVisuals(); _emit()
  })

  hueStrip.addEventListener('keydown', (e) => {
    const step = e.key.startsWith('Page') ? 36 : 1
    if (e.key === 'ArrowUp') { state.h = Math.max(0, state.h - step) } else if (e.key === 'ArrowDown') { state.h = Math.min(360, state.h + step) } else { return }
    e.preventDefault()
    _updateVisuals(); _emit()
  })

  // ── Number input wiring ────────────────────────────────────────────────────
  function wireInput (field, parse, clamp, apply) {
    const input = inputs[field]
    if (!input) return
    input.addEventListener('input', () => {
      const raw = parse(input.value)
      if (raw === null || raw === undefined) return
      if (typeof raw === 'number' && !Number.isFinite(raw)) return
      const val = clamp(raw)
      if (val === null || val === undefined) return
      apply(val)
      _updateVisuals(); _emit()
    })
    input.addEventListener('focus', () => {
      container.querySelectorAll('.cp-num').forEach(n => n.classList.remove('is-active'))
      input.closest('.cp-num')?.classList.add('is-active')
    })
    input.addEventListener('blur', () => {
      input.closest('.cp-num')?.classList.remove('is-active')
    })
  }

  wireInput('h', parseFloat, v => Math.min(360, Math.max(0, Math.round(v))), v => { state.h = v })
  wireInput('s', parseFloat, v => Math.min(100, Math.max(0, Math.round(v))), v => { state.s = v })
  wireInput('v', parseFloat, v => Math.min(100, Math.max(0, Math.round(v))), v => { state.v = v })
  wireInput('r', parseFloat, v => Math.min(255, Math.max(0, Math.round(v))), v => {
    const { g: cg, b: cb } = hsvToRgb(state.h, state.s, state.v)
    const hsv = rgbToHsv(v, cg, cb)
    state.h = hsv.h; state.s = hsv.s; state.v = hsv.v
  })
  wireInput('g', parseFloat, v => Math.min(255, Math.max(0, Math.round(v))), v => {
    const { r: cr, b: cb } = hsvToRgb(state.h, state.s, state.v)
    const hsv = rgbToHsv(cr, v, cb); state.h = hsv.h; state.s = hsv.s; state.v = hsv.v
  })
  wireInput('b', parseFloat, v => Math.min(255, Math.max(0, Math.round(v))), v => {
    const { r: cr, g: cg } = hsvToRgb(state.h, state.s, state.v)
    const hsv = rgbToHsv(cr, cg, v); state.h = hsv.h; state.s = hsv.s; state.v = hsv.v
  })
  wireInput('a', parseFloat, v => Math.min(100, Math.max(0, Math.round(v))), v => { state.a = v })
  wireInput('hex',
    s => {
      const clean = s.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
      return clean.length === 6 ? clean : null
    },
    v => v, // clamp is identity; parse already validates length
    v => { const hsv = hexToHsv(v); state.h = hsv.h; state.s = hsv.s; state.v = hsv.v }
  )

  // ── Public API ─────────────────────────────────────────────────────────────
  Object.defineProperty(container, 'hex', {
    get: () => hsvToHex(state.h, state.s, state.v)
  })
  Object.defineProperty(container, 'alpha', {
    get: () => state.a
  })

  container.setHex = (hex) => {
    setHexInternal(hex.replace('#', ''))
    _emit()
  }
  container.setAlpha = (a) => {
    state.a = Math.min(100, Math.max(0, Math.round(a)))
    _updateVisuals()
    _emit()
  }

  // Initial render
  _updateVisuals()
  return container
}
