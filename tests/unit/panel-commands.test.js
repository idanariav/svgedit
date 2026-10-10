import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from '../../src/editor/commands.js'
import { registerPanelCommands } from '../../src/editor/panelCommands.js'

describe('panel commands', () => {
  let editor
  let commands
  let state

  beforeEach(() => {
    state = { mode: 'select', stroke: '#000', fill: '#f00', text: false, canDeleteNodes: true }
    const spyOn = (...names) => Object.fromEntries(names.map((n) => [n, vi.fn()]))
    editor = {
      svgCanvas: {
        getMode: () => state.mode,
        getColor: (k) => state[k],
        cancelImageCrop: vi.fn()
      },
      leftPanel: spyOn('clickSelect', 'clickFHPath', 'clickText', 'clickPath', 'clickLine', 'clickRect', 'clickEllipse', 'clickImage'),
      topPanel: {
        ...spyOn('clickFrame', 'clickWireframe', 'convertToPath', 'strokeToPath', 'clickFlipHorizontal', 'smoothPathNode',
          'clonePathNode', 'deletePathNode', 'opencloseSubPath', 'addSubPath', 'linkControlPoints', 'clickBold', 'clickItalic',
          'clickTextDecoration', 'makeHyperlink', 'clickGroup', 'applyImageCrop'),
        get anyTextSelected () { return state.text },
        path: { get canDeleteNodes () { return state.canDeleteNodes } }
      },
      rightPanel: spyOn('newLayer', 'deleteLayer', 'moveLayer', 'layerRename', 'openTraceDialog'),
      mainMenu: spyOn('clickTabletMode', 'showPreferences')
    }
    commands = new CommandRegistry(editor)
    editor.commands = commands
    registerPanelCommands(commands)
  })

  it('registers real commands (not button adapters) for the migrated ids', () => {
    for (const id of ['tool_select', 'tool_rect', 'tool_topath', 'tool_flip_h', 'layer_new', 'tool_bold', 'tool_export', 'tool_trace_image', 'tool_clone_multi']) {
      expect(commands.get(id), id).toBeTruthy()
      expect(commands.get(id).adapter, id).toBe(false)
    }
  })

  it('delegates to the panel method that used to be the click handler', () => {
    commands.run('tool_rect')
    expect(editor.leftPanel.clickRect).toHaveBeenCalledTimes(1)
    commands.run('tool_topath')
    expect(editor.topPanel.convertToPath).toHaveBeenCalledTimes(1)
    commands.run('layer_down')
    expect(editor.rightPanel.moveLayer).toHaveBeenCalledWith(1)
    commands.run('layer_up')
    expect(editor.rightPanel.moveLayer).toHaveBeenCalledWith(-1)
    commands.run('tool_editor_prefs')
    expect(editor.mainMenu.showPreferences).toHaveBeenCalledTimes(1)
  })

  it('text decorations pass their CSS value', () => {
    state.text = true
    commands.run('tool_text_decoration_linethrough')
    expect(editor.topPanel.clickTextDecoration).toHaveBeenCalledWith('line-through')
  })

  it('node commands are disabled outside the path editor, and delete also needs enough nodes', () => {
    expect(commands.isEnabled('tool_node_clone')).not.toBe(true)
    expect(() => commands.run('tool_node_clone')).toThrow(/Edit a path/)
    expect(editor.topPanel.clonePathNode).not.toHaveBeenCalled()
    state.mode = 'pathedit'
    expect(commands.isEnabled('tool_node_clone')).toBe(true)
    commands.run('tool_node_clone')
    expect(editor.topPanel.clonePathNode).toHaveBeenCalledTimes(1)
    state.canDeleteNodes = false
    expect(commands.isEnabled('tool_node_delete')).not.toBe(true)
    state.canDeleteNodes = true
    expect(commands.isEnabled('tool_node_delete')).toBe(true)
  })

  it('text commands need selected text', () => {
    expect(commands.isEnabled('tool_bold')).not.toBe(true)
    state.text = true
    expect(commands.isEnabled('tool_bold')).toBe(true)
  })

  it('tool buttons follow the stroke / fill gating the bottom panel applies', () => {
    state.stroke = 'none'
    expect(commands.isEnabled('tool_line')).not.toBe(true)
    expect(commands.isEnabled('tool_fhpath')).not.toBe(true)
    expect(commands.isEnabled('tool_text')).toBe(true) // a fill is enough
    state.fill = 'none'
    expect(commands.isEnabled('tool_text')).not.toBe(true)
    expect(commands.isEnabled('tool_path')).not.toBe(true)
    expect(commands.isEnabled('tool_select')).toBe(true)
  })

  it('Export is taken over by a host that owns exporting', () => {
    editor.$id = vi.fn(() => ({ setAttribute: vi.fn() }))
    window.svgEditHost = { exportDrawing: vi.fn() }
    try {
      commands.run('tool_export')
      expect(window.svgEditHost.exportDrawing).toHaveBeenCalledTimes(1)
      expect(editor.$id).not.toHaveBeenCalled()
    } finally {
      delete window.svgEditHost
    }
  })

  it('the multi-selection twins run the same command', () => {
    commands.register({ id: 'tool_clone', label: 'x', run: vi.fn() })
    commands.run('tool_clone_multi')
    expect(commands.get('tool_clone').run).toHaveBeenCalledTimes(1)
  })
})
