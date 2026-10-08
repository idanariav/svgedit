import { describe, it, expect } from 'vitest'
import HotkeyManager, { formatShortcutAttr, tooltipText } from '../../src/editor/Hotkeys.js'
import { buildEditorShortcuts } from '../../src/editor/editorShortcuts.js'
import { DEFAULT_FAVORITES } from '../../src/editor/favorites.js'

describe('shortcut formatting', () => {
  it('formats a component shortcut per platform (jsdom is non-Mac)', () => {
    expect(formatShortcutAttr('ctrl+Z')).toBe('Ctrl+Z')
    expect(formatShortcutAttr('mod+k')).toBe('Ctrl+K')
    expect(formatShortcutAttr('D')).toBe('D')
  })
  it('leaves decorative multi-key strings as authored', () => {
    expect(formatShortcutAttr('Delete/Backspace')).toBe('Delete/Backspace')
  })
  it('tooltipText has no trailing space without a shortcut', () => {
    expect(tooltipText('Select Tool', null)).toBe('Select Tool')
    expect(tooltipText('Undo', 'ctrl+Z')).toBe('Undo [Ctrl+Z]')
  })
})

describe('editor shortcut defaults', () => {
  const byId = Object.fromEntries(buildEditorShortcuts({}).map((s) => [s.id, s]))
  it('Tab cycles forward and Shift+Tab backward', () => {
    expect(byId.cycle_next.key.split('/')).toContain('tab')
    expect(byId.cycle_prev.key.split('/')).toContain('shift+tab')
  })
  it('select-all needs the modifier (no bare "a")', () => {
    expect([byId.select_all.key].flat()[0]).toBe('mod+a')
  })
})

describe('context menu defaults', () => {
  it('seeds paste / select all / zoom to fit', () => {
    expect(DEFAULT_FAVORITES).toEqual(['paste', 'select_all', 'zoom_fit'])
  })
})

describe('action labels', () => {
  const label = (labelKey) => HotkeyManager.prototype.labelFor.call({}, { labelKey })
  it('strips explanatory suffixes so lists show just the name', () => {
    expect(label('Shape builder (click a region to merge)')).toBe('Shape builder')
    expect(label('Puppet Warp — pin an object, then drag')).toBe('Puppet Warp')
    expect(label('Align left')).toBe('Align left')
  })
})

describe('isFocusControl (Tab stays free for focus navigation)', () => {
  it('is true for native controls and se-* hosts, false for the body and the editor container', async () => {
    const { isFocusControl } = await import('../../src/editor/Hotkeys.js')
    const make = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild }
    expect(isFocusControl(make('<button></button>'))).toBe(true)
    expect(isFocusControl(make('<input>'))).toBe(true)
    expect(isFocusControl(make('<se-button></se-button>'))).toBe(true)
    expect(isFocusControl(make('<div tabindex="0"></div>'))).toBe(true)
    expect(isFocusControl(make('<div tabindex="-1" data-svgedit-root></div>'))).toBe(false)
    expect(isFocusControl(document.body)).toBe(false)
    expect(isFocusControl(null)).toBe(false)
  })
})
