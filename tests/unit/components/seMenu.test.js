import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seMenu.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-menu', () => {
  beforeEach(() => installMockSvgEditor())
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with a toggle button and popup', () => {
    const el = mountElement('se-menu')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$toggle.tagName).toBe('BUTTON')
    expect(el.$popup.getAttribute('role')).toBe('menu')
  })

  it('prepends the label text into the toggle on the label attribute', () => {
    const el = mountElement('se-menu')
    el.setAttribute('label', 'Menu')
    expect(el.$toggle.textContent).toContain('Menu')
    expect(el.label).toBe('Menu')
  })

  it('reads/writes the src property via the attribute', () => {
    const el = mountElement('se-menu')
    el.src = 'logo.svg'
    expect(el.getAttribute('src')).toBe('logo.svg')
    expect(el.src).toBe('logo.svg')
  })

  it('positions the popup below the trigger, clamped to the viewport', () => {
    const el = mountElement('se-menu')
    // jsdom returns all-zero rects by default; just assert it runs and sets styles.
    el.positionPopup()
    expect(el.$popup.style.top).toMatch(/px$/)
    expect(el.$popup.style.left).toMatch(/px$/)
  })

  it('clamps the popup left position to stay within the viewport', () => {
    const el = mountElement('se-menu')
    el.$toggle.getBoundingClientRect = () => ({ left: window.innerWidth - 10, bottom: 40, width: 20, height: 20 })
    el.$popup.getBoundingClientRect = () => ({ width: 200, height: 100 })
    el.positionPopup()
    const left = parseFloat(el.$popup.style.left)
    expect(left).toBeLessThanOrEqual(window.innerWidth - 8)
  })

  it('removes the click listener on disconnect', () => {
    const el = mountElement('se-menu')
    const removeSpy = vi.spyOn(el, 'removeEventListener')
    el.remove()
    expect(removeSpy).toHaveBeenCalledWith('click', el._closeOnItemClick)
  })

  it('closes the popup when a click bubbles up from a slotted se-menu-item', () => {
    const el = mountElement('se-menu')
    el.$popup.hidePopover = vi.fn()
    // se-menu-item content is slotted (a light-DOM child of <se-menu>
    // projected through the shadow <slot>), not placed directly in the
    // shadow root, so the host's own click listener sees it as e.target
    // without shadow retargeting. se-menu-item isn't imported/registered in
    // this file, so this is an unnamed element matched purely by tag name.
    const item = document.createElement('se-menu-item')
    el.append(item)

    item.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))

    expect(el.$popup.hidePopover).toHaveBeenCalled()
  })

  it('does not close the popup on a click that is not from an se-menu-item', () => {
    const el = mountElement('se-menu')
    el.$popup.hidePopover = vi.fn()

    el.$toggle.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }))

    expect(el.$popup.hidePopover).not.toHaveBeenCalled()
  })
})
