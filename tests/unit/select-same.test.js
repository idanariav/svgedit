import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import {
  SELECT_SAME_CRITERIA, colorDistance, appearanceOf, samePaint, matchesSame, init
} from '../../packages/svgcanvas/core/select-same.js'

const make = (tag, attrs = {}, parent = document.body) => {
  const el = document.createElementNS(NS.SVG, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  parent.append(el)
  return el
}

describe('colorDistance', () => {
  it('is 0 for the same colour in any notation and 100 from black to white', () => {
    expect(colorDistance('#ff0000', 'red')).toBeCloseTo(0, 6)
    expect(colorDistance('#fff', '#ffffff')).toBeCloseTo(0, 6)
    expect(colorDistance('#000000', '#ffffff')).toBeCloseTo(100, 3)
  })

  it('orders colours by how different they look', () => {
    const near = colorDistance('#336699', '#346a9b')
    const mid = colorDistance('#336699', '#3a78b0')
    const far = colorDistance('#336699', '#cc3333')
    expect(near).toBeLessThan(mid)
    expect(mid).toBeLessThan(far)
    expect(near).toBeLessThan(2)
  })

  it('is Infinity when either side is not a plain colour', () => {
    expect(colorDistance('none', '#fff')).toBe(Infinity)
    expect(colorDistance('url(#g)', '#fff')).toBe(Infinity)
    expect(colorDistance('#fff', '')).toBe(Infinity)
  })
})

describe('appearanceOf', () => {
  afterEach(() => { document.body.textContent = '' })

  it('applies the SVG defaults: black fill, no stroke, opacity 1, and no weight without a stroke', () => {
    expect(appearanceOf(make('rect'))).toEqual({ fill: '#000000', stroke: 'none', strokeWidth: 0, opacity: 1 })
    expect(appearanceOf(make('rect', { stroke: '#F00', fill: 'NONE', opacity: '0.5' })))
      .toEqual({ fill: 'none', stroke: '#f00', strokeWidth: 1, opacity: 0.5 })
    expect(appearanceOf(make('rect', { stroke: 'red', 'stroke-width': '3' })).strokeWidth).toBe(3)
  })

  it('reads a tapered path as the stroked line it stands for', () => {
    const tapered = make('path', { fill: '#ff0000', 'se:taper': '30,30', 'se:taper-style': '6|#0000FF' })
    expect(appearanceOf(tapered)).toEqual({ fill: 'none', stroke: '#0000ff', strokeWidth: 6, opacity: 1 })
  })
})

describe('samePaint / matchesSame', () => {
  afterEach(() => { document.body.textContent = '' })

  it('tolerance 0 is an exact match of the (normalised) text, exactly as before', () => {
    expect(samePaint('#ff0000', '#ff0000', 0)).toBe(true)
    expect(samePaint('#fff', '#ffffff', 0)).toBe(false)
    expect(samePaint('red', '#ff0000', 0)).toBe(false)
    expect(samePaint('url(#g)', 'url(#g)', 0)).toBe(true)
    expect(samePaint('none', 'none', 50)).toBe(true)
  })

  it('a tolerance accepts colours within that distance, in any notation, but never none / gradients', () => {
    expect(samePaint('#fff', '#ffffff', 1)).toBe(true)
    expect(samePaint('#336699', '#346a9b', 2)).toBe(true)
    expect(samePaint('#336699', '#cc3333', 10)).toBe(false)
    expect(samePaint('#336699', '#cc3333', 100)).toBe(true)
    expect(samePaint('none', '#000000', 100)).toBe(false)
    expect(samePaint('url(#a)', 'url(#b)', 100)).toBe(false)
  })

  it('each criterion compares its own property', () => {
    const ref = make('rect', { fill: '#ff0000', stroke: '#000000', 'stroke-width': '2', opacity: '0.5' })
    const same = (attrs, tag = 'rect') => make(tag, attrs)
    expect(matchesSame('fill', ref, same({ fill: '#FF0000' }))).toBe(true)
    expect(matchesSame('fill', ref, same({ fill: '#00ff00' }))).toBe(false)
    expect(matchesSame('stroke', ref, same({ stroke: '#000000', fill: '#00ff00' }))).toBe(true)
    expect(matchesSame('fillstroke', ref, same({ fill: '#ff0000', stroke: '#000000' }))).toBe(true)
    expect(matchesSame('fillstroke', ref, same({ fill: '#ff0000', stroke: '#111111' }))).toBe(false)
    expect(matchesSame('strokeweight', ref, same({ stroke: 'red', 'stroke-width': '2' }))).toBe(true)
    expect(matchesSame('strokeweight', ref, same({ stroke: 'red', 'stroke-width': '3' }))).toBe(false)
    expect(matchesSame('opacity', ref, same({ opacity: '0.5' }))).toBe(true)
    expect(matchesSame('opacity', ref, same({}))).toBe(false)
    expect(matchesSame('type', ref, same({}, 'rect'))).toBe(true)
    expect(matchesSame('type', ref, same({}, 'circle'))).toBe(false)
  })

  it('unstroked shapes all share "no stroke weight", whatever stroke-width they carry', () => {
    const ref = make('rect')
    expect(matchesSame('strokeweight', ref, make('circle', { 'stroke-width': '9' }))).toBe(true)
    expect(matchesSame('strokeweight', ref, make('circle', { stroke: 'red' }))).toBe(false)
  })

  it('a tolerance applies to fill, stroke and both, not to weight or opacity', () => {
    const ref = make('rect', { fill: '#336699', stroke: '#336699', 'stroke-width': '2' })
    const close = make('rect', { fill: '#346a9b', stroke: '#346a9b', 'stroke-width': '2.5' })
    expect(matchesSame('fill', ref, close, 0)).toBe(false)
    expect(matchesSame('fill', ref, close, 3)).toBe(true)
    expect(matchesSame('fillstroke', ref, close, 3)).toBe(true)
    expect(matchesSame('strokeweight', ref, close, 100)).toBe(false)
  })

  it('a tapered path matches by its stroke colour, not by its fill', () => {
    const ref = make('path', { stroke: '#0000ff', fill: 'none' })
    const tapered = make('path', { fill: '#0000ff', 'se:taper': '30,30', 'se:taper-style': '4|#0000ff' })
    expect(matchesSame('stroke', ref, tapered)).toBe(true)
    expect(matchesSame('fill', ref, tapered)).toBe(true) // both are unfilled lines
    expect(matchesSame('fill', make('rect', { fill: '#0000ff' }), tapered)).toBe(false)
  })
})

describe('svgCanvas.selectSameAs', () => {
  let canvas
  let content
  let layer
  let selected
  let group

  const item = (tag, id, attrs = {}, parent = layer) => make(tag, { id, ...attrs }, parent)
  /** ids passed to the most recent selectOnly call */
  const picked = () => canvas.selectOnly.mock.calls.at(-1)[0].map((el) => el.id)

  beforeEach(() => {
    content = make('svg')
    layer = make('g', { class: 'layer' }, content)
    make('title', {}, layer)
    selected = []
    group = null
    canvas = {
      getSelectedElements: () => selected,
      getCurrentGroup: () => group,
      getSvgContent: () => content,
      selectOnly: vi.fn((els) => { selected = els })
    }
    init(canvas)
  })
  afterEach(() => { document.body.textContent = '' })

  it('lists the criteria the editor offers', () => {
    expect(SELECT_SAME_CRITERIA).toEqual(['fill', 'stroke', 'type', 'fillstroke', 'strokeweight', 'opacity'])
  })

  it('selects every visible-layer element that matches, the reference included', () => {
    selected = [item('rect', 'a', { fill: '#ff0000' })]
    item('circle', 'b', { fill: '#ff0000' })
    item('rect', 'c', { fill: '#00ff00' })
    const hidden = make('g', { class: 'layer', display: 'none' }, content)
    item('rect', 'd', { fill: '#ff0000' }, hidden)
    canvas.selectSameAs('fill')
    expect(picked()).toEqual(['a', 'b'])
    expect(canvas.selectOnly.mock.calls[0][1]).toBe(true)
  })

  it('skips titles and frames', () => {
    selected = [item('rect', 'a', { fill: '#ff0000' })]
    item('rect', 'frame', { fill: '#ff0000', 'data-frame': '1' })
    canvas.selectSameAs('fill')
    expect(picked()).toEqual(['a'])
  })

  it('passes the tolerance through, and treats a missing or negative one as exact', () => {
    selected = [item('rect', 'a', { fill: '#336699' })]
    item('rect', 'b', { fill: '#346a9b' })
    canvas.selectSameAs('fill')
    expect(picked()).toEqual(['a'])
    canvas.selectSameAs('fill', { tolerance: -5 })
    expect(picked()).toEqual(['a'])
    canvas.selectSameAs('fill', { tolerance: 3 })
    expect(picked()).toEqual(['a', 'b'])
  })

  it('scans only the current group when one is open', () => {
    item('rect', 'outside', { fill: '#ff0000' })
    group = item('g', 'grp')
    selected = [item('rect', 'inside', { fill: '#ff0000' }, group)]
    item('rect', 'other', { fill: '#ff0000' }, group)
    canvas.selectSameAs('fill')
    expect(picked()).toEqual(['inside', 'other'])
  })

  it('does nothing without a selection', () => {
    item('rect', 'a')
    canvas.selectSameAs('fill')
    expect(canvas.selectOnly).not.toHaveBeenCalled()
  })

  it('matches by opacity, weight and fill-and-stroke too', () => {
    selected = [item('rect', 'a', { opacity: '0.5', stroke: '#000', 'stroke-width': '2' })]
    item('rect', 'b', { opacity: '0.5' })
    item('rect', 'c', { stroke: '#111', 'stroke-width': '2' })
    canvas.selectSameAs('opacity')
    expect(picked()).toEqual(['a', 'b'])
    selected = [layer.querySelector('#a')]
    canvas.selectSameAs('strokeweight')
    expect(picked()).toEqual(['a', 'c'])
    selected = [layer.querySelector('#a')]
    canvas.selectSameAs('fillstroke', { tolerance: 10 })
    expect(picked()).toEqual(['a']) // #000 against #111 is about 18 apart
    selected = [layer.querySelector('#a')]
    canvas.selectSameAs('fillstroke', { tolerance: 20 })
    expect(picked()).toEqual(['a', 'c'])
  })
})
