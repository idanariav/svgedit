import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  findItem, getAt, getAttr, parseSvg, pathAnchors, readDrawing, serializeSvg, setAttr, updateAt, walkItems
} from '../../packages/svgcanvas/core/model/index.ts'
import { hasLockMark, isObjectHidden, isPanelObject } from '../../packages/svgcanvas/core/object-state.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.ts'

const SE = NS.SE
const read = (svg) => readDrawing(parseSvg(svg))
const svg = (inner, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:se="${SE}" width="640" height="480"${attrs}>${inner}</svg>`

describe('readDrawing: structure', () => {
  const doc = read(svg(`
    <defs><linearGradient id="g1"/><g se:brush="x" id="b1"/></defs>
    <g class="layer" id="l1"><title>Sketch</title>
      <rect id="r1" x="10" y="20" width="30" height="40" data-name="Box" transform="rotate(5)"/>
      <g id="grp"><circle id="c1" cx="5" cy="6" r="7" display="none"/><path id="p1" d="M0 0L10 0L10 10z" se:locked="true"/></g>
      <text id="t1" x="1" y="2">hello</text>
    </g>
    <g class="layer" display="none" se:template="true" se:locked="true"><title>Trace</title><image id="im" href="a.png" x="0" y="0" width="9" height="8"/></g>
    <rect id="stray" width="1" height="1"/>`, ' se:guides="v:50,10;h:5"'))

  it('reads the size and the ruler guides of the root', () => {
    expect(doc.size).toEqual({ width: '640', height: '480' })
    expect(doc.guides).toEqual({ v: [10, 50], h: [5] })
    expect(doc.se).toEqual({ 'se:guides': 'v:50,10;h:5' })
  })

  it('reads layers by class and <title>, with their state', () => {
    expect(doc.layers.map((l) => l.name)).toEqual(['Sketch', 'Trace'])
    const [sketch, trace] = doc.layers
    expect(sketch).toMatchObject({ id: 'l1', hidden: false, locked: false, template: false })
    expect(trace).toMatchObject({ hidden: true, locked: true, template: true })
    expect(sketch.path).toEqual([3]) // child 0 and 2 are whitespace text, 1 is <defs>
  })

  it('reads the objects of a layer, nested groups included, skipping <title>', () => {
    const items = doc.layers[0].items
    expect(items.map((i) => i.kind)).toEqual(['shape', 'group', 'text'])
    expect(items[0]).toMatchObject({ kind: 'shape', tag: 'rect', id: 'r1', name: 'Box', transform: 'rotate(5)', geometry: { x: 10, y: 20, width: 30, height: 40 } })
    const grp = items[1]
    expect(grp.kind).toBe('group')
    expect(grp.children.map((c) => `${c.kind}:${c.id}`)).toEqual(['shape:c1', 'path:p1'])
    expect(grp.children[0]).toMatchObject({ hidden: true, geometry: { cx: 5, cy: 6, r: 7 } })
    expect(grp.children[1]).toMatchObject({ locked: true, d: 'M0 0L10 0L10 10z' })
    expect(items[2]).toMatchObject({ kind: 'text', content: 'hello', onPath: false })
    expect(doc.layers[1].items[0]).toMatchObject({ kind: 'image', href: 'a.png', geometry: { width: 9, height: 8 } })
  })

  it('reports visible top-level elements outside a layer as orphans, and the defs children', () => {
    expect(doc.orphans.map((o) => o.id)).toEqual(['stray'])
    expect(doc.defs.map((d) => `${d.tag}:${d.id}`)).toEqual(['linearGradient:g1', 'g:b1'])
    expect(doc.defs[1].se).toEqual({ 'se:brush': 'x' })
  })

  it('walks items in document order and finds one by id', () => {
    const seen = []
    walkItems(doc, (item, layer) => seen.push(`${layer?.name ?? '-'}/${item.id}`))
    expect(seen).toEqual(['Sketch/r1', 'Sketch/grp', 'Sketch/c1', 'Sketch/p1', 'Sketch/t1', 'Trace/im', '-/stray'])
    expect(findItem(doc, 'p1')?.kind).toBe('path')
    expect(findItem(doc, 'nope')).toBeUndefined()
  })

  it('gives every item a path that addresses its element in the tree', () => {
    walkItems(doc, (item) => {
      expect(getAt(doc.root, item.path)).toMatchObject({ kind: 'element', name: item.tag })
      expect(getAttr(getAt(doc.root, item.path), 'id')).toBe(item.id)
    })
  })
})

describe('readDrawing: items', () => {
  const one = (inner) => read(svg(`<g class="layer"><title>L</title>${inner}</g>`)).layers[0].items[0]

  it('classifies groups that are generated from a source', () => {
    expect(one('<g se:blend="1"><path/></g>')).toMatchObject({ kind: 'group', role: 'blend' })
    expect(one('<g se:art-brush="a"/>')).toMatchObject({ role: 'art-brush' })
    expect(one('<g se:repeat="r"/>')).toMatchObject({ role: 'repeat' })
    expect(one('<g/>')).toMatchObject({ role: 'group' })
    expect(one('<a><rect/></a>')).toMatchObject({ kind: 'group', tag: 'a' })
  })

  it('keeps every se: attribute verbatim and flags repeat copies', () => {
    const item = one('<path d="M0 0" se:fx="roughen" se:fx-d="M1 1" se:repeat-copy="1"/>')
    expect(item.se).toEqual({ 'se:fx': 'roughen', 'se:fx-d': 'M1 1', 'se:repeat-copy': '1' })
    expect(item.generated).toBe(true)
  })

  it('can walk without the copies a repeat makes', () => {
    const d = read(svg('<g class="layer"><title>L</title><g id="src" se:repeat="1"><rect id="a"/><rect id="copy" se:repeat-copy="1"/></g></g>'))
    const ids = (options) => { const out = []; walkItems(d, (i) => out.push(i.id), options); return out }
    expect(ids()).toEqual(['src', 'a', 'copy'])
    expect(ids({ generated: false })).toEqual(['src', 'a'])
  })

  it('reads polygon points, ignoring a dangling coordinate', () => {
    expect(one('<polygon points="0,0 10,0 10,10 5"/>').points).toEqual([[0, 0], [10, 0], [10, 10]])
  })

  it('reads hard rows of a text, leaving the soft (wrapped) rows out', () => {
    const t = one('<text><tspan>one</tspan><tspan se:soft="1">wrapped</tspan><tspan>two</tspan></text>')
    expect(t.content).toBe('one\ntwo')
    expect(one('<text><textPath href="#p">on a path</textPath></text>')).toMatchObject({ onPath: true, content: 'on a path' })
  })

  it('reads use/href with either spelling, and treats other tags as other', () => {
    expect(one('<use xlink:href="#a"/>')).toMatchObject({ kind: 'use', href: '#a' })
    expect(one('<foreignObject/>')).toMatchObject({ kind: 'other', tag: 'foreignObject' })
  })

  it('does not list ephemeral scaffolding as an object', () => {
    expect(read(svg('<g class="layer"><title>L</title><rect id="tmp" data-se-ephemeral="1"/><rect id="x"/></g>')).layers[0].items.map((i) => i.id)).toEqual(['x'])
  })

  it('gives the anchor model of a path on demand', () => {
    const p = one('<path d="M0 0L10 0L10 10z"/>')
    expect(pathAnchors(p)[0].closed).toBe(true)
    expect(pathAnchors(p)[0].anchors.length).toBe(3)
  })

  it('refuses a root that is not <svg>', () => {
    expect(() => readDrawing(parseSvg('<html/>'))).toThrow(TypeError)
  })

  it('reads a drawing without layers (a bare svg) as orphans only', () => {
    const d = read('<svg><rect id="a"/><title>t</title></svg>')
    expect(d.layers).toEqual([])
    expect(d.orphans.map((o) => o.id)).toEqual(['a'])
  })
})

describe('readDrawing: an edit through the tree shows in the next read', () => {
  it('hides an object by path without touching the rest of the tree', () => {
    const doc = parseSvg(svg('<g class="layer"><title>L</title><rect id="a"/><rect id="b"/></g>'))
    const before = readDrawing(doc)
    const target = before.layers[0].items[1]
    const root = updateAt(doc.root, target.path, (n) => setAttr(n, 'display', 'none'))
    const after = readDrawing({ ...doc, root })
    expect(after.layers[0].items.map((i) => i.hidden)).toEqual([false, true])
    expect(before.layers[0].items.map((i) => i.hidden)).toEqual([false, false]) // the old value is the undo snapshot
    expect(serializeSvg({ ...doc, root })).toContain('<rect id="b" display="none"/>')
  })
})

describe('readDrawing: agrees with the editor on the round-trip corpus', () => {
  const dir = path.join(process.cwd(), 'tests/e2e/fixtures/roundtrip')
  const fixtures = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()

  // The editor's own DOM reading of a drawing, flattened to comparable rows.
  const domRows = (el, out) => {
    for (const child of el.children) {
      if (!isPanelObject(child)) continue
      out.push({ tag: child.tagName, id: child.getAttribute('id') ?? undefined, hidden: isObjectHidden(child), locked: hasLockMark(child) })
      if (child.tagName === 'g' || child.tagName === 'a') domRows(child, out)
    }
    return out
  }

  describe.each(fixtures)('%s', (file) => {
    it('finds the same layers and objects as the editor helpers', () => {
      const src = fs.readFileSync(path.join(dir, file), 'utf8')
      const declared = /xmlns:se=/.test(src) ? src : src.replace(/<svg\b/, `<svg xmlns:se="${SE}"`)
      const dom = new DOMParser().parseFromString(declared, 'image/svg+xml')
      const domLayers = [...dom.documentElement.children]
        .filter((c) => c.tagName === 'g' && c.classList.contains('layer'))
        .map((g) => ({ name: g.querySelector('title')?.textContent ?? '', hidden: g.getAttribute('display') === 'none', rows: domRows(g, []) }))

      const drawing = read(src)
      const modelLayers = drawing.layers.map((l) => {
        const rows = []
        // the Layers panel does not list the copies a repeat makes
        walkItems({ ...drawing, layers: [l], orphans: [] }, (i) => rows.push({ tag: i.tag, id: i.id, hidden: i.hidden, locked: i.locked }), { generated: false })
        return { name: l.name, hidden: l.hidden, rows }
      })
      expect(modelLayers).toEqual(domLayers)
      expect(modelLayers.length).toBeGreaterThan(0)
    })
  })
})
