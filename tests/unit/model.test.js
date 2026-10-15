import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  cdata, comment, element, getAt, getAttr, parseSvg, serializeNode, serializeSvg, setAttr, SvgParseError, text, updateAt, walk
} from '../../packages/svgcanvas/core/model/index.js'

const SE = 'http://svg-edit.googlecode.com'
const roundTrip = (src, options) => serializeSvg(parseSvg(src), options)

describe('model: persistent tree', () => {
  const tree = () => parseSvg('<svg><g id="a"><rect id="r1"/><rect id="r2"/></g><g id="b"><circle id="c"/></g></svg>').root

  it('freezes nodes, attribute lists and child lists', () => {
    const root = tree()
    expect(Object.isFrozen(root)).toBe(true)
    expect(Object.isFrozen(root.attrs)).toBe(true)
    expect(Object.isFrozen(root.children)).toBe(true)
    expect(Object.isFrozen(root.children[0])).toBe(true)
  })

  it('copies only the path from the root and shares every other node', () => {
    const root = tree()
    const next = updateAt(root, [0, 1], (n) => setAttr(n, 'fill', 'red'))
    expect(next).not.toBe(root)
    expect(getAttr(getAt(next, [0, 1]), 'fill')).toBe('red')
    expect(getAttr(getAt(root, [0, 1]), 'fill')).toBeUndefined() // the old root is the undo snapshot
    expect(getAt(next, [0, 0])).toBe(getAt(root, [0, 0])) // sibling shared
    expect(getAt(next, [1])).toBe(getAt(root, [1])) // untouched subtree shared
  })

  it('returns the same root when the edit changes nothing', () => {
    const root = tree()
    expect(updateAt(root, [0, 0], (n) => n)).toBe(root)
    expect(updateAt(root, [0, 0], (n) => setAttr(n, 'id', 'r1'))).toBe(root)
  })

  it('rejects a path that leaves the tree', () => {
    const root = tree()
    expect(() => updateAt(root, [5], (n) => n)).toThrow(RangeError)
    expect(() => updateAt(root, [1, 0, 0], (n) => n)).toThrow(RangeError)
    expect(getAt(root, [9])).toBeUndefined()
  })

  it('setAttr keeps the attribute in place, appends new ones, and removes with null', () => {
    const el = element('rect', [{ name: 'x', value: '1' }, { name: 'y', value: '2' }])
    expect(setAttr(el, 'x', '9').attrs.map((a) => `${a.name}=${a.value}`)).toEqual(['x=9', 'y=2'])
    expect(setAttr(el, 'z', '3').attrs.map((a) => a.name)).toEqual(['x', 'y', 'z'])
    expect(setAttr(el, 'x', null).attrs.map((a) => a.name)).toEqual(['y'])
    expect(setAttr(el, 'nope', null)).toBe(el)
  })

  it('walks in document order and can skip a subtree', () => {
    const seen = []
    walk(tree(), (n, p) => {
      if (n.kind === 'element') seen.push(`${n.name}@${p.join('.')}`)
      return n.name !== 'g' || getAttr(n, 'id') !== 'a'
    })
    expect(seen).toEqual(['svg@', 'g@0', 'g@1', 'circle@1.0'])
  })
})

describe('model: parse', () => {
  it('keeps attribute order and qualified names as written', () => {
    const { root } = parseSvg('<svg z="1" a="2" xmlns:se="x" se:corner-radius="4"/>')
    expect(root.attrs.map((a) => a.name)).toEqual(['z', 'a', 'xmlns:se', 'se:corner-radius'])
  })

  it('accepts an undeclared prefix (older drawings used se: without declaring it)', () => {
    const { root } = parseSvg('<svg><rect se:corner-radius="18"/></svg>')
    expect(getAttr(root.children[0], 'se:corner-radius')).toBe('18')
  })

  it('keeps text, CDATA, comments and processing instructions as separate nodes', () => {
    const { root } = parseSvg('<svg><style><![CDATA[a > b {}]]></style><!-- note --><?pi data?><text>hi &amp; bye</text></svg>')
    expect(root.children.map((c) => c.kind)).toEqual(['element', 'comment', 'pi', 'element'])
    expect(root.children[0].children[0]).toEqual(cdata('a > b {}'))
    expect(root.children[1]).toEqual(comment(' note '))
    expect(root.children[2]).toEqual({ kind: 'pi', target: 'pi', value: 'data' })
    expect(root.children[3].children).toEqual([text('hi & bye')]) // entities decoded, one text node
  })

  it('keeps the declaration, doctype and comments around the root', () => {
    const doc = parseSvg('<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!DOCTYPE svg>\n<!--before--><svg/>\n<!--after-->')
    expect(doc.prolog.map((n) => n.kind)).toEqual(['decl', 'doctype', 'comment'])
    expect(doc.prolog[0]).toEqual({ kind: 'decl', version: '1.0', encoding: 'UTF-8', standalone: 'no' })
    expect(doc.epilog).toEqual([comment('after')])
  })

  it('reports malformed XML with a position', () => {
    expect(() => parseSvg('<svg><g></svg>')).toThrow(SvgParseError)
    try {
      parseSvg('<svg>\n<g>\n</svg>')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(SvgParseError)
      expect(e.line).toBe(3)
    }
    expect(() => parseSvg('')).toThrow(SvgParseError)
    expect(() => parseSvg('<svg a="1" a="2"/>')).toThrow(SvgParseError)
  })
})

