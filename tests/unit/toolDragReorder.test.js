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

function keyEvent (type, key, opts = {}) {
  return new KeyboardEvent(type, { key, bubbles: true, cancelable: true, ...opts })
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

  describe('keyboard reorder', () => {
    it('sets up a roving tabindex starting at the first tool', () => {
      expect(a.tabIndex).toBe(0)
      expect(b.tabIndex).toBe(-1)
      expect(c.tabIndex).toBe(-1)
      expect(overflowHost.tabIndex).toBe(-1)
      expect(container.getAttribute('role')).toBe('toolbar')
    })

    it('ArrowDown moves the roving tabindex/focus to the next tool', () => {
      a.focus()
      a.dispatchEvent(keyEvent('keydown', 'ArrowDown'))
      expect(document.activeElement).toBe(b)
      expect(a.tabIndex).toBe(-1)
      expect(b.tabIndex).toBe(0)
    })

    it('ArrowUp at the first tool does nothing', () => {
      a.focus()
      a.dispatchEvent(keyEvent('keydown', 'ArrowUp'))
      expect(document.activeElement).toBe(a)
    })

    it('Enter forwards to the focused tool\'s own click handler', () => {
      const clicked = []
      a.addEventListener('click', () => clicked.push('a'))
      a.focus()
      a.dispatchEvent(keyEvent('keydown', 'Enter'))
      expect(clicked).toEqual(['a'])
    })

    it('Space grabs the focused tool, marking it for a11y', () => {
      a.focus()
      a.dispatchEvent(keyEvent('keydown', ' '))
      expect(a.classList.contains('se-grabbed')).toBe(true)
      expect(a.getAttribute('aria-grabbed')).toBe('true')
    })

    it('ArrowDown while grabbed swaps with the next tool and keeps it grabbed+focused', () => {
      a.focus()
      a.dispatchEvent(keyEvent('keydown', ' '))
      a.dispatchEvent(keyEvent('keydown', 'ArrowDown'))

      expect(Array.from(container.children).filter((el) => el !== overflowHost).map((el) => el.id))
        .toEqual(['b', 'a', 'c'])
      expect(document.activeElement).toBe(a)
      expect(a.classList.contains('se-grabbed')).toBe(true)
      expect(changes.at(-1)).toEqual({ main: ['b', 'a', 'c'], overflow: [] })
    })

    it('Space drops a grabbed tool in place', () => {
      a.focus()
      a.dispatchEvent(keyEvent('keydown', ' '))
      a.dispatchEvent(keyEvent('keydown', ' '))
      expect(a.classList.contains('se-grabbed')).toBe(false)
      expect(a.hasAttribute('aria-grabbed')).toBe(false)
    })

    it('Escape cancels a grabbed move and restores the original order', () => {
      a.focus()
      a.dispatchEvent(keyEvent('keydown', ' '))
      a.dispatchEvent(keyEvent('keydown', 'ArrowDown'))
      a.dispatchEvent(keyEvent('keydown', 'Escape'))

      expect(Array.from(container.children).filter((el) => el !== overflowHost).map((el) => el.id))
        .toEqual(['a', 'b', 'c'])
      expect(a.classList.contains('se-grabbed')).toBe(false)
      expect(document.activeElement).toBe(a)
    })

    it('grabbing the last main tool and pressing ArrowDown crosses it into the overflow bucket', () => {
      c.focus()
      c.dispatchEvent(keyEvent('keydown', ' '))
      c.dispatchEvent(keyEvent('keydown', 'ArrowDown'))

      expect(Array.from(container.children).filter((el) => el !== overflowHost).map((el) => el.id))
        .toEqual(['a', 'b'])
      expect(Array.from(overflowHost.children).map((el) => el.id)).toEqual(['c'])
      expect(c.classList.contains('se-grabbed')).toBe(false)
      expect(document.activeElement).toBe(overflowHost)
      expect(changes.at(-1)).toEqual({ main: ['a', 'b'], overflow: ['c'] })
    })

    it('grabbing the first overflow tool (popover open) and pressing ArrowUp crosses it back out', () => {
      overflowHost.appendChild(a)
      overflowHost.setAttribute('opened', 'opened')

      a.focus()
      a.dispatchEvent(keyEvent('keydown', ' '))
      a.dispatchEvent(keyEvent('keydown', 'ArrowUp'))

      expect(Array.from(container.children).filter((el) => el !== overflowHost).map((el) => el.id))
        .toEqual(['b', 'c', 'a'])
      expect(overflowHost.children.length).toBe(0)
      expect(document.activeElement).toBe(a)
    })

    it('losing focus off the toolbar while grabbed auto-cancels the move', async () => {
      const outside = document.createElement('button')
      document.body.append(outside)

      a.focus()
      a.dispatchEvent(keyEvent('keydown', ' '))
      a.dispatchEvent(keyEvent('keydown', 'ArrowDown'))
      outside.focus() // simulates e.g. Tab moving focus out of the toolbar entirely
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(a.classList.contains('se-grabbed')).toBe(false)
      expect(Array.from(container.children).filter((el) => el !== overflowHost).map((el) => el.id))
        .toEqual(['a', 'b', 'c'])
    })
  })
})
