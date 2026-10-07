import { describe, it, expect } from 'vitest'
import { formatShortcutAttr, tooltipText } from '../../src/editor/Hotkeys.js'
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
