import { describe, it, expect, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seGuidesSettings.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-guides-settings', () => {
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with the overlay toggles and guide buttons', () => {
    installMockSvgEditor()
    const el = mountElement('se-guides-settings')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.shadowRoot.querySelector('#ov_thirds')).toBeTruthy()
    expect(el.shadowRoot.querySelector('#ov_golden')).toBeTruthy()
    expect(el.shadowRoot.querySelector('#ov_center')).toBeTruthy()
    expect(el.shadowRoot.querySelector('#guide_add_v')).toBeTruthy()
    expect(el.shadowRoot.querySelector('#guide_add_h')).toBeTruthy()
    expect(el.shadowRoot.querySelector('#guides_clear')).toBeTruthy()
  })

  it('clicking an overlay toggle flips aria-pressed and calls setCompOverlay', () => {
    const setCompOverlay = vi.fn()
    installMockSvgEditor({ svgCanvas: { setCompOverlay } })
    const el = mountElement('se-guides-settings')
    const btn = el.shadowRoot.querySelector('#ov_thirds')
    expect(btn.getAttribute('aria-pressed')).toBe('false')

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(setCompOverlay).toHaveBeenCalledWith('thirds', true)

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    expect(setCompOverlay).toHaveBeenCalledWith('thirds', false)
  })

  it('each overlay kind (golden, center) toggles independently', () => {
    const setCompOverlay = vi.fn()
    installMockSvgEditor({ svgCanvas: { setCompOverlay } })
    const el = mountElement('se-guides-settings')
    el.shadowRoot.querySelector('#ov_golden').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    el.shadowRoot.querySelector('#ov_center').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(setCompOverlay).toHaveBeenCalledWith('golden', true)
    expect(setCompOverlay).toHaveBeenCalledWith('center', true)
  })

  it('does not throw when setCompOverlay is absent (optional chaining)', () => {
    installMockSvgEditor({ svgCanvas: {} })
    const el = mountElement('se-guides-settings')
    expect(() => el.shadowRoot.querySelector('#ov_thirds')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow()
  })

  it('clicking "Clear all guides" calls clearRulerGuides', () => {
    const clearRulerGuides = vi.fn()
    installMockSvgEditor({ svgCanvas: { clearRulerGuides } })
    const el = mountElement('se-guides-settings')
    el.shadowRoot.querySelector('#guides_clear').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(clearRulerGuides).toHaveBeenCalled()
  })

  it('clicking "+ Vertical" calls addRulerGuide("v")', () => {
    const addRulerGuide = vi.fn()
    installMockSvgEditor({ svgCanvas: { addRulerGuide } })
    const el = mountElement('se-guides-settings')
    el.shadowRoot.querySelector('#guide_add_v').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(addRulerGuide).toHaveBeenCalledWith('v')
  })

  it('clicking "+ Horizontal" calls addRulerGuide("h")', () => {
    const addRulerGuide = vi.fn()
    installMockSvgEditor({ svgCanvas: { addRulerGuide } })
    const el = mountElement('se-guides-settings')
    el.shadowRoot.querySelector('#guide_add_h').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(addRulerGuide).toHaveBeenCalledWith('h')
  })

  it('open() seeds overlay button states from getCompOverlays()', () => {
    installMockSvgEditor({
      svgCanvas: { getCompOverlays: () => ({ thirds: true, golden: false, center: true }) }
    })
    const el = mountElement('se-guides-settings')
    el.open()
    expect(el.shadowRoot.querySelector('#ov_thirds').getAttribute('aria-pressed')).toBe('true')
    expect(el.shadowRoot.querySelector('#ov_golden').getAttribute('aria-pressed')).toBe('false')
    expect(el.shadowRoot.querySelector('#ov_center').getAttribute('aria-pressed')).toBe('true')
    expect(el.isOpen).toBe(true)
  })

  it('open() defaults all overlay states to false when getCompOverlays is absent', () => {
    installMockSvgEditor({ svgCanvas: {} })
    const el = mountElement('se-guides-settings')
    el.open()
    for (const kind of ['thirds', 'golden', 'center']) {
      expect(el.shadowRoot.querySelector(`#ov_${kind}`).getAttribute('aria-pressed')).toBe('false')
    }
  })
})
