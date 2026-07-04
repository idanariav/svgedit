import { describe, it, expect, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seRepeatSettings.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-repeat-settings', () => {
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with mode buttons and all field groups', () => {
    installMockSvgEditor()
    const el = mountElement('se-repeat-settings')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$radial).toBeTruthy()
    expect(el.$grid).toBeTruthy()
    expect(el.$path).toBeTruthy()
    expect(el.$fieldsRadial).toBeTruthy()
    expect(el.$fieldsGrid).toBeTruthy()
    expect(el.$fieldsPath).toBeTruthy()
  })

  it('defaults to radial mode, matching the markup default (grid/path fields pre-hidden inline)', () => {
    installMockSvgEditor()
    const el = mountElement('se-repeat-settings')
    // _mode starts as 'radial' in the constructor, but _setMode() (which
    // would set $fieldsRadial's inline display:flex) is only invoked from the
    // mode-button click handlers — so on initial render $fieldsRadial has no
    // inline display yet and is simply visible via the template's own CSS.
    expect(el._mode).toBe('radial')
    expect(el.$radial.getAttribute('aria-pressed')).toBe('true')
    expect(el.$fieldsRadial.style.display).toBe('')
    expect(el.$fieldsGrid.style.display).toBe('none')
    expect(el.$fieldsPath.style.display).toBe('none')
  })

  it('clicking Grid mode switches visible fields and aria-pressed state', () => {
    installMockSvgEditor()
    const el = mountElement('se-repeat-settings')
    el.$grid.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el._mode).toBe('grid')
    expect(el.$grid.getAttribute('aria-pressed')).toBe('true')
    expect(el.$radial.getAttribute('aria-pressed')).toBe('false')
    expect(el.$fieldsGrid.style.display).toBe('flex')
    expect(el.$fieldsRadial.style.display).toBe('none')
    expect(el.$fieldsPath.style.display).toBe('none')
  })

  it('clicking Path mode switches visible fields and aria-pressed state', () => {
    installMockSvgEditor()
    const el = mountElement('se-repeat-settings')
    el.$path.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el._mode).toBe('path')
    expect(el.$path.getAttribute('aria-pressed')).toBe('true')
    expect(el.$fieldsPath.style.display).toBe('flex')
    expect(el.$fieldsRadial.style.display).toBe('none')
    expect(el.$fieldsGrid.style.display).toBe('none')
  })

  it('defaults center to canvas with the custom-center row hidden', () => {
    installMockSvgEditor()
    const el = mountElement('se-repeat-settings')
    expect(el._center).toBe('canvas')
    expect(el.$centerCanvas.getAttribute('aria-pressed')).toBe('true')
    expect(el.$customCenterRow.style.display).toBe('none')
  })

  it('clicking "Custom" center reveals the custom-center row', () => {
    installMockSvgEditor()
    const el = mountElement('se-repeat-settings')
    el.$centerCustom.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el._center).toBe('custom')
    expect(el.$centerCustom.getAttribute('aria-pressed')).toBe('true')
    expect(el.$centerCanvas.getAttribute('aria-pressed')).toBe('false')
    expect(el.$customCenterRow.style.display).toBe('flex')
  })

  it('clicking "Own center" (selection) selects that center mode', () => {
    installMockSvgEditor()
    const el = mountElement('se-repeat-settings')
    el.$centerSelection.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el._center).toBe('selection')
    expect(el.$centerSelection.getAttribute('aria-pressed')).toBe('true')
  })

  it('center readout shows "not set" until both coordinates are finite', () => {
    installMockSvgEditor()
    const el = mountElement('se-repeat-settings')
    el._updateCenterReadout()
    expect(el.$centerReadout.textContent).toBe('not set')
    el._centerX = 12.4
    el._updateCenterReadout()
    expect(el.$centerReadout.textContent).toBe('not set') // still missing Y
    el._centerY = 30.6
    el._updateCenterReadout()
    expect(el.$centerReadout.textContent).toBe('12, 31')
  })

  it('clicking "Pick center" closes the popover and arms armRepeatCenterPick', () => {
    const armRepeatCenterPick = vi.fn()
    installMockSvgEditor({ svgCanvas: { armRepeatCenterPick } })
    const el = mountElement('se-repeat-settings')
    el.open()
    el.$pickCenter.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el.isOpen).toBe(false)
    expect(armRepeatCenterPick).toHaveBeenCalledTimes(1)
    expect(typeof armRepeatCenterPick.mock.calls[0][0]).toBe('function')
  })

  it('the armed pick-center callback sets coordinates, switches to custom center, and reopens', () => {
    let capturedCallback
    installMockSvgEditor({
      svgCanvas: { armRepeatCenterPick: (cb) => { capturedCallback = cb } }
    })
    const el = mountElement('se-repeat-settings')
    el.open()
    el.$pickCenter.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    capturedCallback(50, 75)

    expect(el._centerX).toBe(50)
    expect(el._centerY).toBe(75)
    expect(el._center).toBe('custom')
    expect(el.isOpen).toBe(true)
    expect(el.$centerReadout.textContent).toBe('50, 75')
  })

  it('reopening after a pick restores the snapshotted radial fields instead of reseeding from getRepeatParams', () => {
    let capturedCallback
    const getRepeatParams = vi.fn(() => ({ mode: 'radial', count: 99, sweep: 99, center: 'canvas' }))
    installMockSvgEditor({
      svgCanvas: { armRepeatCenterPick: (cb) => { capturedCallback = cb }, getRepeatParams }
    })
    const el = mountElement('se-repeat-settings')
    el.$radial.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    el.shadowRoot.querySelector('#repeat_count').value = '7'
    el.shadowRoot.querySelector('#repeat_sweep').value = '270'

    el.$pickCenter.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    capturedCallback(10, 20)

    // Should restore the in-progress snapshot (7 / 270), not the 99/99 from
    // getRepeatParams, and not clobber it via the normal seeding path.
    expect(el.shadowRoot.querySelector('#repeat_count').value).toBe('7')
    expect(el.shadowRoot.querySelector('#repeat_sweep').value).toBe('270')
  })

  it('open() with no existing repeat keeps defaults and labels the button "Apply"', () => {
    installMockSvgEditor({ svgCanvas: { getRepeatParams: () => null } })
    const el = mountElement('se-repeat-settings')
    el.open()
    expect(el.$apply.textContent).toBe('Apply')
  })

  it('open() seeds radial fields/center from an existing radial repeat, labels "Update"', () => {
    installMockSvgEditor({
      svgCanvas: {
        getRepeatParams: () => ({ mode: 'radial', count: 8, sweep: 180, center: 'custom', centerX: 5, centerY: 6 })
      }
    })
    const el = mountElement('se-repeat-settings')
    el.open()
    expect(el._mode).toBe('radial')
    expect(el.shadowRoot.querySelector('#repeat_count').value).toBe('8')
    expect(el.shadowRoot.querySelector('#repeat_sweep').value).toBe('180')
    expect(el._center).toBe('custom')
    expect(el._centerX).toBe(5)
    expect(el._centerY).toBe(6)
    expect(el.$apply.textContent).toBe('Update')
  })

  it('open() seeds grid fields from an existing grid repeat', () => {
    installMockSvgEditor({
      svgCanvas: {
        getRepeatParams: () => ({ mode: 'grid', rows: 4, cols: 5, gapX: 30, gapY: 40 })
      }
    })
    const el = mountElement('se-repeat-settings')
    el.open()
    expect(el._mode).toBe('grid')
    expect(el.shadowRoot.querySelector('#repeat_rows').value).toBe('4')
    expect(el.shadowRoot.querySelector('#repeat_cols').value).toBe('5')
    expect(el.shadowRoot.querySelector('#repeat_gap_x').value).toBe('30')
    expect(el.shadowRoot.querySelector('#repeat_gap_y').value).toBe('40')
  })

  it('open() seeds path fields (incl. follow toggle) from an existing path repeat', () => {
    installMockSvgEditor({
      svgCanvas: {
        getRepeatParams: () => ({ mode: 'path', count: 12, offset: 5, span: 90, follow: false })
      }
    })
    const el = mountElement('se-repeat-settings')
    el.open()
    expect(el._mode).toBe('path')
    expect(el.shadowRoot.querySelector('#repeat_path_count').value).toBe('12')
    expect(el.shadowRoot.querySelector('#repeat_path_offset').value).toBe('5')
    expect(el.shadowRoot.querySelector('#repeat_path_span').value).toBe('90')
    expect(el.$follow.getAttribute('aria-pressed')).toBe('false')
  })

  it('apply() in radial mode calls repeatSelection with rounded/clamped params and closes', () => {
    const repeatSelection = vi.fn()
    installMockSvgEditor({ svgCanvas: { repeatSelection } })
    const el = mountElement('se-repeat-settings')
    el.shadowRoot.querySelector('#repeat_count').value = '4.6'
    el.shadowRoot.querySelector('#repeat_sweep').value = '270'
    el.apply()
    expect(repeatSelection).toHaveBeenCalledWith({
      mode: 'radial', count: 5, sweep: 270, center: 'canvas', centerX: null, centerY: null
    })
    expect(el.isOpen).toBe(false)
  })

  it('apply() in grid mode calls repeatSelection with grid params', () => {
    const repeatSelection = vi.fn()
    installMockSvgEditor({ svgCanvas: { repeatSelection } })
    const el = mountElement('se-repeat-settings')
    el.$grid.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    el.shadowRoot.querySelector('#repeat_rows').value = '3'
    el.shadowRoot.querySelector('#repeat_cols').value = '4'
    el.shadowRoot.querySelector('#repeat_gap_x').value = '25'
    el.shadowRoot.querySelector('#repeat_gap_y').value = '35'
    el.apply()
    expect(repeatSelection).toHaveBeenCalledWith({
      mode: 'grid', rows: 3, cols: 4, gapX: 25, gapY: 35
    })
  })

  it('apply() in path mode calls repeatSelection with path params incl. follow', () => {
    const repeatSelection = vi.fn()
    installMockSvgEditor({ svgCanvas: { repeatSelection } })
    const el = mountElement('se-repeat-settings')
    el.$path.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    el.shadowRoot.querySelector('#repeat_path_count').value = '10'
    el.shadowRoot.querySelector('#repeat_path_offset').value = '15'
    el.shadowRoot.querySelector('#repeat_path_span').value = '80'
    el.apply()
    expect(repeatSelection).toHaveBeenCalledWith({
      mode: 'path', count: 10, offset: 15, span: 80, follow: true
    })
  })

  it('clicking the follow toggle flips its aria-pressed state', () => {
    installMockSvgEditor()
    const el = mountElement('se-repeat-settings')
    expect(el.$follow.getAttribute('aria-pressed')).toBe('true')
    el.$follow.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el.$follow.getAttribute('aria-pressed')).toBe('false')
  })

  it('apply() falls back to defaults for non-numeric radial field values', () => {
    const repeatSelection = vi.fn()
    installMockSvgEditor({ svgCanvas: { repeatSelection } })
    const el = mountElement('se-repeat-settings')
    el.shadowRoot.querySelector('#repeat_count').value = 'abc'
    el.shadowRoot.querySelector('#repeat_sweep').value = 'xyz'
    el.apply()
    expect(repeatSelection).toHaveBeenCalledWith({
      mode: 'radial', count: 6, sweep: 360, center: 'canvas', centerX: null, centerY: null
    })
  })

  it('does not throw when repeatSelection is absent', () => {
    installMockSvgEditor({ svgCanvas: {} })
    const el = mountElement('se-repeat-settings')
    expect(() => el.apply()).not.toThrow()
  })
})
