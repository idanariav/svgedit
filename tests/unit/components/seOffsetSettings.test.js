import { describe, it, expect, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seOffsetSettings.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-offset-settings', () => {
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with the distance field and direction buttons', () => {
    installMockSvgEditor()
    const el = mountElement('se-offset-settings')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$dist).toBeTruthy()
    expect(el.$out).toBeTruthy()
    expect(el.$in).toBeTruthy()
    expect(el.$apply).toBeTruthy()
  })

  it('defaults direction to outset with the outset button pressed', () => {
    installMockSvgEditor()
    const el = mountElement('se-offset-settings')
    expect(el._direction).toBe('outset')
    expect(el.$out.getAttribute('aria-pressed')).toBe('true')
    expect(el.$in.getAttribute('aria-pressed')).toBe('false')
  })

  it('clicking Inset switches direction and aria-pressed state', () => {
    installMockSvgEditor()
    const el = mountElement('se-offset-settings')
    el.$in.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el._direction).toBe('inset')
    expect(el.$in.getAttribute('aria-pressed')).toBe('true')
    expect(el.$out.getAttribute('aria-pressed')).toBe('false')
  })

  it('clicking Outset after Inset switches back', () => {
    installMockSvgEditor()
    const el = mountElement('se-offset-settings')
    el.$in.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    el.$out.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el._direction).toBe('outset')
    expect(el.$out.getAttribute('aria-pressed')).toBe('true')
  })

  it('open() seeds the distance field to 10 when empty', () => {
    installMockSvgEditor()
    const el = mountElement('se-offset-settings')
    expect(el.$dist.value).toBeFalsy()
    el.open()
    expect(el.$dist.value).toBe('10')
    expect(el.isOpen).toBe(true)
  })

  it('open() does not overwrite an existing distance value', () => {
    installMockSvgEditor()
    const el = mountElement('se-offset-settings')
    el.$dist.value = '42'
    el.open()
    expect(el.$dist.value).toBe('42')
  })

  it('apply() calls svgCanvas.offsetPath with a positive delta for outset', () => {
    const offsetPath = vi.fn()
    installMockSvgEditor({ svgCanvas: { offsetPath } })
    const el = mountElement('se-offset-settings')
    el.$dist.value = '15'
    el.apply()
    expect(offsetPath).toHaveBeenCalledWith(15)
  })

  it('apply() calls svgCanvas.offsetPath with a negative delta for inset', () => {
    const offsetPath = vi.fn()
    installMockSvgEditor({ svgCanvas: { offsetPath } })
    const el = mountElement('se-offset-settings')
    el.$in.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    el.$dist.value = '15'
    el.apply()
    expect(offsetPath).toHaveBeenCalledWith(-15)
  })

  it('apply() closes the popover after applying', () => {
    const offsetPath = vi.fn()
    installMockSvgEditor({ svgCanvas: { offsetPath } })
    const el = mountElement('se-offset-settings')
    el.$dist.value = '15'
    el.open()
    el.apply()
    expect(el.isOpen).toBe(false)
  })

  it('apply() is a no-op for a non-finite or non-positive distance', () => {
    const offsetPath = vi.fn()
    installMockSvgEditor({ svgCanvas: { offsetPath } })
    const el = mountElement('se-offset-settings')

    el.$dist.value = '0'
    el.apply()
    expect(offsetPath).not.toHaveBeenCalled()

    el.$dist.value = '-5'
    el.apply()
    expect(offsetPath).not.toHaveBeenCalled()

    el.$dist.value = 'abc'
    el.apply()
    expect(offsetPath).not.toHaveBeenCalled()
  })

  it('clicking Apply invokes apply()', () => {
    const offsetPath = vi.fn()
    installMockSvgEditor({ svgCanvas: { offsetPath } })
    const el = mountElement('se-offset-settings')
    el.$dist.value = '5'
    el.$apply.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(offsetPath).toHaveBeenCalledWith(5)
  })
})
