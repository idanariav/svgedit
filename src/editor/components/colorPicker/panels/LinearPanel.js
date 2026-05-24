/**
 * LinearPanel.js — linear gradient tab panel. Factory function.
 */

import { createStopBar } from './shared/StopBar.js'
import { createDial } from './shared/Dial.js'
import { createSlider } from './shared/Slider.js'
import { createHsvBox } from './shared/HsvBox.js'
import { paintToState } from '../PaintModel.js'

const CHEV_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M6 9l6 6 6-6"/></svg>`

/**
 * @param {object} paint
 * @param {object} i18next
 * @returns {HTMLElement}
 */
export function createLinearPanel (paint, i18next) {
  const t = key => {
    try { return i18next?.t(key) || key } catch { return key }
  }

  const state = paintToState(paint)
  let panelState = {
    mode: (state.tab === 'linear' ? state.mode : 'two') || 'two',
    stops: (state.tab === 'linear' ? state.stops : null) || [
      { color: '2962ff', position: 0, alpha: 100 },
      { color: 'ffffff', position: 100, alpha: 100 }
    ],
    angle: state.tab === 'linear' ? (state.angle ?? 0) : 0,
    spreadMethod: state.tab === 'linear' ? (state.spreadMethod || 'pad') : 'pad',
    alpha: state.tab === 'linear' ? (state.alpha ?? 100) : 100,
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

  // Preview
  const previewWrap = document.createElement('div')
  previewWrap.className = 'cp-preview-big'
  previewWrap.innerHTML = '<div class="cp-preview-chk" style="position:absolute;inset:0;background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0;"></div><div class="cp-preview-fill" style="position:absolute;inset:0;"></div>'
  const previewFill = previewWrap.querySelector('.cp-preview-fill')
  leftCol.appendChild(previewWrap)

  // StopBar
  const stopBar = createStopBar(panelState.stops, panelState.mode)
  leftCol.appendChild(stopBar)

  // Inline HsvBox for editing selected stop
  const stopColorSection = document.createElement('div')
  stopColorSection.className = 'cp-stop-color-editor'
  stopColorSection.style.display = 'none'
  let stopHsvBox = null
  leftCol.appendChild(stopColorSection)

  // ── Right column ───────────────────────────────────────────────────────────
  const rightCol = document.createElement('div')
  rightCol.className = 'cp-grad-right'

  // Direction section
  const dirSection = document.createElement('div')
  dirSection.className = 'cp-section'
  dirSection.innerHTML = `<div class="cp-section-title">Direction</div>`
  const dial = createDial(panelState.angle)
  dirSection.appendChild(dial)
  rightCol.appendChild(dirSection)

  // Settings section
  const settingsSection = document.createElement('div')
  settingsSection.className = 'cp-section'
  settingsSection.innerHTML = `<div class="cp-section-title">Settings</div>`

  // Spread method select
  const selectWrap = document.createElement('div')
  selectWrap.className = 'cp-select'
  selectWrap.innerHTML = `
    <span class="cp-select-label">${t('config.jgraduate_spread_method') || 'Spread'}</span>
    <button type="button" class="cp-select-btn">
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
  const selectBtn = selectWrap.querySelector('.cp-select-btn')
  selectBtn.style.position = 'relative'
  selectBtn.appendChild(spreadSelect)
  spreadSelect.addEventListener('change', () => {
    panelState.spreadMethod = spreadSelect.value
    selectWrap.querySelector('.cp-select-val').textContent = spreadSelect.value
  })
  settingsSection.appendChild(selectWrap)

  // Opacity slider
  const opacSlider = createSlider({
    label: t('config.jgraduate_opac') || 'Opacity',
    min: 0, max: 100, value: panelState.alpha, unit: '%'
  })
  opacSlider.addEventListener('change', e => { panelState.alpha = e.detail.value })
  settingsSection.appendChild(opacSlider)
  rightCol.appendChild(settingsSection)

  // Mono settings section
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

  // ── Wiring ─────────────────────────────────────────────────────────────────
  function _updatePreview () {
    let gradCSS
    if (panelState.mode === 'mono') {
      const firstStop = panelState.stops[0] || { color: '000000', alpha: 100 }
      let endColor, endAlpha = 100
      if (panelState.monoMode === 'white') { endColor = '#ffffff' } else if (panelState.monoMode === 'black') { endColor = '#000000' } else { endColor = '#' + firstStop.color; endAlpha = 0 }
      gradCSS = `linear-gradient(${panelState.angle}deg, #${firstStop.color} 0%, rgba(${_hexToRgb(endColor)},${endAlpha / 100}) 100%)`
    } else {
      const sorted = [...panelState.stops].sort((a, b) => a.position - b.position)
      gradCSS = `linear-gradient(${panelState.angle}deg, ${sorted.map(s => `rgba(${_hexToRgb('#' + s.color)},${s.alpha / 100}) ${s.position}%`).join(', ')})`
    }
    previewFill.style.background = gradCSS
  }

  function _hexToRgb (hex) {
    const c = hex.replace('#', '')
    return `${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)}`
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
    // Build/rebuild inline HsvBox for this stop
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

  dial.addEventListener('change', (e) => {
    panelState.angle = e.detail.angle
    _updatePreview()
  })

  _updatePreview()

  // ── Public API ─────────────────────────────────────────────────────────────
  panel.getPaintState = () => ({
    tab: 'linear',
    mode: panelState.mode,
    stops: panelState.stops.map(s => ({ ...s })),
    angle: panelState.angle,
    spreadMethod: panelState.spreadMethod,
    alpha: panelState.alpha,
    monoMode: panelState.monoMode
  })

  panel.setFromPaint = (p) => {
    const s = paintToState(p)
    if (s.tab === 'linear') {
      panelState = {
        mode: s.mode || 'two',
        stops: s.stops || panelState.stops,
        angle: s.angle ?? 0,
        spreadMethod: s.spreadMethod || 'pad',
        alpha: s.alpha ?? 100,
        monoMode: s.monoMode || 'white'
      }
      stopBar.setStops(panelState.stops)
      stopBar.setMode(panelState.mode)
      dial.setAngle(panelState.angle)
      opacSlider.setValue(panelState.alpha)
      spreadSelect.value = panelState.spreadMethod
      selectWrap.querySelector('.cp-select-val').textContent = panelState.spreadMethod
      monoSection.style.display = panelState.mode === 'mono' ? '' : 'none'
      setMode(panelState.mode)
      _updatePreview()
    }
  }

  return panel
}
