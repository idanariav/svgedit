import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import { SeSettingsPopover } from '../../../src/editor/components/seSettingsPopover.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

// Minimal throwaway subclass so we can exercise the base class's own logic
// (open/close/toggle, positioning, light-dismiss, icon loading) without any
// of the field-specific behavior the real subclasses layer on top.
const TEMPLATE_HTML = `
  <button class="trigger" title="Test settings" aria-haspopup="dialog" aria-expanded="false">
    <span id="icon"></span>
  </button>
  <div id="options-container" role="dialog" aria-label="Test settings" style="display:none"></div>
`

class TestSettingsPopover extends SeSettingsPopover {
  constructor () {
    super(TEMPLATE_HTML)
  }
}
customElements.define('se-test-settings-popover', TestSettingsPopover)

describe('SeSettingsPopover (base class)', () => {
  beforeEach(() => installMockSvgEditor())
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with trigger and popup', () => {
    const el = mountElement('se-test-settings-popover')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$trigger).toBeTruthy()
    expect(el.$popup).toBeTruthy()
    expect(el.$icon).toBeTruthy()
  })

  it('reflects a title attribute onto the trigger button when present at construction time', () => {
    document.body.insertAdjacentHTML('beforeend', '<se-test-settings-popover title="my_tool"></se-test-settings-popover>')
    const el = document.body.querySelector('se-test-settings-popover')
    expect(el.$trigger.getAttribute('title')).toBe('my_tool')
  })

  it('reflects a title attribute set after construction (title is observed)', () => {
    const el = mountElement('se-test-settings-popover', { title: 'my_tool' })
    expect(el.$trigger.getAttribute('title')).toBe('my_tool')
  })

  it('starts closed', () => {
    const el = mountElement('se-test-settings-popover')
    expect(el.isOpen).toBe(false)
    expect(el.$popup.style.display).toBe('none')
  })

  it('open() sets display:flex and aria-expanded=true', () => {
    const el = mountElement('se-test-settings-popover')
    el.open()
    expect(el.isOpen).toBe(true)
    expect(el.$popup.style.display).toBe('flex')
    expect(el.$trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('close() sets display:none and aria-expanded=false', () => {
    const el = mountElement('se-test-settings-popover')
    el.open()
    el.close()
    expect(el.isOpen).toBe(false)
    expect(el.$popup.style.display).toBe('none')
    expect(el.$trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('toggle() opens when closed and closes when open', () => {
    const el = mountElement('se-test-settings-popover')
    el.toggle()
    expect(el.isOpen).toBe(true)
    el.toggle()
    expect(el.isOpen).toBe(false)
  })

  // A real click always fires pointerdown before click; the component reads
  // isOpen at pointerdown time (see comment on the listener) since the
  // browser's own light-dismiss can otherwise auto-close the popover between
  // the two events, on the second click, before our click handler runs.
  const clickTrigger = (el) => {
    el.$trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    el.$trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('clicking the trigger toggles the popup open, and again closes it', () => {
    const el = mountElement('se-test-settings-popover')
    clickTrigger(el)
    expect(el.isOpen).toBe(true)
    clickTrigger(el)
    expect(el.isOpen).toBe(false)
  })

  it('clicking the trigger while open still closes it even if the browser already auto-closed the popover via light-dismiss before the click fires', () => {
    const el = mountElement('se-test-settings-popover')
    el.open()
    // Simulate the native light-dismiss race: pointerdown on the trigger
    // reads isOpen while still true, then the browser auto-closes the
    // popover (as it does for an outside click) before click fires.
    el.$trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    el.$popup.hidePopover()
    el.$trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el.isOpen).toBe(false)
  })

  it('is a native "auto" popover (light-dismiss/Escape/top-layer delegated to the browser)', () => {
    const el = mountElement('se-test-settings-popover')
    expect(el.$popup.getAttribute('popover')).toBe('auto')
  })

  it('syncs isOpen/aria-expanded/display when the browser closes the popover directly (outside click / Escape / another popover opening)', () => {
    const el = mountElement('se-test-settings-popover')
    el.open()
    // Simulate what light-dismiss or Escape do natively: hide the popover
    // without going through our own close() method.
    el.$popup.hidePopover()
    expect(el.isOpen).toBe(false)
    expect(el.$popup.style.display).toBe('none')
    expect(el.$trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('close() does not throw when the popup was already closed by the browser', () => {
    const el = mountElement('se-test-settings-popover')
    el.open()
    el.$popup.hidePopover()
    expect(() => el.close()).not.toThrow()
  })

  // jsdom performs no real layout, so a stubbed getBoundingClientRect() always
  // reports the same static rect regardless of inline style — that starves
  // positionPopup()'s re-measure/converge loop of the feedback it expects,
  // making it walk off to a runaway value. Make the popup stub read its own
  // current inline left/top (like a real laid-out element would) so the loop
  // converges after its first correction, same as it does in the browser.
  function stubPopupRectFollowingStyle (popup, width, height) {
    vi.spyOn(popup, 'getBoundingClientRect').mockImplementation(() => ({
      left: parseFloat(popup.style.left) || 0,
      top: parseFloat(popup.style.top) || 0,
      width,
      height
    }))
  }

  it('positions the popup below the trigger by default', () => {
    const el = mountElement('se-test-settings-popover')
    vi.spyOn(el.$trigger, 'getBoundingClientRect').mockReturnValue(
      { left: 100, right: 140, top: 50, bottom: 86, width: 40, height: 36 }
    )
    stubPopupRectFollowingStyle(el.$popup, 200, 100)
    el.open()
    expect(el.$popup.style.left).toBe('100px')
    expect(el.$popup.style.top).toBe('92px') // bottom(86) + gap(6)
  })

  it('flips above the trigger when there is no room below', () => {
    const el = mountElement('se-test-settings-popover')
    Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true })
    vi.spyOn(el.$trigger, 'getBoundingClientRect').mockReturnValue(
      { left: 10, right: 50, top: 250, bottom: 286, width: 40, height: 36 }
    )
    stubPopupRectFollowingStyle(el.$popup, 200, 100)
    el.open()
    // aboveTop = 250 - 6 - 100 = 144, which is >= margin(8), so it flips above.
    expect(el.$popup.style.top).toBe('144px')
  })

  it('clamps left so the popup does not overflow the right edge', () => {
    const el = mountElement('se-test-settings-popover')
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true })
    vi.spyOn(el.$trigger, 'getBoundingClientRect').mockReturnValue(
      { left: 350, right: 390, top: 50, bottom: 86, width: 40, height: 36 }
    )
    stubPopupRectFollowingStyle(el.$popup, 200, 100)
    el.open()
    // 350 + 200 > 400 - 8(margin) => left clamped to 400 - 200 - 8 = 192
    expect(el.$popup.style.left).toBe('192px')
  })

  it('loads an icon into #icon when the src attribute is set', async () => {
    const el = mountElement('se-test-settings-popover')
    el.setAttribute('src', 'some-icon.svg')
    // Unregistered icon name -> fetchSvgEl falls back to a real fetch() call,
    // which is actual async I/O rather than a plain microtask; wait it out.
    await new Promise(resolve => setTimeout(resolve, 50))
    // Registry has no such icon in tests, so it falls back to an <img>.
    const img = el.$icon.querySelector('img')
    expect(img).toBeTruthy()
    expect(img.src).toContain('images/some-icon.svg')
  })

  it('does not reload the icon when src is set to the same value', async () => {
    const el = mountElement('se-test-settings-popover')
    el.setAttribute('src', 'some-icon.svg')
    await new Promise(resolve => setTimeout(resolve, 50))
    el.$icon.replaceChildren() // clear so we can detect a reload
    el.setAttribute('src', 'some-icon.svg')
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(el.$icon.children.length).toBe(0)
  })
})
