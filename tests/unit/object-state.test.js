import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.ts'
import {
  isPanelObject, isExpandableGroup, isObjectLocked, isObjectHidden, hasLockMark, canHoldObjects, init
} from '../../packages/svgcanvas/core/object-state.ts'

const make = (tag, attrs = {}, parent = document.body) => {
  const el = document.createElementNS(NS.SVG, tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('se:')) el.setAttributeNS(NS.SE, k, v)
    else el.setAttribute(k, v)
  }
  parent.append(el)
  return el
}
const layer = (parent) => make('g', { class: 'layer' }, parent)

afterEach(() => { document.body.textContent = '' })

describe('isPanelObject / isExpandableGroup', () => {
  it('skips non-rendering tags, ephemeral overlays and generated repeat copies', () => {
    expect(isPanelObject(make('rect'))).toBe(true)
    expect(isPanelObject(make('title'))).toBe(false)
    expect(isPanelObject(make('defs'))).toBe(false)
    expect(isPanelObject(make('rect', { 'data-se-ephemeral': '1' }))).toBe(false)
    expect(isPanelObject(make('rect', { 'se:repeat-copy': '1' }))).toBe(false)
  })

  it('expands plain groups only, not layers or generated groups', () => {
    expect(isExpandableGroup(make('g'))).toBe(true)
    expect(isExpandableGroup(layer(document.body))).toBe(false)
    expect(isExpandableGroup(make('g', { 'se:blend': '1' }))).toBe(false)
    expect(isExpandableGroup(make('g', { 'se:art-brush': '1' }))).toBe(false)
    expect(isExpandableGroup(make('rect'))).toBe(false)
  })

  it('lets a layer or plain group receive objects', () => {
    expect(canHoldObjects(layer(document.body))).toBe(true)
    expect(canHoldObjects(make('g'))).toBe(true)
    expect(canHoldObjects(make('rect'))).toBe(false)
    expect(canHoldObjects(null)).toBe(false)
  })
})

describe('locked and hidden state', () => {
  it('reads se:locked on the object and on groups above it, but not on the layer', () => {
    const lay = layer(document.body)
    const grp = make('g', {}, lay)
    const rect = make('rect', {}, grp)
    expect(isObjectLocked(rect)).toBe(false)
    grp.setAttributeNS(NS.SE, 'se:locked', 'true')
    expect(isObjectLocked(rect)).toBe(true)
    expect(isObjectLocked(grp)).toBe(true)
    grp.removeAttributeNS(NS.SE, 'locked')
    lay.setAttributeNS(NS.SE, 'se:locked', 'true')
    expect(isObjectLocked(rect)).toBe(false)
    expect(hasLockMark(rect)).toBe(false)
  })

  it('makes every object of a tracing-template layer unselectable', () => {
    const lay = layer(document.body)
    const rect = make('rect', {}, lay)
    const grp = make('g', {}, lay)
    const inner = make('rect', {}, grp)
    expect(isObjectLocked(rect)).toBe(false)
    lay.setAttributeNS(NS.SE, 'se:template', 'true')
    expect(isObjectLocked(rect)).toBe(true)
    expect(isObjectLocked(inner)).toBe(true)
    lay.removeAttributeNS(NS.SE, 'template')
    expect(isObjectLocked(inner)).toBe(false)
  })

  it('reports display="none" as hidden', () => {
    const r = make('rect')
    expect(isObjectHidden(r)).toBe(false)
    r.setAttribute('display', 'none')
    expect(isObjectHidden(r)).toBe(true)
  })
})

