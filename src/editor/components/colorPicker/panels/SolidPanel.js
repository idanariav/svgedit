/**
 * SolidPanel.js — solid-color tab panel. Factory function.
 */

import { createHsvBox } from './shared/HsvBox.js'
import { paintToState } from '../PaintModel.js'

/**
 * @param {import('../PaintModel.js').Paint} paint
 * @returns {HTMLElement & { getPaintState():object, setFromPaint(p:object):void }}
 */
export function createSolidPanel (paint) {
  const state = paintToState(paint)
  const hex = state.tab === 'solid' ? (state.hex || '2962ff') : '2962ff'
  const alpha = state.tab === 'solid' ? (state.alpha ?? 100) : 100
  const origHex = hex

  const hsvBox = createHsvBox(hex, alpha, origHex)

  const panel = document.createElement('div')
  panel.className = 'cp-body cp-body-solid'
  panel.appendChild(hsvBox)

  // Forward color-change events
  hsvBox.addEventListener('color-change', (e) => {
    panel.dispatchEvent(new CustomEvent('color-change', { detail: e.detail, bubbles: true }))
  })

  panel.getPaintState = () => ({
    tab: 'solid',
    solidColor: hsvBox.hex,
    alpha: hsvBox.alpha
  })

  panel.setFromPaint = (p) => {
    const s = paintToState(p)
    if (s.hex) hsvBox.setHex(s.hex)
    if (s.alpha !== undefined) hsvBox.setAlpha(s.alpha)
  }

  panel.setFromHex = (hex) => {
    hsvBox.setHex(hex.replace('#', ''))
  }

  return panel
}
