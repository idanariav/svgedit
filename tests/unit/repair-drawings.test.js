import { describe, expect, it } from 'vitest'
import LZString from 'lz-string'
import {
  repairNaNTspans, repairUndefinedDefs, repairStackedTranslates, repairSvg, repairMarkdown
} from '../../scripts/repair-drawings.mjs'
import { checkDrawing } from '../../packages/svgcanvas/core/drawing-invariants.js'

const doc = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" id="svgcontent"><g class="layer"><title>L</title>${inner}</g></svg>`
const parse = (s) => new DOMParser().parseFromString(s, 'image/svg+xml').documentElement

describe('repair-drawings: NaN tspans', () => {
  const bad = doc('<text x="10" y="20"><tspan x="NaN" y="NaN">a</tspan><tspan x="10" y="40">b</tspan><tspan x="12" y="NaN" fill="red">c</tspan></text>')

  it('drops NaN coordinates from tspans so they inherit; valid ones are untouched', () => {
    expect(checkDrawing(parse(bad)).some((f) => f.code === 'bad-number')).toBe(true)
    const fixed = repairNaNTspans(bad)
    expect(fixed).toContain('<tspan>a</tspan>')
    expect(fixed).toContain('<tspan x="10" y="40">b</tspan>')
    expect(fixed).toContain('<tspan x="12" fill="red">c</tspan>')
    expect(checkDrawing(parse(fixed))).toEqual([])
  })

  it('leaves a <text> or other elements with NaN alone, and clean files byte-identical', () => {
    const other = doc('<text x="NaN" y="5">t</text>')
    expect(repairNaNTspans(other)).toBe(other)
    const clean = doc('<text x="1" y="2"><tspan x="1" y="2">ok</tspan></text>')
    expect(repairSvg(clean)).toEqual({ source: clean, applied: [] })
  })

  it('reports which repairs applied', () => {
    expect(repairSvg(bad).applied).toEqual(['NaN tspan coordinates'])
  })
})

describe('repair-drawings: "undefined" text in <defs>', () => {
  it('removes text children of <defs> that are only "undefined"', () => {
    const bad = '<svg><defs>undefined<linearGradient id="g"/>undefinedundefined<clipPath id="c"/></defs><g/></svg>'
    expect(repairUndefinedDefs(bad)).toBe('<svg><defs><linearGradient id="g"/><clipPath id="c"/></defs><g/></svg>')
  })

  it('leaves legitimate text alone (titles, styles, other elements, real words)', () => {
    const ok = '<svg><title>undefined</title><defs><style>.undefined{}</style><text>undefined</text>undefined behaviour</defs><text>undefined</text></svg>'
    expect(repairUndefinedDefs(ok)).toBe(ok)
  })
})

describe('repair-drawings: stacked translate() transforms', () => {
  it('merges a run of translates into one', () => {
    expect(repairStackedTranslates('<g transform="translate(5,6) translate(10 -2) translate(1)"/>'))
      .toBe('<g transform="translate(16 4)"/>')
  })

  it('keeps the other items of the list in place', () => {
    expect(repairStackedTranslates('<g transform="matrix(1 0 0 1 3 4) translate(-0.5 0) translate(-0.5 0) rotate(45)"/>'))
      .toBe('<g transform="matrix(1 0 0 1 3 4) translate(-1 0) rotate(45)"/>')
  })

  it('does not merge translates separated by another transform', () => {
    const split = '<g transform="translate(1,2) rotate(10) translate(3,4)"/>'
    expect(repairStackedTranslates(split)).toBe(split)
  })

  it('merges only the attribute named transform, and leaves a single translate alone', () => {
    const ok = '<g transform="translate(1,2)"/><linearGradient gradientTransform="translate(1,2) translate(3,4)"/>'
    expect(repairStackedTranslates(ok)).toBe(ok)
  })

  it('avoids float noise in the sum', () => {
    expect(repairStackedTranslates('<g transform="translate(0.1,0.2) translate(0.2,0.1)"/>')).toBe('<g transform="translate(0.3 0.3)"/>')
  })
})

describe('repair-drawings: plugin notes', () => {
  const bad = doc('<text x="1" y="2"><tspan x="NaN" y="NaN">a</tspan></text>')
  const fixed = doc('<text x="1" y="2"><tspan>a</tspan></text>')
  const note = (block) => `---\nsketch-editor-plugin: parsed\n---\nBody text\n\n%%\n# Sketch Editor Data\n\n## Drawing\n${block}\n%%\n`

  it('repairs a raw ```svg block and leaves the rest of the note byte-for-byte', () => {
    const before = note('```svg\n' + bad + '\n```')
    const out = repairMarkdown(before)
    expect(out.source).toBe(note('```svg\n' + fixed + '\n```'))
    expect(out.applied).toEqual(['NaN tspan coordinates'])
  })

  it('repairs a ```compressed-svg block (decompress, repair, recompress in 76-column lines)', () => {
    const wrap = (b64) => b64.match(/.{1,76}/g).join('\n')
    const before = note('```compressed-svg\n' + wrap(LZString.compressToBase64(bad)) + '\n```')
    const out = repairMarkdown(before)
    const payload = /```compressed-svg\n([\s\S]*?)\n```/.exec(out.source)[1]
    expect(LZString.decompressFromBase64(payload.replace(/\s+/g, ''))).toBe(fixed)
    expect(payload.split('\n').every((l) => l.length <= 76)).toBe(true)
    expect(out.source.startsWith('---\nsketch-editor-plugin: parsed\n---\nBody text')).toBe(true)
  })

  it('repairs the svg inside saved snapshots (raw and compressed)', () => {
    const snaps = JSON.stringify([{ id: 'a', name: 'v1', createdAt: 'now', svg: bad }])
    const raw = repairMarkdown('## Versions\n```versions-json\n' + snaps + '\n```\n')
    expect(JSON.parse(/```versions-json\n(.*)\n```/.exec(raw.source)[1])[0].svg).toBe(fixed)
    const comp = repairMarkdown('## Versions\n```compressed-versions-json\n' + LZString.compressToBase64(snaps) + '\n```\n')
    const json = LZString.decompressFromBase64(/```compressed-versions-json\n([\s\S]*?)\n```/.exec(comp.source)[1].replace(/\s+/g, ''))
    expect(JSON.parse(json)[0].svg).toBe(fixed)
  })

  it('leaves clean notes, unrelated code fences and unreadable payloads byte-identical', () => {
    const clean = note('```compressed-svg\n' + LZString.compressToBase64(doc('<rect/>')) + '\n```')
    expect(repairMarkdown(clean)).toEqual({ source: clean, applied: [] })
    const other = '```js\nconst a = "NaN"\n```\n```compressed-svg\n!!!not base64!!!\n```\n'
    expect(repairMarkdown(other)).toEqual({ source: other, applied: [] })
  })
})
