import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'
import { renderCommandsDoc } from '../../scripts/commands-doc.mjs'

// `.claude/commands.md` is the generated list of every command (id, label, keys, params).
// UPDATE_COMMANDS_DOC=1 rewrites it; a plain run fails when it is stale.
const DOC = path.resolve('.claude/commands.md')

// Default keys depend on the platform (`meta+z` on a Mac, `ctrl+z` elsewhere; `isMac()` reads the user agent): pin one
// so the file is the same wherever it is generated or checked.
test.use({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' })

test('.claude/commands.md matches the command registry', async ({ page }) => {
  await visitAndApproveStorage(page)
  await page.evaluate(() => {
    window.svgEditor.configObj.pref('uiMode', 'desktop', true)
    document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
  })
  await page.waitForFunction(() => window.svgEditor.extensionsAdded === true, null, { timeout: 20000 })
  const { all, visible } = await page.evaluate(async () => {
    const { commands } = window.svgEditor
    const strip = (c) => ({ id: c.id, label: c.label, group: c.group, keys: c.keys, interactive: c.interactive, params: c.params })
    return {
      all: commands.list({ includeHidden: true }).map(strip),
      visible: commands.list().map((c) => c.id)
    }
  })
  const hidden = new Set(all.map((c) => c.id).filter((id) => !visible.includes(id)))
  const doc = renderCommandsDoc(all, hidden)
  if (process.env.UPDATE_COMMANDS_DOC) {
    fs.writeFileSync(DOC, doc)
    return
  }
  expect(fs.readFileSync(DOC, 'utf8'), 'run UPDATE_COMMANDS_DOC=1 npx playwright test tests/e2e/commands-doc.spec.js').toBe(doc)
})
