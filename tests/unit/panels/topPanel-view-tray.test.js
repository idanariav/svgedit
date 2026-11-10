import { describe, expect, it, vi } from 'vitest'

// See topPanel-image-panel.test.js for why @svgedit/svgcanvas is mocked here.
vi.mock('@svgedit/svgcanvas', () => ({
  default: { $click: () => {}, isValidUnit: () => true, getTypeMap: () => ({}), convertUnit: (v) => v }
}))

const { default: TopPanel } = await import('../../../src/editor/panels/TopPanel.ts')

describe('TopPanel.toggleViewTray', () => {
  const build = () => {
    const tray = document.createElement('div')
    tray.id = 'editor_panel'
    const editor = { $req: () => tray, configObj: { pref: vi.fn() } }
    return { panel: new TopPanel(editor), tray, editor }
  }

  it('folds the view tray and opens it again, remembering the choice', () => {
    const { panel, tray, editor } = build()
    panel.toggleViewTray()
    expect(tray.classList.contains('collapsed')).toBe(true)
    expect(editor.configObj.pref).toHaveBeenLastCalledWith('view_tray_collapsed', true, true)
    panel.toggleViewTray()
    expect(tray.classList.contains('collapsed')).toBe(false)
    expect(editor.configObj.pref).toHaveBeenLastCalledWith('view_tray_collapsed', false, true)
  })

  it('takes an explicit state (the saved one, on start)', () => {
    const { panel, tray } = build()
    panel.toggleViewTray(true)
    panel.toggleViewTray(true)
    expect(tray.classList.contains('collapsed')).toBe(true)
  })
})
