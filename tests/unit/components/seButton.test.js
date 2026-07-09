import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seButton.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-button', () => {
  beforeEach(() => installMockSvgEditor())
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with the icon wrapper', () => {
    const el = mountElement('se-button')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.shadowRoot.querySelector('.icon-wrap')).toBeTruthy()
  })

  it('reflects the title attribute onto the inner div title', () => {
    const el = mountElement('se-button')
    el.setAttribute('title', 'my_tool')
    expect(el.$div.getAttribute('title')).toContain('my_tool')
  })

  it('appends the shortcut to the title when present', () => {
    const el = mountElement('se-button')
    el.setAttribute('shortcut', 'ctrl+z')
    el.setAttribute('title', 'undo')
    expect(el.$div.getAttribute('title')).toBe('undo [ctrl+z]')
  })

  it('toggles the pressed class via attribute and property', () => {
    const el = mountElement('se-button')
    el.setAttribute('pressed', 'true')
    expect(el.$div.classList.contains('pressed')).toBe(true)
    expect(el.pressed).toBe(true)

    el.pressed = false
    expect(el.$div.classList.contains('pressed')).toBe(false)
    expect(el.hasAttribute('pressed')).toBe(false)
  })

  it('toggles the locked class via attribute', () => {
    const el = mountElement('se-button')
    el.setAttribute('locked', 'true')
    expect(el.$div.classList.contains('locked')).toBe(true)
    el.removeAttribute('locked')
    expect(el.$div.classList.contains('locked')).toBe(false)
  })

  it('toggles the disabled class via attribute and property', () => {
    const el = mountElement('se-button')
    el.disabled = true
    expect(el.$div.classList.contains('disabled')).toBe(true)
    expect(el.disabled).toBe(true)
    el.disabled = false
    expect(el.$div.classList.contains('disabled')).toBe(false)
  })

  it('toggles the small size class via attribute and property', () => {
    const el = mountElement('se-button')
    el.size = 'small'
    expect(el.$div.classList.contains('small')).toBe(true)
    expect(el.size).toBe('small')
    el.removeAttribute('size')
    expect(el.$div.classList.contains('small')).toBe(false)
  })

  it('applies an inline style string from the style attribute', () => {
    const el = mountElement('se-button')
    el.setAttribute('style', 'color: red;')
    expect(el.$div.style.color).toBe('red')
  })

  it('reads/writes the src property via the attribute', () => {
    const el = mountElement('se-button')
    el.src = 'foo.svg'
    expect(el.getAttribute('src')).toBe('foo.svg')
    expect(el.src).toBe('foo.svg')
  })

  it('blocks click listeners while disabled (pointer-events:none on the inner div does not stop clicks on the host)', () => {
    const el = mountElement('se-button')
    const handler = vi.fn()
    el.addEventListener('click', handler)

    el.disabled = true
    el.click()
    expect(handler).not.toHaveBeenCalled()

    el.disabled = false
    el.click()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('registers itself with the hotkey manager on connect when it has an id', () => {
    let registered = null
    installMockSvgEditor({ hotkeys: { registerEl: (opts) => { registered = opts } } })
    mountElement('se-button', { title: 'undo', shortcut: 'ctrl+z', id: 'tool_undo' })

    expect(registered).toMatchObject({ id: 'tool_undo', rawKey: 'ctrl+z' })
  })
})
