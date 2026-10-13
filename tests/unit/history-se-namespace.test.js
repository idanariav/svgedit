import { describe, it, expect } from 'vitest'
import * as history from '../../packages/svgcanvas/core/history.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'

// object-state reads `se:locked` with getAttributeNS; undo / redo must put it back in the namespace.
describe('ChangeElementCommand and se: attributes', () => {
  const rect = () => document.createElementNS(NS.SVG, 'rect')
  const handler = { handleHistoryEvent () {} }

  it('undoing a removal restores the attribute in the se namespace', () => {
    const el = rect()
    el.setAttributeNS(NS.SE, 'se:locked', 'true')
    const cmd = new history.ChangeElementCommand(el, { 'se:locked': 'true' })
    el.removeAttributeNS(NS.SE, 'locked')
    cmd.newValues = { 'se:locked': null }
    cmd.unapply(handler)
    expect(el.getAttributeNS(NS.SE, 'locked')).toBe('true')
    cmd.apply(handler)
    expect(el.hasAttributeNS(NS.SE, 'locked')).toBe(false)
  })

  it('redoing a set writes it in the se namespace; other attributes stay plain', () => {
    const el = rect()
    const cmd = new history.ChangeElementCommand(el, { 'se:locked': null, fill: null })
    el.setAttributeNS(NS.SE, 'se:locked', 'true')
    el.setAttribute('fill', '#f00')
    cmd.newValues = { 'se:locked': 'true', fill: '#f00' }
    cmd.unapply(handler)
    expect(el.hasAttributeNS(NS.SE, 'locked')).toBe(false)
    cmd.apply(handler)
    expect(el.getAttributeNS(NS.SE, 'locked')).toBe('true')
    expect(el.getAttributeNS(null, 'fill')).toBe('#f00')
  })
})
