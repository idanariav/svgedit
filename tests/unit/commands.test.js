import { vi } from 'vitest'
import { CommandRegistry, CommandError } from '../../src/editor/commands.js'
import { setLogSink } from '../../packages/svgcanvas/common/logger.js'

const makeEditor = (extra = {}) => ({ svgCanvas: {}, ...extra })

describe('CommandRegistry', () => {
  let editor
  let reg

  beforeEach(() => {
    editor = makeEditor()
    reg = new CommandRegistry(editor)
  })

  afterEach(() => setLogSink(null))

  const codeOf = (fn) => {
    try { fn() } catch (e) { return e instanceof CommandError ? e.code : `other:${e.message}` }
    return null
  }

  describe('registration', () => {
    it('registers, gets and unregisters', () => {
      reg.register({ id: 'a', label: 'A', run: () => 1 })
      expect(reg.get('a')).toMatchObject({ id: 'a', group: 'Tools', defaultKeys: [], adapter: false })
      expect(reg.unregister('a')).toBe(true)
      expect(reg.get('a')).toBeUndefined()
      expect(reg.unregister('a')).toBe(false)
    })

    it('rejects a spec without id or run', () => {
      expect(() => reg.register({ label: 'x', run () {} })).toThrow(TypeError)
      expect(() => reg.register({ id: 'x', label: 'x' })).toThrow(TypeError)
    })

    it('throws on a duplicate id (dev), unless replace is set', () => {
      reg.register({ id: 'a', label: 'A', run: () => 1 })
      expect(() => reg.register({ id: 'a', label: 'A2', run: () => 2 })).toThrow(/Duplicate command id "a"/)
      reg.register({ id: 'a', label: 'A2', run: () => 2 }, { replace: true })
      expect(reg.run('a')).toBe(2)
    })

    it('expands authoring keys (alternatives, mod) into canonical defaults', () => {
      reg.register({ id: 'del', label: 'Delete', keys: 'delete/backspace', run () {} })
      reg.register({ id: 'cp', label: 'Copy', keys: 'mod+c', run () {} })
      expect(reg.get('del').defaultKeys).toEqual(['delete', 'backspace'])
      expect(reg.get('cp').defaultKeys).toEqual(['ctrl+c']) // jsdom is non-Mac
    })
  })

  describe('adapters (components that self-register)', () => {
    const makeButton = (attrs = {}) => {
      const el = document.createElement('button')
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
      return el
    }
    const adapt = (id, el, extra = {}) => reg.registerAdapter({
      id, el, label: id, group: 'Tools', defaultKeys: ['d'], decorative: null, ...extra
    })

    it('runs by clicking the element and is disabled with it', () => {
      const el = makeButton()
      const click = vi.fn()
      el.addEventListener('click', click)
      adapt('btn', el)
      reg.run('btn')
      expect(click).toHaveBeenCalledTimes(1)
      el.setAttribute('disabled', '')
      expect(reg.isEnabled('btn')).toBe('disabled')
      expect(codeOf(() => reg.run('btn'))).toBe('disabled')
      expect(click).toHaveBeenCalledTimes(1)
    })

    it('re-registering the same adapter (reconnect) replaces it silently', () => {
      adapt('btn', makeButton())
      const second = makeButton()
      adapt('btn', second)
      expect(reg.get('btn').el).toBe(second)
    })

    it('a real command declared AFTER its button replaces the adapter and keeps the button + its key', () => {
      const el = makeButton()
      adapt('tool_x', el)
      reg.register({ id: 'tool_x', label: 'X', run: () => 'native' })
      const rec = reg.get('tool_x')
      expect(rec.adapter).toBe(false)
      expect(rec.el).toBe(el)
      expect(rec.defaultKeys).toEqual(['d'])
      expect(reg.run('tool_x')).toBe('native')
    })

    it('a real command declared BEFORE its button survives the button connecting', () => {
      reg.register({ id: 'tool_x', label: 'X', run: () => 'native' })
      const el = makeButton()
      adapt('tool_x', el)
      const rec = reg.get('tool_x')
      expect(rec.adapter).toBe(false)
      expect(rec.el).toBe(el)
      expect(rec.defaultKeys).toEqual(['d'])
      expect(reg.run('tool_x')).toBe('native')
    })

    it('the command keys win over the button shortcut attribute', () => {
      reg.register({ id: 'tool_x', label: 'X', keys: 'x', run () {} })
      adapt('tool_x', makeButton())
      expect(reg.get('tool_x').defaultKeys).toEqual(['x'])
    })
  })

  describe('run()', () => {
    it('unknown id -> CommandError(unknown)', () => {
      expect(codeOf(() => reg.run('nope'))).toBe('unknown')
    })

    it('disabled -> CommandError(disabled) carrying the reason, and run() is not called', () => {
      const run = vi.fn()
      reg.register({ id: 'a', label: 'A', enabled: () => 'Nothing selected', run })
      let err
      try { reg.run('a') } catch (e) { err = e }
      expect(err).toBeInstanceOf(CommandError)
      expect(err).toMatchObject({ code: 'disabled', id: 'a', message: 'Nothing selected' })
      expect(run).not.toHaveBeenCalled()
      expect(reg.tryRun('a')).toBe(false)
    })

    it('passes (editor, params) and returns the result', () => {
      const run = vi.fn(() => 'ok')
      reg.register({ id: 'a', label: 'A', run })
      expect(reg.run('a', {})).toBe('ok')
      expect(run).toHaveBeenCalledWith(editor, {})
    })

    it('an unexpected throw is logged and rethrown as internal', () => {
      const lines = []
      setLogSink((level, info) => lines.push([level, info.message]))
      const boom = new Error('kaput')
      reg.register({ id: 'a', label: 'A', run () { throw boom } })
      let err
      try { reg.run('a') } catch (e) { err = e }
      expect(err).toMatchObject({ code: 'internal', id: 'a', message: 'kaput', cause: boom })
      expect(lines.some(([level, m]) => level === 'error' && m.includes('"a"'))).toBe(true)
    })

    it('a throwing enabled() counts as disabled, not as a crash', () => {
      reg.register({ id: 'a', label: 'A', enabled () { throw new Error('x') }, run () {} })
      expect(reg.isEnabled('a')).toBe('unavailable')
    })

    it('atomic commands run inside svgCanvas.transact so a throw can roll back', () => {
      const transact = vi.fn((label, fn) => fn())
      editor.svgCanvas = { transact }
      reg.register({ id: 'a', label: 'A', atomic: true, run: () => 7 })
      reg.register({ id: 'b', label: 'B', run: () => 8 })
      expect(reg.run('a')).toBe(7)
      expect(transact).toHaveBeenCalledTimes(1)
      reg.run('b')
      expect(transact).toHaveBeenCalledTimes(1)
    })
  })

  describe('params', () => {
    beforeEach(() => {
      reg.register({
        id: 'p',
        label: 'P',
        params: {
          n: { type: 'number', min: 0, max: 10, default: 5 },
          s: { type: 'string' },
          b: { type: 'boolean', default: false },
          e: { type: 'enum', values: ['x', 'y'], required: true }
        },
        run: (_ed, p) => p
      })
    })

    it('coerces, clamps and fills defaults', () => {
      expect(reg.run('p', { n: '99', s: 4, b: 'true', e: 'x' })).toEqual({ n: 10, s: '4', b: true, e: 'x' })
      expect(reg.run('p', { n: -3, e: 'y' })).toEqual({ n: 0, b: false, e: 'y' })
      expect(reg.run('p', { e: 'y' })).toEqual({ n: 5, b: false, e: 'y' })
    })

    it('rejects unknown keys, missing required, bad numbers/enums/booleans', () => {
      expect(codeOf(() => reg.run('p', { e: 'x', zzz: 1 }))).toBe('badParams')
      expect(codeOf(() => reg.run('p', {}))).toBe('badParams')
      expect(codeOf(() => reg.run('p', { e: 'q' }))).toBe('badParams')
      expect(codeOf(() => reg.run('p', { e: 'x', n: 'abc' }))).toBe('badParams')
      expect(codeOf(() => reg.run('p', { e: 'x', n: '' }))).toBe('badParams')
      expect(codeOf(() => reg.run('p', { e: 'x', b: 'maybe' }))).toBe('badParams')
      expect(codeOf(() => reg.run('p', { e: 'x', s: { a: 1 } }))).toBe('badParams')
    })

    it('a command without params rejects any param', () => {
      reg.register({ id: 'q', label: 'Q', run () {} })
      expect(codeOf(() => reg.run('q', { x: 1 }))).toBe('badParams')
    })
  })

  describe('list()', () => {
    it('describes every command with state, effective keys and params', () => {
      editor.hotkeys = { effectiveKeys: (id) => (id === 'a' ? ['ctrl+k'] : []) }
      reg.register({ id: 'a', label: 'Alpha (extra)', group: 'Edit', keys: 'a', run () {} })
      reg.register({ id: 'b', label: 'Beta', enabled: () => 'because', params: { n: { type: 'number' } }, interactive: true, run () {} })
      const list = reg.list()
      expect(list.find((c) => c.id === 'a')).toEqual({
        id: 'a', label: 'Alpha', group: 'Edit', keys: ['ctrl+k'], enabled: true, interactive: false
      })
      expect(list.find((c) => c.id === 'b')).toMatchObject({
        enabled: false, disabledReason: 'because', interactive: true, params: { n: { type: 'number' } }
      })
    })

    it('hides palette:false commands unless asked', () => {
      reg.register({ id: 'h', label: 'H', palette: false, run () {} })
      expect(reg.list().map((c) => c.id)).not.toContain('h')
      expect(reg.list({ includeHidden: true }).map((c) => c.id)).toContain('h')
    })
  })

  describe('refreshEnablement()', () => {
    it('runs after every command (an atomic command records its undo step after its own events fired)', () => {
      const spy = vi.spyOn(reg, 'refreshEnablement')
      reg.register({ id: 'ok', label: 'Ok', run () {} })
      reg.register({ id: 'bad', label: 'Bad', run () { throw new Error('x') } })
      reg.run('ok')
      expect(spy).toHaveBeenCalledTimes(1)
      expect(() => reg.run('bad')).toThrow()
      expect(spy).toHaveBeenCalledTimes(2)
    })

    it('syncs elements declaring command="<id>" with the command state', () => {
      const container = document.createElement('div')
      const btn = document.createElement('button')
      btn.setAttribute('command', 'a')
      const other = document.createElement('button')
      other.setAttribute('command', 'unregistered')
      container.append(btn, other)
      editor.$container = container
      let on = false
      reg.register({ id: 'a', label: 'A', enabled: () => (on ? true : 'no'), run () {} })
      reg.refreshEnablement()
      expect(btn.disabled).toBe(true)
      expect(other.disabled).toBe(false) // unknown commands are left alone
      on = true
      reg.refreshEnablement()
      expect(btn.disabled).toBe(false)
    })

    it('mirrors the reason into disabled-reason while unavailable, and clears it', () => {
      const container = document.createElement('div')
      const btn = document.createElement('button')
      btn.setAttribute('command', 'a')
      const plain = document.createElement('button')
      plain.setAttribute('command', 'b')
      container.append(btn, plain)
      editor.$container = container
      let on = false
      reg.register({ id: 'a', label: 'A', enabled: () => (on ? true : 'Select a group'), run () {} })
      reg.register({ id: 'b', label: 'B', enabled: () => 'unavailable', run () {} })
      reg.refreshEnablement()
      expect(btn.getAttribute('disabled-reason')).toBe('Select a group')
      expect(plain.hasAttribute('disabled-reason')).toBe(false) // a bare 'unavailable' explains nothing
      on = true
      reg.refreshEnablement()
      expect(btn.hasAttribute('disabled-reason')).toBe(false)
    })
  })

  describe('alias commands (a second button for another command)', () => {
    it('own no keys, even when the button self-registers with a shortcut, in either order', () => {
      reg.register({ id: 'real', label: 'R', keys: 'd', run () {} })
      reg.register({ id: 'twin', label: 'T', alias: true, run () {} })
      reg.registerAdapter({ id: 'twin', el: document.createElement('button'), label: 'T', defaultKeys: ['d'], decorative: null, group: 'Edit' })
      expect(reg.get('twin').defaultKeys).toEqual([])
      reg.registerAdapter({ id: 'twin2', el: document.createElement('button'), label: 'T', defaultKeys: ['d'], decorative: null, group: 'Edit' })
      reg.register({ id: 'twin2', label: 'T', alias: true, run () {} })
      expect(reg.get('twin2').defaultKeys).toEqual([])
    })

    it('are hidden from palettes', () => {
      reg.register({ id: 'twin', label: 'T', alias: true, run () {} })
      expect(reg.list().map((c) => c.id)).not.toContain('twin')
      expect(reg.list({ includeHidden: true }).map((c) => c.id)).toContain('twin')
    })
  })
})
