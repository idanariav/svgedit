/**
 * @file ext-color-shift.js
 *
 * @license Apache-2.0
 *
 * Adds a "Color Shift" section to the right-hand side panel (next to Layers).
 * Provides four numeric inputs that shift the colours of the current
 * selection by a relative delta from a per-selection snapshot:
 *
 *   H  Hue rotation, −180° to 180°
 *   S  Saturation delta, ±100 percentage points
 *   L  Lightness delta, ±100 percentage points
 *   T  Transparency delta, ±100 (positive = more transparent)
 *
 * Plus Fill and Stroke toggles to scope the shift to one channel or both,
 * and a Reset button that reverts to the snapshot.
 *
 * On every selection change the snapshot is recaptured from each element's
 * current `fill`, `stroke`, `fill-opacity`, `stroke-opacity` attributes, and
 * the four inputs zero. Each input change rebuilds the element state from
 *   snapshot + current delta — so successive shifts overwrite each other
 * cleanly rather than compounding, and Reset (delta=0) restores the snapshot.
 */

const name = 'color-shift'

const loadExtensionTranslation = async function (svgEditor) {
  let translationModule
  const lang = svgEditor.configObj.pref('lang')
  try {
    translationModule = await import(`./locale/${lang}.js`)
  } catch (_error) {
    console.warn(`Missing translation (${lang}) for ${name} - using 'en'`)
    translationModule = await import('./locale/en.js')
  }
  svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
}

// ── Colour helpers ────────────────────────────────────────────────────────

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

let _namedColorCtx
const parseNamedColor = (str) => {
  if (!_namedColorCtx) _namedColorCtx = document.createElement('canvas').getContext('2d')
  _namedColorCtx.fillStyle = '#000'
  try { _namedColorCtx.fillStyle = str } catch { return null }
  const c = _namedColorCtx.fillStyle
  if (c[0] === '#') return parseColor(c)
  const m = c.match(/^rgba?\(([^)]+)\)$/)
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean)
    return { r: +p[0], g: +p[1], b: +p[2], a: p[3] != null ? +p[3] : 1 }
  }
  return null
}

const parseColor = (str) => {
  if (!str) return null
  const s = String(str).trim().toLowerCase()
  if (s === 'none' || s === 'transparent') return null
  if (s[0] === '#') {
    let h = s.slice(1)
    if (h.length === 3) h = h.split('').map(c => c + c).join('')
    if (h.length === 4) h = h.split('').map(c => c + c).join('')
    if (h.length === 6) {
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 }
    }
    if (h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: parseInt(h.slice(6, 8), 16) / 255
      }
    }
    return null
  }
  let m = s.match(/^rgba?\(([^)]+)\)$/)
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean)
    return { r: +p[0], g: +p[1], b: +p[2], a: p[3] != null ? +p[3] : 1 }
  }
  m = s.match(/^hsla?\(([^)]+)\)$/)
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean)
    const rgb = hslToRgb({ h: +p[0], s: +String(p[1]).replace('%', ''), l: +String(p[2]).replace('%', '') })
    rgb.a = p[3] != null ? +p[3] : 1
    return rgb
  }
  return parseNamedColor(s)
}

const rgbToHsl = ({ r, g, b }) => {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: h * 60, s: s * 100, l: l * 100 }
}