describe('model: serialize', () => {
  it('writes an empty element as <x/> and escapes with the editor\'s toXml spelling', () => {
    expect(roundTrip('<svg><g></g><text>a &lt; b &amp; "c" \'d\'</text></svg>')).toBe(
      '<svg><g/><text>a &lt; b &amp; &quot;c&quot; &#x27;d&#x27;</text></svg>')
  })

  it('round-trips tabs and line breaks in attribute values as character references', () => {
    const src = '<svg><text style="a&#9;b&#10;c&#13;d"/></svg>'
    expect(roundTrip(src)).toBe(src)
    expect(getAttr(parseSvg(src).root.children[0], 'style')).toBe('a\tb\nc\rd')
  })

  it('preserve mode keeps whitespace text (mixed content is not touched)', () => {
    const src = '<svg>\n <text>a <tspan>b</tspan> c</text>\n</svg>'
    expect(roundTrip(src)).toBe(src)
  })

  it('indent mode is the editor layout: one space per level, text inline, whitespace-only text dropped', () => {
    const src = '<svg>\n\n   <g><rect/>  <text> hi </text><!--c--></g></svg>'
    expect(roundTrip(src, { format: 'indent' })).toBe(
      '<svg>\n <g>\n  <rect/>\n  <text>hi</text>\n  <!--c-->\n </g>\n</svg>')
  })

  it('writes the declaration, doctype and surrounding comments one per line', () => {
    const src = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE svg>\n<!--a--><svg/>'.replace('<!--a-->', '<!--a-->\n')
    expect(roundTrip(src)).toBe(src)
  })

  it('serializes one subtree', () => {
    const { root } = parseSvg(`<svg xmlns:se="${SE}"><g><rect se:x="1"/></g></svg>`)
    expect(serializeNode(getAt(root, [0, 0]))).toBe('<rect se:x="1"/>')
    expect(serializeNode(text('a<b'))).toBe('a&lt;b')
  })
})

describe('model: saved drawings (round-trip corpus)', () => {
  const dir = path.join(process.cwd(), 'tests/e2e/fixtures/roundtrip')
  const fixtures = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()

  it('has the corpus', () => {
    expect(fixtures.length).toBeGreaterThan(20)
  })

  describe.each(fixtures)('%s', (file) => {
    const src = fs.readFileSync(path.join(dir, file), 'utf8').trimEnd()

    it('serializes back to the same bytes', () => {
      expect(roundTrip(src)).toBe(src)
    })

    it('is the editor save layout, apart from the blank line it leaves for a skipped empty <defs>', () => {
      const blankless = (s) => s.split('\n').filter((l) => l.trim() !== '').join('\n')
      expect(roundTrip(src, { format: 'indent' })).toBe(blankless(src))
    })

    it('holds the same infoset as the browser parser (names, attribute order, text)', () => {
      // The browser parser refuses an undeclared prefix, which the model accepts: declare it for the comparison.
      const declared = /xmlns:se=/.test(src) ? src : src.replace(/<svg\b/, `<svg xmlns:se="${SE}"`)
      const dom = new DOMParser().parseFromString(declared, 'image/svg+xml')
      expect(dom.querySelector('parsererror')).toBeNull()
      const fromDom = (el) => ({
        name: el.nodeName,
        attrs: [...el.attributes].map((a) => [a.name, a.value]).filter(([n]) => src.includes(`${n}=`)),
        children: [...el.childNodes].filter((c) => c.nodeType === 1 || (c.nodeType === 3 && c.nodeValue.trim())).map((c) => c.nodeType === 1 ? fromDom(c) : c.nodeValue)
      })
      const fromModel = (el) => ({
        name: el.name,
        attrs: el.attrs.map((a) => [a.name, a.value]),
        children: el.children.filter((c) => c.kind === 'element' || (c.kind === 'text' && c.value.trim())).map((c) => c.kind === 'element' ? fromModel(c) : c.value)
      })
      expect(fromModel(parseSvg(src).root)).toEqual(fromDom(dom.documentElement))
    })
  })
})

describe('model: size', () => {
  it('parses and serializes 5,000 elements round-trip', () => {
    const rects = Array.from({ length: 5000 }, (_, i) => `<rect id="svg_${i}" x="${i}" y="1" width="2" height="3" fill="#fff" se:corner-radius="4"/>`).join('\n  ')
    const src = `<svg xmlns:se="${SE}">\n <g class="layer">\n  ${rects}\n </g>\n</svg>`
    expect(roundTrip(src)).toBe(src)
  })
})
