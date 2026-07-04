import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor } from './testUtils.js'
import '../../../src/editor/components/seFlyingButton.js'
import '../../../src/editor/components/seButton.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

/**
 * se-flyingbutton reads its slotted <se-button> children (via
 * `this.$menu.lastElementChild.assignedElements()`) in its *constructor*, so
 * the children must already be parsed into the light DOM before the element
 * is upgraded. Building the whole subtree via innerHTML on a wrapper (with
 * both custom elements already registered) achieves that, matching how the
 * real app's HTML templates are parsed.
 */
function mountFlyingButton (attrs = '', childrenHtml = `
  <se-button id="tool_rect" title="tools.mode_rect" src="rect.svg"></se-button>
  <se-button id="tool_square" title="tools.mode_square" src="square.svg"></se-button>
`) {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = `<se-flyingbutton ${attrs}>${childrenHtml}</se-flyingbutton>`
  const el = wrapper.firstElementChild
  document.body.append(el)
  return el
}

describe('se-flyingbutton', () => {
  beforeEach(() => installMockSvgEditor())
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with button/menu/handle structure', () => {
    const el = mountFlyingButton()
    expect(el.shadowRoot).toBeTruthy()
    expect(el.shadowRoot.querySelector('.menu-button')).toBeTruthy()
    expect(el.shadowRoot.querySelector('.menu')).toBeTruthy()
    expect(el.shadowRoot.querySelector('.handle')).toBeTruthy()
  })

  it('captures the slotted se-button children as $elements', () => {
    const el = mountFlyingButton()
    expect(el.$elements.length).toBe(2)
    expect(el.$elements[0].id).toBe('tool_rect')
    expect(el.$elements[1].id).toBe('tool_square')
  })

  it('uses the first slotted button as the initial activeSlot on connect', () => {
    const el = mountFlyingButton()
    expect(el.activeSlot.id).toBe('tool_rect')
  })

  it('reflects the title attribute (with shortcut) onto the inner button title', () => {
    const el = mountFlyingButton()
    el.setAttribute('shortcut', 'R')
    el.setAttribute('title', 'tools.square_rect_tool')
    expect(el.$button.getAttribute('title')).toBe('tools.square_rect_tool [R]')
  })

  it('reflects the title attribute without a shortcut', () => {
    const el = mountFlyingButton()
    el.setAttribute('title', 'tools.square_rect_tool')
    expect(el.$button.getAttribute('title')).toBe('tools.square_rect_tool ')
  })

  it('gets/sets the title property via the attribute', () => {
    const el = mountFlyingButton()
    el.title = 'my_title'
    expect(el.getAttribute('title')).toBe('my_title')
    expect(el.title).toBe('my_title')
  })

  it('toggles the pressed class via attribute and clears opened on unpress', () => {
    const el = mountFlyingButton()
    el.setAttribute('opened', 'opened')
    el.setAttribute('pressed', 'true')
    expect(el.$overall.classList.contains('pressed')).toBe(true)
    expect(el.pressed).toBe(true)

    el.pressed = false
    expect(el.$overall.classList.contains('pressed')).toBe(false)
    expect(el.hasAttribute('pressed')).toBe(false)
    expect(el.hasAttribute('opened')).toBe(false)
  })

  it('toggles the locked class via attribute', () => {
    const el = mountFlyingButton()
    el.setAttribute('locked', 'true')
    expect(el.$overall.classList.contains('locked')).toBe(true)
    el.removeAttribute('locked')
    expect(el.$overall.classList.contains('locked')).toBe(false)
  })

  it('toggles the disabled class via attribute', () => {
    const el = mountFlyingButton()
    el.setAttribute('disabled', 'true')
    expect(el.$overall.classList.contains('disabled')).toBe(true)
    el.removeAttribute('disabled')
    expect(el.$overall.classList.contains('disabled')).toBe(false)
  })

  it('gets/sets opened via attribute/property, reflecting the open class on the menu', () => {
    const el = mountFlyingButton()
    el.opened = true
    expect(el.hasAttribute('opened')).toBe(true)
    expect(el.$menu.classList.contains('open')).toBe(true)

    el.opened = false
    expect(el.hasAttribute('opened')).toBe(false)
    expect(el.$menu.classList.contains('open')).toBe(false)
  })

  it('gets/sets disabled via attribute/property', () => {
    const el = mountFlyingButton()
    el.disabled = true
    expect(el.disabled).toBe(true)
    el.disabled = false
    expect(el.hasAttribute('disabled')).toBe(false)
  })

  it('clicking the host while not pressed clicks the active slot and becomes pressed', () => {
    const el = mountFlyingButton()
    const clickSpy = vi.fn()
    el.activeSlot.addEventListener('click', clickSpy)

    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(el.pressed).toBe(true)
  })

  it('clicking the host while already pressed opens the menu instead', () => {
    const el = mountFlyingButton()
    el.pressed = true
    const clickSpy = vi.fn()
    el.activeSlot.addEventListener('click', clickSpy)

    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(clickSpy).not.toHaveBeenCalled()
    expect(el.opened).toBe(true)
  })

  it('clicking the handle (a DIV target) toggles the open menu and positions it', () => {
    const el = mountFlyingButton()
    el.$handle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el.opened).toBe(true)

    el.$handle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el.opened).toBe(false)
  })

  it('clicking a slotted se-button switches the activeSlot, sets pressed, and closes the menu', () => {
    const el = mountFlyingButton()
    el.$menu.classList.add('open')

    const secondButton = el.$elements[1]
    secondButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(el.activeSlot).toBe(secondButton)
    expect(el.pressed).toBe(true)
    expect(el.$menu.classList.contains('open')).toBe(false)
  })

  it('closes the opened menu on an outside document click', () => {
    const el = mountFlyingButton()
    el.opened = true
    expect(el.opened).toBe(true)

    document.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(el.opened).toBe(false)
  })
})
