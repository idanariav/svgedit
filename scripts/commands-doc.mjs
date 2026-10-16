// commands-doc.mjs — renders `.claude/commands.md` (every command id, label, default keys and params) from `editor.commands.list({ includeHidden: true })`
//
// The list only exists in a running editor (extensions register their commands on init), so the file is written and
// checked by `tests/e2e/commands-doc.spec.js`: `UPDATE_COMMANDS_DOC=1 npx playwright test tests/e2e/commands-doc.spec.js`
// rewrites it, a plain run fails when it is stale. This module is the pure part (unit-tested in tests/unit/commands-doc.test.js).

/**
 * @typedef {object} ListedCommand
 * @property {string} id
 * @property {string} label
 * @property {string} group
 * @property {string[]} keys
 * @property {boolean} [interactive]
 * @property {Object<string, {type: string, default?: *, min?: number, max?: number, values?: string[], required?: boolean}>} [params]
 */

/** @param {string} s @returns {string} */
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')

/**
 * `name: number 1..100 = 5`, `layout: "a" | "b"`, `name!` marks a required one.
 * @param {NonNullable<ListedCommand['params']>} params
 * @returns {string}
 */
export function formatParams (params) {
  return Object.entries(params).map(([name, p]) => {
    let type = p.type
    if (p.type === 'enum' && p.values) type = p.values.map(v => JSON.stringify(v)).join(' | ')
    else if (p.min !== undefined || p.max !== undefined) type += ` ${p.min ?? ''}..${p.max ?? ''}`
    const def = p.default !== undefined && p.default !== '' ? ` = ${JSON.stringify(p.default)}` : ''
    return `\`${name}${p.required ? '!' : ''}: ${type}${def}\``
  }).join('<br>')
}

/**
 * @param {ListedCommand[]} list the registry's snapshot, hidden commands included
 * @param {Set<string>} [hidden] ids of the commands that are not in palettes
 * @returns {string}
 */
export function renderCommandsDoc (list, hidden = new Set()) {
  /** @type {Map<string, ListedCommand[]>} */
  const groups = new Map()
  for (const c of [...list].sort((a, b) => a.group.localeCompare(b.group))) {
    if (!groups.has(c.group)) groups.set(c.group, [])
    groups.get(c.group).push(c)
  }
  const out = [
    '# Commands',
    '',
    '> **Generated** from `editor.commands.list({ includeHidden: true })` by `tests/e2e/commands-doc.spec.js`',
    '> (`UPDATE_COMMANDS_DOC=1 npx playwright test tests/e2e/commands-doc.spec.js` rewrites it; the plain e2e run fails',
    '> when it is stale). Every user-visible action is a command with a stable id: never rename one, hotkey overrides',
    '> and favorites store them. Keys are the defaults, in the registry\'s authoring form (`mod` = Ctrl / Cmd).',
    '> *dialog* = opens a dialog / file picker / prompt; *hidden* = not listed in palettes and the shortcut manager.',
    ''
  ]
  for (const [group, cmds] of groups) {
    out.push(`## ${group}`, '', '| Id | Label | Keys | Params | |', '|---|---|---|---|---|')
    for (const c of [...cmds].sort((a, b) => a.id.localeCompare(b.id))) {
      const flags = [c.interactive ? 'dialog' : '', hidden.has(c.id) ? 'hidden' : ''].filter(Boolean).join(', ')
      out.push(`| \`${c.id}\` | ${cell(c.label)} | ${c.keys.length ? c.keys.map(k => `\`${cell(k)}\``).join(' ') : ''} | ${c.params ? cell(formatParams(c.params)) : ''} | ${flags} |`)
    }
    out.push('')
  }
  return out.join('\n')
}
