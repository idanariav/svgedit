import { describe, expect, it } from 'vitest'
import LZString from 'lz-string'
import { REPAIRS, repairSvg, repairMarkdown } from '../../scripts/repair-drawings.mjs'

const doc = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" id="svgcontent"><g class="layer"><title>L</title>${inner}</g></svg>`

// The machinery is tested with a stand-in that has the shape of the old NaN-tspan repair.
const dropNaNTspanCoords = (source) =>
  source.replace(/<tspan\b[^>]*>/g, (tag) => tag.replace(/\s(?:x|y)="NaN"/g, ''))
const repairs = [{ name: 'NaN tspan coordinates', run: dropNaNTspanCoords }]

describe('repair-drawings: machinery', () => {
  it('ships only the current repairs (they are deleted once run)', () => {
    expect(REPAIRS.map((r) => r.name)).toEqual(['retraced-path'])
    const any = doc('<rect/>')
    expect(repairSvg(any)).toEqual({ source: any, applied: [] })
  })

  it('applies each repair and reports which ones changed the file', () => {
    const bad = doc('<text><tspan x="NaN" y="NaN">a</tspan></text>')
    expect(repairSvg(bad, repairs)).toEqual({ source: doc('<text><tspan>a</tspan></text>'), applied: ['NaN tspan coordinates'] })
    const clean = doc('<text><tspan x="1">a</tspan></text>')
    expect(repairSvg(clean, repairs)).toEqual({ source: clean, applied: [] })
  })
})

describe('repair-drawings: plugin notes', () => {
  const bad = doc('<text x="1" y="2"><tspan x="NaN" y="NaN">a</tspan></text>')
  const fixed = doc('<text x="1" y="2"><tspan>a</tspan></text>')
  const note = (block) => `---\nsketch-editor-plugin: parsed\n---\nBody text\n\n%%\n# Sketch Editor Data\n\n## Drawing\n${block}\n%%\n`

  it('repairs a raw ```svg block and leaves the rest of the note byte-for-byte', () => {
    const before = note('```svg\n' + bad + '\n```')
    const out = repairMarkdown(before, repairs)
    expect(out.source).toBe(note('```svg\n' + fixed + '\n```'))
    expect(out.applied).toEqual(['NaN tspan coordinates'])
  })

  it('repairs a ```compressed-svg block (decompress, repair, recompress in 76-column lines)', () => {
    const wrap = (b64) => b64.match(/.{1,76}/g).join('\n')
    const before = note('```compressed-svg\n' + wrap(LZString.compressToBase64(bad)) + '\n```')
    const out = repairMarkdown(before, repairs)
    const payload = /```compressed-svg\n([\s\S]*?)\n```/.exec(out.source)[1]
    expect(LZString.decompressFromBase64(payload.replace(/\s+/g, ''))).toBe(fixed)
    expect(payload.split('\n').every((l) => l.length <= 76)).toBe(true)
    expect(out.source.startsWith('---\nsketch-editor-plugin: parsed\n---\nBody text')).toBe(true)
  })

  it('repairs the svg inside saved snapshots (raw and compressed)', () => {
    const snaps = JSON.stringify([{ id: 'a', name: 'v1', createdAt: 'now', svg: bad }])
    const raw = repairMarkdown('## Versions\n```versions-json\n' + snaps + '\n```\n', repairs)
    expect(JSON.parse(/```versions-json\n(.*)\n```/.exec(raw.source)[1])[0].svg).toBe(fixed)
    const comp = repairMarkdown('## Versions\n```compressed-versions-json\n' + LZString.compressToBase64(snaps) + '\n```\n', repairs)
    const json = LZString.decompressFromBase64(/```compressed-versions-json\n([\s\S]*?)\n```/.exec(comp.source)[1].replace(/\s+/g, ''))
    expect(JSON.parse(json)[0].svg).toBe(fixed)
  })

  it('leaves clean notes, unrelated code fences and unreadable payloads byte-identical', () => {
    const clean = note('```compressed-svg\n' + LZString.compressToBase64(doc('<rect/>')) + '\n```')
    expect(repairMarkdown(clean, repairs)).toEqual({ source: clean, applied: [] })
    const other = '```js\nconst a = "NaN"\n```\n```compressed-svg\n!!!not base64!!!\n```\n'
    expect(repairMarkdown(other, repairs)).toEqual({ source: other, applied: [] })
  })
})

describe('repair-drawings: retraced-path', () => {
  const [retraced] = REPAIRS

  it('opens a closed line that runs out and back over itself, relative or absolute', () => {
    const bad = doc('<path d="m449,472.9l-31.14,15.97l31.14,-15.97z" fill="none" id="p" stroke="#000"/><path d="M0 0 L10 5 Z" id="q"/>')
    expect(repairSvg(bad, [retraced])).toEqual({
      source: doc('<path d="M449,472.9 L417.86,488.87" fill="none" id="p" stroke="#000"/><path d="M0,0 L10,5" id="q"/>'),
      applied: ['retraced-path']
    })
  })

  it('leaves real shapes, open lines and curves alone', () => {
    const clean = doc('<path d="M0 0 L10 0 L10 10 Z"/><path d="M0 0 L10 5"/><path d="M0 0 C5 5 5 5 10 0 L0 0 Z"/><rect d="M0 0 L1 1 Z"/>')
    expect(repairSvg(clean, [retraced])).toEqual({ source: clean, applied: [] })
  })
})
