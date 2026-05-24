/**
 * Slider.js — reusable horizontal slider factory (not a custom element).
 * Returns a <div class="cp-slider"> element with getValue/setValue methods.
 */

/**
 * @param {{label:string, min:number, max:number, value:number, unit?:string, step?:number}} opts
 * @returns {HTMLDivElement & {getValue():number, setValue(n:number):void}}
 */
export function createSlider ({ label, min, max, value, unit = '', step = 1 }) {
  let current = Math.min(max, Math.max(min, value))

  const el = document.createElement('div')
  el.className = 'cp-slider'
  el.innerHTML = `
    <span class="cp-slider-label">${label}</span>
    <div class="cp-slider-track">
      <div class="cp-slider-fill"></div>
      <div class="cp-slider-thumb"></div>
    </div>
    <span class="cp-slider-readout">${current}${unit}</span>
  `

  const track = el.querySelector('.cp-slider-track')
  const fill = el.querySelector('.cp-slider-fill')
  const thumb = el.querySelector('.cp-slider-thumb')
  const readout = el.querySelector('.cp-slider-readout')

  function updateVisuals () {
    const pct = ((current - min) / (max - min)) * 100
    fill.style.width = `${pct}%`
    thumb.style.left = `${pct}%`
    readout.textContent = `${current}${unit}`
  }

  function setFromPointer (e) {
    const rect = track.getBoundingClientRect()
    const raw = (e.clientX - rect.left) / rect.width
    const clamped = Math.min(1, Math.max(0, raw))
    const newVal = Math.round((min + clamped * (max - min)) / step) * step
    if (newVal !== current) {
      current = newVal
      updateVisuals()
      el.dispatchEvent(new CustomEvent('change', { detail: { value: current }, bubbles: true }))
    }
  }

  thumb.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    thumb.setPointerCapture(e.pointerId)
    thumb.addEventListener('pointermove', setFromPointer)
    thumb.addEventListener('pointerup', () => {
      thumb.removeEventListener('pointermove', setFromPointer)
    }, { once: true })
  })

  track.addEventListener('pointerdown', (e) => {
    if (e.target === thumb) return
    setFromPointer(e)
  })

  updateVisuals()

  /** @type {function():number} */
  el.getValue = () => current

  /** @type {function(number):void} */
  el.setValue = (n) => {
    current = Math.min(max, Math.max(min, Math.round(n / step) * step))
    updateVisuals()
  }

  return el
}
