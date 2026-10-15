import { describe, expect, it } from 'vitest'
import LZString from 'lz-string'
import { drawingsIn } from '../../scripts/repair-drawings.mjs'
import { checkDrawingText } from '../../scripts/check-model-roundtrip.mjs'

const svg = '<svg xmlns="http://www.w3.org/2000/svg">\n <g class="layer">\n  <title>L</title>\n  <rect id="a"/>\n </g>\n</svg>'
const note = (blocks) => `---\nsketch-editor-plugin: parsed\n---\n%%\n# Sketch Editor Data\n\n${blocks}\n%%\n`
const base64Lines = (text) => LZString.compressToBase64(text).match(/.{1,76}/g).join('\n')

describe('drawingsIn: the drawings a plugin note holds', () => {
  it('reads a raw ```svg block', () => {
    expect(drawingsIn(note('## Drawing\n```svg\n' + svg + '\n```'))).toEqual([{ where: 'drawing', svg }])
  })

  it('reads a ```compressed-svg block and the saved versions', () => {
    const versions = JSON.stringify([{ svg }, { svg: svg.replace('"a"', '"b"') }, { note: 'no svg' }])
    const content = note('## Drawing\n```compressed-svg\n' + base64Lines(svg) + '\n```\n\n## Versions\n```versions-json\n' + versions + '\n```')
    expect(drawingsIn(content).map((d) => d.where)).toEqual(['drawing', 'version 0', 'version 1'])
    expect(drawingsIn(content)[0].svg).toBe(svg)
  })

  it('finds nothing in an ordinary note, and skips damaged blocks', () => {
    expect(drawingsIn('# Title\n\n```js\nconst a = 1\n```\n')).toEqual([])
    expect(drawingsIn(note('```versions-json\nnot json\n```'))).toEqual([])
  })
})

describe('checkDrawingText', () => {
  it('reports a drawing the model writes back unchanged', () => {
    expect(checkDrawingText(svg + '\n')).toEqual({ status: 'identical' })
  })

  it('tells a respelling (same tree) from a parse failure', () => {
    expect(checkDrawingText('<svg><defs></defs><text a=\'1\'>x</text></svg>').status).toBe('respelled')
    expect(checkDrawingText('<svg><g></svg>').status).toBe('parse-error')
  })

  it('with typed on, reports a drawing whose root is not <svg> as unreadable', () => {
    expect(checkDrawingText('<html/>', { typed: true }).status).toBe('unreadable')
    expect(checkDrawingText('<html/>').status).toBe('identical')
    expect(checkDrawingText(svg, { typed: true })).toEqual({ status: 'identical' })
  })
})
