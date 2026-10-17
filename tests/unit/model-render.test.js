import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseSvg, setAttr, updateAt, element, text, serializeSvg } from '../../packages/svgcanvas/core/model/index.ts'
import { renderNode, reconcile, readDom } from '../../packages/svgcanvas/core/model-render.ts'

const dir = 'tests/e2e/fixtures/roundtrip'
const fixtures = fs.readdirSync(dir).filter((f) => f.endsWith('.svg'))

describe('model-render: renderNode / readDom', () => {
  it.each(fixtures)('%s renders and reads back as the same tree', (file) => {
    const { root } = parseSvg(fs.readFileSync(path.join(dir, file), 'utf8'))
    const dom = renderNode(document, root)
    expect(readDom(dom)).toEqual(root)
  })

  it('puts prefixed attributes in their namespaces, declared or not', () => {
    const { root } = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><use xlink:href="#a" se:locked="true"/><rect/></svg>')
    const use = renderNode(document, root).firstChild
    expect(use.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('#a')
    expect(use.getAttributeNS('http://svg-edit.googlecode.com', 'locked')).toBe('true')
    expect(use.namespaceURI).toBe('http://www.w3.org/2000/svg')
  })
})

describe('model-render: reconcile', () => {
  const base = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g class="layer"><title>L</title><rect id="a" x="1"/><rect id="b" x="2"/><rect id="c" x="3"/></g></svg>').root
  const layerPath = [0]
  const edit = (root, fn) => updateAt(root, layerPath, fn)
  const patched = (next) => {
    const dom = renderNode(document, base)
    const out = reconcile(dom, base, next)
    return { dom, out }
  }

  it('skips a subtree that is the same object', () => {
    const dom = renderNode(document, base)
    const before = dom.firstChild
    expect(reconcile(dom, base, base)).toBe(dom)
    expect(dom.firstChild).toBe(before)
  })

  it('changes one attribute and keeps every node', () => {
    const next = updateAt(base, [0, 2], (n) => setAttr(n, 'x', '9'))
    const { dom, out } = patched(next)
    expect(out).toBe(dom)
    expect(readDom(dom)).toEqual(next)
  })

  it('adds and removes attributes', () => {
    const next = updateAt(base, [0, 2], (n) => setAttr(setAttr(n, 'x', null), 'fill', 'red'))
    const { dom } = patched(next)
    const rect = dom.querySelector('#b')
    expect(rect.hasAttribute('x')).toBe(false)
    expect(rect.getAttribute('fill')).toBe('red')
    expect(readDom(dom)).toEqual(next)
  })

  it('inserts and deletes children', () => {
    const added = edit(base, (g) => element(g.name, g.attrs, [...g.children, element('circle', [{ name: 'id', value: 'd' }])]))
    const { dom } = patched(added)
    expect(readDom(dom)).toEqual(added)
    const removed = edit(base, (g) => element(g.name, g.attrs, g.children.filter((c) => c.kind !== 'element' || !c.attrs.some((a) => a.value === 'b'))))
    const r = patched(removed)
    expect(r.dom.querySelector('#b')).toBeNull()
    expect(readDom(r.dom)).toEqual(removed)
  })

  it('a reordered object keeps its DOM node', () => {
    const next = edit(base, (g) => element(g.name, g.attrs, [g.children[0], g.children[3], g.children[1], g.children[2]]))
    const dom = renderNode(document, base)
    const c = dom.querySelector('#c')
    reconcile(dom, base, next)
    expect(readDom(dom)).toEqual(next)
    expect(dom.querySelector('#c')).toBe(c)
    expect([...dom.querySelectorAll('rect')].map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('swaps a node whose tag changed, in place', () => {
    const next = updateAt(base, [0, 1], () => element('ellipse', [{ name: 'id', value: 'a' }]))
    const { dom } = patched(next)
    expect(readDom(dom)).toEqual(next)
    expect(dom.querySelector('ellipse#a')).not.toBeNull()
  })

  it('updates text content', () => {
    const next = updateAt(base, [0, 0, 0], () => text('Renamed'))
    const { dom } = patched(next)
    expect(dom.querySelector('title').textContent).toBe('Renamed')
  })

  it('changes an attribute the DOM holds in no namespace without adding a second one beside it', () => {
    // a drawing that used `se:` without declaring it has the attribute in no namespace
    const before = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect id="a" se:x="1"/></svg>').root
    const dom = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('id', 'a')
    rect.setAttribute('se:x', '1') // in no namespace
    dom.append(rect)
    const after = updateAt(before, [0], (n) => setAttr(n, 'se:x', '2'))
    reconcile(dom, before, after)
    expect(dom.firstChild.getAttribute('se:x')).toBe('2')
    expect([...dom.firstChild.attributes].filter((a) => a.name === 'se:x')).toHaveLength(1)
  })

  it('hands back a pooled node for an element that comes back', () => {
    const pool = new Map()
    const dom = renderNode(document, base)
    const b = dom.querySelector('[id="b"]')
    const without = edit(base, (g) => element(g.name, g.attrs, g.children.filter((c) => c.kind !== 'element' || !c.attrs.some((a) => a.value === 'b'))))
    reconcile(dom, base, without, undefined, { pool })
    expect(pool.get('b').dom).toBe(b)
    reconcile(dom, without, base, undefined, { pool })
    expect(dom.querySelector('[id="b"]')).toBe(b)
    expect(pool.size).toBe(0)
  })

  it('reports the elements it changed', () => {
    const touched = new Set()
    const dom = renderNode(document, base)
    const next = updateAt(base, [0, 2], (n) => setAttr(n, 'x', '9'))
    reconcile(dom, base, next, undefined, { touched: (el) => touched.add(el.id) })
    expect([...touched]).toEqual(['b'])
  })

  it('reaches the same DOM as a fresh render, for a random walk of edits', () => {
    let model = base
    const dom = renderNode(document, model)
    const ops = [
      (m) => updateAt(m, [0, 1], (n) => setAttr(n, 'x', String(Math.floor(Math.random() * 99)))),
      (m) => edit(m, (g) => element(g.name, g.attrs, [...g.children].reverse())),
      (m) => edit(m, (g) => element(g.name, g.attrs, g.children.slice(0, -1))),
      (m) => edit(m, (g) => element(g.name, g.attrs, [...g.children, element('rect', [{ name: 'id', value: 'n' + Math.random() }])]))
    ]
    for (let i = 0; i < 60; i++) {
      const next = ops[i % ops.length](model)
      reconcile(dom, model, next)
      model = next
      expect(readDom(dom)).toEqual(model)
    }
    expect(serializeSvg({ prolog: [], root: model, epilog: [] })).toBe(serializeSvg({ prolog: [], root: readDom(dom), epilog: [] }))
  })
})
