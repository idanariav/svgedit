import { describe, it, expect, afterEach, vi } from 'vitest'
import '../../../src/editor/components/eyedropper/EyedropperActionMenu.js'

describe('se-eyedropper-menu', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the 4 fixed action rows with default English labels', () => {
    const el = document.createElement('se-eyedropper-menu')
    document.body.append(el)
    const labels = Array.from(el.shadowRoot.querySelectorAll('a[data-action] .qa-label')).map((n) => n.textContent)
    expect(labels).toEqual([
      'Set as fill color',
      'Set as outline color',
      'Set as background color',
      'Generate matching palette'
    ])
  })

  it('uses i18next translations when provided', () => {
    const el = document.createElement('se-eyedropper-menu')
    el.i18next = { t: (key) => (key === 'eyedropper:menu.fill' ? 'Custom Fill Label' : undefined) }
    document.body.append(el)
    // i18next is set after render in this test (property setter doesn't
    // re-render); real usage sets it before append, matching ColorDialog's
    // pattern, so re-render explicitly here to exercise the translation path.
    el._render()
    const fillLabel = el.shadowRoot.querySelector('a[data-action="fill"] .qa-label')
    expect(fillLabel.textContent).toBe('Custom Fill Label')
  })

  it('open() adds the open class and positions the menu', () => {
    const el = document.createElement('se-eyedropper-menu')
    document.body.append(el)
    el.open(100, 200, {})
    expect(el.classList.contains('is-open')).toBe(true)
    expect(el.$menu.style.display).toBe('block')
  })

  it('clicking an action invokes its callback and closes the menu', () => {
    const el = document.createElement('se-eyedropper-menu')
    document.body.append(el)
    const onFill = vi.fn()
    el.open(0, 0, { onFill })
    el.shadowRoot.querySelector('a[data-action="fill"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onFill).toHaveBeenCalledTimes(1)
    expect(el.isConnected).toBe(false)
  })

  it('each action wires to its own distinct callback', () => {
    const el = document.createElement('se-eyedropper-menu')
    document.body.append(el)
    const callbacks = { onFill: vi.fn(), onStroke: vi.fn(), onBackground: vi.fn(), onPalette: vi.fn() }
    el.open(0, 0, callbacks)
    el.shadowRoot.querySelector('a[data-action="palette"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(callbacks.onPalette).toHaveBeenCalledTimes(1)
    expect(callbacks.onFill).not.toHaveBeenCalled()
    expect(callbacks.onStroke).not.toHaveBeenCalled()
    expect(callbacks.onBackground).not.toHaveBeenCalled()
  })

  it('close() removes the element from the DOM and its document listeners', () => {
    const el = document.createElement('se-eyedropper-menu')
    document.body.append(el)
    el.open(0, 0, {})
    el.close()
    expect(el.isConnected).toBe(false)
    expect(el.classList.contains('is-open')).toBe(false)
  })

  it('Escape closes the menu', async () => {
    vi.useFakeTimers()
    const el = document.createElement('se-eyedropper-menu')
    document.body.append(el)
    el.open(0, 0, {})
    vi.runAllTimers()
    vi.useRealTimers()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(el.isConnected).toBe(false)
  })

  it('a mousedown outside the menu closes it', () => {
    vi.useFakeTimers()
    const el = document.createElement('se-eyedropper-menu')
    document.body.append(el)
    el.open(0, 0, {})
    vi.runAllTimers()
    vi.useRealTimers()
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }))
    expect(el.isConnected).toBe(false)
  })
})
