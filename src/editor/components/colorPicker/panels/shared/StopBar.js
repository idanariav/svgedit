/**
 * StopBar.js — gradient stop bar + detail list factory.
 * Not a custom element — returns a container div with API methods.
 */

import { interpolateStopColor, alphaToHex } from '../../PaintModel.js'

const TRASH_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
  <path d="M4 7h16"/><path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2"/>
  <path d="M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12"/>
</svg>`

const PLUS_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="14" height="14">
  <path d="M12 5v14M5 12h14"/>
</svg>`

/**
 * @param {{color:string,position:number,alpha:number}[]} initialStops
 * @param {'two'|'mono'|'multi'} initialMode
 * @returns {HTMLElement}
 */
export function createStopBar (initialStops, initialMode = 'two') {
  let stops = initialStops.map(s => ({ ...s }))
  let mode = initialMode
  let selectedIndex = 0

  const container = document.createElement('div')
  container.className = 'cp-stopbar-wrap'
  container.innerHTML = `
    <div class="cp-stopbar">
      <div class="cp-stopbar-stops"></div>
      <div class="cp-stopbar-track">
        <div class="cp-stopbar-track-chk"></div>
        <div class="cp-stopbar-track-fill" style="position:absolute;inset:0;"></div>
      </div>
      <button type="button" class="cp-stopbar-add" aria-label="Add stop" title="Add stop">${PLUS_SVG}</button>
    </div>
    <div class="cp-stop-list"></div>
  `

  const stopsContainer = container.querySelector('.cp-stopbar-stops')
  const trackFill = container.querySelector('.cp-stopbar-track-fill')
  const addBtn = container.querySelector('.cp-stopbar-add')
  const stopList = container.querySelector('.cp-stop-list')

  function _gradientCSS () {
    if (!stops.length) return 'transparent'
    const sorted = [...stops].sort((a, b) => a.position - b.position)
    return 'linear-gradient(to right, ' +
      sorted.map(s => `#${s.color}${alphaToHex(s.alpha)} ${s.position}%`).join(', ') + ')'
  }

  function _emitChange () {
    container.dispatchEvent(new CustomEvent('stops-change', {
      detail: { stops: stops.map(s => ({ ...s })) },
      bubbles: true
    }))
  }

  function _emitSelect (index) {
    container.dispatchEvent(new CustomEvent('stop-select', {
      detail: { index },
      bubbles: true
    }))
  }

  function _selectStop (idx) {
    selectedIndex = idx
    _render()
    _emitSelect(idx)
  }

  function _render () {
    // Update track gradient
    trackFill.style.background = _gradientCSS()

    // Render chips above the bar
    stopsContainer.innerHTML = ''
    const visibleStops = mode === 'mono' ? stops.slice(0, 1) : stops
    visibleStops.forEach((stop, idx) => {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'cp-stop' + (idx === selectedIndex ? ' is-selected' : '')
      chip.style.left = `${stop.position}%`
      chip.setAttribute('aria-label', `Stop ${idx + 1}: #${stop.color}`)
      chip.innerHTML = `<div class="cp-stop-chip" style="background:#${stop.color}"></div>`
      chip.addEventListener('click', (e) => {
        e.stopPropagation()
        _selectStop(idx)
      })

      // Drag to reposition
      chip.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return
        e.preventDefault()
        chip.setPointerCapture(e.pointerId)
        const bar = stopsContainer.parentElement
        const rect = bar.getBoundingClientRect()
        const padding = 8 // matches CSS padding: 0 8px on .cp-stopbar
        chip.addEventListener('pointermove', (me) => {
          const raw = (me.clientX - rect.left - padding) / (rect.width - padding * 2)
          const pos = Math.round(Math.min(100, Math.max(0, raw * 100)))
          stops[idx].position = pos
          chip.style.left = `${pos}%`
          trackFill.style.background = _gradientCSS()
        })
        chip.addEventListener('pointerup', () => {
          stops.sort((a, b) => a.position - b.position)
          _render()
          _emitChange()
        }, { once: true })
      })

      stopsContainer.appendChild(chip)
    })

    // Add button visibility
    addBtn.style.display = mode === 'multi' ? '' : 'none'

    // Stop detail list
    stopList.innerHTML = ''
    const listStops = mode === 'mono' ? stops.slice(0, 1) : stops
    listStops.forEach((stop, idx) => {
      const row = document.createElement('div')
      row.className = 'cp-stop-row' + (idx === selectedIndex ? ' is-selected' : '')
      row.innerHTML = `
        <span class="cp-stop-idx">${idx + 1}</span>
        <button type="button" class="cp-stop-chipbig" style="background:#${stop.color}" title="Edit color" aria-label="Edit stop ${idx + 1} color"></button>
        <span class="cp-stop-hex">#${stop.color}</span>
        <span class="cp-stop-pos">
          <span class="cp-stop-pos-label">position</span>
          <span class="cp-stop-pos-val">${stop.position}%</span>
        </span>
        <button type="button" class="cp-stop-del" aria-label="Delete stop ${idx + 1}">${TRASH_SVG}</button>
      `

      row.addEventListener('click', (e) => {
        if (e.target.closest('.cp-stop-del')) return
        _selectStop(idx)
      })

      const chipBtn = row.querySelector('.cp-stop-chipbig')
      chipBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        _selectStop(idx)
        container.dispatchEvent(new CustomEvent('stop-edit', {
          detail: { index: idx },
          bubbles: true
        }))
      })

      const delBtn = row.querySelector('.cp-stop-del')
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        const minStops = mode === 'mono' ? 1 : 2
        if (stops.length <= minStops) return
        stops.splice(idx, 1)
        if (selectedIndex >= stops.length) selectedIndex = stops.length - 1
        _render()
        _emitChange()
        _emitSelect(selectedIndex)
      })

      stopList.appendChild(row)
    })
  }

  // Add stop handler
  addBtn.addEventListener('click', () => {
    if (stops.length < 2) {
      stops.push({ color: 'ffffff', position: 100, alpha: 100 })
      _selectStop(stops.length - 1)
      _emitChange()
      return
    }
    // Find midpoint of largest gap
    const sorted = [...stops].sort((a, b) => a.position - b.position)
    let maxGap = 0; let gapIdx = 0
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].position - sorted[i].position
      if (gap > maxGap) { maxGap = gap; gapIdx = i }
    }
    const newPos = Math.round((sorted[gapIdx].position + sorted[gapIdx + 1].position) / 2)
    const newColor = interpolateStopColor(sorted, newPos)
    const newStop = { color: newColor, position: newPos, alpha: 100 }
    stops.push(newStop)
    stops.sort((a, b) => a.position - b.position)
    selectedIndex = stops.findIndex(s => s === newStop)
    _render()
    _emitChange()
    _emitSelect(selectedIndex)
  })

  // ── Public API ─────────────────────────────────────────────────────────────
  container.getStops = () => stops.map(s => ({ ...s }))

  container.setStops = (newStops) => {
    stops = newStops.map(s => ({ ...s }))
    _render()
  }

  container.setSelectedStop = (idx, colorHex, alpha) => {
    if (idx >= 0 && idx < stops.length) {
      stops[idx].color = colorHex
      if (alpha !== undefined) stops[idx].alpha = alpha
      selectedIndex = idx
      _render()
    }
  }

  container.getSelectedIndex = () => selectedIndex

  container.setMode = (newMode) => {
    mode = newMode
    _render()
  }

  // Initial render
  _render()
  return container
}
