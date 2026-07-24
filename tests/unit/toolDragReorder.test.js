import { describe, it, expect, beforeEach } from 'vitest'
import { initToolDragReorder } from '../../src/editor/toolDragReorder.js'

/**
 * jsdom has no DataTransfer/DragEvent implementation, so tests build plain
 * bubbling Events and stamp a minimal DataTransfer-like stub onto them
 * (a standard workaround for testing native HTML5 DnD in jsdom). Dispatching
 * directly on the intended target element (rather than trying to control
 * `evt.target` after construction, which dispatchEvent overwrites anyway)
 * gives toolDragReorder.js's `evt.target.closest(...)` lookups a real target,
 * matching how a real drag interaction reaches these listeners via bubbling.
 */
function dragEvent (type, { clientY = 0 } = {}) {
  const evt = new Event(type, { bubbles: true, cancelable: true })
  evt.clientY = clientY
  evt.dataTransfer = {
    effectAllowed: null,
    dropEffect: null,
    _data: {},
    setData (t, v) { this._data[t] = v },
    getData (t) { return this._data[t] }
  }
  return evt
}

function makeTool (id) {
  const el = document.createElement('div')
  el.id = id
  return el
}

describe('initToolDragReorder', () => {
  let container, overflowHost, a, b, c, changes

  beforeEach(() => {
    container = document.createElement('div')
    overflowHost = document.createElement('div')
    a = makeTool('a')
    b = makeTool('b')
    c = makeTool('c')
    container.append(a, b, c, overflowHost)
    document.body.append(container)
    changes = []
    initToolDragReorder({ container, overflowHost, onChange: (order) => changes.push(order) })
  })

  it('marks direct children of container draggable, excluding the overflow host', () => {
    expect(a.draggable).toBe(true)
    expect(b.draggable).toBe(true)
    expect(c.draggable).toBe(true)
    expect(overflowHost.draggable).toBe(false)
  })

  it('dragging "a" and dropping it after "b" reorders main and calls onChange', () => {
    a.dispatchEvent(dragEvent('dragstart'))
    // Drop on the bottom half of "b" (clientY below its zero-height midpoint) → insert after b.
    b.dispatchEvent(dragEvent('drop', { clientY: 1 }))

    expect(Array.from(container.children).filter((el) => el !== overflowHost).map((el) => el.id))
      .toEqual(['b', 'a', 'c'])
    expect(changes.at(-1)).toEqual({ main: ['b', 'a', 'c'], overflow: [] })
  })

  it('dragging "a" and dropping it before "b" keeps it ahead of b', () => {
    a.dispatchEvent(dragEvent('dragstart'))
    // Top half (negative clientY relative to the zero-height rect) → insert before b.
    b.dispatchEvent(dragEvent('drop', { clientY: -1 }))

    expect(Array.from(container.children).filter((el) => el !== overflowHost).map((el) => el.id))
      .toEqual(['a', 'b', 'c'])
  })

  it('adds the se-dragging class on dragstart and removes it on dragend', () => {
    a.dispatchEvent(dragEvent('dragstart'))
    expect(a.classList.contains('se-dragging')).toBe(true)
    a.dispatchEvent(dragEvent('dragend'))
    expect(a.classList.contains('se-dragging')).toBe(false)
  })

  it('dropping directly on the overflow trigger moves the tool into overflow', () => {
    a.dispatchEvent(dragEvent('dragstart'))
    overflowHost.dispatchEvent(dragEvent('drop'))

    expect(Array.from(container.children).filter((el) => el !== overflowHost).map((el) => el.id))
      .toEqual(['b', 'c'])
    expect(Array.from(overflowHost.children).map((el) => el.id)).toEqual(['a'])
    expect(changes.at(-1)).toEqual({ main: ['b', 'c'], overflow: ['a'] })
    expect(a.draggable).toBe(true)
  })

  it('dropping a tool from overflow back onto a main-row tool moves it back out', () => {
    a.dispatchEvent(dragEvent('dragstart'))
    overflowHost.dispatchEvent(dragEvent('drop'))
    changes.length = 0

    a.dispatchEvent(dragEvent('dragstart'))
    b.dispatchEvent(dragEvent('drop', { clientY: -1 }))

    expect(Array.from(container.children).filter((el) => el !== overflowHost).map((el) => el.id))
      .toEqual(['a', 'b', 'c'])
    expect(overflowHost.children.length).toBe(0)
    expect(changes.at(-1)).toEqual({ main: ['a', 'b', 'c'], overflow: [] })
  })

  it('reorders within the overflow popover itself', () => {
    a.dispatchEvent(dragEvent('dragstart'))
    overflowHost.dispatchEvent(dragEvent('drop'))
    b.dispatchEvent(dragEvent('dragstart'))
    overflowHost.dispatchEvent(dragEvent('drop'))
    changes.length = 0

    // Now overflow = [a, b]; drag b before a within the popover.
    b.dispatchEvent(dragEvent('dragstart'))
    a.dispatchEvent(dragEvent('drop', { clientY: -1 }))

    expect(Array.from(overflowHost.children).map((el) => el.id)).toEqual(['b', 'a'])
  })
})
