import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, it, expect } from 'vitest'
import { parseSvg, readDrawing, readFeatures, walkItems } from '../../packages/svgcanvas/core/model/index.ts'
import { parseCornerSpec } from '../../packages/svgcanvas/core/corner-radius.ts'
import { parseBrush } from '../../packages/svgcanvas/core/art-brush-canvas.js'
import { parseBlend } from '../../packages/svgcanvas/core/blend-canvas.js'
import { parseProfile, parseTaper, parseTaperStyle, TAPER_ATTR } from '../../packages/svgcanvas/core/width-profile.ts'
import * as taperStroke from '../../packages/svgcanvas/core/taper-stroke.ts'

describe('readFeatures', () => {
  it('reads each typed feature with the parser its module owns', () => {
    const se = {
      'se:corner-radius': '18, 0, 6:c',
      'se:orig-d': 'M0 0L10 0L10 10z',
      'se:width-profile': '0:0:0;0.5:1:1;1:0:0',
      'se:taper': '100,0',
      'se:taper-style': '3|#336699',
      'se:taper-d': 'M0 0L5 5',
      'se:dash-fit': '4 2',
      'se:art-brush': 'art(width=20,scale=proportional)',
      'se:blend': 'blend(mode=steps,steps=5)'
    }
    expect(readFeatures(se)).toEqual({
      cornerRadius: parseCornerSpec(se['se:corner-radius']),
      cornerSource: 'M0 0L10 0L10 10z',
      widthProfile: parseProfile(se['se:width-profile']),
      taper: { start: 100, end: 0 },
      taperStyle: { width: 3, paint: '#336699' },
      taperSource: 'M0 0L5 5',
      dashFit: [4, 2],
      artBrush: parseBrush(se['se:art-brush']),
      blend: parseBlend(se['se:blend']),
      invalid: []
    })
    expect(readFeatures({ 'se:corner-radius': '12' }).cornerRadius).toEqual({ uniform: 12, radii: [], kinds: [] })
    expect(readFeatures(se).blend).toMatchObject({ mode: 'steps', steps: 5 })
    expect(readFeatures({ 'se:brush': 'pattern' }).brushLibrary).toBe('pattern')
  })

  it('names a typed attribute that does not parse and leaves it out', () => {
    const f = readFeatures({ 'se:taper': 'wide', 'se:width-profile': '1:2', 'se:dash-fit': 'none', 'se:art-brush': 'oil()', 'se:blend': 'x', 'se:brush': 'oil' })
    expect(f.invalid.sort()).toEqual(['se:art-brush', 'se:blend', 'se:brush', 'se:dash-fit', 'se:taper', 'se:width-profile'])
    expect(f.taper).toBeUndefined()
  })

  it('ignores attributes that have no typed reader (they stay in item.se)', () => {
    expect(readFeatures({ 'se:fx': 'roughen()', 'se:locked': 'true', 'se:future': '1' })).toEqual({ invalid: [] })
  })

  it('parses the taper grammar like the validators in taper-stroke.js do', () => {
    expect(parseTaper('50,25')).toEqual({ start: 50, end: 25 })
    expect(parseTaper('50')).toBeNull()
    expect(parseTaper('a,b')).toBeNull()
    expect(parseTaperStyle('2.5|url(#g)')).toEqual({ width: 2.5, paint: 'url(#g)' })
    expect(parseTaperStyle('2.5')).toBeNull()
    // taper-stroke.js re-exports the names it used to define, so no importer changed
    expect(taperStroke.TAPER_ATTR).toBe(TAPER_ATTR)
    expect(TAPER_ATTR).toBe('se:taper')
  })
})

describe('typed features on items and defs', () => {
  it('puts them on every item and on the defs', () => {
    const d = readDrawing(parseSvg(
      '<svg><defs><g id="b" se:brush="art"/></defs><g class="layer"><title>L</title><path id="p" d="M0 0" se:taper="10,20" se:taper-style="2|red"/></g></svg>'))
    expect(d.layers[0].items[0].features).toMatchObject({ taper: { start: 10, end: 20 }, taperStyle: { width: 2, paint: 'red' }, invalid: [] })
    expect(d.defs[0].features.brushLibrary).toBe('art')
  })
})

describe('the round-trip corpus', () => {
  const dir = path.join(process.cwd(), 'tests/e2e/fixtures/roundtrip')
  const read = (f) => readDrawing(parseSvg(fs.readFileSync(path.join(dir, f), 'utf8')))
  const featuresOf = (f) => {
    const found = []
    const d = read(f)
    walkItems(d, (i) => found.push(i.features))
    d.defs.forEach((x) => found.push(x.features))
    return found
  }

  it('has no typed feature that fails its own parser', () => {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.svg'))) {
      expect(featuresOf(f).flatMap((x) => x.invalid), f).toEqual([])
    }
  })

  it.each([
    ['corner-radius.svg', 'cornerRadius'],
    ['taper.svg', 'taper'],
    ['taper.svg', 'taperStyle'],
    ['taper.svg', 'taperSource'],
    ['width-profile.svg', 'widthProfile'],
    ['dash-fit-corners.svg', 'dashFit'],
    ['art-brush.svg', 'artBrush'],
    ['art-brush.svg', 'brushLibrary'],
    ['blend.svg', 'blend']
  ])('%s: reads %s', (file, key) => {
    expect(featuresOf(file).some((x) => x[key] !== undefined)).toBe(true)
  })
})

describe('headless', () => {
  it('imports and runs in a bare Node process: no DOM, no paper.js', () => {
    const entry = path.join(process.cwd(), 'packages/svgcanvas/core/model/index.ts')
    const script = `
      import { parseSvg, readDrawing, serializeSvg } from ${JSON.stringify(entry)}
      const doc = parseSvg('<svg><g class="layer"><title>L</title><path d="M0 0L5 5" se:taper="1,2"/></g></svg>')
      const d = readDrawing(doc)
      console.log(JSON.stringify({ hasDocument: typeof document !== 'undefined', taper: d.layers[0].items[0].features.taper, round: serializeSvg(doc).length }))`
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    expect(JSON.parse(out.trim().split('\n').pop())).toMatchObject({ hasDocument: false, taper: { start: 1, end: 2 } })
  })
})
