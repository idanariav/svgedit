/**
 * RadialPanel.ts — radial gradient tab panel. Factory function.
 */

import { createStopBar } from './shared/StopBar.ts'
import { createSlider } from './shared/Slider.ts'
import { createHsvBox } from './shared/HsvBox.ts'
import { paintToState } from '../PaintModel.ts'

export type GradientStop = import('../PaintModel.ts').GradientStop

const CHEV_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M6 9l6 6 6-6"/></svg>'

export function createRadialPanel (paint: import('@svgedit/svgcanvas/core/paint.ts').default | null, i18next: import('i18next').i18n | null | undefined): import('../PaintModel.ts').PaintPanel {
  const t = (key: string) => {
    try { return i18next?.t(key) || key } catch { return key }
  }

  const state = paintToState(paint)
  let panelState: { mode: 'two' | 'mono' | 'multi', stops: GradientStop[], cx: number, cy: number, fx: number, fy: number, r: number, ellip: number, angle: number, spreadMethod: string, alpha: number, matchCenter: boolean, monoMode: string } = {
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

  const panel = document.createElement('div') as import('../PaintModel.ts').PaintPanel
  panel.className = 'cp-body cp-body-grad'

  // ── Left column ────────────────────────────────────────────────────────────
  const leftCol = document.createElement('div')
  leftCol.className = 'cp-grad-left'

  // Mode toggle
  const modeToggle = document.createElement('div')
  modeToggle.className = 'cp-mode'
  const modes: Array<{ key: 'two' | 'mono' | 'multi', label: string }> = [
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
  const previewFill = previewWrap.querySelector('.cp-preview-fill') as HTMLElement
  const centerMarker = previewWrap.querySelector('.cp-radial-center') as HTMLElement
  const focalMarker = previewWrap.querySelector('.cp-radial-focal') as HTMLElement
  const radialHandle = previewWrap.querySelector('.cp-radial-handle') as HTMLElement
  leftCol.appendChild(previewWrap)

  /**
   * Draggable center marker
 * @param onUpdate the pointer's place in the preview, 0-1
   */
  function _makeMarkerDraggable (markerEl: HTMLElement, onUpdate: (x: number, y: number) => void) {
    const pt = markerEl.querySelector('.cp-radial-pt') as HTMLElement
    pt.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      pt.setPointerCapture(e.pointerId)
      const onMove = (me: PointerEvent) => {
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

  // ── Colors column (right) — stop color editor, like the Solid tab ───────────
  const colorsCol = document.createElement('div')
  colorsCol.className = 'cp-grad-colors'
  const stopColorSection = document.createElement('div')
  stopColorSection.className = 'cp-stop-color-editor'
  let stopHsvBox: (HTMLElement & { hex: string; alpha: number; setHex(h: string): void; setAlpha(a: number): void; }) | null = null
  colorsCol.appendChild(stopColorSection)

  // ── Bottom row — Shape + Focal Point + Settings ─────────────────────────────
  const bottomRow = document.createElement('div')
  bottomRow.className = 'cp-grad-bottom'

  // Shape section
  const shapeSection = document.createElement('div')
  shapeSection.className = 'cp-section'
  shapeSection.innerHTML = '<div class="cp-section-title">Shape</div>'

  const radiusSlider = createSlider({ label: t('config.jgraduate_radius') || 'Radius', min: 0, max: 100, value: panelState.r, unit: '%' })
  const ellipSlider = createSlider({ label: t('config.jgraduate_ellip') || 'Ellipse', min: 0, max: 200, value: panelState.ellip, unit: '%' })
  const angleSlider = createSlider({ label: t('config.jgraduate_angle') || 'Angle', min: 0, max: 360, value: panelState.angle, unit: '°' })
  radiusSlider.addEventListener('change', (e) => { panelState.r = (e as CustomEvent).detail.value; _updatePreview(); _updateMarkers() })
  ellipSlider.addEventListener('change', (e) => { panelState.ellip = (e as CustomEvent).detail.value; _updatePreview() })
  angleSlider.addEventListener('change', (e) => { panelState.angle = (e as CustomEvent).detail.value; _updatePreview() })
  shapeSection.appendChild(radiusSlider)
  shapeSection.appendChild(ellipSlider)
  shapeSection.appendChild(angleSlider)
  bottomRow.appendChild(shapeSection)

  // Focal point section
  const focalSection = document.createElement('div')
  focalSection.className = 'cp-section'
  focalSection.innerHTML = '<div class="cp-section-title">Focal Point</div>'
  const matchLabel = document.createElement('label')
  matchLabel.className = 'cp-check'
  matchLabel.innerHTML = `<input type="checkbox" ${panelState.matchCenter ? 'checked' : ''}><span class="cp-check-box"></span><span class="cp-check-label">${t('config.jgraduate_match_center') || 'Match center'}</span>`
  const matchCheckbox = matchLabel.querySelector('input') as HTMLInputElement
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
  bottomRow.appendChild(focalSection)

  // Settings section
  const settingsSection = document.createElement('div')
  settingsSection.className = 'cp-section'
  settingsSection.innerHTML = '<div class="cp-section-title">Settings</div>'

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
  ;(selectWrap.querySelector('.cp-select-btn') as HTMLElement).appendChild(spreadSelect)
  spreadSelect.addEventListener('change', () => {
    panelState.spreadMethod = spreadSelect.value
    ;(selectWrap.querySelector('.cp-select-val') as HTMLElement).textContent = spreadSelect.value
  })
  settingsSection.appendChild(selectWrap)

  const opacSlider = createSlider({ label: t('config.jgraduate_opac') || 'Opacity', min: 0, max: 100, value: panelState.alpha, unit: '%' })
  opacSlider.addEventListener('change', (e) => { panelState.alpha = (e as CustomEvent).detail.value })
  settingsSection.appendChild(opacSlider)
  bottomRow.appendChild(settingsSection)

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
  ;(monoSection.querySelectorAll('[data-mono]') as NodeListOf<HTMLElement>).forEach(btn => {
    btn.addEventListener('click', () => {
      panelState.monoMode = btn.dataset.mono ?? 'white'
      monoSection.querySelectorAll('[data-mono]').forEach(b => b.classList.toggle('is-active', b === btn))
      _updatePreview()
    })
  })
  bottomRow.appendChild(monoSection)

  // Shape/Focal/Settings sit in the empty space under the stop list, on the left.
  leftCol.appendChild(bottomRow)

  const topRow = document.createElement('div')
  topRow.className = 'cp-grad-top'
  topRow.appendChild(leftCol)
  topRow.appendChild(colorsCol)
  panel.appendChild(topRow)

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _hexToRgb (hex: string) {
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
      let endColor; let endAlpha = 100
      if (panelState.monoMode === 'white') { endColor = '#ffffff' } else if (panelState.monoMode === 'black') { endColor = '#000000' } else { endColor = '#' + first.color; endAlpha = 0 }
      stops = [{ color: first.color, position: 0, alpha: first.alpha }, { color: endColor.replace('#', ''), position: 100, alpha: endAlpha }]
    }
    const sorted = [...stops].sort((a, b) => a.position - b.position)
    const stopsCss = sorted.map(s => `rgba(${_hexToRgb('#' + s.color)},${s.alpha / 100}) ${s.position}%`).join(', ')
    previewFill.style.background = `radial-gradient(ellipse at ${panelState.cx * 100}% ${panelState.cy * 100}%, ${stopsCss})`
    _updateMarkers()
    // Tell the dialog (-> host live preview); a no-op until the panel is mounted.
    panel.dispatchEvent(new CustomEvent('color-change', { bubbles: true }))
  }

  function setMode (newMode: 'two' | 'mono' | 'multi') {
    panelState.mode = newMode
    modeToggle.querySelectorAll('.cp-mode-btn').forEach(b => {
      b.classList.toggle('is-active', b.textContent === modes.find(m => m.key === newMode)?.label)
    })
    stopBar.setMode(newMode)
    monoSection.style.display = newMode === 'mono' ? '' : 'none'
    _updatePreview()
  }

  stopBar.addEventListener('stops-change', (e) => {
    panelState.stops = (e as CustomEvent).detail.stops
    _updatePreview()
  })

  function _mountStopEditor (idx: number) {
    const stop = panelState.stops[idx]
    if (!stop) return
    stopColorSection.innerHTML = ''
    stopHsvBox = createHsvBox(stop.color, stop.alpha)
    stopColorSection.appendChild(stopHsvBox)
    stopHsvBox.addEventListener('color-change', (event) => {
      const ce = event as CustomEvent
      const sidx = stopBar.getSelectedIndex()
      if (sidx >= 0 && sidx < panelState.stops.length) {
        panelState.stops[sidx].color = ce.detail.hex
        panelState.stops[sidx].alpha = ce.detail.a
        stopBar.setSelectedStop(sidx, ce.detail.hex, ce.detail.a)
        _updatePreview()
      }
    })
  }

  stopBar.addEventListener('stop-select', (e) => _mountStopEditor((e as CustomEvent).detail.index))

  _mountStopEditor(stopBar.getSelectedIndex())
  _updatePreview()

  panel.setFromHex = (hex: string) => {
    const clean = hex.replace('#', '')
    let idx = stopBar.getSelectedIndex()
    if (idx < 0 || idx >= panelState.stops.length) idx = 0
    const alpha = panelState.stops[idx].alpha
    panelState.stops[idx].color = clean
    stopBar.setSelectedStop(idx, clean, alpha)
    if (stopHsvBox) stopHsvBox.setHex(clean)
    _updatePreview()
  }

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

  panel.setFromPaint = (p: import('@svgedit/svgcanvas/core/paint.ts').default) => {
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
      ;(selectWrap.querySelector('.cp-select-val') as HTMLElement).textContent = panelState.spreadMethod
      matchCheckbox.checked = panelState.matchCenter
      monoSection.style.display = panelState.mode === 'mono' ? '' : 'none'
      setMode(panelState.mode)
      _updatePreview()
    }
  }

  return panel
}
