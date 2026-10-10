import { beforeEach, describe, expect, it, vi } from 'vitest'

import MainMenu from '../../src/editor/MainMenu.js'
import { CommandRegistry } from '../../src/editor/commands.js'
import { registerPanelCommands } from '../../src/editor/panelCommands.js'

vi.mock('@svgedit/svgcanvas', () => ({
  default: {
    $click: (el, fn) => el?.addEventListener('click', fn)
  }
}))

describe('MainMenu', () => {
  let editor
  let menu
  let prefStore

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app"></div>
      <div id="se-export-dialog"></div>
      <div id="se-edit-prefs"></div>
    `
    prefStore = { img_save: 'embed', lang: 'en' }
    const configObj = {
      curConfig: {
        baseUnit: 'px',
        exportWindowType: 'new',
        canvasName: 'svg-edit',
        gridSnapping: false,
        snappingStep: 1,
        gridColor: '#ccc',
        showRulers: false
      },
      curPrefs: { bkgd_color: '#fff' },
      preferences: false,
      pref: vi.fn((key, val) => {
        if (val !== undefined) {
          prefStore[key] = val
        }
        return prefStore[key]
      })
    }
    const svgCanvas = {
      setDocumentTitle: vi.fn(),
      setResolution: vi.fn().mockReturnValue(true),
      getResolution: vi.fn(() => ({ w: 120, h: 80 })),
      getDocumentTitle: vi.fn(() => 'Doc'),
      setConfig: vi.fn(),
      rasterExport: vi.fn().mockResolvedValue('data-uri')
    }

    editor = {
      configObj,
      svgCanvas,
      i18next: { t: (key) => key },
      $svgEditor: document.getElementById('app'),
      // Container-scoped lookups (see EditorStartup constructor).
      $id: (id) => document.getElementById(id),
      rulers: { updateRulers: vi.fn(), display: vi.fn() },
      setBackground: vi.fn(),
      updateCanvas: vi.fn(),
      customExportImage: false
    }
    globalThis.seAlert = vi.fn()
    menu = new MainMenu(editor)
    // The menu entries are views of registry commands (panelCommands.js).
    editor.mainMenu = menu
    editor.commands = new CommandRegistry(editor)
    registerPanelCommands(editor.commands)
  })

  it('saves preferences and updates config', async () => {
    editor.configObj.preferences = true
    // Grid settings live in the grid-settings popover, not here; savePreferences
    // only handles ruler visibility and the base unit.
    const detail = {
      showrulers: true,
      baseunit: 'cm'
    }

    await menu.savePreferences({ detail })

    expect(editor.rulers.display).toHaveBeenCalledWith(true)
    expect(editor.configObj.curConfig.showRulers).toBe(true)
    expect(editor.configObj.curConfig.baseUnit).toBe('cm')
    expect(editor.rulers.updateRulers).toHaveBeenCalled()
    expect(editor.svgCanvas.setConfig).toHaveBeenCalled()
    expect(editor.updateCanvas).toHaveBeenCalled()
    expect(editor.configObj.preferences).toBe(false)
    expect(document.getElementById('se-edit-prefs').getAttribute('dialog')).toBe('close')
  })

  it('persists the scrub-fields preference and shows the stored value when the dialog opens', async () => {
    await menu.savePreferences({ detail: { showrulers: false, baseunit: 'px', scrubfields: false } })
    expect(editor.configObj.pref).toHaveBeenCalledWith('scrub_numeric_fields', false, true)
    expect(prefStore.scrub_numeric_fields).toBe(false)
    const dialog = document.getElementById('se-edit-prefs')
    menu.showPreferences()
    expect(dialog.scrubFields).toBe(false)
    editor.configObj.preferences = false
    prefStore.scrub_numeric_fields = 'true' // storage hands prefs back as strings
    menu.showPreferences()
    expect(dialog.scrubFields).toBe(true)
  })

  it('opens preferences dialog only once', () => {
    menu.showPreferences()
    const prefs = document.getElementById('se-edit-prefs')
    expect(editor.configObj.preferences).toBe(true)
    expect(prefs.getAttribute('dialog')).toBe('open')

    // Grid/background attributes are populated by the grid-settings popover,
    // not showPreferences, which only opens the dialog once per session.
    prefs.removeAttribute('dialog')
    menu.showPreferences()
    expect(prefs.getAttribute('dialog')).toBeNull()
  })

  it('routes export actions based on dialog detail', async () => {
    await menu.clickExport()
    expect(editor.svgCanvas.rasterExport).not.toHaveBeenCalled()

    await menu.clickExport({ detail: { trigger: 'ok', imgType: 'PNG', quality: 50 } })
    expect(editor.svgCanvas.rasterExport).toHaveBeenCalledWith(
      'PNG', 0.5, editor.exportWindowName,
      { includeBg: false, bgcolor: editor.configObj.curPrefs.bkgd_color, crop: null }
    )
    expect(editor.exportWindowCt).toBe(1)

    await menu.clickExport({ detail: { trigger: 'ok', imgType: 'PNG', quality: 100, scale: 2 } })
    expect(editor.svgCanvas.rasterExport).toHaveBeenLastCalledWith(
      'PNG', 1, editor.exportWindowName,
      { includeBg: false, bgcolor: editor.configObj.curPrefs.bkgd_color, crop: null, scale: 2 }
    )
  })

  it('delegates Export to window.svgEditHost.exportDrawing when a host provides it', () => {
    menu.init()
    window.svgEditHost = { exportDrawing: vi.fn() }
    try {
      editor.commands.run('tool_export')
      expect(window.svgEditHost.exportDrawing).toHaveBeenCalledTimes(1)
      expect(document.getElementById('se-export-dialog').getAttribute('dialog')).not.toBe('open')
    } finally {
      delete window.svgEditHost
    }
  })

  it('creates menu entries that are views of their commands, and wires the dialogs in init', () => {
    menu.init()

    for (const id of ['tool_export', 'tool_command_search', 'tool_hotkeys', 'tool_favorites', 'tool_editor_prefs']) {
      expect(document.getElementById(id).getAttribute('command'), id).toBe(id)
      expect(editor.commands.get(id).adapter, id).toBe(false)
    }

    editor.commands.run('tool_export')
    expect(document.getElementById('se-export-dialog').getAttribute('dialog')).toBe('open')

    editor.commands.run('tool_editor_prefs')
    expect(editor.configObj.preferences).toBe(true)

    const prefsDialog = document.getElementById('se-edit-prefs')
    prefsDialog.dispatchEvent(new CustomEvent('change', { detail: { dialog: 'closed' } }))
    expect(prefsDialog.getAttribute('dialog')).toBe('close')
  })
})
