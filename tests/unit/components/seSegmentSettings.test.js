import { describe, it, expect, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seSegmentSettings.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-segment-settings', () => {
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with mode buttons and both field groups', () => {
    installMockSvgEditor()
    const el = mountElement('se-segment-settings')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$radial).toBeTruthy()
    expect(el.$grid).toBeTruthy()
    expect(el.$splitOff).toBeTruthy()
    expect(el.$splitOn).toBeTruthy()
    expect(el.$fieldsRadial).toBeTruthy()
    expect(el.$fieldsGrid).toBeTruthy()
  })

  it('defaults to radial mode and non-split, matching the markup default', () => {
    installMockSvgEditor()
    const el = mountElement('se-segment-settings')
    expect(el._mode).toBe('radial')
    expect(el._split).toBe(false)
    expect(el.$radial.getAttribute('aria-pressed')).toBe('true')
    expect(el.$splitOff.getAttribute('aria-pressed')).toBe('true')
    expect(el.$fieldsRadial.style.display).toBe('')
    expect(el.$fieldsGrid.style.display).toBe('none')
  })

  it('clicking Grid mode switches visible fields and aria-pressed state', () => {
    installMockSvgEditor()
    const el = mountElement('se-segment-settings')
    el.$grid.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el._mode).toBe('grid')
    expect(el.$grid.getAttribute('aria-pressed')).toBe('true')
    expect(el.$radial.getAttribute('aria-pressed')).toBe('false')
    expect(el.$fieldsGrid.style.display).toBe('flex')
    expect(el.$fieldsRadial.style.display).toBe('none')
  })

  it('clicking Split switches the split toggle state', () => {
    installMockSvgEditor()
    const el = mountElement('se-segment-settings')
    el.$splitOn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el._split).toBe(true)
    expect(el.$splitOn.getAttribute('aria-pressed')).toBe('true')
    expect(el.$splitOff.getAttribute('aria-pressed')).toBe('false')
  })

  it('defaults grid axis to vertical', () => {
    installMockSvgEditor()
    const el = mountElement('se-segment-settings')
    expect(el._axis).toBe('vertical')
    expect(el.$axisVertical.getAttribute('aria-pressed')).toBe('true')
  })

  it('clicking Horizontal switches the grid axis', () => {
    installMockSvgEditor()
    const el = mountElement('se-segment-settings')
    el.$axisHorizontal.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el._axis).toBe('horizontal')
    expect(el.$axisHorizontal.getAttribute('aria-pressed')).toBe('true')
    expect(el.$axisVertical.getAttribute('aria-pressed')).toBe('false')
  })

  it('open() with no existing segment keeps defaults and labels the button "Apply"', () => {
    installMockSvgEditor({ svgCanvas: { getSegmentParams: () => null } })
    const el = mountElement('se-segment-settings')
    el.open()
    expect(el.$apply.textContent).toBe('Apply')
  })

  it('open() seeds radial fields from an existing non-split radial segment, labels "Update"', () => {
    installMockSvgEditor({
      svgCanvas: {
        getSegmentParams: () => ({ mode: 'radial', count: 8, startAngle: 0, split: false })
      }
    })
    const el = mountElement('se-segment-settings')
    el.open()
    expect(el._mode).toBe('radial')
    expect(el._split).toBe(false)
    expect(el.shadowRoot.querySelector('#segment_count').value).toBe('8')
    expect(el.shadowRoot.querySelector('#segment_start_angle').value).toBe('0')
    expect(el.$apply.textContent).toBe('Update')
  })

  it('open() seeds grid fields from an existing grid segment', () => {
    installMockSvgEditor({
      svgCanvas: {
        getSegmentParams: () => ({ mode: 'grid', count: 5, split: false, axis: 'horizontal' })
      }
    })
    const el = mountElement('se-segment-settings')
    el.open()
    expect(el._mode).toBe('grid')
    expect(el.shadowRoot.querySelector('#segment_grid_count').value).toBe('5')
    expect(el._axis).toBe('horizontal')
  })

  it('apply() in radial mode calls segmentSelection with rounded/clamped params and closes', () => {
    const segmentSelection = vi.fn()
    installMockSvgEditor({ svgCanvas: { segmentSelection } })
    const el = mountElement('se-segment-settings')
    el.shadowRoot.querySelector('#segment_count').value = '4.6'
    el.shadowRoot.querySelector('#segment_start_angle').value = '30'
    el.apply()
    expect(segmentSelection).toHaveBeenCalledWith({
      mode: 'radial', split: false, count: 5, startAngle: 30
    })
    expect(el.isOpen).toBe(false)
  })

  it('apply() in grid mode calls segmentSelection with grid params', () => {
    const segmentSelection = vi.fn()
    installMockSvgEditor({ svgCanvas: { segmentSelection } })
    const el = mountElement('se-segment-settings')
    el.$grid.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    el.$splitOn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    el.$axisHorizontal.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    el.shadowRoot.querySelector('#segment_grid_count').value = '3'
    el.apply()
    expect(segmentSelection).toHaveBeenCalledWith({
      mode: 'grid', split: true, count: 3, axis: 'horizontal'
    })
  })

  it('apply() falls back to defaults for non-numeric radial field values', () => {
    const segmentSelection = vi.fn()
    installMockSvgEditor({ svgCanvas: { segmentSelection } })
    const el = mountElement('se-segment-settings')
    el.shadowRoot.querySelector('#segment_count').value = 'abc'
    el.shadowRoot.querySelector('#segment_start_angle').value = 'xyz'
    el.apply()
    expect(segmentSelection).toHaveBeenCalledWith({
      mode: 'radial', split: false, count: 4, startAngle: -90
    })
  })

  it('does not throw when segmentSelection is absent', () => {
    installMockSvgEditor({ svgCanvas: {} })
    const el = mountElement('se-segment-settings')
    expect(() => el.apply()).not.toThrow()
  })
})
