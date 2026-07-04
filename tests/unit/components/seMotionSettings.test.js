import { describe, it, expect, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seMotionSettings.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-motion-settings', () => {
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with direction buttons and spin inputs', () => {
    installMockSvgEditor()
    const el = mountElement('se-motion-settings')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.shadowRoot.querySelector('#motion_count')).toBeTruthy()
    expect(el.shadowRoot.querySelector('#motion_len')).toBeTruthy()
    expect(el.shadowRoot.querySelector('#motion_gap')).toBeTruthy()
    expect(el.shadowRoot.querySelector('#motion_curve')).toBeTruthy()
    expect(el.$apply).toBeTruthy()
  })

  it('defaults direction to left with the left button pressed', () => {
    installMockSvgEditor()
    const el = mountElement('se-motion-settings')
    expect(el._dir).toBe('left')
    const left = el.shadowRoot.querySelector('[data-dir="left"]')
    expect(left.getAttribute('aria-pressed')).toBe('true')
  })

  it('clicking a direction button updates _dir and aria-pressed across all buttons', () => {
    installMockSvgEditor()
    const el = mountElement('se-motion-settings')
    el.shadowRoot.querySelector('[data-dir="up"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el._dir).toBe('up')
    expect(el.shadowRoot.querySelector('[data-dir="up"]').getAttribute('aria-pressed')).toBe('true')
    expect(el.shadowRoot.querySelector('[data-dir="left"]').getAttribute('aria-pressed')).toBe('false')
    expect(el.shadowRoot.querySelector('[data-dir="right"]').getAttribute('aria-pressed')).toBe('false')
    expect(el.shadowRoot.querySelector('[data-dir="down"]').getAttribute('aria-pressed')).toBe('false')
  })

  it('open() with no existing motion lines keeps defaults and labels the button "Apply"', () => {
    installMockSvgEditor({ svgCanvas: { getMotionParams: () => null } })
    const el = mountElement('se-motion-settings')
    el.open()
    expect(el.$apply.textContent).toBe('Apply')
    expect(el.isOpen).toBe(true)
  })

  it('open() seeds fields and direction from existing motion params, labels button "Update"', () => {
    installMockSvgEditor({
      svgCanvas: {
        getMotionParams: () => ({ dir: 'right', count: 5, len: 100, gap: 20, curve: -10 })
      }
    })
    const el = mountElement('se-motion-settings')
    el.open()
    expect(el._dir).toBe('right')
    expect(el.shadowRoot.querySelector('[data-dir="right"]').getAttribute('aria-pressed')).toBe('true')
    // se-spin-input's `value` setter assigns straight to the inner
    // <input>.value, which coerces to a string.
    expect(el.shadowRoot.querySelector('#motion_count').value).toBe('5')
    expect(el.shadowRoot.querySelector('#motion_len').value).toBe('100')
    expect(el.shadowRoot.querySelector('#motion_gap').value).toBe('20')
    expect(el.shadowRoot.querySelector('#motion_curve').value).toBe('-10')
    expect(el.$apply.textContent).toBe('Update')
  })

  it('apply() calls applyMotionLines with parsed numeric params and closes', () => {
    const applyMotionLines = vi.fn()
    installMockSvgEditor({ svgCanvas: { applyMotionLines, getMotionParams: () => null } })
    const el = mountElement('se-motion-settings')
    el.open()
    el.shadowRoot.querySelector('#motion_count').value = '4'
    el.shadowRoot.querySelector('#motion_len').value = '90'
    el.shadowRoot.querySelector('#motion_gap').value = '12'
    el.shadowRoot.querySelector('#motion_curve').value = '5'
    el.apply()
    expect(applyMotionLines).toHaveBeenCalledWith({
      dir: 'left', count: 4, len: 90, gap: 12, curve: 5
    })
    expect(el.isOpen).toBe(false)
  })

  it('apply() rounds count and clamps it to a minimum of 1', () => {
    const applyMotionLines = vi.fn()
    installMockSvgEditor({ svgCanvas: { applyMotionLines } })
    const el = mountElement('se-motion-settings')
    el.shadowRoot.querySelector('#motion_count').value = '0.4'
    el.apply()
    expect(applyMotionLines.mock.calls[0][0].count).toBe(1)
  })

  it('apply() falls back to defaults for non-numeric field values', () => {
    const applyMotionLines = vi.fn()
    installMockSvgEditor({ svgCanvas: { applyMotionLines } })
    const el = mountElement('se-motion-settings')
    el.shadowRoot.querySelector('#motion_count').value = 'abc'
    el.shadowRoot.querySelector('#motion_len').value = 'xyz'
    el.shadowRoot.querySelector('#motion_gap').value = ''
    el.shadowRoot.querySelector('#motion_curve').value = 'nope'
    el.apply()
    expect(applyMotionLines).toHaveBeenCalledWith({
      dir: 'left', count: 3, len: 80, gap: 15, curve: 0
    })
  })

  it('clicking Apply invokes apply()', () => {
    const applyMotionLines = vi.fn()
    installMockSvgEditor({ svgCanvas: { applyMotionLines } })
    const el = mountElement('se-motion-settings')
    el.$apply.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(applyMotionLines).toHaveBeenCalled()
  })

  it('does not throw when applyMotionLines is absent', () => {
    installMockSvgEditor({ svgCanvas: {} })
    const el = mountElement('se-motion-settings')
    expect(() => el.apply()).not.toThrow()
  })
})
