import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seListItem.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-list-item', () => {
  beforeEach(() => installMockSvgEditor())
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with the option row', () => {
    const el = mountElement('se-list-item')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$menuitem).toBeTruthy()
    expect(el.$menuitem.getAttribute('aria-label')).toBe('option')
  })

  it('reflects the option attribute onto the inner element and translates it', () => {
    const el = mountElement('se-list-item')
    el.setAttribute('option', 'my_option')
    expect(el.$menuitem.getAttribute('option')).toBe('my_option')
    expect(el.$menuitem.textContent.trim()).toBe('my_option')
  })

  it('keeps the icon when both src and option are set (icon + text label row)', async () => {
    const el = mountElement('se-list-item')
    el.setAttribute('src', 'icon.svg')
    el.setAttribute('option', 'my_option')
    await Promise.resolve()
    expect(el.$iconWrap).toBeTruthy()
    expect(el._shadowRoot.contains(el.$iconWrap)).toBe(true)
    expect(el.$menuitem.querySelector('.label-text').textContent).toBe('my_option')
  })

  it('reflects the title attribute translated onto the inner element', () => {
    const el = mountElement('se-list-item')
    el.setAttribute('title', 'my_title')
    expect(el.$menuitem.getAttribute('title')).toBe('my_title')
  })

  it('toggles the selected class based on the selected attribute value', () => {
    const el = mountElement('se-list-item')
    el.setAttribute('selected', 'true')
    expect(el.$menuitem.classList.contains('selected')).toBe(true)
    el.setAttribute('selected', 'false')
    expect(el.$menuitem.classList.contains('selected')).toBe(false)
  })

  it('reads/writes option, title, src, imgHeight properties via attributes', () => {
    const el = mountElement('se-list-item')
    el.option = 'opt1'
    expect(el.getAttribute('option')).toBe('opt1')
    expect(el.option).toBe('opt1')

    el.title = 'a title'
    expect(el.getAttribute('title')).toBe('a title')
    expect(el.title).toBe('a title')

    el.src = 'icon.svg'
    expect(el.getAttribute('src')).toBe('icon.svg')
    expect(el.src).toBe('icon.svg')

    el.imgHeight = '16px'
    expect(el.getAttribute('img-height')).toBe('16px')
    expect(el.imgHeight).toBe('16px')
  })

  it('dispatches a selectedindexchange event with the value on mousedown', () => {
    const el = mountElement('se-list-item', { value: 'itemA' })
    const handler = vi.fn()
    el.addEventListener('selectedindexchange', handler)

    el.$menuitem.dispatchEvent(new Event('mousedown', { bubbles: true }))

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].detail).toEqual({ selectedItem: 'itemA' })
  })
})
