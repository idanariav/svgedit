import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildCommandSearchCatalog, activateCommandSearchResult } from '../../src/editor/commandSearch.js'

const runFavoriteTrigger = vi.fn()
let mockIsValueControl = () => false
const buildFavoritesCatalog = vi.fn(() => [{ group: 'Tools', actions: [{ id: 'undo', label: 'Undo' }] }])

vi.mock('../../src/editor/favoriteActions.js', () => ({
  buildFavoritesCatalog: (...args) => buildFavoritesCatalog(...args),
  isValueControl: (id) => mockIsValueControl(id),
  runFavoriteTrigger: (...args) => runFavoriteTrigger(...args)
}))

function makeEditor () {
  return {
    hotkeys: { getAction: vi.fn(() => null) },
    rightPanel: { toggleSidePanel: vi.fn(), activateTab: vi.fn() }
  }
}

describe('commandSearch', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    runFavoriteTrigger.mockClear()
    buildFavoritesCatalog.mockClear()
    mockIsValueControl = () => false
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => { document.body.innerHTML = '' })

  it('buildCommandSearchCatalog delegates to buildFavoritesCatalog', () => {
    const editor = makeEditor()
    const result = buildCommandSearchCatalog(editor)
    expect(buildFavoritesCatalog).toHaveBeenCalledWith(editor)
    expect(result).toEqual([{ group: 'Tools', actions: [{ id: 'undo', label: 'Undo' }] }])
  })

  it('runs a trigger with no enclosing tab, without switching tabs', () => {
    const editor = makeEditor()
    const button = document.createElement('button')
    button.id = 'tool_undo'
    document.body.append(button)

    activateCommandSearchResult(editor, 'tool_undo')

    expect(editor.rightPanel.activateTab).not.toHaveBeenCalled()
    expect(editor.rightPanel.toggleSidePanel).not.toHaveBeenCalled()
    expect(runFavoriteTrigger).toHaveBeenCalledWith(editor, 'tool_undo')
  })

  it('switches to the enclosing Right Panel tab before running a trigger inside it', () => {
    const editor = makeEditor()
    const tab = document.createElement('div')
    tab.id = 'tab_design'
    tab.className = 'sidepanel_tabpanel'
    const button = document.createElement('button')
    button.id = 'tool_trace_image'
    tab.append(button)
    document.body.append(tab)

    activateCommandSearchResult(editor, 'tool_trace_image')

    expect(editor.rightPanel.toggleSidePanel).toHaveBeenCalledWith(true)
    expect(editor.rightPanel.activateTab).toHaveBeenCalledWith('design')
    expect(runFavoriteTrigger).toHaveBeenCalledWith(editor, 'tool_trace_image')
  })

  it('reveals stroke_width in place after switching to the Design tab, without running a trigger', () => {
    mockIsValueControl = (id) => id === 'stroke_width'
    const editor = makeEditor()
    const tab = document.createElement('div')
    tab.id = 'tab_design'
    tab.className = 'sidepanel_tabpanel'
    const field = document.createElement('input')
    field.id = 'stroke_width'
    tab.append(field)
    document.body.append(tab)

    activateCommandSearchResult(editor, 'stroke_width')

    expect(editor.rightPanel.activateTab).toHaveBeenCalledWith('design')
    expect(field.classList.contains('cmd-search-flash')).toBe(true)
    expect(field.scrollIntoView).toHaveBeenCalled()
    expect(runFavoriteTrigger).not.toHaveBeenCalled()
  })

  it('opens the colour dialog directly for fill_color, without switching tabs', () => {
    mockIsValueControl = (id) => id === 'fill_color'
    const editor = makeEditor()
    const swatch = document.createElement('div')
    swatch.id = 'fill_color'
    swatch.openColorDialog = vi.fn()
    document.body.append(swatch)

    activateCommandSearchResult(editor, 'fill_color')

    expect(editor.rightPanel.activateTab).not.toHaveBeenCalled()
    expect(swatch.openColorDialog).toHaveBeenCalledTimes(1)
    expect(runFavoriteTrigger).not.toHaveBeenCalled()
  })
})
