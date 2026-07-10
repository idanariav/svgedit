import { test, expect } from './fixtures.js'

test.describe('Main menu logic', () => {
  test('saves properties, preferences and export settings', async ({ page }) => {
    await page.addInitScript(() => {
      window.__svgEditorReadyResolved = false
      window.__svgEditorReady = new Promise((resolve) => {
        document.addEventListener('svgedit:ready', (e) => {
          window.__svgEditor = e.detail
          window.__svgEditorReadyResolved = true
          resolve()
        }, { once: true })
      })
    })

    await page.goto('/index.html')
    await page.waitForFunction(() => window.__svgEditorReadyResolved === true)

    const result = await page.evaluate(() => {
      const MainMenu = window.__svgEditor.mainMenu.constructor
      window.seAlert = () => {}
      const prefsStore = {}
      const svgCanvas = {
        setConfig: (cfg) => { window.__setConfig = cfg },
        rasterExport: () => { window.__raster = true }
      }

      const editor = {
        $id: (id) => document.getElementById(id),
        configObj: {
          pref: (key, val) => {
            if (val !== undefined) prefsStore[key] = val
            return prefsStore[key]
          },
          curConfig: {
            baseUnit: 'px',
            showRulers: false,
            canvasName: 'test'
          },
          curPrefs: { bkgd_color: '#fff' },
          preferences: false
        },
        rulers: {
          display: () => { window.__rulersDisplayed = true },
          updateRulers: () => { window.__rulers = true }
        },
        svgCanvas,
        updateCanvas: () => { window.__updated = true },
        i18next: { t: (key) => key },
        exportWindowCt: 0,
        customExportImage: false,
        exportWindowName: ''
      }

      const holder = document.getElementById('menu-test-root') || (() => {
        const div = document.createElement('div')
        div.id = 'menu-test-root'
        document.body.append(div)
        return div
      })()
      holder.innerHTML = '<div id="se-edit-prefs"></div>'
      const menu = new MainMenu(editor)

      menu.showPreferences()
      menu.savePreferences({
        detail: {
          showrulers: true,
          baseunit: 'cm'
        }
      })
      menu.clickExport({ detail: { trigger: 'ok', imgType: 'PNG', quality: 80 } })
      window.seAlert?.('alert text')
      window.seConfirm?.('question?', ['Yes', 'No'])
      window.sePrompt?.('prompt me', 'defaults')
      window.seSelect?.('pick', ['a', 'b'])

      return {
        updated: window.__updated,
        prefsDialogState: document.getElementById('se-edit-prefs').getAttribute('dialog'),
        baseUnit: editor.configObj.curConfig.baseUnit,
        rulersUpdated: window.__rulers === true,
        rasterCalled: window.__raster === true
      }
    })

    expect(result.updated).toBe(true)
    expect(result.prefsDialogState).toBe('close')
    expect(result.baseUnit).toBe('cm')
    expect(result.rulersUpdated).toBe(true)
    expect(result.rasterCalled).toBe(true)
  })
})
