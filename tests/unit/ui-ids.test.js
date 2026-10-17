import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generate, idTypes, render } from '../../scripts/gen-ui-ids.mjs'

// src/editor/ui-ids.d.ts types `$id('angle')` / `$req('angle')`; scripts/gen-ui-ids.mjs writes it from the editor's markup.

describe('idTypes', () => {
  it('maps ids to native and custom element types', () => {
    const map = idTypes(['<se-spin-input id="angle" size="3"></se-spin-input><input type="text" id="name"/><div class="x" id="box">'])
    expect(map.get('angle')).toBe("HTMLElementTagNameMap['se-spin-input']")
    expect(map.get('name')).toBe('HTMLInputElement')
    expect(map.get('box')).toBe('HTMLDivElement')
  })

  it('fills in an interpolation from the file\'s string constant, and skips an id that stays dynamic', () => {
    // eslint-disable-next-line no-template-curly-in-string
    const map = idTypes(["const P = 'ext-blend'\nconst html = `<input id=\"${P}-pick\"><select id=\"${P}-${kind}\">`"])
    expect([...map]).toEqual([['ext-blend-pick', 'HTMLInputElement']])
  })

  it('skips ids the markup gives different tags', () => {
    const map = idTypes(['<div id="dup"></div>', '<span id="dup"></span>', '<div id="same"></div>', '<div id="same"></div>'])
    expect([...map.keys()]).toEqual(['same'])
  })

  it('skips tags with no element type of their own (svg parts)', () => {
    expect(idTypes(['<path id="p" d="M0 0"/>']).size).toBe(0)
  })
})

describe('render', () => {
  it('quotes ids that are not identifiers and sorts', () => {
    const out = render(new Map([['b-c', 'HTMLDivElement'], ['a', 'HTMLInputElement']]))
    expect(out).toContain("interface ElementIdMap {\n  a: HTMLInputElement\n  'b-c': HTMLDivElement\n}")
  })
})

describe('src/editor/ui-ids.d.ts', () => {
  it('is current (run `npm run gen-ui-ids`)', () => {
    const root = resolve(import.meta.dirname, '../..')
    expect(readFileSync(resolve(root, 'src/editor/ui-ids.d.ts'), 'utf8')).toBe(generate(root))
  })
})
