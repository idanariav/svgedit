import fs from 'node:fs'
import path from 'node:path'
import { CommandRegistry } from '../../src/editor/commands.js'
import { buildEditorShortcuts } from '../../src/editor/editorShortcuts.js'
import { registerCoreCommands } from '../../src/editor/coreCommands.js'
import { CORNER_KINDS } from '../../packages/svgcanvas/core/corner-radius.js'

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

// Buttons whose ids are built from a template literal at runtime (the markup regex
// above only sees literal ids). Keep in step with the extensions that build them.
const TEMPLATED_IDS = [
  ...['spiral', 'arc', 'rectgrid', 'polargrid'].map((m) => `tool_${m}`), // ext-shape-family MODES
  ...CORNER_KINDS.map((k) => `corner_kind_${k}`) // ext-corner-radius
]

const currentIds = () => {
  const reg = new CommandRegistry({})
  registerCoreCommands(reg)
  const ids = new Set([...reg.table.keys(), ...markupIds(), ...TEMPLATED_IDS])
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

  it('the templated ids still match the source that builds them', () => {
    const shapes = fs.readFileSync(path.join(SRC, 'extensions/ext-shape-family/ext-shape-family.js'), 'utf8')
    expect(shapes).toContain("const MODES = ['spiral', 'arc', 'rectgrid', 'polargrid']")
    expect(shapes).toContain('id="tool_$' + '{mode}"')
    const corners = fs.readFileSync(path.join(SRC, 'extensions/ext-corner-radius/ext-corner-radius.js'), 'utf8')
    expect(corners).toContain('id="corner_kind_$' + '{k}"')
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
