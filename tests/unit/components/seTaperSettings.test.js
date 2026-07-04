import { describe, it, expect, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seTaperSettings.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-taper-settings', () => {
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with start/end fields and apply/remove buttons', () => {
    installMockSvgEditor()
    const el = mountElement('se-taper-settings')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.shadowRoot.querySelector('#taper_start')).toBeTruthy()
    expect(el.shadowRoot.querySelector('#taper_end')).toBeTruthy()
    expect(el.$apply).toBeTruthy()
    expect(el.$remove).toBeTruthy()
  })

  it('open() with no existing taper hides Remove and labels the button "Apply"', () => {
    installMockSvgEditor({ svgCanvas: { getTaperParams: () => null } })
    const el = mountElement('se-taper-settings')
    el.open()
    expect(el.$apply.textContent).toBe('Apply')
    expect(el.$remove.style.display).toBe('none')
    expect(el.isOpen).toBe(true)
  })

  it('open() seeds fields from an existing taper, shows Remove, labels button "Update"', () => {
    installMockSvgEditor({ svgCanvas: { getTaperParams: () => ({ start: 80, end: 20 }) } })
    const el = mountElement('se-taper-settings')
    el.open()
    expect(el.shadowRoot.querySelector('#taper_start').value).toBe('80')
    expect(el.shadowRoot.querySelector('#taper_end').value).toBe('20')
    expect(el.$apply.textContent).toBe('Update')
    expect(el.$remove.style.display).toBe('')
  })

  it('apply() calls applyTaperStroke with parsed clamped values and closes', () => {
    const applyTaperStroke = vi.fn()
    installMockSvgEditor({ svgCanvas: { applyTaperStroke } })
    const el = mountElement('se-taper-settings')
    el.open()
    el.shadowRoot.querySelector('#taper_start').value = '70'
    el.shadowRoot.querySelector('#taper_end').value = '10'
    el.$apply.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(applyTaperStroke).toHaveBeenCalledWith({ start: 70, end: 10 })
    expect(el.isOpen).toBe(false)
  })

  it('apply() clamps out-of-range values to [0, 100]', () => {
    const applyTaperStroke = vi.fn()
    installMockSvgEditor({ svgCanvas: { applyTaperStroke } })
    const el = mountElement('se-taper-settings')
    el.shadowRoot.querySelector('#taper_start').value = '150'
    el.shadowRoot.querySelector('#taper_end').value = '-30'
    el.$apply.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(applyTaperStroke).toHaveBeenCalledWith({ start: 100, end: 0 })
  })

  it('apply() falls back to defaults (100/0) for non-numeric field values', () => {
    const applyTaperStroke = vi.fn()
    installMockSvgEditor({ svgCanvas: { applyTaperStroke } })
    const el = mountElement('se-taper-settings')
    el.shadowRoot.querySelector('#taper_start').value = 'abc'
    el.shadowRoot.querySelector('#taper_end').value = 'xyz'
    el.$apply.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(applyTaperStroke).toHaveBeenCalledWith({ start: 100, end: 0 })
  })

  it('clicking Remove calls removeTaperStroke and closes', () => {
    const removeTaperStroke = vi.fn()
    installMockSvgEditor({ svgCanvas: { removeTaperStroke } })
    const el = mountElement('se-taper-settings')
    el.open()
    el.$remove.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(removeTaperStroke).toHaveBeenCalled()
    expect(el.isOpen).toBe(false)
  })

  it('does not throw when applyTaperStroke/removeTaperStroke are absent', () => {
    installMockSvgEditor({ svgCanvas: {} })
    const el = mountElement('se-taper-settings')
    expect(() => el.$apply.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow()
    expect(() => el.$remove.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow()
  })
})
