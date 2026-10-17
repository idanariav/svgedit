import { vi } from 'vitest'
import { CommandRegistry, CommandError } from '../../src/editor/commands.ts'
import { registerCanvasCommands } from '../../src/editor/canvasCommands.ts'

const LAYOUTS_KEY = 'svg-edit-canvas-layouts'

const makeEditor = () => {
  const editor = {
    svgCanvas: {
      setResolution: vi.fn(),
      getResolution: () => ({ w: 800, h: 600 }),
      getSvgString: () => '<svg/>'
    },
    configObj: { pref: () => '#FFFFFF' },
    updateCanvas: vi.fn(),
    setBackground: vi.fn()
  }
  editor.commands = new CommandRegistry(editor)
  registerCanvasCommands(editor.commands)
  return editor
}

describe('canvas commands', () => {
  beforeEach(() => localStorage.clear())

  it('are discoverable in the Canvas group with typed params', () => {
    const list = makeEditor().commands.list()
    const byId = Object.fromEntries(list.map((c) => [c.id, c]))
    expect(Object.keys(byId).filter((id) => id.startsWith('canvas_')).sort()).toEqual([
      'canvas_apply_layout', 'canvas_delete_layout', 'canvas_save_layout', 'canvas_set_background', 'canvas_set_size'
    ])
    expect(byId.canvas_set_size).toMatchObject({ group: 'Canvas', params: { width: { type: 'number', required: true } } })
  })

  it('canvas_set_size resizes and refreshes the canvas, rounding to whole pixels', () => {
    const editor = makeEditor()
    editor.commands.run('canvas_set_size', { width: 1024.4, height: '768' })
    expect(editor.svgCanvas.setResolution).toHaveBeenCalledWith(1024, 768)
    expect(editor.updateCanvas).toHaveBeenCalled()
  })

  it('canvas_set_size rejects a missing or non-numeric side', () => {
    const editor = makeEditor()
    expect(() => editor.commands.run('canvas_set_size', { width: 100 })).toThrow(CommandError)
    expect(() => editor.commands.run('canvas_set_size', { width: 'wide', height: 5 })).toThrow(/finite number/)
    expect(editor.svgCanvas.setResolution).not.toHaveBeenCalled()
  })

  it('canvas_set_background records an undo step and refuses what the canvas cannot paint', () => {
    const editor = makeEditor()
    editor.commands.run('canvas_set_background', { color: '#336699' })
    expect(editor.setBackground).toHaveBeenCalledWith('#336699', '', undefined, true)
    editor.commands.run('canvas_set_background', { color: 'none' })
    let err
    try { editor.commands.run('canvas_set_background', { color: 'red; evil' }) } catch (e) { err = e }
    expect(err).toBeInstanceOf(CommandError)
    expect(err.code).toBe('badParams')
    expect(editor.setBackground).toHaveBeenCalledTimes(2)
  })

  it('lists the saved layouts as the values of canvas_apply_layout, and is unavailable without any', () => {
    const editor = makeEditor()
    const layout = () => editor.commands.list().find((c) => c.id === 'canvas_apply_layout')
    expect(layout()).toMatchObject({ enabled: false, disabledReason: 'No saved layouts' })
    editor.commands.run('canvas_save_layout', { name: ' Poster ' })
    expect(JSON.parse(localStorage.getItem(LAYOUTS_KEY))).toMatchObject([{ name: 'Poster', w: 800, h: 600, bg: '#FFFFFF' }])
    expect(layout()).toMatchObject({ enabled: true, params: { name: { type: 'enum', values: ['Poster'] } } })
    expect(() => editor.commands.run('canvas_apply_layout', { name: 'Nope' })).toThrow(/one of \["Poster"\]/)
  })

  it('canvas_save_layout overwrites a layout of the same name and refuses a blank one', () => {
    const editor = makeEditor()
    editor.commands.run('canvas_save_layout', { name: 'A' })
    editor.svgCanvas.getResolution = () => ({ w: 10, h: 20 })
    editor.commands.run('canvas_save_layout', { name: 'A' })
    expect(JSON.parse(localStorage.getItem(LAYOUTS_KEY))).toMatchObject([{ name: 'A', w: 10, h: 20 }])
    expect(() => editor.commands.run('canvas_save_layout', { name: '   ' })).toThrow(/must not be empty/)
  })

  it('canvas_delete_layout removes only the named layout', () => {
    const editor = makeEditor()
    editor.commands.run('canvas_save_layout', { name: 'A' })
    editor.commands.run('canvas_save_layout', { name: 'B' })
    editor.commands.run('canvas_delete_layout', { name: 'A' })
    expect(JSON.parse(localStorage.getItem(LAYOUTS_KEY)).map((l) => l.name)).toEqual(['B'])
    expect(() => editor.commands.run('canvas_delete_layout', { name: 'A' })).toThrow(/one of \["B"\]/)
  })
})
