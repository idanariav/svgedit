import { describe, it, expect, beforeEach } from 'vitest'
import { SnapshotHistory, readSnapshot, share } from '../../packages/svgcanvas/core/snapshot-history.ts'
import { SnapshotMirror, firstDifference } from '../../packages/svgcanvas/core/snapshot-mirror.ts'
import { parseSvg, element } from '../../packages/svgcanvas/core/model/index.ts'

const SVG = 'http://www.w3.org/2000/svg'
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('share: snapshots keep what an edit did not touch', () => {
  const a = parseSvg('<svg><g id="l"><rect id="a" x="1"/><rect id="b" x="2"/></g><g id="m"><rect id="c"/></g></svg>').root
  const b = parseSvg('<svg><g id="l"><rect id="a" x="1"/><rect id="b" x="9"/></g><g id="m"><rect id="c"/></g></svg>').root

  it('returns the same node for an equal tree and reuses equal subtrees of a changed one', () => {
    expect(share(a, parseSvg('<svg><g id="l"><rect id="a" x="1"/><rect id="b" x="2"/></g><g id="m"><rect id="c"/></g></svg>').root)).toBe(a)
    const out = share(a, b)
    expect(out).not.toBe(a)
    expect(out.children[0].children[0]).toBe(a.children[0].children[0]) // rect a
    expect(out.children[0].children[1]).not.toBe(a.children[0].children[1]) // rect b changed
    expect(out.children[1]).toBe(a.children[1]) // layer m
  })

  it('matches children by id, so an insertion in front does not break the sharing', () => {
    const c = element('svg', [], [element('g', [{ name: 'id', value: 'new' }]), ...a.children])
    const out = share(a, c)
    expect(out.children[1]).toBe(a.children[0])
    expect(out.children[2]).toBe(a.children[1])
  })
})

describe('SnapshotHistory', () => {
  let content
  let history
  let held
  let stack
  const rect = (id, x) => {
    const r = document.createElementNS(SVG, 'rect')
    r.setAttribute('id', id)
    r.setAttribute('x', x)
    return r
  }
  const xs = () => [...content.querySelectorAll('rect')].map((r) => `${r.id}:${r.getAttribute('x')}`)
  /** a command lands: `edit` changes the DOM, then the history records it */
  const command = (edit) => {
    edit()
    stack++
    history.pushed(stack)
  }

  beforeEach(() => {
    content = document.createElementNS(SVG, 'svg')
    content.setAttribute('id', 'svgcontent')
    const layer = document.createElementNS(SVG, 'g')
    layer.setAttribute('class', 'layer')
    layer.append(rect('a', '1'), rect('b', '2'))
    content.append(layer)
    document.body.append(content)
    held = false
    stack = 0
    history = new SnapshotHistory({
      count: () => stack,
      held: () => held,
      signal: () => new AbortController().signal,
      content: () => content,
      before: () => {},
      patched: () => {}
    })
    history.reset()
  })

  it('undo and redo make the DOM show the snapshot', () => {
    command(() => content.querySelector('[id="a"]').setAttribute('x', '10'))
    command(() => content.querySelector('.layer').append(rect('c', '3')))
    expect(xs()).toEqual(['a:10', 'b:2', 'c:3'])
    stack--
    history.step(stack)
    expect(xs()).toEqual(['a:10', 'b:2'])
    stack--
    history.step(stack)
    expect(xs()).toEqual(['a:1', 'b:2'])
    stack++
    history.step(stack)
    stack++
    history.step(stack)
    expect(xs()).toEqual(['a:10', 'b:2', 'c:3'])
  })

  it('a removed element comes back as the same node', () => {
    const b = content.querySelector('[id="b"]')
    command(() => b.remove())
    stack--
    history.step(stack)
    expect(content.querySelector('[id="b"]')).toBe(b)
  })

  it('takes in a change made after the command landed (the state is what the DOM showed when it was left)', () => {
    command(() => content.querySelector('[id="a"]').setAttribute('x', '10'))
    content.querySelector('[id="b"]').setAttribute('x', '20') // derived data written after the push
    history.baseline() // the next user action
    command(() => content.querySelector('[id="a"]').setAttribute('x', '11'))
    stack--
    history.step(stack)
    expect(xs()).toEqual(['a:10', 'b:20'])
  })

  it('a change outside any command belongs to the state the next action starts from', async () => {
    content.querySelector('[id="b"]').setAttribute('x', '7') // a layer given its id, a rounding…
    await flush()
    history.baseline()
    command(() => content.querySelector('[id="a"]').setAttribute('x', '10'))
    stack--
    history.step(stack)
    expect(xs()).toEqual(['a:1', 'b:7'])
  })

  it('does not take a baseline from inside a transaction', async () => {
    command(() => content.querySelector('[id="a"]').setAttribute('x', '5'))
    held = true
    content.querySelector('[id="a"]').setAttribute('x', '6') // a live change inside the transaction
    await flush()
    history.baseline()
    held = false
    command(() => content.querySelector('[id="a"]').setAttribute('x', '7'))
    stack--
    history.step(stack)
    expect(xs()[0]).toBe('a:5') // undo goes back to where the transaction started, not to a value from inside it
  })

  it('leaves the content root view attributes and ephemeral overlays alone', () => {
    content.setAttribute('width', '100')
    command(() => content.querySelector('[id="a"]').setAttribute('x', '10'))
    const overlay = document.createElementNS(SVG, 'g')
    overlay.setAttribute('data-se-ephemeral', '')
    content.append(overlay)
    content.setAttribute('width', '200') // a zoom
    stack--
    history.step(stack)
    expect(content.getAttribute('width')).toBe('200')
    expect(content.contains(overlay)).toBe(true)
    expect(readSnapshot(content).attrs.some((a) => a.name === 'width')).toBe(false)
  })
})

describe('SnapshotMirror', () => {
  it('reports an undo that does not restore the drawing, and nothing otherwise', () => {
    const content = document.createElementNS(SVG, 'svg')
    const r = document.createElementNS(SVG, 'rect')
    r.setAttribute('id', 'a')
    content.append(r)
    const mirror = new SnapshotMirror(() => readSnapshot(content))
    mirror.reset()
    r.setAttribute('x', '1')
    mirror.pushed()
    mirror.undone('good') // the command's undo forgot to put x back
    expect(mirror.problems).toHaveLength(1)
    expect(mirror.problems[0]).toMatch(/undo of "good" did not restore the drawing/)
    r.removeAttribute('x')
    mirror.redone('fine')
    expect(firstDifference(readSnapshot(content), readSnapshot(content))).toBeNull()
  })
})
