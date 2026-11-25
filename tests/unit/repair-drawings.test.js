import { describe, expect, it } from 'vitest'
import LZString from 'lz-string'
import { REPAIRS, repairSvg, repairMarkdown } from '../../scripts/repair-drawings.mjs'
import { computeFxD, parseFxStack } from '../../packages/svgcanvas/core/live-effects.ts'

const doc = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" id="svgcontent"><g class="layer"><title>L</title>${inner}</g></svg>`

// The machinery is tested with a stand-in that has the shape of the old NaN-tspan repair.
const dropNaNTspanCoords = (source) =>
  source.replace(/<tspan\b[^>]*>/g, (tag) => tag.replace(/\s(?:x|y)="NaN"/g, ''))
const repairs = [{ name: 'NaN tspan coordinates', run: dropNaNTspanCoords }]

describe('repair-drawings: machinery', () => {
  it('ships only the current repairs (they are deleted once run)', () => {
    expect(REPAIRS.map((r) => r.name)).toEqual(['editor-pointer-events', 'dimmed-leak', 'retraced-path', 'mask-feather-lost', 'fx-rounding-drift', 'resource-in-layer'])
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

describe('repair-drawings: dimmed-leak', () => {
  const dimmed = REPAIRS.find((r) => r.name === 'dimmed-leak')

  it('drops the leaked dimming and nothing else', () => {
    const bad = '<svg xmlns="http://www.w3.org/2000/svg"><defs opacity="0.33"/><title opacity="0.33">D</title>' +
      '<g class="layer" id="l" opacity="0.33"><title opacity="0.33">L</title><g id="g" opacity="0.33" transform="matrix(1 0 0 1 0 5)">' +
      '<rect fill-opacity="0.33" stroke-opacity="0.33" opacity="0.5"/></g><text id="t" opacity="0.33" x="1">0.33</text></g></svg>'
    const { source, applied } = repairSvg(bad, [dimmed])
    expect(applied).toEqual(['dimmed-leak'])
    expect(source).toBe('<svg xmlns="http://www.w3.org/2000/svg"><defs/><title>D</title>' +
      '<g class="layer" id="l"><title>L</title><g id="g" transform="matrix(1 0 0 1 0 5)">' +
      '<rect fill-opacity="0.33" stroke-opacity="0.33" opacity="0.5"/></g><text id="t" x="1">0.33</text></g></svg>')
  })
})

describe('repair-drawings: retraced-path', () => {
  const retraced = REPAIRS.find((r) => r.name === 'retraced-path')

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

describe('repair-drawings: mask-feather-lost', () => {
  const feather = REPAIRS.find((r) => r.name === 'mask-feather-lost')

  it('gives a feathered mask\'s direct children back the feather style, from the masked element\'s data-feather', () => {
    const bad = doc('<defs><mask id="m"><rect fill="#ffffff" id="s"/><g id="g" style="fill: red"><rect id="t"/></g></mask>' +
      '<mask id="n"><ellipse id="e"/></mask></defs><rect data-feather="-4" id="a" mask="url(#m)"/><rect id="b" mask="url(#n)"/>')
    const soft = 'fill-opacity: 1 !important; opacity: 1 !important; fill: #666666 !important; stroke: #ffffff !important; stroke-width: 4 !important; filter: blur(2.4px);'
    expect(repairSvg(bad, [feather])).toEqual({
      source: doc(`<defs><mask id="m"><rect fill="#ffffff" id="s" style="${soft}"/><g id="g" style="fill: red; ${soft}"><rect id="t"/></g></mask>` +
        '<mask id="n"><ellipse id="e"/></mask></defs><rect data-feather="-4" id="a" mask="url(#m)"/><rect id="b" mask="url(#n)"/>'),
      applied: ['mask-feather-lost']
    })
  })

  it('leaves a mask that kept its feather, and drawings with no feathered mask, alone', () => {
    const kept = doc('<defs><mask id="m"><rect id="s" style="fill: #ffffff !important; filter: blur(8px);"/></mask></defs><rect data-feather="8" id="a" mask="url(#m)"/>')
    expect(repairSvg(kept, [feather])).toEqual({ source: kept, applied: [] })
    const plain = doc('<rect id="a"/>')
    expect(repairSvg(plain, [feather])).toEqual({ source: plain, applied: [] })
  })
})

describe('repair-drawings: fx-rounding-drift', () => {
  const drift = REPAIRS.find((r) => r.name === 'fx-rounding-drift')
  const fx = 'freeDistort(topLeftX=0.125,topLeftY=-0.2,topRightX=1,topRightY=0,bottomRightX=1.25,bottomRightY=1.4,bottomLeftX=0,bottomLeftY=1)'
  const src = 'M60,60 L220,60 L220,160 L60,160 L60,60 Z'
  const path = (d) => doc(`<path d="${d}" fill="#8ecae6" id="free" se:fx="${fx}" se:fx-d="${src}"/>`)

  it('writes the effect output back over a d that drifted by rounding', () => {
    // the output, with an error that grows along the path as the old relative rounding made it (0.13 by the end)
    const out = computeFxD(src, parseFxStack(fx))
    let k = 0
    const drifted = out.replace(/-?\d*\.?\d+/g, (n) => (Number(n) + 0.13 * (k++ / 300)).toFixed(2))
    const { source, applied } = repairSvg(path(drifted), [drift])
    expect(applied).toEqual(['fx-rounding-drift'])
    const d = /\sd="([^"]*)"/.exec(source)[1]
    expect(d).not.toBe(drifted)
    expect(repairSvg(source, [drift]).applied).toEqual([]) // current now
  })

  it('leaves a path that was really edited, or that carries another stage, alone', () => {
    const edited = path('M10,10 L50,10 L50,50 Z')
    expect(repairSvg(edited, [drift])).toEqual({ source: edited, applied: [] })
    const stacked = doc(`<path d="M80,40 L180.12,60.05 Z" id="t" se:fx="${fx}" se:fx-d="${src}" se:taper-d="M0,0 L1,1"/>`)
    expect(repairSvg(stacked, [drift])).toEqual({ source: stacked, applied: [] })
  })
})

describe('repair-drawings: editor-pointer-events', () => {
  const repair = REPAIRS.find((r) => r.name === 'editor-pointer-events')

  it('drops the editor\'s pointer-events state and keeps the drawing\'s own style', () => {
    const bad = '<svg xmlns="http://www.w3.org/2000/svg"><g class="layer" style="pointer-events: all;"><title>L</title>' +
      '<rect style="fill: #fff !important; filter: blur(8px); pointer-events: inherit;"/><rect style="pointer-events:inherit"/>' +
      '<rect style="pointer-events: none"/><path style="stroke: red; pointer-events: none"/></g>' +
      '<g class="layer other" style="opacity: 0.5; pointer-events: none"><circle r="1"/></g></svg>'
    const { source, applied } = repairSvg(bad, [repair])
    expect(applied).toEqual(['editor-pointer-events'])
    expect(source).toBe('<svg xmlns="http://www.w3.org/2000/svg"><g class="layer"><title>L</title>' +
      '<rect style="fill: #fff !important; filter: blur(8px);"/><rect/>' +
      '<rect/><path style="stroke: red; pointer-events: none"/></g>' +
      '<g class="layer other" style="opacity: 0.5;"><circle r="1"/></g></svg>')
  })

  it('leaves a clean drawing byte-for-byte', () => {
    const clean = '<svg xmlns="http://www.w3.org/2000/svg"><g class="layer"><rect style="fill: red"/></g></svg>'
    expect(repairSvg(clean, [repair])).toEqual({ source: clean, applied: [] })
  })
})

describe('repair-drawings: resource-in-layer', () => {
  const repair = REPAIRS.find((r) => r.name === 'resource-in-layer')

  it('drops the leftovers of an ungrouped Excalidraw paste from the layers', () => {
    const bad = '<svg xmlns="http://www.w3.org/2000/svg"><defs/><g class="layer"><title>L</title>\n  <!-- svg-source:excalidraw -->' +
      '\n  <path id="a" d="M0 0L1 1"/>\n  <metadata/>\n  <defs>\n   <style class="style-fonts"/>\n  </defs>\n  <mask/>\n  <mask></mask>' +
      '\n  <path id="b" d="M0 0L2 2"/>\n</g></svg>'
    const { source, applied } = repairSvg(bad, [repair])
    expect(applied).toEqual(['resource-in-layer'])
    expect(source).toBe('<svg xmlns="http://www.w3.org/2000/svg"><defs/><g class="layer"><title>L</title>\n  <!-- svg-source:excalidraw -->' +
      '\n  <path id="a" d="M0 0L1 1"/>\n  <path id="b" d="M0 0L2 2"/>\n</g></svg>')
  })

  it('leaves the root <defs>, and resources that something can use, alone', () => {
    const kept = '<svg xmlns="http://www.w3.org/2000/svg"><defs></defs><metadata/><g class="layer"><title>L</title>' +
      '<mask id="m"><rect width="1" height="1"/></mask><defs><style>.a{fill:red}</style></defs><metadata><rdf/></metadata></g></svg>'
    expect(repairSvg(kept, [repair])).toEqual({ source: kept, applied: [] })
  })
})
