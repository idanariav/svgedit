import { describe, it, expect } from 'vitest'
import { resolvePressTarget, PRESS_RULES } from '../../packages/svgcanvas/core/press-target.ts'

// Roadmap R10: the press rules, tested together. Two of them interacting was the 2026-11-24 selection bug (34a8b370), so
// the table below presses through each pair of situations, not each rule on its own.
const el = (name) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  node.id = name
  return node
}
const root = el('root')
const grips = el('grips')
const red = el('red') // a filled shape on top
const blue = el('blue') // a shape under it
const line = el('line') // a fill-less line
const text = el('text') // an area text

/** A press: what the native hit test found, what is selected, and what the probes would answer. */
const press = ({ hit = root, selected = [], shift = false, rightClick = false, mode = 'select', under = [], near = null, areaText = null, inBox = false, openPath = [] } = {}) =>
  resolvePressTarget({
    mode,
    hit,
    root,
    grips,
    selected,
    shift,
    rightClick,
    probes: {
      elementsAt: () => under,
      strokeNear: () => near,
      areaTextAt: () => areaText,
      inSelectionBox: () => inBox,
      isOpenPath: (e) => openPath.includes(e)
    }
  })

const pick = (r) => ({ target: r.target.id, clickSelect: r.clickSelect?.id ?? null, rule: r.rule })

describe('press target rules', () => {
  it('are ranked: prefer-selected, stroke-near, area-text, selection-box', () => {
    expect(PRESS_RULES.map((r) => r.name)).toEqual(['prefer-selected', 'stroke-near', 'area-text', 'selection-box'])
  })

  it.each([
    ['a plain press takes the native hit', {}, { hit: red }, { target: 'red', clickSelect: null, rule: 'hit' }],
    ['a press over a shape covering the selection takes the selection; a click selects the shape pressed',
      { hit: red, selected: [blue], under: [red, blue] }, {}, { target: 'blue', clickSelect: 'red', rule: 'prefer-selected' }],
    ['a press on empty canvas over the selection takes it, and a click selects nothing else',
      { hit: root, selected: [blue], under: [blue] }, {}, { target: 'blue', clickSelect: null, rule: 'prefer-selected' }],
    ['Shift adds: the covering shape is taken, not the selection',
      { hit: red, selected: [blue], under: [red, blue], shift: true }, {}, { target: 'red', clickSelect: null, rule: 'hit' }],
    ['a press on one member of a multi-selection keeps it for a drag, and a click selects that member',
      { hit: red, selected: [red, blue] }, {}, { target: 'red', clickSelect: 'red', rule: 'prefer-selected' }],
    ['a line within reach wins over the filled shape pressed',
      { hit: red, near: line }, {}, { target: 'line', clickSelect: null, rule: 'stroke-near' }],
    ['a line within reach wins over a preferred selection, and the click no longer selects the covering shape',
      { hit: red, selected: [blue], under: [red, blue], near: line }, {}, { target: 'line', clickSelect: null, rule: 'stroke-near' }],
    ['an area text\'s empty box is the text', { hit: root, areaText: text }, {}, { target: 'text', clickSelect: null, rule: 'area-text' }],
    ['an area text under the selection box is the text, not the selection',
      { hit: root, areaText: text, selected: [blue], inBox: true }, {}, { target: 'text', clickSelect: null, rule: 'area-text' }],
    ['empty canvas inside the selection box takes the selection',
      { hit: root, selected: [blue], inBox: true }, {}, { target: 'blue', clickSelect: null, rule: 'selection-box' }],
    ['the box of one open line alone is not a handle',
      { hit: root, selected: [line], inBox: true, openPath: [line] }, {}, { target: 'root', clickSelect: null, rule: 'hit' }],
    ['the box of a line among others is a handle',
      { hit: root, selected: [line, blue], inBox: true, openPath: [line] }, {}, { target: 'line', clickSelect: null, rule: 'selection-box' }],
    ['Shift on empty canvas inside the box starts a marquee', { hit: root, selected: [blue], inBox: true, shift: true }, {}, { target: 'root', clickSelect: null, rule: 'hit' }],
    ['a grip is a grip, whatever is near it', { hit: grips, selected: [blue], near: line, under: [blue] }, {}, { target: 'grips', clickSelect: null, rule: 'hit' }],
    ['a right-click keeps what was hit (the context menu acts on the selection)',
      { hit: red, selected: [blue], under: [red, blue], near: line, rightClick: true }, {}, { target: 'red', clickSelect: null, rule: 'hit' }],
    ['outside select mode no rule applies', { hit: red, near: line, mode: 'rect' }, {}, { target: 'red', clickSelect: null, rule: 'hit' }]
  ])('%s', (_name, situation, extra, expected) => {
    expect(pick(press({ ...situation, ...extra }))).toEqual(expected)
  })
})
