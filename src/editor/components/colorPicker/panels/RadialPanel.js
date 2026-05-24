/**
 * RadialPanel.js — radial gradient tab panel. Factory function.
 */

import { createStopBar } from './shared/StopBar.js'
import { createSlider } from './shared/Slider.js'
import { createHsvBox } from './shared/HsvBox.js'
import { paintToState } from '../PaintModel.js'

const CHEV_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M6 9l6 6 6-6"/></svg>`

/**
 * @param {object} paint
 * @param {object} i18next
 * @returns {HTMLElement}
 */
export function createRadialPanel (paint, i18next) {
  const t = key => {
    try { return i18next?.t(key) || key } catch { return key }
  }

  const state = paintToState(paint)
  let panelState = {
    mode: (state.tab === 'radial' ? state.mode : 'two') || 'two',
    stops: (state.tab === 'radial' ? state.stops : null) || [
      { color: '2962ff', position: 0, alpha: 100 },
      { color: 'ffffff', position: 100, alpha: 100 }
    ],
    cx: state.tab === 'radial' ? (state.cx ?? 0.5) : 0.5,
    cy: state.tab === 'radial' ? (state.cy ?? 0.5) : 0.5,
    fx: state.tab === 'radial' ? (state.fx ?? 0.5) : 0.5,
    fy: state.tab === 'radial' ? (state.fy ?? 0.5) : 0.5,
    r: state.tab === 'radial' ? (state.r ?? 50) : 50,
    ellip: state.tab === 'radial' ? (state.ellip ?? 100) : 100,
    angle: state.tab === 'radial' ? (state.angle ?? 0) : 0,
    spreadMethod: state.tab === 'radial' ? (state.spreadMethod || 'pad') : 'pad',
    alpha: state.tab === 'radial' ? (state.alpha ?? 100) : 100,
    matchCenter: state.tab === 'radial' ? (state.matchCenter ?? true) : true,
    monoMode: state.monoMode || 'white'
  }

  const panel = document.createElement('div')
  panel.className = 'cp-body cp-body-grad'

  // ── Left column ────────────────────────────────────────────────────────────
  const leftCol = document.createElement('div')
  leftCol.className = 'cp-grad-left'

  // Mode toggle
  const modeToggle = document.createElement('div')
  modeToggle.className = 'cp-mode'
  const modes = [
    { key: 'two', label: t('config.gradient_mode_two') || 'Two color' },
    { key: 'mono', label: t('config.gradient_mode_mono') || 'Mono' },
    { key: 'multi', label: t('config.gradient_mode_multi') || 'Multi-stop' }
  ]
  modes.forEach(m => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'cp-mode-btn' + (panelState.mode === m.key ? ' is-active' : '')
    btn.textContent = m.label
    btn.addEventListener('click', () => setMode(m.key))
    modeToggle.appendChild(btn)
  })
  leftCol.appendChild(modeToggle)

  // Preview with draggable center marker
  const previewWrap = document.createElement('div')
  previewWrap.className = 'cp-preview-big'
  previewWrap.style.userSelect = 'none'
  previewWrap.innerHTML = `
    <div class="cp-preview-chk" style="position:absolute;inset:0;background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0;"></div>
    <div class="cp-preview-fill" style="position:absolute;inset:0;"></div>
    <div class="cp-radial-center" style="left:50%;top:50%;">
      <div class="cp-radial-pt" title="Center" data-role="center"></div>
      <span class="cp-radial-pt-label">Center</span>
    </div>
    <div class="cp-radial-handle" style="left:50%;top:50%;"></div>
    <div class="cp-radial-center cp-radial-focal" style="left:50%;top:50%;display:none;">
      <div class="cp-radial-pt" title="Focal point" data-role="focal"></div>
      <span class="cp-radial-pt-label">Focal</span>
    </div>
  `
  const previewFill = previewWrap.querySelector('.cp-preview-fill')
  const centerMarker = previewWrap.querySelector('.cp-radial-center')
  const focalMarker = previewWrap.querySelector('.cp-radial-focal')
  const radialHandle = previewWrap.querySelector('.cp-radial-handle')
  leftCol.appendChild(previewWrap)

  // Draggable center marker
  function _makeMarkerDraggable (markerEl, onUpdate) {
    const pt = markerEl.querySelector('.cp-radial-pt')
    pt.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      pt.setPointerCapture(e.pointerId)
      const onMove = (me) => {
        const rect = previewWrap.getBoundingClientRect()
        const x = Math.min(1, Math.max(0, (me.clientX - rect.left) / rect.width))
        const y = Math.min(1, Math.max(0, (me.clientY - rect.top) / rect.height))
        onUpdate(x, y)
        _updatePreview()
      }
      pt.addEventListener('pointermove', onMove)
      pt.addEventListener('pointerup', () => {
        pt.removeEventListener('pointermove', onMove)
      }, { once: true })
      pt.addEventListener('pointercancel', () => {
        pt.removeEventListener('pointermove', onMove)
      }, { once: true })
    })
  }

  _makeMarkerDraggable(centerMarker, (x, y) => {
    panelState.cx = x; panelState.cy = y
    if (panelState.matchCenter) { panelState.fx = x; panelState.fy = y }
    _updateMarkers()
  })
  _makeMarkerDraggable(focalMarker, (x, y) => {
    panelState.fx = x; panelState.fy = y
    _updateMarkers()
  })

  // StopBar
  const stopBar = createStopBar(panelState.stops, panelState.mode)
  leftCol.appendChild(stopBar)

  // Inline HsvBox for stop editing
  const stopColorSection = document.createElement('div')
  stopColorSection.style.display = 'none'
  let stopHsvBox = null
  leftCol.appendChild(stopColorSection)

  // ── Right column ───────────────────────────────────────────────────────────
  const rightCol = document.createElement('div')
  rightCol.className = 'cp-grad-right'

  // Shape section
  const shapeSection = document.createElement('div')
  shapeSection.className = 'cp-section'
  shapeSection.innerHTML = `<div class="cp-section-title">Shape</div>`

  const radiusSlider = createSlider({ label: t('config.jgraduate_radius') || 'Radius', min: 0, max: 100, value: panelState.r, unit: '%' })
  const ellipSlider = createSlider({ label: t('config.jgraduate_ellip') || 'Ellipse', min: 0, max: 200, value: panelState.ellip, unit: '%' })
  const angleSlider = createSlider({ label: t('config.jgraduate_angle') || 'Angle', min: 0, max: 360, value: panelState.angle, unit: '°' })
  radiusSlider.addEventListener('change', e => { panelState.r = e.detail.value; _updatePreview(); _updateMarkers() })
  ellipSlider.addEventListener('change', e => { panelState.ellip = e.detail.value; _updatePreview() })
  angleSlider.addEventListener('change', e => { panelState.angle = e.detail.value; _updatePreview() })
  shapeSection.appendChild(radiusSlider)
  shapeSection.appendChild(ellipSlider)
  shapeSection.appendChild(angleSlider)
  rightCol.appendChild(shapeSection)

  // Focal point section
  const focalSection = document.createElement('div')
  focalSection.className = 'cp-section'
  focalSection.innerHTML = `<div class="cp-section-title">Focal Point</div>`
  const matchLabel = document.createElement('label')
  matchLabel.className = 'cp-check'
  matchLabel.innerHTML = `<input type="checkbox" ${panelState.matchCenter ? 'checked' : ''}><span class="cp-check-box"></span><span class="cp-check-label">${t('config.jgraduate_match_center') || 'Match center'}</span>`
  const matchCheckbox = matchLabel.querySelector('input')
  matchCheckbox.addEventListener('change', () => {
    panelState.matchCenter = matchCheckbox.checked
    if (panelState.matchCenter) {
      panelState.fx = panelState.cx; panelState.fy = panelState.cy
      focalMarker.style.display = 'none'
    } else {
      focalMarker.style.display = ''
    }
    _updateMarkers()
  })
  focalSection.appendChild(matchLabel)
  rightCol.appendChild(focalSection)

  // Settings section
  const settingsSection = document.createElement('div')
  settingsSection.className = 'cp-section'
  settingsSection.innerHTML = `<div class="cp-section-title">Settings</div>`

  const selectWrap = document.createElement('div')
  selectWrap.className = 'cp-select'
  selectWrap.innerHTML = `
    <span class="cp-select-label">${t('config.jgraduate_spread_method') || 'Spread'}</span>
    <button type="button" class="cp-select-btn" style="position:relative;">
      <span class="cp-select-val">${panelState.spreadMethod}</span>
      <span class="cp-select-chev">${CHEV_SVG}</span>
    </button>
  `
  const spreadSelect = document.createElement('select')
  spreadSelect.style.cssText = 'position:absolute;opacity:0;inset:0;width:100%;cursor:pointer;'
  ;['pad', 'reflect', 'repeat'].forEach(val => {
    const opt = document.createElement('option')
    opt.value = val
    opt.textContent = t('config.jgraduate_' + val) || val.charAt(0).toUpperCase() + val.slice(1)
    if (val === panelState.spreadMethod) opt.selected = true
    spreadSelect.appendChild(opt)
  })
  selectWrap.querySelector('.cp-select-btn').appendChild(spreadSelect)
  spreadSelect.addEventListener('change', () => {
    panelState.spreadMethod = spreadSelect.value
    selectWrap.querySelector('.cp-select-val').textContent = spreadSelect.value
  })
  settingsSection.appendChild(selectWrap)

  const opacSlider = createSlider({ label: t('config.jgraduate_opac') || 'Opacity', min: 0, max: 100, value: panelState.alpha, unit: '%' })
  opacSlider.addEventListener('change', e => { panelState.alpha = e.detail.value })
  settingsSection.appendChild(opacSlider)
  rightCol.appendChild(settingsSection)

  // Mono settings
  const monoSection = document.createElement('div')
  monoSection.className = 'cp-section cp-mono-hint'
  monoSection.style.display = panelState.mode === 'mono' ? '' : 'none'
  monoSection.innerHTML = `
    <div class="cp-section-title">${t('config.mono_settings') || 'Mono Settings'}</div>
    <div class="cp-mono-row">
      <span>From:</span>
      <div class="cp-mono-toggle">
        <button type="button" data-mono="white" class="${panelState.monoMode === 'white' ? 'is-active' : ''}">${t('config.from_white') || 'White'}</button>
        <button type="button" data-mono="black" class="${panelState.monoMode === 'black' ? 'is-active' : ''}">${t('config.from_black') || 'Black'}</button>
        <button type="button" data-mono="transparent" class="${panelState.monoMode === 'transparent' ? 'is-active' : ''}">${t('config.from_transparent') || 'Transparent'}</button>
      </div>
    </div>
  `
  monoSection.querySelectorAll('[data-mono]').forEach(btn => {
    btn.addEventListener('click', () => {
      panelState.monoMode = btn.dataset.mono
      monoSection.querySelectorAll('[data-mono]').forEach(b => b.classList.toggle('is-active', b === btn))
      _updatePreview()
    })
  })
  rightCol.appendChild(monoSection)

  panel.appendChild(leftCol)
  panel.appendChild(rightCol)

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _hexToRgb (hex) {
    const c = hex.replace('#', '')
    return `${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)}`
  }

  function _updateMarkers () {
    centerMarker.style.left = `${panelState.cx * 100}%`
    centerMarker.style.top = `${panelState.cy * 100}%`
    focalMarker.style.left = `${panelState.fx * 100}%`
    focalMarker.style.top = `${panelState.fy * 100}%`
    // Radius circle
    const pctR = (panelState.r / 100) * 40 + 40 // rough visual scaling
    radialHandle.style.width = `${pctR}px`
    radialHandle.style.height = `${pctR}px`
    radialHandle.style.left = `${panelState.cx * 100}%`
    radialHandle.style.top = `${panelState.cy * 100}%`
    focalMarker.style.display = panelState.matchCenter ? 'none' : ''
  }

  function _updatePreview () {
    let stops = panelState.stops
    if (panelState.mode === 'mono') {
      const first = stops[0] || { color: '000000', alpha: 100 }
      let endColor, endAlpha = 100
      if (panelState.monoMode === 'white') { endColor = '#ffffff' } else if (panelState.monoMode === 'black') { endColor = '#000000' } else { endColor = '#' + first.color; endAlpha = 0 }
      stops = [{ color: first.color, position: 0, alpha: first.alpha }, { color: endColor.replace('#', ''), position: 100, alpha: endAlpha }]
    }
    const sorted = [...stops].sort((a, b) => a.position - b.position)
    const stopsCss = sorted.map(s => `rgba(${_hexToRgb('#' + s.color)},${s.alpha / 100}) ${s.position}%`).join(', ')
    previewFill.style.background = `radial-gradient(ellipse at ${panelState.cx * 100}% ${panelState.cy * 100}%, ${stopsCss})`
    _updateMarkers()
  }

  function setMode (newMode) {
    panelState.mode = newMode
    modeToggle.querySelectorAll('.cp-mode-btn').forEach(b => {
      b.classList.toggle('is-active', b.textContent === modes.find(m => m.key === newMode)?.label)
    })
    stopBar.setMode(newMode)
    monoSection.style.display = newMode === 'mono' ? '' : 'none'
    _updatePreview()
  }

  stopBar.addEventListener('stops-change', (e) => {
    panelState.stops = e.detail.stops
    _updatePreview()
  })

  stopBar.addEventListener('stop-select', (e) => {
    const idx = e.detail.index
    const stop = panelState.stops[idx]
    if (!stop) return
    stopColorSection.innerHTML = ''
    stopHsvBox = createHsvBox(stop.color, stop.alpha)
    stopColorSection.appendChild(stopHsvBox)
    stopColorSection.style.display = ''
    stopHsvBox.addEventListener('color-change', (ce) => {
      const sidx = stopBar.getSelectedIndex()
      if (sidx >= 0 && sidx < panelState.stops.length) {
        panelState.stops[sidx].color = ce.detail.hex
        panelState.stops[sidx].alpha = ce.detail.a
        stopBar.setSelectedStop(sidx, ce.detail.hex, ce.detail.a)
        _updatePreview()
      }
    })
  })

  _updatePreview()

  // ── Public API ─────────────────────────────────────────────────────────────
  panel.getPaintState = () => ({
    tab: 'radial',
    mode: panelState.mode,
    stops: panelState.stops.map(s => ({ ...s })),
    cx: panelState.cx,
    cy: panelState.cy,
    fx: panelState.matchCenter ? panelState.cx : panelState.fx,
    fy: panelState.matchCenter ? panelState.cy : panelState.fy,
    r: panelState.r,
    ellip: panelState.ellip,
    angle: panelState.angle,
    spreadMethod: panelState.spreadMethod,
    alpha: panelState.alpha,
    matchCenter: panelState.matchCenter,
    monoMode: panelState.monoMode
  })

  panel.setFromPaint = (p) => {
    const s = paintToState(p)
    if (s.tab === 'radial') {
      panelState = {
        mode: s.mode || 'two',
        stops: s.stops || panelState.stops,
        cx: s.cx ?? 0.5,
        cy: s.cy ?? 0.5,
        fx: s.fx ?? s.cx ?? 0.5,
        fy: s.fy ?? s.cy ?? 0.5,
        r: s.r ?? 50,
        ellip: s.ellip ?? 100,
        angle: s.angle ?? 0,
        spreadMethod: s.spreadMethod || 'pad',
        alpha: s.alpha ?? 100,
        matchCenter: s.matchCenter ?? true,
        monoMode: s.monoMode || 'white'
      }
      stopBar.setStops(panelState.stops)
      stopBar.setMode(panelState.mode)
      radiusSlider.setValue(panelState.r)
      ellipSlider.setValue(panelState.ellip)
      angleSlider.setValue(panelState.angle)
      opacSlider.setValue(panelState.alpha)
      spreadSelect.value = panelState.spreadMethod
      selectWrap.querySelector('.cp-select-val').textContent = panelState.spreadMethod
      matchCheckbox.checked = panelState.matchCenter
      monoSection.style.display = panelState.mode === 'mono' ? '' : 'none'
      setMode(panelState.mode)
      _updatePreview()
    }
  }

  return panel
}
