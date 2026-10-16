import { formatParams, renderCommandsDoc } from '../../scripts/commands-doc.mjs'

describe('commands-doc rendering', () => {
  it('formats param types, ranges, enums, defaults and required marks', () => {
    expect(formatParams({
      width: { type: 'number', min: 1, max: 100, default: 5 },
      mode: { type: 'enum', values: ['a', 'b'], default: 'a' },
      name: { type: 'string', required: true },
      on: { type: 'boolean', default: false }
    })).toBe('`width: number 1..100 = 5`<br>`mode: "a" | "b" = "a"`<br>`name!: string`<br>`on: boolean = false`')
  })

  it('groups alphabetically, sorts ids within a group and flags dialog / hidden commands', () => {
    const doc = renderCommandsDoc([
      { id: 'z_cmd', label: 'Zed', group: 'Tools', keys: [], interactive: true },
      { id: 'a_cmd', label: 'A | pipe', group: 'Tools', keys: ['mod+a', 'b'] },
      { id: 'edit_it', label: 'Edit', group: 'Edit', keys: [], params: { n: { type: 'number' } } }
    ], new Set(['a_cmd']))
    expect(doc.indexOf('## Edit')).toBeLessThan(doc.indexOf('## Tools'))
    expect(doc.indexOf('`a_cmd`')).toBeLessThan(doc.indexOf('`z_cmd`'))
    expect(doc).toContain('| `a_cmd` | A \\| pipe | `mod+a` `b` |  | hidden |')
    expect(doc).toContain('| `z_cmd` | Zed |  |  | dialog |')
    expect(doc).toContain('| `edit_it` | Edit |  | `n: number` |  |')
  })
})
