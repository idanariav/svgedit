import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import { copyStyle, readStyle, styleSourceOf, styleTargetsOf } from '../../src/editor/styleCopy.js'

describe('styleCopy', () => {
  let root
  let svgCanvas
  let editor
  let transacted

  const make = (tagName, attrs = {}, parent = root) => {
    const el = document.createElementNS(NS.SVG, tagName)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    parent.append(el)
    return el
  }

  beforeEach(() => {
    root = document.createElementNS(NS.SVG, 'svg')
    document.body.append(root)
    transacted = []
    svgCanvas = {
      transact: vi.fn((label, fn) => { transacted.push(label); return fn() }),
      getElement: (id) => document.getElementById(id),
      history: { BatchCommand: class { addSubCommand () {} } }
    }
    editor = { svgCanvas }
  })
  afterEach(() => { document.body.textContent = '' })

  it('copies paint and stroke attributes and removes the ones the source lacks, in one transaction', () => {
    const source = make('rect', { fill: '#ff0000', stroke: '#00ff00', 'stroke-width': '4', 'stroke-dasharray': '4 2', 'stroke-linecap': 'round', opacity: '0.5' })
    const target = make('ellipse', { fill: '#000000', 'stroke-linejoin': 'bevel', 'fill-opacity': '0.3' })
    expect(copyStyle(editor, source, [target])).toBe(1)
    expect(transacted).toEqual(['Copy style'])
    expect(target.getAttribute('fill')).toBe('#ff0000')
    expect(target.getAttribute('stroke')).toBe('#00ff00')
    expect(target.getAttribute('stroke-width')).toBe('4')
    expect(target.getAttribute('stroke-dasharray')).toBe('4 2')
    expect(target.getAttribute('stroke-linecap')).toBe('round')
    expect(target.getAttribute('opacity')).toBe('0.5')
    expect(target.hasAttribute('stroke-linejoin')).toBe(false)
    expect(target.hasAttribute('fill-opacity')).toBe(false)
  })

  it('shares a gradient fill by reference', () => {
    const source = make('rect', { fill: 'url(#grad1)' })
    const target = make('rect', { fill: '#000000' })
    copyStyle(editor, source, [target])
    expect(target.getAttribute('fill')).toBe('url(#grad1)')
  })

  it('copies font attributes only between text elements', () => {
    const text = make('text', { 'font-family': 'Georgia', 'font-size': '30', 'font-weight': 'bold', fill: '#111111' })
    const otherText = make('text', { 'font-family': 'Arial', 'font-style': 'italic' })
    const rect = make('rect', { 'font-size': '99' })
    copyStyle(editor, text, [otherText, rect])
    expect(otherText.getAttribute('font-family')).toBe('Georgia')
    expect(otherText.getAttribute('font-size')).toBe('30')
    expect(otherText.hasAttribute('font-style')).toBe(false)
    expect(rect.getAttribute('font-size')).toBe('99') // untouched: a rect has no font
    expect(rect.getAttribute('fill')).toBe('#111111') // but still takes the paint
    // and a shape source never wipes a text target's font
    const shape = make('rect', { fill: '#222222' })
    copyStyle(editor, shape, [otherText])
    expect(otherText.getAttribute('font-family')).toBe('Georgia')
  })

  it('reads a tapered source through se:taper-style and leaves tapered targets alone', () => {
    const tapered = make('path', { fill: '#ff0000', 'se:taper': '30,30', 'se:taper-style': '6|#0000ff' })
    expect(Object.fromEntries(readStyle(tapered))).toMatchObject({ fill: 'none', stroke: '#0000ff', 'stroke-width': '6' })
    const plain = make('path', { fill: '#000000' })
    const otherTapered = make('path', { fill: '#ff00ff', 'se:taper': '10,10', 'se:taper-style': '2|#00ff00' })
    expect(copyStyle(editor, tapered, [plain, otherTapered])).toBe(1)
    expect(plain.getAttribute('stroke')).toBe('#0000ff')
    expect(plain.getAttribute('stroke-width')).toBe('6')
    expect(plain.getAttribute('fill')).toBe('none')
    expect(otherTapered.getAttribute('fill')).toBe('#ff00ff')
    expect(otherTapered.getAttribute('se:taper-style')).toBe('2|#00ff00')
  })

  it('uses the first shape of a group as the source and restyles the shapes inside a group target', () => {
    const group = make('g')
    make('title', {}, group)
    const inner = make('rect', { fill: '#123456' }, group)
    make('rect', { fill: '#654321' }, group)
    expect(styleSourceOf(group)).toBe(inner)
    const targetGroup = make('g')
    const nested = make('g', {}, targetGroup)
    const a = make('rect', {}, nested)
    const b = make('circle', {}, targetGroup)
    expect(styleTargetsOf(targetGroup)).toEqual([a, b])
    expect(copyStyle(editor, group, [targetGroup])).toBe(2)
    expect(a.getAttribute('fill')).toBe('#123456')
    expect(b.getAttribute('fill')).toBe('#123456')
    expect(targetGroup.hasAttribute('fill')).toBe(false)
    expect(styleSourceOf(make('g'))).toBeNull()
  })

  it('never restyles the source itself and does nothing without targets', () => {
    const source = make('rect', { fill: '#ff0000' })
    expect(copyStyle(editor, source, [source])).toBe(0)
    expect(copyStyle(editor, source, [])).toBe(0)
    expect(copyStyle(editor, make('g'), [source])).toBe(0)
    expect(svgCanvas.transact).not.toHaveBeenCalled()
  })

  describe('markers', () => {
    let defs
    const marker = (id, extra = {}) => {
      const m = make('marker', { id, ...extra }, defs)
      make('path', { fill: '#ff0000' }, m)
      return m
    }
    beforeEach(() => { defs = make('defs') })

    it('clones the source\'s markers for the target, with ids derived from the target', () => {
      make('rect') // unrelated sibling
      const source = make('path', { id: 'src', 'marker-start': 'url(#mkr_start_src)', 'marker-end': 'url(#mkr_end_src)' })
      marker('mkr_start_src', { se_type: 'leftarrow' })
      marker('mkr_end_src', { se_type: 'box' })
      const target = make('path', { id: 'tgt', 'marker-start': 'url(#mkr_start_tgt)', 'marker-mid': 'url(#mkr_mid_tgt)' })
      marker('mkr_start_tgt', { se_type: 'circle' })
      marker('mkr_mid_tgt', { se_type: 'star' })
      copyStyle(editor, source, [target])
      expect(target.getAttribute('marker-start')).toBe('url(#mkr_start_tgt)')
      expect(document.getElementById('mkr_start_tgt').getAttribute('se_type')).toBe('leftarrow')
      expect(document.getElementById('mkr_start_tgt').parentNode).toBe(defs)
      expect(target.getAttribute('marker-end')).toBe('url(#mkr_end_tgt)')
      expect(document.getElementById('mkr_end_tgt').getAttribute('se_type')).toBe('box')
      // The source keeps its own; the target's mid marker (absent on the source) is gone with its definition.
      expect(source.getAttribute('marker-start')).toBe('url(#mkr_start_src)')
      expect(target.hasAttribute('marker-mid')).toBe(false)
      expect(document.getElementById('mkr_mid_tgt')).toBeNull()
      expect(document.querySelectorAll('marker#mkr_start_tgt').length).toBe(1)
    })

    it('shares a marker this editor did not create, and skips shapes that cannot draw markers', () => {
      marker('imported')
      const source = make('path', { 'marker-end': 'url(#imported)' })
      const target = make('polyline')
      const rect = make('rect')
      copyStyle(editor, source, [target, rect])
      expect(target.getAttribute('marker-end')).toBe('url(#imported)')
      expect(rect.hasAttribute('marker-end')).toBe(false)
    })

    it('does not give a <line> a mid marker', () => {
      marker('m1', { se_type: 'box' })
      const source = make('path', { 'marker-mid': 'url(#m1)' })
      const line = make('line', { id: 'ln' })
      copyStyle(editor, source, [line])
      expect(line.hasAttribute('marker-mid')).toBe(false)
    })
  })

  describe('effects', () => {
    const api = (store) => ({
      read: vi.fn((el) => store.get(el) ?? null),
      apply: vi.fn((el, params) => { if (params.remove) store.delete(el); else store.set(el, params) })
    })

    it('re-applies the source\'s shadow, outline and glow to each target through the extension APIs', () => {
      const shadows = new Map()
      const outlines = new Map()
      const glows = new Map()
      editor.shadowApi = api(shadows)
      editor.outlineApi = api(outlines)
      editor.glowApi = api(glows)
      const source = make('rect')
      const a = make('rect')
      const b = make('rect')
      shadows.set(source, { angle: 90, length: 8, blur: 4, opacity: 0.5, color: '#000000' })
      glows.set(source, { outer: { blur: 6, color: '#ffff00', opacity: 0.8 }, inner: null, feather: null })
      copyStyle(editor, source, [a, b])
      expect(shadows.get(a)).toEqual(shadows.get(source))
      expect(shadows.get(b)).toEqual(shadows.get(source))
      expect(glows.get(a)).toEqual(glows.get(source))
      expect(outlines.size).toBe(0)
      expect(editor.outlineApi.apply).not.toHaveBeenCalled()
    })

    it('removes an effect from the target when the source has none', () => {
      const shadows = new Map()
      editor.shadowApi = api(shadows)
      const source = make('rect')
      const target = make('rect')
      shadows.set(target, { angle: 0, length: 5, blur: 1, opacity: 1, color: '#000000' })
      copyStyle(editor, source, [target])
      expect(editor.shadowApi.apply).toHaveBeenCalledWith(target, { remove: true }, expect.anything())
      expect(shadows.has(target)).toBe(false)
    })

    it('works without the effect extensions loaded', () => {
      const source = make('rect', { fill: '#fff000' })
      const target = make('rect')
      expect(copyStyle(editor, source, [target])).toBe(1)
      expect(target.getAttribute('fill')).toBe('#fff000')
    })
  })
})
