import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('browser-fs-access', () => ({ fileOpen: vi.fn(), fileSave: vi.fn() }))

const { default: extOpenSave } = await import('../../src/editor/extensions/ext-opensave/ext-opensave.ts')
const { fileSave } = await import('browser-fs-access')
const { mockCommands } = await import('./helpers/commands.js')

describe('ext-opensave', () => {
  let svgEditor
  let sourceDialog

  beforeEach(async () => {
    sourceDialog = document.createElement('div')
    sourceDialog.id = 'se-svg-editor-dialog'
    sourceDialog.$sourceTxt = { value: '<svg>typed in the source editor</svg>' }
    document.body.append(sourceDialog)
    const menu = document.createElement('div')
    menu.id = 'tool_import'
    document.body.append(menu)

    const byId = (id) => document.getElementById(id)
    const svgCanvas = {
      $id: byId,
      $req: byId,
      insertChildAtIndex: vi.fn(),
      clearSelection: vi.fn(),
      runExtensions: vi.fn()
    }
    svgEditor = {
      svgCanvas,
      workarea: document.createElement('div'),
      configObj: { pref: () => 'en', curConfig: { dimensions: [640, 480] } },
      i18next: { t: (key) => key, addResourceBundle: vi.fn() },
      saveSourceEditor: vi.fn()
    }
    mockCommands(svgEditor)
    const ext = await extOpenSave.init(svgEditor)
    ext.callback.call(svgEditor)
  })

  afterEach(() => {
    document.body.textContent = ''
    vi.clearAllMocks()
  })

  it('saving while the source editor is open saves the text in it, as the dialog\'s own Save does', async () => {
    sourceDialog.setAttribute('dialog', 'open')

    await svgEditor.commands.run('tool_save')

    expect(svgEditor.saveSourceEditor).toHaveBeenCalledTimes(1)
    const e = svgEditor.saveSourceEditor.mock.calls[0][0]
    expect(e.detail.value).toBe('<svg>typed in the source editor</svg>')
    expect(fileSave).not.toHaveBeenCalled()
  })
})
