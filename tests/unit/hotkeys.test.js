import { vi } from 'vitest'
import HotkeyManager from '../../src/editor/Hotkeys.js'
import { CommandRegistry } from '../../src/editor/commands.js'
import { buildEditorShortcuts } from '../../src/editor/editorShortcuts.js'
import { registerCoreCommands } from '../../src/editor/coreCommands.js'

// HotkeyManager is a key-binding VIEW over editor.commands: it must not keep a
// second catalogue, and keydown dispatch must go through the registry.
describe('HotkeyManager over the command registry', () => {
  let editor
  let hk

  const press = (key, init = {}) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    document.body.dispatchEvent(e)
    return e
  }

  beforeEach(() => {
    localStorage.clear()
    document.body.textContent = ''
    editor = { $container: document.body, svgCanvas: {} }
    editor.commands = new CommandRegistry(editor)
    hk = new HotkeyManager(editor)
    editor.hotkeys = hk
  })

  afterEach(() => hk.unregister())

  it('shares the registry table instead of keeping its own', () => {
    expect(hk.actions).toBe(editor.commands.table)
  })

  it('ingests editor shortcuts as commands (fn -> run, key -> default keys, pd kept)', () => {
    const fn = vi.fn()
    hk.ingestEditorShortcuts([
      { id: 'sc_a', group: 'Edit', label: 'hotkeys.a', key: ['mod+a', true], fn },
      { id: 'sc_b', label: 'hotkeys.b', key: 'delete/backspace', fn }
    ])
    expect(editor.commands.get('sc_a')).toMatchObject({ group: 'Edit', defaultKeys: ['ctrl+a'], pd: true })
    expect(editor.commands.get('sc_b')).toMatchObject({ group: 'Selection', defaultKeys: ['delete', 'backspace'], pd: false })
    editor.commands.run('sc_a')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('an editor shortcut can say when it is unavailable, with a reason', () => {
    const fn = vi.fn()
    hk.ingestEditorShortcuts([{ id: 'sc_gated', label: 'hotkeys.g', enabled: () => 'Select a shape first', fn }])
    expect(editor.commands.get('sc_gated').enabled(editor)).toBe('Select a shape first')
    expect(() => editor.commands.run('sc_gated')).toThrow(/Select a shape first/)
    expect(fn).not.toHaveBeenCalled()
  })

  it('"Select same" has a keyless command per criterion, available once something is selected', () => {
    const selected = []
    const clickSelectSame = vi.fn()
    editor.svgCanvas = { getSelectedElements: () => selected }
    editor.topPanel = { clickSelectSame }
    hk.ingestEditorShortcuts(buildEditorShortcuts(editor))
    const ids = ['fill', 'stroke', 'type', 'fillstroke', 'strokeweight', 'opacity'].map((c) => `select_same_${c}`)
    for (const id of ids) {
      expect(editor.commands.get(id)).toMatchObject({ group: 'Select', defaultKeys: [] })
      expect(editor.commands.get(id).enabled(editor)).toBe('Select a shape first')
    }
    selected.push(document.createElement('div'))
    editor.commands.run('select_same_fillstroke')
    expect(clickSelectSame).toHaveBeenCalledWith({ detail: { value: 'fillstroke' } })
  })

  it('registerEl creates an adapter command that clicks the element', () => {
    const el = document.createElement('div')
    const click = vi.fn()
    el.addEventListener('click', click)
    hk.registerEl({ id: 'tool_thing', el, label: 'tools.thing', rawKey: 'ctrl+K' })
    expect(editor.commands.get('tool_thing')).toMatchObject({ adapter: true, defaultKeys: ['ctrl+k'], pd: true })
    editor.commands.run('tool_thing')
    expect(click).toHaveBeenCalled()
  })

  it('a decorative shortcut string is display-only', () => {
    hk.registerEl({ id: 'zoom_thing', el: document.createElement('div'), label: 'z', rawKey: 'Z / Ctrl + wheel' })
    expect(editor.commands.get('zoom_thing')).toMatchObject({ defaultKeys: [], decorative: 'Z / Ctrl + wheel' })
  })

  describe('keydown dispatch', () => {
    it('runs the command through the registry and honours pd', () => {
      const fn = vi.fn()
      hk.ingestEditorShortcuts([{ id: 'sc', group: 'Edit', label: 'l', key: ['x', true], fn }])
      hk.register()
      const run = vi.spyOn(editor.commands, 'run')
      const e = press('x')
      expect(run).toHaveBeenCalledWith('sc', {})
      expect(fn).toHaveBeenCalledTimes(1)
      expect(e.defaultPrevented).toBe(true)
    })

    it('does nothing -- and does not preventDefault -- when the command is disabled', () => {
      const el = document.createElement('div')
      const click = vi.fn()
      el.addEventListener('click', click)
      el.setAttribute('disabled', '')
      hk.registerEl({ id: 'tool_off', el, label: 'l', rawKey: 'q' })
      hk.register()
      const e = press('q')
      expect(click).not.toHaveBeenCalled()
      expect(e.defaultPrevented).toBe(false)
    })

    it('a throwing command is logged by the registry and does not escape the key handler', () => {
      hk.ingestEditorShortcuts([{ id: 'sc', group: 'Edit', label: 'l', key: 'x', fn () { throw new Error('boom') } }])
      hk.register()
      expect(() => press('x')).not.toThrow()
    })

    it('honours user key overrides (keyed by the same command ids)', () => {
      const fn = vi.fn()
      hk.ingestEditorShortcuts([{ id: 'sc', group: 'Edit', label: 'l', key: 'x', fn }])
      hk.register()
      expect(hk.addKey('sc', 'y')).toEqual({ ok: true })
      hk.removeKey('sc', 'x')
      press('x')
      expect(fn).not.toHaveBeenCalled()
      press('y')
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })

  describe('persisted ids survive (hotkey overrides and favorites store command ids)', () => {
    it('applies a stored override to a command that is registered natively', () => {
      localStorage.setItem('svg-edit-hotkeys', JSON.stringify({ tool_clone: ['ctrl+shift+d'] }))
      registerCoreCommands(editor.commands)
      hk.register()
      expect(hk.effectiveKeys('tool_clone')).toEqual(['ctrl+shift+d'])
      expect(hk.reverseMap().get('ctrl+shift+d')).toBe('tool_clone')
    })
  })

  it('a twin button (alias) owns no keys: rebinding the real command frees the key', () => {
    registerCoreCommands(editor.commands)
    editor.commands.register({ id: 'tool_clone_multi', label: 'tools.clone', group: 'Edit', alias: true, run: () => {} })
    hk.registerEl({ id: 'tool_clone_multi', el: document.createElement('div'), label: 'tools.clone', rawKey: 'D' })
    localStorage.setItem('svg-edit-hotkeys', JSON.stringify({ tool_clone: ['shift+d'], tool_clone_multi: ['d'] }))
    hk.register()
    expect(hk.effectiveKeys('tool_clone_multi')).toEqual([])
    expect(hk.reverseMap().get('d')).toBeUndefined()
    expect(hk.reverseMap().get('shift+d')).toBe('tool_clone')
    expect(hk.listForUi().flatMap((g) => g.actions).map((a) => a.id)).not.toContain('tool_clone_multi')
  })

  it('an adapter is interactive when its element says so (no static id list)', () => {
    const dialogBtn = document.createElement('div')
    dialogBtn.setAttribute('interactive', '')
    hk.registerEl({ id: 'tool_dialog', el: dialogBtn, label: 'x' })
    hk.registerEl({ id: 'tool_plain', el: document.createElement('div'), label: 'y' })
    expect(editor.commands.get('tool_dialog').interactive).toBe(true)
    expect(editor.commands.get('tool_plain').interactive).toBe(false)
  })

  it('listForUi lists commands from the registry, grouped', () => {
    registerCoreCommands(editor.commands)
    const groups = hk.listForUi()
    const edit = groups.find((g) => g.group === 'Edit')
    expect(edit.actions.map((a) => a.id)).toEqual(expect.arrayContaining(['tool_clone', 'tool_undo', 'paste']))
  })

  it('every editor shortcut ingests without a duplicate-id error', () => {
    expect(() => hk.ingestEditorShortcuts(buildEditorShortcuts(editor))).not.toThrow()
  })
})
