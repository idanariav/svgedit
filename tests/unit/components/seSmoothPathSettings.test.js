import { describe, it, expect, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seSmoothPathSettings.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-smooth-path-settings', () => {
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with the strength field and apply button', () => {
    installMockSvgEditor()
    const el = mountElement('se-smooth-path-settings')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$strength).toBeTruthy()
    expect(el.$apply).toBeTruthy()
  })

  it('defaults the strength field to 40', () => {
    installMockSvgEditor()
    const el = mountElement('se-smooth-path-settings')
    expect(el.$strength.value).toBe('40')
  })

  it('open() previews at the current strength (40% -> 0.4)', () => {
    const previewSmoothPath = vi.fn()
    installMockSvgEditor({ svgCanvas: { previewSmoothPath } })
    const el = mountElement('se-smooth-path-settings')
    el.open()
    expect(previewSmoothPath).toHaveBeenCalledWith(0.4)
    expect(el.isOpen).toBe(true)
  })

  it('changing the strength field previews live at the new value', () => {
    const previewSmoothPath = vi.fn()
    installMockSvgEditor({ svgCanvas: { previewSmoothPath } })
    const el = mountElement('se-smooth-path-settings')
    el.$strength.value = '80'
    el.$strength.dispatchEvent(new Event('change'))
    expect(previewSmoothPath).toHaveBeenCalledWith(0.8)
  })

  it('clamps out-of-range strength values before previewing', () => {
    const previewSmoothPath = vi.fn()
    installMockSvgEditor({ svgCanvas: { previewSmoothPath } })
    const el = mountElement('se-smooth-path-settings')
    el.$strength.value = '150'
    el.$strength.dispatchEvent(new Event('change'))
    expect(previewSmoothPath).toHaveBeenCalledWith(1)

    el.$strength.value = '-20'
    el.$strength.dispatchEvent(new Event('change'))
    expect(previewSmoothPath).toHaveBeenCalledWith(0)
  })

  it('apply() commits the preview and closes without cancelling', () => {
    const commitSmoothPath = vi.fn()
    const cancelSmoothPath = vi.fn()
    installMockSvgEditor({ svgCanvas: { commitSmoothPath, cancelSmoothPath } })
    const el = mountElement('se-smooth-path-settings')
    el.open()
    el.$apply.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(commitSmoothPath).toHaveBeenCalled()
    expect(cancelSmoothPath).not.toHaveBeenCalled()
    expect(el.isOpen).toBe(false)
  })

  it('closing without applying (e.g. Escape/light-dismiss) cancels the preview', () => {
    const cancelSmoothPath = vi.fn()
    installMockSvgEditor({ svgCanvas: { cancelSmoothPath } })
    const el = mountElement('se-smooth-path-settings')
    el.open()
    el.close()
    expect(cancelSmoothPath).toHaveBeenCalled()
    expect(el.isOpen).toBe(false)
  })

  it('a browser-driven close (outside click / Escape, bypassing close()) still cancels the preview', () => {
    const cancelSmoothPath = vi.fn()
    installMockSvgEditor({ svgCanvas: { cancelSmoothPath } })
    const el = mountElement('se-smooth-path-settings')
    el.open()
    // Simulate native light-dismiss/Escape: the browser hides the popover
    // directly, without going through our close() override.
    el.$popup.hidePopover()
    expect(cancelSmoothPath).toHaveBeenCalled()
    expect(el.isOpen).toBe(false)
  })

  it('reopening after a cancelled close previews fresh (does not auto-cancel again)', () => {
    const cancelSmoothPath = vi.fn()
    const previewSmoothPath = vi.fn()
    installMockSvgEditor({ svgCanvas: { cancelSmoothPath, previewSmoothPath } })
    const el = mountElement('se-smooth-path-settings')
    el.open()
    el.close()
    expect(cancelSmoothPath).toHaveBeenCalledTimes(1)

    el.open()
    el.close()
    expect(cancelSmoothPath).toHaveBeenCalledTimes(2)
  })

  it('does not throw when preview/commit/cancel are absent', () => {
    installMockSvgEditor({ svgCanvas: {} })
    const el = mountElement('se-smooth-path-settings')
    expect(() => el.open()).not.toThrow()
    expect(() => el.$apply.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow()
    expect(() => el.close()).not.toThrow()
  })
})