describe('canvas methods', () => {
  let canvas, selected, lay, a, b, grp

  beforeEach(() => {
    selected = []
    canvas = {
      transact: vi.fn((label, fn) => fn()),
      getSvgContent: () => document.body,
      getSelectedElements: () => selected,
      selectOnly: vi.fn((els) => { selected = els })
    }
    init(canvas)
    lay = layer(document.body)
    a = make('rect', { id: 'a' }, lay)
    b = make('rect', { id: 'b' }, lay)
    grp = make('g', { id: 'grp' }, lay)
  })

  it('hides and shows as one step, and drops hidden objects from the selection', () => {
    selected = [a, b]
    expect(canvas.setObjectsHidden([a], true)).toBe(true)
    expect(a.getAttribute('display')).toBe('none')
    expect(canvas.selectOnly).toHaveBeenCalledWith([b])
    expect(canvas.transact).toHaveBeenCalledTimes(1)
    expect(canvas.setObjectsHidden([a], true)).toBe(false)
    expect(canvas.setObjectsHidden([a], false)).toBe(true)
    expect(a.hasAttribute('display')).toBe(false)
  })

  it('locks and unlocks, and a locked group takes its selected child out of the selection', () => {
    const inner = make('rect', {}, grp)
    selected = [inner]
    expect(canvas.setObjectsLocked([grp], true)).toBe(true)
    expect(grp.getAttributeNS(NS.SE, 'locked')).toBe('true')
    expect(canvas.selectOnly).toHaveBeenCalledWith([])
    expect(canvas.setObjectsLocked([grp], false)).toBe(true)
    expect(grp.hasAttributeNS(NS.SE, 'locked')).toBe(false)
  })

  it('names objects through data-name; empty clears it', () => {
    expect(canvas.setObjectName(a, '  Sun ')).toBe(true)
    expect(a.getAttribute('data-name')).toBe('Sun')
    expect(canvas.setObjectName(a, 'Sun')).toBe(false)
    expect(canvas.setObjectName(a, '')).toBe(true)
    expect(a.hasAttribute('data-name')).toBe(false)
  })

  it('refuses a move into itself, into a shape, or before a node of another parent', () => {
    const inner = make('g', {}, grp)
    expect(canvas.objectMoveIssue([grp], inner)).toMatch(/itself/)
    expect(canvas.objectMoveIssue([a], b)).toMatch(/cannot hold/)
    expect(canvas.objectMoveIssue([a], grp, b)).toMatch(/insertion/)
    expect(canvas.objectMoveIssue([a], grp)).toBeNull()
    expect(canvas.moveObjects([grp], inner)).toBe(false)
  })

  it('reorders within a parent and reports a no-op', () => {
    expect(canvas.moveObjects([b], lay, a)).toBe(true)
    expect([...lay.children].map(e => e.id)).toEqual(['b', 'a', 'grp'])
    expect(canvas.moveObjects([b], lay, a)).toBe(false)
    expect(canvas.moveObjects([a], lay, null)).toBe(true)
    expect([...lay.children].map(e => e.id)).toEqual(['b', 'grp', 'a'])
    expect(canvas.moveObjects([a], lay, null)).toBe(false)
  })

  it('moves several objects in document order, into a group, and across layers', () => {
    expect(canvas.moveObjects([b, a], grp)).toBe(true)
    expect([...grp.children].map(e => e.id)).toEqual(['a', 'b'])
    const other = layer(document.body)
    expect(canvas.moveObjects([grp], other)).toBe(true)
    expect(other.firstElementChild).toBe(grp)
    expect(canvas.transact).toHaveBeenCalledTimes(2)
  })
  describe('all-objects state', () => {
    it('finds locked and hidden objects at any depth, but never a hidden layer or a generated group\'s parts', () => {
      expect(canvas.hasLockedObjects()).toBe(false)
      expect(canvas.hasHiddenObjects()).toBe(false)
      lay.setAttribute('display', 'none') // layer visibility is not an object's
      expect(canvas.hasHiddenObjects()).toBe(false)
      const deep = make('rect', { 'se:locked': 'true' }, grp)
      expect(canvas.hasLockedObjects()).toBe(true)
      const blend = make('g', { 'se:blend': '1' }, lay)
      make('rect', { display: 'none' }, blend)
      expect(canvas.hasHiddenObjects()).toBe(false)
      b.setAttribute('display', 'none')
      expect(canvas.hasHiddenObjects()).toBe(true)
      expect(deep.isConnected).toBe(true)
    })

    it('unlocks and shows everything in one undo step each', () => {
      const deep = make('rect', { 'se:locked': 'true', display: 'none' }, grp)
      a.setAttributeNS(NS.SE, 'se:locked', 'true')
      canvas.transact.mockClear()
      expect(canvas.unlockAllObjects()).toBe(true)
      expect(canvas.transact).toHaveBeenCalledTimes(1)
      expect(hasLockMark(a)).toBe(false)
      expect(hasLockMark(deep)).toBe(false)
      expect(canvas.unlockAllObjects()).toBe(false)
      expect(canvas.showAllObjects()).toBe(true)
      expect(deep.hasAttribute('display')).toBe(false)
      expect(canvas.showAllObjects()).toBe(false)
    })
  })
})
