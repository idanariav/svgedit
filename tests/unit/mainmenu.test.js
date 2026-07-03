import { beforeEach, describe, expect, it, vi } from 'vitest'

import MainMenu from '../../src/editor/MainMenu.js'

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
  })

  it('creates menu entries and wires click handlers in init', () => {
    menu.init()

    document.getElementById('tool_export').dispatchEvent(new Event('click', { bubbles: true }))
    expect(document.getElementById('se-export-dialog').getAttribute('dialog')).toBe('open')

    document.getElementById('tool_editor_prefs').dispatchEvent(new Event('click', { bubbles: true }))
    expect(editor.configObj.preferences).toBe(true)

    const prefsDialog = document.getElementById('se-edit-prefs')
    prefsDialog.dispatchEvent(new CustomEvent('change', { detail: { dialog: 'closed' } }))
    expect(prefsDialog.getAttribute('dialog')).toBe('close')
  })
})
