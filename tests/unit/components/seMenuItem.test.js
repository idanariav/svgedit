import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seMenuItem.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

function mountMenuItem (attrs = {}) {
  return mountElement('se-menu-item', attrs)
}

describe('se-menu-item', () => {
  beforeEach(() => installMockSvgEditor())
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with icon and label slots', () => {
    const el = mountMenuItem()
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$iconWrap).toBeTruthy()
    expect(el.$label).toBeTruthy()
  })

  it('defaults role to menuitem and tabindex to 0 when not set', () => {
    const el = mountMenuItem()
    expect(el.getAttribute('role')).toBe('menuitem')
    expect(el.getAttribute('tabindex')).toBe('0')
  })

  it('does not override an explicitly provided role/tabindex', () => {
    const el = mountMenuItem({ role: 'custom', tabindex: '2' })
    expect(el.getAttribute('role')).toBe('custom')
    expect(el.getAttribute('tabindex')).toBe('2')
  })

  it('sets the label text via t() without a shortcut', () => {
    const el = mountMenuItem()
    el.setAttribute('label', 'undo')
    expect(el.$label.textContent).toBe('undo ')
  })

  it('appends the shortcut in parentheses when present', () => {
    const el = mountMenuItem({ shortcut: 'ctrl+z' })
    el.setAttribute('label', 'undo')
    expect(el.$label.textContent).toBe('undo (ctrl+z)')
  })

  it('reads/writes label and src properties via attributes', () => {
    const el = mountMenuItem()
    el.label = 'redo'
    expect(el.getAttribute('label')).toBe('redo')
    expect(el.label).toBe('redo')

    el.src = 'redo.svg'
    expect(el.getAttribute('src')).toBe('redo.svg')
    expect(el.src).toBe('redo.svg')
  })

  it('registers itself with the hotkey manager on connect when it has an id and shortcut', () => {
    let registered = null
    installMockSvgEditor({ hotkeys: { registerEl: (opts) => { registered = opts } } })
    mountMenuItem({ id: 'menu_undo', label: 'undo', shortcut: 'ctrl+z' })

    expect(registered).toMatchObject({ id: 'menu_undo', rawKey: 'ctrl+z', label: 'undo' })
  })

  it('does not register with the hotkey manager without an id', () => {
    let registered = null
    installMockSvgEditor({ hotkeys: { registerEl: (opts) => { registered = opts } } })
    mountMenuItem({ label: 'undo', shortcut: 'ctrl+z' })

    expect(registered).toBeNull()
  })
})
