import { describe, it, expect, afterEach, vi } from 'vitest'
import { setUserDataAdapter } from '../../src/editor/userDataAdapter.js'
import {
  getClasses,
  saveClass,
  deleteClass,
  getDefaultClasses,
  getDefaultClassForTag,
  setDefaultClassForTag,
  internalClassTokens,
  nextClassString,
  applyDefaultClassAttrs
} from '../../src/editor/classLibrary.js'

const CLASSES_KEY = 'svg-edit-class-library'
const DEFAULTS_KEY = 'svg-edit-default-classes'

const makeRect = (className = '') => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  if (className) el.setAttribute('class', className)
  return el
}

describe('classLibrary — per-tag default classes (localStorage fallback)', () => {
  afterEach(() => {
    setUserDataAdapter(null)
    localStorage.removeItem(CLASSES_KEY)
    localStorage.removeItem(DEFAULTS_KEY)
  })

  it('getDefaultClasses returns {} when nothing is stored', () => {
    expect(getDefaultClasses()).toEqual({})
  })

  it('getDefaultClassForTag returns undefined for an unset tag', () => {
    expect(getDefaultClassForTag('text')).toBeUndefined()
  })

  it('setDefaultClassForTag persists a default readable via getDefaultClassForTag', () => {
    setDefaultClassForTag('text', 'title')
    expect(getDefaultClassForTag('text')).toBe('title')
    expect(JSON.parse(localStorage.getItem(DEFAULTS_KEY))).toEqual({ text: 'title' })
  })

  it('setDefaultClassForTag overwrites an existing default for the same tag', () => {
    setDefaultClassForTag('rect', 'boxA')
    setDefaultClassForTag('rect', 'boxB')
    expect(getDefaultClassForTag('rect')).toBe('boxB')
  })

  it('setDefaultClassForTag with a falsy name clears the default', () => {
    setDefaultClassForTag('text', 'title')
    setDefaultClassForTag('text', null)
    expect(getDefaultClassForTag('text')).toBeUndefined()
    expect(getDefaultClasses()).toEqual({})
  })

  it('keeps defaults for different tags independent', () => {
    setDefaultClassForTag('text', 'title')
    setDefaultClassForTag('rect', 'box')
    expect(getDefaultClassForTag('text')).toBe('title')
    expect(getDefaultClassForTag('rect')).toBe('box')
  })

  it('deleteClass purges any tag defaults pointing at the deleted class', () => {
    saveClass({ name: 'title', scope: 'text', attrs: { fill: 'red' } })
    setDefaultClassForTag('text', 'title')
    setDefaultClassForTag('tspan', 'title')

    deleteClass('title')

    expect(getClasses().find(c => c.name === 'title')).toBeUndefined()
    expect(getDefaultClassForTag('text')).toBeUndefined()
    expect(getDefaultClassForTag('tspan')).toBeUndefined()
  })

  it('deleteClass leaves an unrelated tag default alone', () => {
    saveClass({ name: 'title', scope: 'text', attrs: {} })
    setDefaultClassForTag('text', 'title')
    setDefaultClassForTag('rect', 'box')

    deleteClass('title')

    expect(getDefaultClassForTag('rect')).toBe('box')
  })
})

describe('classLibrary — default classes via host adapter', () => {
  afterEach(() => {
    setUserDataAdapter(null)
  })

  it('reads/writes defaults through the adapter instead of localStorage when one is registered', () => {
    const store = {}
    const adapter = {
      getDefaultClasses: vi.fn(() => store),
      setDefaultClasses: vi.fn(defaults => Object.assign(store, defaults))
    }
    setUserDataAdapter(adapter)

    setDefaultClassForTag('text', 'title')

    expect(adapter.setDefaultClasses).toHaveBeenCalled()
    expect(getDefaultClassForTag('text')).toBe('title')
    expect(adapter.getDefaultClasses).toHaveBeenCalled()
  })

  it('falls back to {} when an adapter is registered but has no getDefaultClasses method', () => {
    setUserDataAdapter({ getClasses: vi.fn(), setClasses: vi.fn() })
    expect(getDefaultClasses()).toEqual({})
  })
})

describe('classLibrary — class token helpers', () => {
  it('internalClassTokens returns only se_-prefixed tokens', () => {
    const rect = makeRect('se_layer myClass otherThing')
    expect(internalClassTokens(rect)).toEqual(['se_layer'])
  })

  it('internalClassTokens returns [] when there is no class attribute', () => {
    expect(internalClassTokens(makeRect())).toEqual([])
  })

  it('nextClassString appends the name and preserves internal tokens', () => {
    const rect = makeRect('se_layer')
    expect(nextClassString(rect, 'myClass')).toBe('se_layer myClass')
  })

  it('nextClassString returns null when there is nothing to keep', () => {
    expect(nextClassString(makeRect(), '')).toBeNull()
  })
})

describe('classLibrary — applyDefaultClassAttrs', () => {
  it('stamps the class token and flat preset attrs onto the element', () => {
    const rect = makeRect()
    applyDefaultClassAttrs(rect, { name: 'box', attrs: { fill: 'blue', stroke: 'black' } })
    expect(rect.getAttribute('class')).toBe('box')
    expect(rect.getAttribute('fill')).toBe('blue')
    expect(rect.getAttribute('stroke')).toBe('black')
  })

  it('preserves existing internal se_ tokens when stamping the class', () => {
    const rect = makeRect('se_layer')
    applyDefaultClassAttrs(rect, { name: 'box', attrs: {} })
    expect(rect.getAttribute('class')).toBe('se_layer box')
  })

  it('adds paint-order:stroke when the preset sets stroke-width', () => {
    const rect = makeRect()
    applyDefaultClassAttrs(rect, { name: 'thick', attrs: { 'stroke-width': '4' } })
    expect(rect.getAttribute('paint-order')).toBe('stroke')
  })

  it('does not add paint-order when the preset has no stroke-width', () => {
    const rect = makeRect()
    applyDefaultClassAttrs(rect, { name: 'plain', attrs: { fill: 'red' } })
    expect(rect.hasAttribute('paint-order')).toBe(false)
  })
})
