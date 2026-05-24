/**
 * Dial.js — direction dial for linear gradient angle. Factory function.
 * Returns a container element with getAngle/setAngle methods.
 */

const PRESETS = [
  { angle: 0, label: '↑' },
  { angle: 45, label: '↗' },
  { angle: 90, label: '→' },
  { angle: 135, label: '↘' },
  { angle: 180, label: '↓' },
  { angle: 225, label: '↙' },
  { angle: 270, label: '←' },
  { angle: 315, label: '↖' }
]

/**
 * @param {number} initialAngle  0-359 (0 = up)
 * @returns {HTMLElement & { getAngle():number, setAngle(deg:number):void }}
 */
export function createDial (initialAngle = 0) {
  let angle = ((initialAngle % 360) + 360) % 360

  const container = document.createElement('div')
  container.innerHTML = `
    <div class="cp-dial">
      <svg class="cp-dial-svg" viewBox="0 0 72 72" width="72" height="72" style="cursor:pointer;flex-shrink:0;" aria-label="Direction dial" role="slider">
        <!-- outer ring -->
        <circle cx="36" cy="36" r="34" fill="none" stroke="var(--cp-dial-border,#DDE1E7)" stroke-width="1.5"/>
        <!-- inner filled circle -->
        <circle cx="36" cy="36" r="28" fill="var(--cp-dial-bg,#F4F5F7)" stroke="var(--cp-dial-border,#DDE1E7)" stroke-width="1.5"/>
        <!-- tick marks (8 at 45° increments) -->
        ${[0,45,90,135,180,225,270,315].map(a => {
          const rad = (a - 90) * Math.PI / 180
          const x1 = 36 + Math.cos(rad) * 24
          const y1 = 36 + Math.sin(rad) * 24
          const x2 = 36 + Math.cos(rad) * 28
          const y2 = 36 + Math.sin(rad) * 28
          return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="var(--cp-dial-tick,#B6BFCE)" stroke-width="1.5" stroke-linecap="round"/>`
        }).join('')}
        <!-- center dot -->
        <circle cx="36" cy="36" r="3" fill="var(--accent,#2962FF)"/>
        <!-- indicator line (dynamic) -->
        <line class="dial-line" x1="36" y1="36" x2="36" y2="9" stroke="var(--accent,#2962FF)" stroke-width="2.5" stroke-linecap="round"/>
        <!-- thumb at end of line (dynamic) -->
        <circle class="dial-thumb" cx="36" cy="9" r="5" fill="var(--cp-modal-bg,#FFFFFF)" stroke="var(--accent,#2962FF)" stroke-width="2"/>
      </svg>
      <span class="cp-dial-readout">0°</span>
    </div>
    <div class="cp-dir-presets">
      ${PRESETS.map(p => `<button type="button" class="cp-dir-preset" data-angle="${p.angle}" title="${p.angle}°">${p.label}</button>`).join('')}
    </div>
  `

  const svg = container.querySelector('.cp-dial-svg')
  const dialLine = container.querySelector('.dial-line')
  const dialThumb = container.querySelector('.dial-thumb')
  const readout = container.querySelector('.cp-dial-readout')
  const presetBtns = container.querySelectorAll('.cp-dir-preset')

  function _updateVisuals () {
    const rad = (angle - 90) * (Math.PI / 180)
    const x = 36 + Math.cos(rad) * 28
    const y = 36 + Math.sin(rad) * 28
    dialLine.setAttribute('x2', x.toFixed(2))
    dialLine.setAttribute('y2', y.toFixed(2))
    dialThumb.setAttribute('cx', x.toFixed(2))
    dialThumb.setAttribute('cy', y.toFixed(2))
    readout.textContent = `${angle}°`
    presetBtns.forEach(btn => {
      btn.classList.toggle('is-active', parseInt(btn.dataset.angle) === angle)
    })
  }

  function _emitChange () {
    container.dispatchEvent(new CustomEvent('change', { detail: { angle }, bubbles: true }))
  }

  function _angleFromPointer (e) {
    const rect = svg.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = e.clientX - cx
    const dy = e.clientY - cy
    let deg = Math.atan2(dx, -dy) * (180 / Math.PI)
    if (deg < 0) deg += 360
    return Math.round(deg)
  }

  // Drag on SVG
  svg.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    svg.setPointerCapture(e.pointerId)
    angle = _angleFromPointer(e)
    _updateVisuals()
    svg.addEventListener('pointermove', (me) => {
      angle = _angleFromPointer(me)
      _updateVisuals()
    })
    svg.addEventListener('pointerup', () => {
      svg.removeEventListener('pointermove', _angleFromPointer)
      _emitChange()
    }, { once: true })
  })

  // Preset buttons
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      angle = parseInt(btn.dataset.angle)
      _updateVisuals()
      _emitChange()
    })
  })

  _updateVisuals()

  container.getAngle = () => angle
  container.setAngle = (deg) => {
    angle = ((deg % 360) + 360) % 360
    _updateVisuals()
  }

  return container
}
