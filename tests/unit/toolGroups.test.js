import { describe, it, expect } from 'vitest'
import {
  defaultToolOrder, groupOf, isUncustomisedOrder, reconcileToolOrder, markToolGroups, TOOL_GROUPS
} from '../../src/editor/toolOrder.js'

const natural = ['tool_select', 'ext-panning', 'tool_fhpath', 'tool_line', 'tool_path', 'tools_shapes', 'tool_text', 'tool_image',
  'tool_brush', 'tool_shapelib', 'tool_cutter', 'tool_curvature', 'tool_eyedropper', 'tool_puppet_warp', 'tool_thirdparty']

describe('tool groups', () => {
  it('orders tools by group, drawing tools together, unknown tools last', () => {
    expect(defaultToolOrder(natural)).toEqual([
      'tool_select', 'ext-panning',
      'tool_fhpath', 'tool_brush', 'tool_path', 'tool_curvature', 'tool_line',
      'tools_shapes', 'tool_shapelib',
      'tool_text', 'tool_image',
      'tool_cutter', 'tool_puppet_warp', 'tool_eyedropper',
      'tool_thirdparty'
    ])
  })

  it('only lists a tool in one group', () => {
    const all = TOOL_GROUPS.flat()
    expect(new Set(all).size).toBe(all.length)
    expect(groupOf('tool_thirdparty')).toBe(TOOL_GROUPS.length)
  })

  it('treats a saved snapshot of the natural order as uncustomised, but not a reorder or overflow', () => {
    expect(isUncustomisedOrder(natural, null)).toBe(true)
    expect(isUncustomisedOrder(natural, { main: [...natural], overflow: [] })).toBe(true)
    expect(isUncustomisedOrder(natural, { main: [...natural].reverse(), overflow: [] })).toBe(false)
    expect(isUncustomisedOrder(natural, { main: natural.slice(1), overflow: [natural[0]] })).toBe(false)
  })

  it('keeps a customised stored order through reconcile', () => {
    const stored = { main: ['tool_text', 'tool_select'], overflow: ['tool_line'] }
    const out = reconcileToolOrder(natural, stored)
    expect(out.main.slice(0, 2)).toEqual(['tool_text', 'tool_select'])
    expect(out.overflow).toEqual(['tool_line'])
  })

  it('marks the first tool of each group for a divider', () => {
    const c = document.createElement('div')
    c.innerHTML = ['tool_select', 'ext-panning', 'tool_fhpath', 'tool_path', 'tool_text', 'tools_overflow']
      .map((id) => `<span id="${id}"></span>`).join('')
    markToolGroups(c)
    const starts = [...c.children].filter((e) => e.classList.contains('tool-group-start')).map((e) => e.id)
    expect(starts).toEqual(['tool_fhpath', 'tool_text'])
  })
})
