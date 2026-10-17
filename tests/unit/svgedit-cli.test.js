import { describe, expect, it } from 'vitest'
import LZString from 'lz-string'
import { inspect, svgOf } from '../../scripts/svgedit-cli.mjs'

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
