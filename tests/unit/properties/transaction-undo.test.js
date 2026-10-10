import SvgCanvas from '../../../packages/svgcanvas/svgcanvas.js'
import { NS } from '../../../packages/svgcanvas/core/namespaces.js'
import { fc, params } from './fc.js'

// Random DOM edits inside one transaction: undo must restore the drawing
// (attribute order aside) and redo must reproduce the edited state.
const ATTRS = ['x', 'y', 'fill', 'opacity', 'stroke-width', 'se:fx', 'class']
const op = fc.oneof(
  fc.record({ kind: fc.constant('set'), el: fc.nat(40), attr: fc.constantFrom(...ATTRS), value: fc.stringMatching(/^[a-z0-9]{1,6}$/) }),
  fc.record({ kind: fc.constant('unset'), el: fc.nat(40), attr: fc.constantFrom(...ATTRS) }),
  fc.record({ kind: fc.constant('add'), parent: fc.nat(40) }),
  fc.record({ kind: fc.constant('remove'), el: fc.nat(40) }),
  fc.record({ kind: fc.constant('move'), el: fc.nat(40), parent: fc.nat(40), before: fc.nat(40) }),
  fc.record({ kind: fc.constant('text'), el: fc.nat(40), value: fc.stringMatching(/^[a-z]{1,6}$/) })
)

const makeCanvas = () => {
  document.body.innerHTML = '<div id="svgcanvas"></div>'
  return new SvgCanvas(document.getElementById('svgcanvas'), {
    canvas_expansion: 3, dimensions: [200, 200], initFill: { color: 'FF0000', opacity: 1 }, initStroke: { width: 1, color: '000000', opacity: 1 }, initOpacity: 1, imgPath: '', langPath: '', extPath: '', extensions: [], initTool: 'select', wireframe: false
  })
}

describe('transaction undo/redo properties', () => {
  it('undo restores the exact markup; redo restores the edited markup', () => {
    const canvas = makeCanvas()
    const layer = canvas.getCurrentDrawing().getCurrentLayer()
    // Attribute order is not document state (remove + re-add moves an attribute to the end,
    // and redo sets it back in place), so compare with each element's attributes sorted.
    const html = () => {
      const clone = canvas.getSvgContent().cloneNode(true)
      for (const el of [clone, ...clone.querySelectorAll('*')]) {
        const attrs = [...el.attributes].map((a) => [a.name, a.value]).sort(([a], [b]) => (a < b ? -1 : 1))
        for (const [name] of attrs) el.removeAttribute(name)
        for (const [name, value] of attrs) el.setAttribute(name, value)
      }
      return clone.outerHTML
    }

    fc.assert(fc.property(fc.array(op, { minLength: 1, maxLength: 25 }), (ops) => {
      // fresh, deterministic starting drawing
      layer.replaceChildren()
      const mk = (tag, id, parent) => {
        const el = document.createElementNS(NS.SVG, tag)
        el.setAttribute('id', id)
        parent.append(el)
        return el
      }
      const g1 = mk('g', 'g1', layer)
      const g2 = mk('g', 'g2', layer)
      mk('rect', 'r1', g1).setAttribute('x', '1')
      mk('rect', 'r2', g1)
      mk('rect', 'r3', g2).setAttribute('fill', 'red')
      const t = mk('text', 't1', g2)
      t.textContent = 'abc'
      canvas.undoMgr.resetUndoStack()

      let counter = 0
      const nodes = () => [layer, ...layer.querySelectorAll('*')]
      const pick = (i, pool) => (pool.length ? pool[i % pool.length] : null)
      const before = html()

      canvas.transact('random edits', () => {
        for (const o of ops) {
          const pool = nodes()
          const target = pick(o.el ?? 0, pool.slice(1))
          if (o.kind === 'set') target?.setAttribute(o.attr, o.value)
          else if (o.kind === 'unset') target?.removeAttribute(o.attr)
          else if (o.kind === 'add') {
            const parent = pick(o.parent, pool.filter((n) => n === layer || n.tagName === 'g'))
            mk('rect', `n${counter++}`, parent)
          } else if (o.kind === 'remove') {
            target?.remove()
          } else if (o.kind === 'move' && target) {
            const el = target
            const parent = pick(o.parent, pool.filter((n) => (n === layer || n.tagName === 'g') && !el.contains(n)))
            if (!parent) continue
            const kids = [...parent.children].filter((k) => k !== el)
            const ref = kids.length ? kids[o.before % (kids.length + 1)] ?? null : null
            parent.insertBefore(el, ref)
          } else if (o.kind === 'text') {
            if (t.firstChild) t.firstChild.data = o.value
          }
        }
      })
      const after = html()
      const recorded = canvas.undoMgr.getUndoStackSize()
      fc.pre(recorded === 1) // a net no-op records nothing; nothing to undo
      canvas.undoMgr.undo()
      expect(html()).toBe(before)
      canvas.undoMgr.redo()
      expect(html()).toBe(after)
    }), params(150))
  })
})
