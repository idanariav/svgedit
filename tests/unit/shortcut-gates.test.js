import { beforeEach, describe, expect, it } from 'vitest'
import { buildEditorShortcuts } from '../../src/editor/editorShortcuts.js'
import { canPaste } from '../../src/editor/commandGates.js'

const svg = (tag, attrs = {}) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  return e
}

describe('editor shortcut gates', () => {
  let state
  let editor
  let gate

  beforeEach(() => {
    state = { selected: [], mode: 'select', visible: [], align: 'selected', canDeleteNodes: true, clipboard: null }
    editor = {
      $id: () => ({ value: state.align }),
      svgCanvas: {
        getSelectedElements: () => state.selected,
        getMode: () => state.mode,
        pathActions: { get canDeleteNodes () { return state.canDeleteNodes } },
        getCurrentGroup: () => null,
        getCurrentDrawing: () => ({ getCurrentLayer: () => ({}) }),
        getVisibleElements: () => state.visible,
        getClipboardID: () => 'clip'
      }
    }
    const table = buildEditorShortcuts(editor)
    gate = (id) => table.find((sc) => sc.id === id).enabled(editor)
  })

  it('every selection-dependent shortcut is disabled with nothing selected', () => {
    for (const id of ['raise', 'lower', 'move_to_front', 'move_up', 'move_right_big', 'clone_up', 'clone_left_big',
      'flip_horizontal', 'flip_vertical', 'cut', 'copy', 'transform_again', 'add_to_shape_library', 'delete_selected',
      'align_left', 'align_bottom', 'bool_union', 'bool_divide', 'switch_zorder', 'rotate_cw']) {
      expect(gate(id), id).not.toBe(true)
    }
    state.selected = [svg('rect')]
    for (const id of ['raise', 'move_up', 'clone_up', 'flip_horizontal', 'cut', 'copy', 'transform_again', 'delete_selected', 'rotate_cw', 'rotate_ccw_fine']) {
      expect(gate(id), id).toBe(true)
    }
  })

  it('rotating by key needs exactly one object', () => {
    state.selected = [svg('rect'), svg('rect')]
    expect(gate('rotate_cw')).toBe('Select one object to rotate')
  })

  it('align to the selection needs two objects; to the page, one', () => {
    state.selected = [svg('rect')]
    expect(gate('align_left')).not.toBe(true)
    state.align = 'page'
    expect(gate('align_left')).toBe(true)
    state.align = 'selected'
    state.selected = [svg('rect'), svg('rect')]
    expect(gate('align_left')).toBe(true)
  })

  it('boolean operations take exactly two shapes, no text or images', () => {
    state.selected = [svg('rect')]
    expect(gate('bool_union')).not.toBe(true)
    state.selected = [svg('rect'), svg('circle')]
    expect(gate('bool_union')).toBe(true)
    state.selected = [svg('rect'), svg('text')]
    expect(gate('bool_subtract')).toBe('Text and images can’t be combined')
    state.selected = [svg('rect'), svg('circle'), svg('path')]
    expect(gate('bool_union')).not.toBe(true)
  })

  it('Switch z-order needs two siblings', () => {
    const a = svg('rect')
    const b = svg('rect')
    state.selected = [a, b]
    svg('g').append(a)
    svg('g').append(b)
    expect(gate('switch_zorder')).not.toBe(true)
    b.remove()
    a.parentNode.append(b)
    expect(gate('switch_zorder')).toBe(true)
  })

  it('Delete also works in the node editor, when the path can lose a node', () => {
    state.mode = 'pathedit'
    expect(gate('delete_selected')).toBe(true)
    state.canDeleteNodes = false
    expect(gate('delete_selected')).toBe('A path needs at least two nodes')
  })

  it('Select all and Tab need something in the layer', () => {
    expect(gate('select_all')).not.toBe(true)
    expect(gate('cycle_next')).not.toBe(true)
    state.visible = [svg('rect')]
    expect(gate('select_all')).toBe(true)
    expect(gate('cycle_prev')).toBe(true)
  })

  it('Escape and the path commands keep their own checks', () => {
    const table = buildEditorShortcuts(editor)
    expect(table.find((sc) => sc.id === 'escape').enabled).toBeUndefined()
    expect(table.find((sc) => sc.id === 'path_average_h').enabled()).not.toBe(true)
  })

  it('Paste needs a clipboard', () => {
    sessionStorage.removeItem('clip')
    expect(canPaste(editor)).toBe('Nothing to paste')
    sessionStorage.setItem('clip', '[{}]')
    expect(canPaste(editor)).toBe(true)
    sessionStorage.removeItem('clip')
  })
})
