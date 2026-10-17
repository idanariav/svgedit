/**
 * HsvBox.ts — HSV color picker with hue strip, alpha strip, numeric inputs,
 * and preset palette. Factory function — not a custom element.
 */

import { hexToHsv, hexToRgb, rgbToHex, hsvToHex } from '../../PaintModel.ts'

// 72 presets in a 12-column grid: 5 rows of saturated colors (one column per hue,
// one row per lightness level) + 1 row of grays from white to black.
// Hue order: red → orange → yellow → chartreuse → green → spring → cyan → azure → blue → violet → magenta → rose
const PRESETS = [
  // Row 1 — tints (s=33%, v=100%)
  '#FFABAB', '#FFD5AB', '#FFFFAB', '#D5FFAB', '#ABFFAB', '#ABFFD5',
  '#ABFFFF', '#ABD5FF', '#ABABFF', '#D5ABFF', '#FFABFF', '#FFABD5',
  // Row 2 — medium saturation (s=66%, v=100%)
  '#FF5757', '#FFAB57', '#FFFF57', '#ABFF57', '#57FF57', '#57FFAB',
  '#57FFFF', '#57ABFF', '#5757FF', '#AB57FF', '#FF57FF', '#FF57AB',
  // Row 3 — pure hues (s=100%, v=100%)
  '#FF0000', '#FF8000', '#FFFF00', '#80FF00', '#00FF00', '#00FF80',
  '#00FFFF', '#0080FF', '#0000FF', '#8000FF', '#FF00FF', '#FF0080',
  // Row 4 — medium dark (s=100%, v=75%)
  '#BF0000', '#BF6000', '#BFBF00', '#60BF00', '#00BF00', '#00BF60',
  '#00BFBF', '#0060BF', '#0000BF', '#6000BF', '#BF00BF', '#BF0060',
  // Row 5 — dark shades (s=100%, v=50%)
  '#800000', '#804000', '#808000', '#408000', '#008000', '#008040',
  '#008080', '#004080', '#000080', '#400080', '#800080', '#800040',
  // Row 6 — neutrals: white → black
  '#FFFFFF', '#E8E8E8', '#D1D1D1', '#BABABA', '#A3A3A3', '#8C8C8C',
  '#737373', '#5C5C5C', '#454545', '#2E2E2E', '#171717', '#000000'
]

export type HsvBoxElement = HTMLDivElement & { hex: string, alpha: number, setHex(h:string):void, setAlpha(a:number):void }

/**
 * Create an HSV color picker widget.
 * @param initialHex 6-char hex without #
 * @param initialAlpha 0-100
 * @param currentHex original/current color for the split preview
 */
