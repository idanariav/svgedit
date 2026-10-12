import { vi } from 'vitest'
import { initToolAutoFold, withoutFold } from '../../src/editor/toolAutoFold.js'

describe('withoutFold', () => {
  it('counts the folded tools as main tools again, after the others', () => {
    expect(withoutFold({ main: ['a', 'b'], overflow: ['y', 'c', 'd'] }, ['c', 'd'])).toEqual({
      main: ['a', 'b', 'c', 'd'],
      overflow: ['y']
    })
  })

  it('changes nothing when nothing is folded', () => {
    expect(withoutFold({ main: ['a'], overflow: ['z'] }, [])).toEqual({ main: ['a'], overflow: ['z'] })
  })
})

// jsdom has no layout: model a column that fits `room` main tools (the overflow button is not counted).
describe('initToolAutoFold', () => {
  let container
  let host
  let room

  const tool = (id) => {
    const el = document.createElement('div')
    el.id = id
    return el
  }

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe () {} disconnect () {} })
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    container = document.createElement('div')
    host = document.createElement('div')
    host.id = 'tools_overflow'
    host.append(tool('mine'))
    container.append(...['a', 'b', 'c', 'd'].map(tool), host)
    document.body.append(container)
    const count = () => Array.from(container.children).filter((el) => el !== host).length
    Object.defineProperty(container, 'clientHeight', { get: () => 100 })
    Object.defineProperty(container, 'scrollHeight', { get: () => (count() > room ? 200 : 100) })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    container.remove()
  })

  const ids = (el) => Array.from(el.children).map((c) => c.id)

  it('folds the last tools into the overflow, ahead of the user\'s own overflow tools', () => {
    room = 2
    const fold = initToolAutoFold({ container, overflowHost: host })
    fold.fit()
    expect(ids(container)).toEqual(['a', 'b', 'tools_overflow'])
    expect(ids(host)).toEqual(['c', 'd', 'mine'])
    expect(fold.folded()).toEqual(['c', 'd'])
  })

  it('brings them back, in order, when there is room again', () => {
    room = 2
    const fold = initToolAutoFold({ container, overflowHost: host })
    fold.fit()
    room = 3
    fold.fit()
    expect(ids(container)).toEqual(['a', 'b', 'c', 'tools_overflow'])
    expect(fold.folded()).toEqual(['d'])
    room = 10
    fold.fit()
    expect(ids(container)).toEqual(['a', 'b', 'c', 'd', 'tools_overflow'])
    expect(ids(host)).toEqual(['mine'])
    expect(fold.folded()).toEqual([])
  })

  it('treats a folded tool dragged back to the main row as the user\'s own', () => {
    room = 2
    const fold = initToolAutoFold({ container, overflowHost: host })
    fold.fit()
    container.insertBefore(host.querySelector('#c'), container.firstChild)
    room = 3
    fold.fit()
    expect(container.querySelector('#c').hasAttribute('data-auto-folded')).toBe(false)
    expect(fold.folded()).toEqual(['d'])
  })

  it('keeps a tab stop on the column when the focused tool is folded', () => {
    room = 3
    container.querySelector('#d').tabIndex = 0
    initToolAutoFold({ container, overflowHost: host }).fit()
    expect(host.querySelector('#d').tabIndex).toBe(-1)
    expect(host.tabIndex).toBe(0)
  })

  it('destroy puts everything back', () => {
    room = 2
    const fold = initToolAutoFold({ container, overflowHost: host })
    fold.fit()
    fold.destroy()
    expect(ids(container)).toEqual(['a', 'b', 'c', 'd', 'tools_overflow'])
    expect(fold.folded()).toEqual([])
    expect(ids(host)).toEqual(['mine'])
  })
})
