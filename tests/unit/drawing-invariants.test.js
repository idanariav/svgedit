import { beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { checkDrawing } from '../../packages/svgcanvas/core/drawing-invariants.js'

const FIXTURES = path.resolve(__dirname, '../e2e/fixtures/roundtrip')
const parse = (xml) => new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement
const codes = (svg) => checkDrawing(parse(svg)).map((f) => f.code)
const wrap = (inner, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:se="http://svg-edit.googlecode.com">${extra}<g class="layer"><title>L</title>${inner}</g></svg>`

describe('checkDrawing', () => {
  // Constructing a canvas runs every module's init, which registers the se:* validators.
  beforeAll(() => {
    document.body.innerHTML = '<div id="svgcanvas"></div>'
    new SvgCanvas(document.getElementById('svgcanvas'), { // eslint-disable-line no-new
      canvas_expansion: 3, dimensions: [10, 10], initFill: { color: 'FF0000', opacity: 1 }, initStroke: { width: 1, color: '000000', opacity: 1 }, initOpacity: 1, imgPath: '', langPath: '', extPath: '', extensions: [], initTool: 'select', wireframe: false
    })
  })

  it('reports nothing for a healthy drawing', () => {
    expect(codes(wrap('<rect id="a" x="1" y="2" width="3" height="4" fill="url(#g)"/>', '<defs><linearGradient id="g"/></defs>'))).toEqual([])
  })

  it('duplicate-id', () => {
    expect(codes(wrap('<rect id="a"/><rect id="a"/>'))).toEqual(['duplicate-id'])
  })

  it('dangling-ref: attributes, inline style and href', () => {
    expect(codes(wrap('<rect id="a" fill="url(#nope)"/>'))).toEqual(['dangling-ref'])
    expect(codes(wrap('<rect id="a" style="filter:url(#nope)"/>'))).toEqual(['dangling-ref'])
    expect(codes(wrap('<use id="u" href="#nope"/>'))).toEqual(['dangling-ref'])
    expect(codes(wrap('<use id="u" xlink:href="#nope"/>'))).toEqual(['dangling-ref'])
  })

  it('does not flag external references or unused defs', () => {
    expect(codes(wrap('<image id="i" href="https://example.com/a.png"/><image id="j" xlink:href="vault/a.png"/>', '<defs><linearGradient id="unused"/></defs>'))).toEqual([])
  })

  it('stray-text-in-defs (the "undefined" corruption)', () => {
    expect(codes(wrap('<rect id="a"/>', '<defs>undefined</defs>'))).toEqual(['stray-text-in-defs'])
    expect(codes(wrap('<rect id="a"/>', '<defs>\n  </defs>'))).toEqual([])
  })

  it('bad-number in geometry', () => {
    expect(codes(wrap('<rect id="a" x="NaN" y="1" width="undefined" height="2"/>'))).toEqual(['bad-number', 'bad-number'])
    expect(codes(wrap('<path id="p" d="M 0 0 L Infinity 5"/>'))).toEqual(['bad-number'])
    expect(codes(wrap('<tspan id="t" x="NaN" y="NaN"/>'))).toEqual(['bad-number', 'bad-number'])
  })

  it('layer-shape', () => {
    expect(codes('<svg xmlns="http://www.w3.org/2000/svg"><rect id="loose"/></svg>')).toEqual(['layer-shape'])
    // an unnamed layer is fine: external SVGs have them and the editor loads them
    expect(codes('<svg xmlns="http://www.w3.org/2000/svg"><g class="layer"><rect id="a"/></g></svg>')).toEqual([])
  })

  it('se-attr-parse: validates attributes through their owning module', () => {
    expect(codes(wrap('<path id="p" d="M 0 0 L 1 1" se:taper="x,y"/>'))).toEqual(['se-attr-parse'])
    expect(codes(wrap('<path id="p" d="M 0 0 L 1 1" se:fx="bogusEffect()" se:fx-d="M 0 0 L 1 1"/>'))).toEqual(['se-attr-parse'])
    expect(codes(wrap('<path id="p" d="M 0 0 L 1 1" se:orig-d="garbage" se:corner-radius="8"/>'))).toEqual(['se-attr-parse'])
    expect(codes(wrap('<path id="p" d="M 0 0 L 1 1" se:orig-d="M 0 0 L 1 1" se:corner-radius="8:c,4:i,0"/>'))).toEqual([])
  })

  it('findings carry the offending element id', () => {
    expect(checkDrawing(parse(wrap('<rect id="r1" x="NaN"/>')))[0]).toMatchObject({ code: 'bad-number', id: 'r1' })
  })

  // Baseline: the round-trip fixtures are the project's reference drawings.
  // Each finding here is either real corruption (fix the data + add a repair)
  // or a wrong check (fix the check) -- never an allowlist.
  describe('round-trip fixtures are healthy', () => {
    for (const name of fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.svg'))) {
      it(name, () => {
        expect(checkDrawing(parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8')))).toEqual([])
      })
    }
  })
})
