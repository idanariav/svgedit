import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/sePalette.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

const STORAGE_KEY = 'svg-edit-custom-palette'

describe('se-palette', () => {
  beforeEach(() => {
    installMockSvgEditor()
    localStorage.removeItem(STORAGE_KEY)
  })
  afterEach(() => {
    uninstallMockSvgEditor()
    localStorage.removeItem(STORAGE_KEY)
    document.body.innerHTML = ''
  })

  it('renders a shadow root with a swatch for every default palette color', () => {
    const el = mountElement('se-palette')
    const swatches = el.shadowRoot.querySelectorAll('.palette_item')
    expect(swatches.length).toBe(42) // DEFAULT_PALETTE length
  })

  it('getColor returns the default color when no override exists', () => {
    const el = mountElement('se-palette')
    expect(el.getColor(1)).toBe('#000000')
    expect(el.isCustomised(1)).toBe(false)
  })

  it('loads overrides from localStorage on construction', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 1: '#abcdef' }))
    const el = mountElement('se-palette')
    expect(el.getColor(1)).toBe('#abcdef')
    expect(el.isCustomised(1)).toBe(true)
    const swatch = el.shadowRoot.querySelector('.palette_item[data-index="1"]')
    expect(swatch.classList.contains('is-customised')).toBe(true)
  })

  it('reload() re-reads overrides from localStorage and re-renders', () => {
    const el = mountElement('se-palette')
    expect(el.isCustomised(2)).toBe(false)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 2: '#123456' }))
    el.reload()
    expect(el.getColor(2)).toBe('#123456')
    const swatch = el.shadowRoot.querySelector('.palette_item[data-index="2"]')
    expect(swatch.classList.contains('is-customised')).toBe(true)
  })

  it('init() sets the ui-palette_info attribute via i18next.t', () => {
    const el = mountElement('se-palette')
    el.init({ t: (key) => `translated:${key}` })
    expect(el.getAttribute('ui-palette_info')).toBe('translated:ui.palette_info')
  })

  it('attributeChangedCallback reflects ui-palette_info onto the holder title', () => {
    const el = mountElement('se-palette')
    el.setAttribute('ui-palette_info', 'palette help text')
    expect(el.$holder.getAttribute('title')).toBe('palette help text')
  })

  it('clicking a swatch (not in edit mode) dispatches a change event with the target and color', () => {
    const el = mountElement('se-palette')
    const handler = vi.fn()
    el.addEventListener('change', handler)

    const swatch = el.shadowRoot.querySelector('.palette_item[data-index="1"]')
    swatch.dispatchEvent(new MouseEvent('click'))

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].detail).toEqual({ picker: 'fill', color: '#000000' })
  })

  it('clicking the "none" swatch dispatches color "none"', () => {
    const el = mountElement('se-palette')
    const handler = vi.fn()
    el.addEventListener('change', handler)

    const swatch = el.shadowRoot.querySelector('.palette_item[data-index="0"]')
    swatch.dispatchEvent(new MouseEvent('click'))

    expect(handler.mock.calls[0][0].detail).toEqual({ picker: 'fill', color: 'none' })
  })

  it('cycles the color target through fill -> stroke -> background -> fill on target button click', () => {
    const el = mountElement('se-palette')
    expect(el.$targetBtn.dataset.target).toBe('fill')

    el.$targetBtn.dispatchEvent(new MouseEvent('click'))
    expect(el.$targetBtn.dataset.target).toBe('stroke')

    el.$targetBtn.dispatchEvent(new MouseEvent('click'))
    expect(el.$targetBtn.dataset.target).toBe('background')

    el.$targetBtn.dispatchEvent(new MouseEvent('click'))
    expect(el.$targetBtn.dataset.target).toBe('fill')
  })

  it('swatch clicks use the cycled target in the change event', () => {
    const el = mountElement('se-palette')
    el.$targetBtn.dispatchEvent(new MouseEvent('click')) // -> stroke
    const handler = vi.fn()
    el.addEventListener('change', handler)

    const swatch = el.shadowRoot.querySelector('.palette_item[data-index="1"]')
    swatch.dispatchEvent(new MouseEvent('click'))

    expect(handler.mock.calls[0][0].detail.picker).toBe('stroke')
  })

  it('toggles edit mode via the edit button', () => {
    const el = mountElement('se-palette')
    expect(el.classList.contains('edit-mode')).toBe(false)

    el.$editBtn.dispatchEvent(new MouseEvent('click'))
    expect(el.classList.contains('edit-mode')).toBe(true)
    expect(el.$editBtn.classList.contains('is-active')).toBe(true)
    expect(el.$editBtn.getAttribute('aria-pressed')).toBe('true')

    el.$editBtn.dispatchEvent(new MouseEvent('click'))
    expect(el.classList.contains('edit-mode')).toBe(false)
    expect(el.$editBtn.getAttribute('aria-pressed')).toBe('false')
  })

  it('in edit mode, clicking a customised swatch context menu reverts it', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 1: '#abcdef' }))
    const el = mountElement('se-palette')
    el.$editBtn.dispatchEvent(new MouseEvent('click')) // enter edit mode

    const swatch = el.shadowRoot.querySelector('.palette_item[data-index="1"]')
    swatch.dispatchEvent(new MouseEvent('contextmenu', { cancelable: true }))

    expect(el.isCustomised(1)).toBe(false)
    expect(el.getColor(1)).toBe('#000000')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')[1]).toBeUndefined()
  })

  it('the revert button on a customised swatch reverts it without entering edit mode logic twice', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 3: '#fedcba' }))
    const el = mountElement('se-palette')
    el.$editBtn.dispatchEvent(new MouseEvent('click')) // edit mode shows revert buttons

    const swatch = el.shadowRoot.querySelector('.palette_item[data-index="3"]')
    const revertBtn = swatch.querySelector('.revert_btn')
    expect(revertBtn).toBeTruthy()
    revertBtn.dispatchEvent(new MouseEvent('click'))

    expect(el.isCustomised(3)).toBe(false)
  })

  it('_resetAll (via reset button) clears all overrides', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 1: '#abcdef', 2: '#123456' }))
    const el = mountElement('se-palette')
    expect(el.$resetBtn.classList.contains('has-overrides')).toBe(true)

    el.$resetBtn.dispatchEvent(new MouseEvent('click'))

    expect(el.isCustomised(1)).toBe(false)
    expect(el.isCustomised(2)).toBe(false)
    expect(el.$resetBtn.classList.contains('has-overrides')).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('renderSwatches toggles has-overrides on the reset button based on override presence', () => {
    const el = mountElement('se-palette')
    expect(el.$resetBtn.classList.contains('has-overrides')).toBe(false)
    el._overrides[5] = '#fafafa'
    el.renderSwatches()
    expect(el.$resetBtn.classList.contains('has-overrides')).toBe(true)
  })
})
