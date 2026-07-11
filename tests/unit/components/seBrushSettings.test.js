import { describe, it, expect, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seBrushSettings.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

const STORAGE_KEY = 'svg-edit-custom-brushes'

const DEFAULT_PARAMS = {
  thickness: 6, angle: 45, roundness: 100, taperStart: 100, taperEnd: 100, opacity: 1, smoothness: 0.3
}

describe('se-brush-settings', () => {
  afterEach(() => {
    uninstallMockSvgEditor()
    localStorage.removeItem(STORAGE_KEY)
    document.body.innerHTML = ''
  })

  it('renders a shadow root with all 7 setting fields and 5 slots', () => {
    installMockSvgEditor({ svgCanvas: { getBrushParams: () => DEFAULT_PARAMS } })
    const el = mountElement('se-brush-settings')
    for (const id of ['brush_thickness', 'brush_angle', 'brush_roundness', 'brush_smoothness', 'brush_taper_start', 'brush_taper_end', 'brush_opacity']) {
      expect(el.shadowRoot.querySelector(`#${id}`)).toBeTruthy()
    }
    expect(el.shadowRoot.querySelectorAll('.slot').length).toBe(5)
  })

  it('open() seeds fields from svgCanvas.getBrushParams (percent fields scaled to 0-100)', () => {
    installMockSvgEditor({
      svgCanvas: {
        getBrushParams: () => ({ thickness: 8, angle: 30, roundness: 0, taperStart: 20, taperEnd: 80, opacity: 0.5, smoothness: 0.6 })
      }
    })
    const el = mountElement('se-brush-settings')
    el.open()
    expect(el.shadowRoot.querySelector('#brush_thickness').value).toBe('8')
    expect(el.shadowRoot.querySelector('#brush_angle').value).toBe('30')
    expect(el.shadowRoot.querySelector('#brush_opacity').value).toBe('50')
    expect(el.shadowRoot.querySelector('#brush_smoothness').value).toBe('60')
  })

  it('changing a plain field calls setBrushParams with the raw value', () => {
    const setBrushParams = vi.fn()
    installMockSvgEditor({ svgCanvas: { getBrushParams: () => DEFAULT_PARAMS, setBrushParams } })
    const el = mountElement('se-brush-settings')
    el.shadowRoot.querySelector('#brush_thickness').value = '15'
    el.shadowRoot.querySelector('#brush_thickness').dispatchEvent(new Event('change'))
    expect(setBrushParams).toHaveBeenCalledWith({ thickness: 15 })
  })

  it('changing a percent field (opacity/smoothness) divides by 100 before calling setBrushParams', () => {
    const setBrushParams = vi.fn()
    installMockSvgEditor({ svgCanvas: { getBrushParams: () => DEFAULT_PARAMS, setBrushParams } })
    const el = mountElement('se-brush-settings')
    el.shadowRoot.querySelector('#brush_opacity').value = '40'
    el.shadowRoot.querySelector('#brush_opacity').dispatchEvent(new Event('change'))
    expect(setBrushParams).toHaveBeenCalledWith({ opacity: 0.4 })
  })

  it('saving a slot persists the current field values and marks it filled', () => {
    installMockSvgEditor({ svgCanvas: { getBrushParams: () => DEFAULT_PARAMS, setBrushParams: vi.fn() } })
    const el = mountElement('se-brush-settings')
    el.shadowRoot.querySelector('#brush_thickness').value = '12'

    const slot0 = el.shadowRoot.querySelectorAll('.slot')[0]
    expect(slot0.querySelector('.slot-btn').classList.contains('filled')).toBe(false)
    slot0.querySelector('.slot-save').dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(slot0.querySelector('.slot-btn').classList.contains('filled')).toBe(true)
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
    expect(stored[0].thickness).toBe(12)
  })

  it('loading a slot applies its params via setBrushParams and updates the fields', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 1: { ...DEFAULT_PARAMS, thickness: 22, angle: 10 } }))
    const setBrushParams = vi.fn()
    installMockSvgEditor({ svgCanvas: { getBrushParams: () => DEFAULT_PARAMS, setBrushParams } })
    const el = mountElement('se-brush-settings')

    const slot1 = el.shadowRoot.querySelectorAll('.slot')[1]
    expect(slot1.querySelector('.slot-btn').classList.contains('filled')).toBe(true)
    slot1.querySelector('.slot-btn').dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(setBrushParams).toHaveBeenCalledWith(expect.objectContaining({ thickness: 22, angle: 10 }))
    expect(el.shadowRoot.querySelector('#brush_thickness').value).toBe('22')
  })

  it('deleting a slot clears it and unmarks it as filled', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 2: DEFAULT_PARAMS }))
    installMockSvgEditor({ svgCanvas: { getBrushParams: () => DEFAULT_PARAMS, setBrushParams: vi.fn() } })
    const el = mountElement('se-brush-settings')

    const slot2 = el.shadowRoot.querySelectorAll('.slot')[2]
    expect(slot2.querySelector('.slot-btn').classList.contains('filled')).toBe(true)
    slot2.querySelector('.slot-del').dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(slot2.querySelector('.slot-btn').classList.contains('filled')).toBe(false)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')[2]).toBeUndefined()
  })

  it('clicking an empty slot is a no-op', () => {
    const setBrushParams = vi.fn()
    installMockSvgEditor({ svgCanvas: { getBrushParams: () => DEFAULT_PARAMS, setBrushParams } })
    const el = mountElement('se-brush-settings')
    const slot3 = el.shadowRoot.querySelectorAll('.slot')[3]
    slot3.querySelector('.slot-btn').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(setBrushParams).not.toHaveBeenCalled()
  })

  it('only the slot matching the live brush is highlighted active — switching slots moves the highlight instead of accumulating it', () => {
    let liveParams = { ...DEFAULT_PARAMS }
    installMockSvgEditor({
      svgCanvas: {
        getBrushParams: () => liveParams,
        setBrushParams: (p) => { liveParams = { ...liveParams, ...p } }
      }
    })
    const el = mountElement('se-brush-settings')
    const slots = el.shadowRoot.querySelectorAll('.slot')
    const active = (i) => slots[i].querySelector('.slot-btn').classList.contains('active')
    const filled = (i) => slots[i].querySelector('.slot-btn').classList.contains('filled')

    // Save the current (default) live params into slot 0.
    slots[0].querySelector('.slot-save').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(active(0)).toBe(true)

    // Change thickness live (a real 'change' event, so it reaches setBrushParams),
    // then save that different state into slot 1.
    const thickness = el.shadowRoot.querySelector('#brush_thickness')
    thickness.value = '30'
    thickness.dispatchEvent(new Event('change'))
    slots[1].querySelector('.slot-save').dispatchEvent(new MouseEvent('click', { bubbles: true }))

    // Slot 1 now matches the live brush; slot 0 still has data (filled) but
    // is no longer the active one — this is the bug being fixed: both used
    // to stay highlighted here.
    expect(active(1)).toBe(true)
    expect(active(0)).toBe(false)
    expect(filled(0)).toBe(true)

    // Loading slot 0 moves the highlight back to exactly one slot.
    slots[0].querySelector('.slot-btn').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(active(0)).toBe(true)
    expect(active(1)).toBe(false)
  })
})