const hue2rgb = (p, q, t) => {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

const hslToRgb = ({ h, s, l }) => {
  const hh = ((h % 360) + 360) % 360 / 360
  const ss = clamp(s, 0, 100) / 100
  const ll = clamp(l, 0, 100) / 100
  if (ss === 0) {
    const v = Math.round(ll * 255)
    return { r: v, g: v, b: v }
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss
  const p = 2 * ll - q
  return {
    r: Math.round(hue2rgb(p, q, hh + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hh) * 255),
    b: Math.round(hue2rgb(p, q, hh - 1 / 3) * 255)
  }
}

const toHex = ({ r, g, b }) => '#' +
  [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')

// ── Extension ─────────────────────────────────────────────────────────────

// Tags that have a paintable fill/stroke worth shifting. `<g>` is excluded —
// its children carry the actual fills.
const PAINTABLE_TAGS = new Set([
  'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'path', 'text', 'tspan', 'foreignObject'
])

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { BatchCommand, ChangeElementCommand } = svgCanvas.history
    const { $id } = svgCanvas
    await loadExtensionTranslation(svgEditor)

    // Per-element baseline. Keyed by element node so multi-select works even
    // when elements have different starting colours.
    const snapshots = new WeakMap()

    const isPaintable = (el) => el && PAINTABLE_TAGS.has(el.tagName)

    const paintableSelection = () =>
      svgCanvas.getSelectedElements().filter(isPaintable)

    const captureSnapshot = (elem) => {
      const fillRaw = elem.getAttribute('fill')
      const strokeRaw = elem.getAttribute('stroke')
      const fill = fillRaw ?? '#000000' // SVG default for non-stroked paints
      const stroke = strokeRaw ?? 'none'
      const fillOpacity = parseFloat(elem.getAttribute('fill-opacity') ?? '1')
      const strokeOpacity = parseFloat(elem.getAttribute('stroke-opacity') ?? '1')
      const fillRgb = parseColor(fill)
      const strokeRgb = parseColor(stroke)
      return {
        fillRaw,
        strokeRaw,
        fill,
        stroke,
        fillOpacity,
        strokeOpacity,
        fillHSL: fillRgb ? rgbToHsl(fillRgb) : null,
        strokeHSL: strokeRgb ? rgbToHsl(strokeRgb) : null
      }
    }

    const ensureSnapshot = (elem) => {
      let s = snapshots.get(elem)
      if (!s) {
        s = captureSnapshot(elem)
        snapshots.set(elem, s)
      }
      return s
    }

    const getValues = () => ({
      h: Number($id('color_shift_h').value) || 0,
      s: Number($id('color_shift_s').value) || 0,
      l: Number($id('color_shift_l').value) || 0,
      t: Number($id('color_shift_t').value) || 0,
      applyFill: $id('color_shift_fill').checked,
      applyStroke: $id('color_shift_stroke').checked
    })

    /**
     * Compute new value for an attribute and, if it differs from the current
     * attribute string, write it and record the old value for undo.
     *
     * `value === null` means "remove the attribute".
     */
    const setAttrIfChanged = (elem, attr, value, oldAttrs) => {
      const current = elem.getAttribute(attr)
      const next = value === null ? null : String(value)
      if (current === next) return
      oldAttrs[attr] = current ?? ''
      if (next === null) elem.removeAttribute(attr)
      else elem.setAttribute(attr, next)
    }

    /**
     * Apply current input values to every paintable element in the selection.
     * Each call commits one BatchCommand to the undo history.
     */
    const applyShift = () => {
      const { h, s, l, t, applyFill, applyStroke } = getValues()
      const elems = paintableSelection()
      if (!elems.length) return

      const batch = new BatchCommand('Color shift')

      for (const elem of elems) {
        const snap = ensureSnapshot(elem)
        const oldAttrs = {}

        // Fill channel
        if (applyFill) {
          if (snap.fillHSL) {
            const nextHsl = {
              h: snap.fillHSL.h + h,
              s: clamp(snap.fillHSL.s + s, 0, 100),
              l: clamp(snap.fillHSL.l + l, 0, 100)
            }
            const nextFill = toHex(hslToRgb(nextHsl))
            setAttrIfChanged(elem, 'fill', nextFill, oldAttrs)
          }
          const nextFO = clamp(snap.fillOpacity - t / 100, 0, 1)
          // Round to 3 dp to avoid noisy float strings in saved SVG.
          const foStr = nextFO >= 1 ? null : String(Math.round(nextFO * 1000) / 1000)
          setAttrIfChanged(elem, 'fill-opacity', foStr, oldAttrs)
        }

        // Stroke channel
        if (applyStroke) {
          if (snap.strokeHSL) {
            const nextHsl = {
              h: snap.strokeHSL.h + h,
              s: clamp(snap.strokeHSL.s + s, 0, 100),
              l: clamp(snap.strokeHSL.l + l, 0, 100)
            }
            const nextStroke = toHex(hslToRgb(nextHsl))
            setAttrIfChanged(elem, 'stroke', nextStroke, oldAttrs)
          }
          if (snap.strokeHSL) {
            const nextSO = clamp(snap.strokeOpacity - t / 100, 0, 1)
            const soStr = nextSO >= 1 ? null : String(Math.round(nextSO * 1000) / 1000)
            setAttrIfChanged(elem, 'stroke-opacity', soStr, oldAttrs)
          }
        }

        if (Object.keys(oldAttrs).length) {
          batch.addSubCommand(new ChangeElementCommand(elem, oldAttrs))
        }
      }

      if (!batch.isEmpty()) svgCanvas.addCommandToHistory(batch)
    }

    const resetInputs = () => {
      $id('color_shift_h').value = 0
      $id('color_shift_s').value = 0
      $id('color_shift_l').value = 0
      $id('color_shift_t').value = 0
    }

    /**
     * Refresh the per-element snapshots from current element state and
     * zero the inputs. Called on every selection change and on Reset
     * (where we also re-apply a zero-delta shift so the element reverts
     * to whatever the previous snapshot was).
     */
    const reseed = () => {
      // Recompute fresh snapshots so the next shift is relative to "now".
      for (const elem of paintableSelection()) {
        snapshots.set(elem, captureSnapshot(elem))
      }
      resetInputs()
    }

    const updateVisibility = () => {
      const panel = $id('color_shift_panel')
      const hint = $id('color_shift_hint')
      const body = $id('color_shift_body')
      if (!panel) return
      const hasPaintable = paintableSelection().length > 0
      hint.style.display = hasPaintable ? 'none' : ''
      body.style.display = hasPaintable ? '' : 'none'
    }

    const t = (key) => svgEditor.i18next.t(`${name}:${key}`)

    return {
      name: t('name'),

      callback () {
        // Prefer the right-panel "Effects" tab; fall back to the panel root.
        const sidepanel = $id('tab_effects') || $id('sidepanel_content')
        if (!sidepanel) return

        const tpl = document.createElement('template')
        tpl.innerHTML = `
          <div id="color_shift_panel">
            <div id="color_shift_label">${t('panelTitle')}</div>
            <div id="color_shift_hint">${t('hint')}</div>
            <div id="color_shift_body" style="display:none">
              <div class="color_shift_grid">
                <se-spin-input id="color_shift_h" label="H" min="-180" max="180" step="1" value="0"
                  title="${t('inputs.hue.title')}"></se-spin-input>
                <se-spin-input id="color_shift_s" label="S" min="-100" max="100" step="1" value="0"
                  title="${t('inputs.saturation.title')}"></se-spin-input>
                <se-spin-input id="color_shift_l" label="L" min="-100" max="100" step="1" value="0"
                  title="${t('inputs.lightness.title')}"></se-spin-input>
                <se-spin-input id="color_shift_t" label="T" min="-100" max="100" step="1" value="0"
                  title="${t('inputs.transparency.title')}"></se-spin-input>
              </div>
              <div class="color_shift_toggles">
                <label title="${t('toggles.fill.title')}">
                  <input id="color_shift_fill" type="checkbox" checked>
                  <span>${t('toggles.fill.label')}</span>
                </label>
                <label title="${t('toggles.stroke.title')}">
                  <input id="color_shift_stroke" type="checkbox" checked>
                  <span>${t('toggles.stroke.label')}</span>
                </label>
                <button id="color_shift_reset" type="button"
                  title="${t('reset.title')}">Reset</button>
              </div>
            </div>
          </div>
        `
        sidepanel.appendChild(tpl.content.cloneNode(true))

        ;['color_shift_h', 'color_shift_s', 'color_shift_l', 'color_shift_t']
          .forEach((id) => $id(id).addEventListener('change', applyShift))
        // Toggling a channel mid-edit should re-apply with current deltas so
        // the other channel reverts immediately.
        ;['color_shift_fill', 'color_shift_stroke']
          .forEach((id) => $id(id).addEventListener('change', applyShift))

        $id('color_shift_reset').addEventListener('click', () => {
          resetInputs()
          applyShift() // delta=0 → restores snapshot values
        })

        updateVisibility()
      },

      selectedChanged (_opts) {
        reseed()
        updateVisibility()
      }
    }
  }
}
