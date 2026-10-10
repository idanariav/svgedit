import fs from 'node:fs'
import path from 'node:path'
import { CommandRegistry } from '../../src/editor/commands.js'
import { buildEditorShortcuts } from '../../src/editor/editorShortcuts.js'
import { registerCoreCommands } from '../../src/editor/coreCommands.js'

// Command ids are persisted user data: hotkey overrides (`svg-edit-hotkeys`) and
// favorites (`svg-edit-favorites`) are keyed by them, so renaming or dropping
// one silently discards people's settings. This test pins the set.
//
// Intentionally removing an id? Delete it from the fixture in the same change
// and say how stored settings are migrated. Adding ids needs no fixture edit,
// but run `UPDATE_COMMAND_IDS=1 npx vitest run tests/unit/command-ids.test.js`
// to record them.
const FIXTURE = path.resolve(__dirname, 'fixtures/command-ids.json')
const SRC = path.resolve(__dirname, '../../src/editor')

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(html|js)$/.test(entry.name)) out.push(full)
  }
  return out
}

// Components that self-register with the HotkeyManager (seButton / seMenuItem)
// and carry a literal id in markup.
const markupIds = () => {
  const ids = new Set()
  const re = /<se-(?:button|menu-item)\b[^>]*?\sid="([A-Za-z0-9_.-]+)"/g
  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(re)) ids.add(m[1])
  }
  return ids
}

const currentIds = () => {
  const reg = new CommandRegistry({})
  registerCoreCommands(reg)
  const ids = new Set([...reg.table.keys(), ...markupIds()])
  for (const sc of buildEditorShortcuts({})) ids.add(sc.id)
  return [...ids].sort()
}

describe('command id stability', () => {
  it('still contains every id recorded in the fixture', () => {
    const now = currentIds()
    if (process.env.UPDATE_COMMAND_IDS) {
      fs.writeFileSync(FIXTURE, JSON.stringify(now, null, 2) + '\n')
    }
    const recorded = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
    expect(recorded.length).toBeGreaterThan(100)
    expect(recorded.filter((id) => !now.includes(id))).toEqual([])
  })

  it('the core (pilot) command ids are exactly the ids buttons / favorites already used', () => {
    const reg = new CommandRegistry({})
    registerCoreCommands(reg)
    expect([...reg.table.keys()].sort()).toEqual([
      'paste', 'paste_in_place', 'tool_clone', 'tool_delete', 'tool_group_elements',
      'tool_redo', 'tool_undo', 'tool_ungroup', 'zoom_fit'
    ])
  })
})