export function createHsvBox (initialHex: string, initialAlpha: number = 100, currentHex: string | null = null): HsvBoxElement {
  const safeHex = /^[0-9a-fA-F]{6}$/.test(initialHex) ? initialHex : '2962ff'
  const { h: initH, s: initS, v: initV } = hexToHsv(safeHex)
  // `hex` is the canonical exact color; h/s/v are rounded integers kept only
  // for the slider/number-input UI. Deriving hex from h/s/v on every read
  // (instead of keeping it here) loses precision — see hex round-trip bug.
  const state = { h: initH, s: initS, v: initV, a: initialAlpha, hex: safeHex }
  const origHex = currentHex || safeHex

  // ── DOM structure ──────────────────────────────────────────────────────────
  const container = document.createElement('div') as HsvBoxElement
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
  const hsvBox = container.querySelector('.cp-hsv') as HTMLElement
  const hsvHue = container.querySelector('.cp-hsv-hue') as HTMLDivElement
  const hsvDot = container.querySelector('.cp-hsv-dot') as HTMLDivElement
  const hueStrip = container.querySelector('.cp-hue') as HTMLElement
  const hueMarker = container.querySelector('.cp-hue-marker') as HTMLDivElement
  const alphaStrip = container.querySelector('.cp-alpha') as HTMLElement
  const alphaGrad = container.querySelector('.cp-alpha-grad') as HTMLDivElement
  const alphaMarker = container.querySelector('.cp-alpha-marker') as HTMLDivElement
  const currentFill = container.querySelector('[data-role="current-fill"]') as HTMLElement
  const newFill = container.querySelector('[data-role="new-fill"]') as HTMLElement
  const presetGrid = container.querySelector('.cp-preset') as HTMLDivElement

  // Input refs by field name
  const inputs: Record<string, HTMLInputElement | null> = {}
  ;(container.querySelectorAll('.cp-num') as NodeListOf<HTMLElement>).forEach(label => {
    const field = String(label.dataset.field)
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
    const { h, s, v, a, hex } = state
    const { r, g, b } = hexToRgb(hex)
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
    if (inputs.h && document.activeElement !== inputs.h) inputs.h.value = String(h)
    if (inputs.s && document.activeElement !== inputs.s) inputs.s.value = String(s)
    if (inputs.v && document.activeElement !== inputs.v) inputs.v.value = String(v)
    if (inputs.r && document.activeElement !== inputs.r) inputs.r.value = String(r)
    if (inputs.g && document.activeElement !== inputs.g) inputs.g.value = String(g)
    if (inputs.b && document.activeElement !== inputs.b) inputs.b.value = String(b)
    if (inputs.a && document.activeElement !== inputs.a) inputs.a.value = String(a)
    if (inputs.hex && document.activeElement !== inputs.hex) inputs.hex.value = String(hex)

    // Selected preset highlight
    ;(presetGrid.querySelectorAll('.cp-preset-swatch') as NodeListOf<HTMLElement>).forEach(btn => {
      btn.classList.toggle('is-selected', btn.title.toLowerCase() === '#' + hex.toLowerCase())
    })
  }

  function _emit () {
    container.dispatchEvent(new CustomEvent('color-change', {
      detail: { ...state },
      bubbles: true
    }))
  }

  // ── Internal setters ───────────────────────────────────────────────────────
  // Recompute the rounded h/s/v used by the sliders from the canonical hex.
  function _syncHsvFromHex () {
    const { h, s, v } = hexToHsv(state.hex)
    state.h = h; state.s = s; state.v = v
  }

  function setHexInternal (hex: string) {
    state.hex = hex
    _syncHsvFromHex()
    _updateVisuals()
  }

  // ── Drag helpers ───────────────────────────────────────────────────────────
  function makeDrag (el: HTMLElement, onMove: (e: PointerEvent) => void) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      onMove(e)
      const move = (me: PointerEvent) => { onMove(me); _emit() }
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', () => el.removeEventListener('pointermove', move), { once: true })
    })
  }

  // HSV box drag
  makeDrag(hsvBox, (e) => {
    const rect = hsvBox.getBoundingClientRect()
    state.s = Math.round(Math.min(100, Math.max(0, (e.clientX - rect.left) / rect.width * 100)))
    state.v = Math.round(Math.min(100, Math.max(0, (1 - (e.clientY - rect.top) / rect.height) * 100)))
    state.hex = hsvToHex(state.h, state.s, state.v)
    _updateVisuals()
  })

  // Hue strip drag
  makeDrag(hueStrip, (e) => {
    const rect = hueStrip.getBoundingClientRect()
    state.h = Math.round(Math.min(360, Math.max(0, (e.clientY - rect.top) / rect.height * 360)))
    state.hex = hsvToHex(state.h, state.s, state.v)
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
    state.hex = hsvToHex(state.h, state.s, state.v)
    _updateVisuals(); _emit()
  })

  hueStrip.addEventListener('keydown', (e) => {
    const step = e.key.startsWith('Page') ? 36 : 1
    if (e.key === 'ArrowUp') { state.h = Math.max(0, state.h - step) } else if (e.key === 'ArrowDown') { state.h = Math.min(360, state.h + step) } else { return }
    e.preventDefault()
    state.hex = hsvToHex(state.h, state.s, state.v)
    _updateVisuals(); _emit()
  })

  // ── Number input wiring ────────────────────────────────────────────────────
  /** @param field the `data-field` of the input */
  function wireInput<T> (field: string, parse: (text: string) => T | null | undefined, clamp: (raw: T) => T | null | undefined, apply: (value: T) => void) {
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

  wireInput('h', parseFloat, (v: number) => Math.min(360, Math.max(0, Math.round(v))), (v: number) => { state.h = v; state.hex = hsvToHex(state.h, state.s, state.v) })
  wireInput('s', parseFloat, (v: number) => Math.min(100, Math.max(0, Math.round(v))), (v: number) => { state.s = v; state.hex = hsvToHex(state.h, state.s, state.v) })
  wireInput('v', parseFloat, (v: number) => Math.min(100, Math.max(0, Math.round(v))), (v: number) => { state.v = v; state.hex = hsvToHex(state.h, state.s, state.v) })
  wireInput('r', parseFloat, (v: number) => Math.min(255, Math.max(0, Math.round(v))), (v: number) => {
    const { g: cg, b: cb } = hexToRgb(state.hex)
    state.hex = rgbToHex(v, cg, cb)
    _syncHsvFromHex()
  })
  wireInput('g', parseFloat, (v: number) => Math.min(255, Math.max(0, Math.round(v))), (v: number) => {
    const { r: cr, b: cb } = hexToRgb(state.hex)
    state.hex = rgbToHex(cr, v, cb)
    _syncHsvFromHex()
  })
  wireInput('b', parseFloat, (v: number) => Math.min(255, Math.max(0, Math.round(v))), (v: number) => {
    const { r: cr, g: cg } = hexToRgb(state.hex)
    state.hex = rgbToHex(cr, cg, v)
    _syncHsvFromHex()
  })
  wireInput('a', parseFloat, (v: number) => Math.min(100, Math.max(0, Math.round(v))), (v: number) => { state.a = v })
  wireInput('hex',
    (s: string) => {
      const clean = s.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
      return clean.length === 6 ? clean : null
    },
    (v: string) => v, // clamp is identity; parse already validates length
    (v: string) => { state.hex = v; _syncHsvFromHex() }
  )
  const hexInput = inputs.hex
  hexInput?.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text') ?? ''
    const clean = text.replace(/#/g, '').slice(0, 6)
    if (!clean) return
    e.preventDefault()
    hexInput.value = clean
    hexInput.dispatchEvent(new Event('input'))
  })

  // ── Public API ─────────────────────────────────────────────────────────────
  Object.defineProperty(container, 'hex', {
    get: () => state.hex
  })
  Object.defineProperty(container, 'alpha', {
    get: () => state.a
  })

  container.setHex = (hex: string) => {
    setHexInternal(hex.replace('#', ''))
    _emit()
  }
  container.setAlpha = (a: number) => {
    state.a = Math.min(100, Math.max(0, Math.round(a)))
    _updateVisuals()
    _emit()
  }

  // Initial render
  _updateVisuals()
  return container
}
