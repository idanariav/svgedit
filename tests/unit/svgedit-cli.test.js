import { describe, expect, it } from 'vitest'
import LZString from 'lz-string'
import { bounds, inspect, svgOf } from '../../scripts/svgedit-cli.mjs'

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:se="http://svg-edit.googlecode.com" width="640" height="480" se:guides="v:10;h:20,30">
 <defs><linearGradient id="g"/></defs>
 <g class="layer"><title>Sketch</title>
  <rect id="a" x="1" y="2" width="3" height="4" se:corner-radius="5"/>
  <g id="grp"><circle id="c" cx="1" cy="1" r="2"/></g>
  <path id="p" d="M0,0 L10,10" se:width-profile="not a profile"/>
 </g>
 <g class="layer" display="none"><title>Hidden</title><text id="t">hi</text></g>
</svg>`

describe('svgedit-cli: inspect', () => {
  const s = inspect(svg)

  it('summarizes size, layers and the objects in each', () => {
    expect(s.size).toMatchObject({ width: '640', height: '480' })
    expect(s.layers.map((l) => [l.name, l.hidden])).toEqual([['Sketch', false], ['Hidden', true]])
    expect(s.layers[0].objects).toEqual({ shape: 2, 'group:group': 1, path: 1 })
    expect(s.layers[1].objects).toEqual({ text: 1 })
    expect(s.defs).toEqual({ linearGradient: 1 })
    expect(s.ids).toEqual(['a', 'grp', 'c', 'p', 't'])
  })

  it('counts the se: attributes in use and names a typed one that does not parse', () => {
    expect(s.features['se:corner-radius']).toBe(1)
    expect(s.invalid).toEqual(['path#p se:width-profile'])
  })
})

describe('svgedit-cli: svgOf', () => {
  const note = (blocks) => `%%\n# Sketch Editor Data\n\n${blocks}\n%%\n`

  it('passes an .svg file through', () => {
    expect(svgOf('a.svg', svg)).toBe(svg)
  })

  it('picks the drawing of a note, or a saved version', () => {
    const versions = JSON.stringify([{ svg: svg.replace('Sketch', 'Old') }])
    const text = note('## Drawing\n```compressed-svg\n' + LZString.compressToBase64(svg) + '\n```\n\n## Versions\n```versions-json\n' + versions + '\n```')
    expect(svgOf('n.md', text)).toBe(svg)
    expect(svgOf('n.md', text, 0)).toContain('Old')
    expect(() => svgOf('n.md', text, 7)).toThrow(/no version 7/)
  })
})

describe('svgedit-cli: bounds', () => {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
 <defs><rect id="d" x="0" y="0" width="999" height="999"/></defs>
 <g class="layer"><title>Main</title>
  <rect id="r" x="10" y="10" width="20" height="10" fill="none" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
  <g id="grp" transform="translate(100 50) rotate(90)">
   <rect id="inner" x="0" y="0" width="30" height="10"/>
   <circle id="c" cx="5" cy="5" r="5" display="none"/>
  </g>
  <text id="t" x="10" y="90" font-size="10">hello</text>
  <use id="u" href="#d"/>
  <rect id="off" x="500" y="500" width="5" height="5"/>
 </g>
 <g class="layer" display="none"><title>Gone</title><rect id="h" x="0" y="0" width="1" height="1"/></g>
</svg>`
  const out = bounds(doc)
  const byId = Object.fromEntries(out.objects.map((o) => [o.id, o]))

  it('reads the page size and lists every object with an id, definitions left out', () => {
    expect(out.size).toEqual({ width: 200, height: 100 })
    expect(out.objects.map((o) => o.id)).toEqual(['r', 'grp', 'inner', 'c', 't', 'u', 'off', 'h'])
  })

  it('gives the geometry and the stroked box of a shape', () => {
    expect(byId.r.box).toEqual([10, 10, 20, 10])
    expect(byId.r.visual).toEqual([8, 8, 24, 14])
    expect(byId.r).toMatchObject({ source: 'exact', layer: 'Main', hidden: false, outside: false })
  })

  it('puts a nested object in document coordinates, under the transforms of its groups, and names its group', () => {
    // rotate(90) turns the 30 x 10 rect into 10 x 30 hanging left of x = 0, then the group moves it to (100, 50)
    expect(byId.inner.box).toEqual([90, 50, 10, 30])
    expect(byId.inner.parent).toBe('grp')
    expect(byId.grp.box).toEqual([90, 50, 10, 30])
  })

  it('marks what is hidden or off the page, and says what it can only estimate or not know', () => {
    expect(byId.c.hidden).toBe(true)
    expect(byId.h.hidden).toBe(true)
    expect(byId.off.outside).toBe(true)
    expect(byId.t.source).toBe('estimate')
    expect(byId.u).toMatchObject({ source: 'unknown', box: null, visual: null })
  })

  it('takes the extent of the displayed objects only', () => {
    expect(out.extent).toEqual([8, 8, 497, 497])
  })
})
