import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import extLayerView from '../../src/editor/extensions/ext-layer_view/ext-layer_view.ts'
import { mockCommands } from './helpers/commands.js'

describe('ext-layer_view', () => {
  let svgCanvas
  let svgEditor
  let extInstance
  let editorPanel
  let svgEditorRoot
  let marks
  let layers
  let currentIndex

  const badgeText = () => document.querySelector('#layer_focus_badge_text').textContent
  const badgeVisible = () => document.querySelector('#layer_focus_badge').classList.contains('visible')
  const activeSegment = () =>
    document.querySelector('#layer_focus_badge_switch button.active')?.dataset.mode
  const clickSegment = (mode) => {
    document.querySelector(`#layer_focus_badge_switch button[data-mode="${mode}"]`).click()
  }

  beforeEach(async () => {
    editorPanel = document.createElement('div')
    editorPanel.id = 'editor_panel'
    document.body.append(editorPanel)

    svgEditorRoot = document.createElement('div')
    document.body.append(svgEditorRoot)

    marks = {}
    layers = [
      { name: 'Layer 1', locked: false, comment: false },
      { name: 'Layer 2', locked: false, comment: false }
    ]
    currentIndex = 1 // "Layer 2" is current, matching real identifyLayers (top-most)

    const drawing = {
      getNumLayers: () => layers.length,
      getLayerName: (i) => layers[i].name,
      getCurrentLayerName: () => layers[currentIndex].name,
      getLayerByName: (lname) => {
        const l = layers.find((x) => x.name === lname)
        if (!l) return null
        if (!l.el) l.el = document.createElement('g')
        return l.el
      },
      getLayerLocked: (lname) => layers.find((x) => x.name === lname)?.locked ?? false,
      getLayerComment: (lname) => layers.find((x) => x.name === lname)?.comment ?? false
    }

    svgCanvas = {
      $id: (id) => document.getElementById(id),
      $req: (id) => document.getElementById(id),
      $click: (el, fn) => el?.addEventListener('click', fn),
      getCurrentDrawing: () => drawing,
      setLayerLocked: vi.fn((lname, locked) => {
        const l = layers.find((x) => x.name === lname)
        if (l) l.locked = locked
      }),
      setAllLayersMode: vi.fn(),
      getAllLayersMode: vi.fn(() => false),
      indexCurrentLayer: () => currentIndex,
      setCurrentLayer: vi.fn((lname) => {
        currentIndex = layers.findIndex((x) => x.name === lname)
      }),
      getSelectedElements: () => [],
      moveSelectedToLayer: vi.fn(),
      selectOnly: vi.fn(),
      bind: vi.fn(),
      // the canvas's interaction sheet (roadmap R11): the dim is a mark on it, never a style on the layer groups
      interactionStyle: { mark: (name, targets) => { marks[name] = targets }, refresh: vi.fn() }
    }

    svgEditor = {
      svgCanvas,
      $svgEditor: svgEditorRoot,
      configObj: { pref: () => 'en', curConfig: {} },
      i18next: { t: (key) => key, addResourceBundle: vi.fn() }
    }

    mockCommands(svgEditor)

    extInstance = await extLayerView.init(svgEditor)
    extInstance.callback()
  })

  /** Layer mode fades layer `i` (its group is in the mark), with nothing written on the group */
  const dimmed = (i) => {
    const group = svgCanvas.getCurrentDrawing().getLayerByName(layers[i].name)
    expect(group.hasAttribute('style')).toBe(false)
    return marks['layer-view-dim']().includes(group)
  }

  afterEach(() => {
    // Exit layer mode (if a test left it on) so its document-level keydown
    // listener is removed before the DOM is wiped — otherwise it lingers on
    // `document` (shared across tests) and fires during later tests.
    const btn = document.getElementById('tool_layerView')
    if (btn?.pressed) btn.click()
    document.body.textContent = ''
  })

  it('defaults to Current-layer Focus sub-mode each time layer mode is entered', () => {
    document.getElementById('tool_layerView').click()

    expect(badgeVisible()).toBe(true)
    expect(activeSegment()).toBe('current')
    expect(badgeText()).toBe('layer_view:focus.badge')
    expect(svgCanvas.setAllLayersMode).toHaveBeenLastCalledWith(false)
    // Focus dims/locks every layer but the current one ("Layer 2").
    expect(dimmed(0)).toBe(true)
    expect(dimmed(1)).toBe(false)
    expect(layers[0].locked).toBe(true)
    expect(layers[1].locked).toBe(false)
  })

  it('excludes comment layers from Focus dim/lock and All Layers reset', () => {
    layers[0].comment = true

    document.getElementById('tool_layerView').click()
    // Focus mode dims/locks every non-current layer except comment layers —
    // Layer 1 is never touched, so its group element is never even created.
    expect(layers[0].el).toBeUndefined()
    expect(layers[0].locked).toBe(false)

    clickSegment('all')
    // All-Layers mode's lock reset also skips comment layers.
    expect(svgCanvas.setLayerLocked).not.toHaveBeenCalledWith('Layer 1', expect.anything())
  })

  it('switches to All Layers mode from the badge and clears dim/lock', () => {
    document.getElementById('tool_layerView').click()

    clickSegment('all')

    expect(activeSegment()).toBe('all')
    expect(badgeText()).toBe('layer_view:all.badge')
    expect(svgCanvas.setAllLayersMode).toHaveBeenLastCalledWith(true)
    // No forced dim/lock in All Layers mode.
    expect(dimmed(0)).toBe(false)
    expect(dimmed(1)).toBe(false)
    expect(layers[0].locked).toBe(false)
    expect(layers[1].locked).toBe(false)
  })

  it('switching back to Layer restores Focus dim/lock and All Layers off', () => {
    document.getElementById('tool_layerView').click()
    clickSegment('all')
    clickSegment('current')

    expect(activeSegment()).toBe('current')
    expect(badgeText()).toBe('layer_view:focus.badge')
    expect(svgCanvas.setAllLayersMode).toHaveBeenLastCalledWith(false)
    expect(dimmed(0)).toBe(true)
    expect(layers[1].locked).toBe(false)
  })

  it('the [ / ] layer-nav hotkey works in Focus sub-mode but not in All Layers sub-mode', () => {
    document.getElementById('tool_layerView').click()

    const pressBracket = () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true, cancelable: true }))

    pressBracket()
    expect(svgCanvas.setCurrentLayer).toHaveBeenCalledTimes(1)

    clickSegment('all')
    pressBracket()
    // Still just the one call from before switching to All Layers.
    expect(svgCanvas.setCurrentLayer).toHaveBeenCalledTimes(1)
  })

  it('exiting layer mode resets to Current-layer Focus and turns All Layers off', () => {
    const btn = document.getElementById('tool_layerView')
    btn.click() // enter
    clickSegment('all')

    btn.click() // exit

    expect(badgeVisible()).toBe(false)
    expect(svgCanvas.setAllLayersMode).toHaveBeenLastCalledWith(false)
    expect(dimmed(0)).toBe(false)
    expect(dimmed(1)).toBe(false)

    btn.click() // re-enter
    expect(activeSegment()).toBe('current')
  })
})
