import { describe, expect, it, beforeEach } from 'vitest'

import { createContextMenu } from '../../src/editor/contextmenu.ts'

describe('contextmenu helpers', () => {
  let contextmenu

  beforeEach(() => {
    document.body.innerHTML = "<ul id='cmenu_canvas'></ul>"
    contextmenu = createContextMenu()
  })

  it('validates menu entries and prevents duplicates', () => {
    const { add, hasCustomHandler, getCustomHandler } = contextmenu
    expect(() => add(null)).toThrow(/must be defined/)
    add({ id: 'foo', label: 'Foo', action: () => 'ok' })
    expect(hasCustomHandler('foo')).toBe(true)
    expect(getCustomHandler('foo')()).toBe('ok')
    expect(() =>
      add({ id: 'foo', label: 'Again', action: () => {} })
    ).toThrow(/already exists/)
  })

  it('injects extensions into the context menu DOM', () => {
    const { add, injectExtendedContextMenuItemsIntoDom } = contextmenu
    const host = /** @type {HTMLElement} */ (document.getElementById('cmenu_canvas'))
    add({ id: 'alpha', label: 'Alpha', action: () => {}, shortcut: 'Ctrl+A' })
    add({ id: 'beta', label: 'Beta', action: () => {} })

    injectExtendedContextMenuItemsIntoDom()

    const items = host.querySelectorAll('li.disabled a')
    expect(items).toHaveLength(2)
    expect(items[0].getAttribute('href')).toBe('#alpha')
    expect(items[0].textContent).toBe('AlphaCtrl+A')
    expect(items[1].getAttribute('href')).toBe('#beta')
  })

  it('injects nothing, without throwing, when the menu list is not in the document', () => {
    document.body.innerHTML = ''
    contextmenu.add({ id: 'alpha', label: 'Alpha', action: () => {} })
    expect(() => contextmenu.injectExtendedContextMenuItemsIntoDom()).not.toThrow()
  })

  it('scopes registries per instance instead of sharing module state', () => {
    const other = createContextMenu()
    contextmenu.add({ id: 'alpha', label: 'Alpha', action: () => {} })

    expect(other.hasCustomHandler('alpha')).toBe(false)
    expect(() => other.add({ id: 'alpha', label: 'Alpha', action: () => {} })).not.toThrow()
  })
})
