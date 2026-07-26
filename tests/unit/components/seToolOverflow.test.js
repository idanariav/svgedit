import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor } from './testUtils.js'
import '../../../src/editor/components/seToolOverflow.js'
import '../../../src/editor/components/seButton.js'
import '../../../src/editor/components/seFlyingButton.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

/**
 * Mirrors seFlyingButton.test.js's mount pattern: build the subtree via
 * innerHTML on a wrapper (with the custom elements already registered) so
 * slotted children are parsed into the light DOM before upgrade.
 */
function mountToolOverflow (attrs = '', childrenHtml = `
  <se-button id="tool_fhpath" title="tools.mode_fhpath" src="pencil.svg"></se-button>
`) {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = `<se-tool-overflow ${attrs}>${childrenHtml}</se-tool-overflow>`
  const el = wrapper.firstElementChild
  document.body.append(el)
  return el
}

describe('se-tool-overflow', () => {
  beforeEach(() => installMockSvgEditor())
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with button/menu structure (no handle — pure drawer)', () => {
    const el = mountToolOverflow()
    expect(el.shadowRoot).toBeTruthy()
    expect(el.shadowRoot.querySelector('.menu-button')).toBeTruthy()
    expect(el.shadowRoot.querySelector('.menu')).toBeTruthy()
    expect(el.shadowRoot.querySelector('.handle')).toBeNull()
  })

  it('reflects the title attribute onto the inner button title (no shortcut support)', () => {
    const el = mountToolOverflow()
    el.setAttribute('title', 'tools.additional_tools')
    expect(el.$button.getAttribute('title')).toBe('tools.additional_tools')
  })

  it('gets/sets opened via attribute/property, reflecting the open class', () => {
    const el = mountToolOverflow()
    el.opened = true
    expect(el.hasAttribute('opened')).toBe(true)
    expect(el.$overall.classList.contains('open')).toBe(true)

    el.opened = false
    expect(el.hasAttribute('opened')).toBe(false)
    expect(el.$overall.classList.contains('open')).toBe(false)
  })

  it('loads an icon (falls back to an <img> when the registry/fetch has nothing)', async () => {
    const el = mountToolOverflow('src="more_tools.svg"')
    await new Promise((r) => setTimeout(r, 0))
    expect(el.$iconWrap.children.length).toBeGreaterThan(0)
  })

  it('clicking the host (the drawer button) toggles the popover open — never invokes a tool', () => {
    const el = mountToolOverflow()
    const clickSpy = vi.fn()
    el.querySelector('#tool_fhpath').addEventListener('click', clickSpy)

    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el.opened).toBe(true)
    expect(clickSpy).not.toHaveBeenCalled()

    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el.opened).toBe(false)
  })

  it('clicking a slotted tool closes the drawer after (mirrors flyout close-after-pick)', () => {
    const el = mountToolOverflow()
    el.opened = true
    const tool = el.querySelector('#tool_fhpath')

    tool.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(el.opened).toBe(false)
  })

  it('clicking a nested flyout\'s own trigger does not close the drawer (only its own submenu should react)', () => {
    const el = mountToolOverflow('', `
      <se-flyingbutton id="tool_shapes">
        <se-button id="tool_rect" title="tools.mode_rect" src="rect.svg"></se-button>
        <se-button id="tool_square" title="tools.mode_square" src="square.svg"></se-button>
      </se-flyingbutton>
    `)
    el.opened = true
    const flyout = el.querySelector('#tool_shapes')

    // Simulates the flyout's own handle click, retargeted by its shadow
    // boundary to the SE-FLYINGBUTTON host — same retargeting seFlyingButton's
    // own tests rely on for its host-level click assertions.
    flyout.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(el.opened).toBe(true)
  })

  it('closes the opened drawer on an outside document click', () => {
    const el = mountToolOverflow()
    el.opened = true
    expect(el.opened).toBe(true)

    document.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(el.opened).toBe(false)
  })

  it('closes the opened drawer on Escape', () => {
    const el = mountToolOverflow()
    el.opened = true

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(el.opened).toBe(false)
  })
})
