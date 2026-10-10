import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { parseBrush, formatBrush, sanitizeOptions } from '../../packages/svgcanvas/core/art-brush-canvas.js'

describe('brush attribute', () => {
  it('parses and formats, filling defaults and clamping', () => {
    expect(parseBrush('art(scale=proportional,width=150,flipAlong=1,dir=ttb)')).toEqual({
      type: 'art', opts: { scale: 'proportional', width: 150, flipAlong: true, flipAcross: false, dir: 'ttb' }
    })
    expect(parseBrush('pattern(fit=addSpace,spacing=20)').opts).toMatchObject({ fit: 'addSpace', spacing: 20, scale: 100 })
    expect(parseBrush('art()').opts).toMatchObject({ scale: 'stretch', width: 100, dir: 'ltr' })
    expect(parseBrush('blob(x=1)')).toBeNull()
    expect(parseBrush(null)).toBeNull()
    expect(sanitizeOptions('art', { width: 99999, dir: 'sideways' })).toMatchObject({ width: 1000, dir: 'ltr' })
    expect(sanitizeOptions('pattern', { scale: 0, fit: 'nope' })).toMatchObject({ scale: 5, fit: 'stretch' })
    const s = formatBrush('pattern', { spacing: 10, flipAcross: true })
    expect(parseBrush(s).opts).toMatchObject({ spacing: 10, flipAcross: true })
  })
})

describe('art brushes on the canvas', () => {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
    const host = document.createElement('div')
    host.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(host)
    const toolsLeft = document.createElement('div')
    toolsLeft.id = 'tools_left'
    document.body.append(workarea, toolsLeft)
    svgCanvas = new SvgCanvas(host, {
      canvas_expansion: 3,
      dimensions: [640, 480],
      initFill: { color: 'FF0000', opacity: 1 },
      initStroke: { width: 5, color: '000000', opacity: 1 },
      initOpacity: 1,
      imgPath: '../editor/images',
      langPath: 'locale/',
      extPath: 'extensions/',
      extensions: [],
      initTool: 'select',
      wireframe: false
    })
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  const make = (element, attr) => svgCanvas.addSVGElementsFromJson({
    element, attr: { id: svgCanvas.getNextId(), ...attr }
  })
  const art = () => make('rect', { x: 0, y: 0, width: 20, height: 6, fill: '#ff0000', stroke: '#000000', 'stroke-width': 2 })
  const spineOf = (id) => make('path', { id, d: 'M0,100 L200,100', stroke: '#0000ff', 'stroke-width': 4, fill: 'none', opacity: 0.8 })
  const newBrush = (type = 'art') => {
    svgCanvas.selectOnly([art()], true)
    return svgCanvas.makeArtBrush(type)
  }
  const part = (g, name) => [...g.children].find((c) => c.hasAttribute(`se:art-${name}`)) ?? null
  const checks = () => svgCanvas.checkDrawing().filter((f) => /art-brush|se-attr/.test(f.code))

  it('a brush is made from the selected art, in the drawing\'s defs, in one undo step', () => {
    expect(svgCanvas.canMakeArtBrush()).toBe(false)
    const rect = art()
    svgCanvas.selectOnly([rect], true)
    expect(svgCanvas.canMakeArtBrush()).toBe(true)
    const before = svgCanvas.undoMgr.getUndoStackSize()
    const id = svgCanvas.makeArtBrush('art')
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
    expect(svgCanvas.getArtBrushLibrary()).toEqual([{ id, name: 'Art brush 1', type: 'art' }])
    const def = document.getElementById(id)
    expect(def.parentNode.tagName).toBe('defs')
    expect(def.children).toHaveLength(1)
    expect(def.children[0].getAttribute('fill')).toBe('#ff0000')
    expect(def.children[0].id).toBe('') // copies never repeat an id
    expect(document.getElementById(rect.id)).toBe(rect) // the art stays on the canvas
    expect(svgCanvas.makeArtBrush('pattern')).not.toBeNull()
    expect(svgCanvas.getArtBrushLibrary().map((b) => b.name)).toEqual(['Art brush 1', 'Pattern brush 1'])
    svgCanvas.undoMgr.undo()
    expect(svgCanvas.getArtBrushLibrary()).toHaveLength(1)
    expect(checks()).toEqual([])
  })

  it('nothing selected, or text, makes no brush', () => {
    expect(svgCanvas.makeArtBrush('art')).toBeNull()
    const text = make('text', { x: 0, y: 0 })
    svgCanvas.selectOnly([text], true)
    expect(svgCanvas.makeArtBrush('art')).toBeNull()
  })

  it('applying a brush replaces the path with a group: the id, the transform, a hidden spine, the art', () => {
    const brush = newBrush()
    const path = spineOf('sp')
    path.setAttribute('transform', 'translate(10 20)')
    svgCanvas.selectOnly([path], true)
    expect(svgCanvas.canApplyArtBrush(path)).toBe(true)
    const before = svgCanvas.undoMgr.getUndoStackSize()
    const [g] = svgCanvas.applyArtBrush(brush)
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
    expect(g.tagName).toBe('g')
    expect(g.id).toBe('sp')
    expect(g.getAttribute('transform')).toMatch(/translate/)
    expect(g.getAttribute('se:art-brush')).toMatch(/^art\(/)
    const spine = part(g, 'spine')
    expect(spine.getAttribute('d')).toBe('M0,100 L200,100')
    expect(spine.getAttribute('opacity')).toBe('0')
    expect(spine.getAttribute('se:art-opacity')).toBe('0.8')
    expect(spine.id).not.toBe('sp')
    expect(spine.hasAttribute('transform')).toBe(false)
    const src = part(g, 'src')
    expect(src.getAttribute('display')).toBe('none')
    const out = part(g, 'out')
    expect(out.children).toHaveLength(1)
    expect(out.firstChild.getAttribute('fill')).toBe('#ff0000')
    expect(out.firstChild.getAttribute('stroke-width')).toBe('2') // stretch keeps the art's thickness
    expect(svgCanvas.getSelectedElements()).toEqual([g])
    expect(checks()).toEqual([])

    svgCanvas.undoMgr.undo()
    const back = document.getElementById('sp')
    expect(back.tagName).toBe('path')
    expect(back.getAttribute('opacity')).toBe('0.8')
    svgCanvas.undoMgr.redo()
    expect(document.getElementById('sp').tagName).toBe('g')
    expect(checks()).toEqual([])
  })

  it('shapes work as spines; text, live geometry and groups of other things do not', () => {
    const brush = newBrush()
    const circle = make('circle', { cx: 50, cy: 50, r: 30, fill: 'none', stroke: '#000000' })
    expect(svgCanvas.canApplyArtBrush(circle)).toBe(true)
    svgCanvas.selectOnly([circle], true)
    const [g] = svgCanvas.applyArtBrush(brush)
    expect(part(g, 'spine').getAttribute('d')).toMatch(/^M/)
    expect(svgCanvas.canApplyArtBrush(make('text', { x: 0, y: 0 }))).toBe(false)
    expect(svgCanvas.canApplyArtBrush(make('path', { d: 'M0,0 L5,5', 'se:fx-d': 'M0,0 L5,5' }))).toBe(false)
    expect(svgCanvas.canApplyArtBrush(null)).toBe(false)
  })

  it('options change the art, in one undo step', () => {
    const brush = newBrush()
    svgCanvas.selectOnly([spineOf('sp')], true)
    const [g] = svgCanvas.applyArtBrush(brush)
    const height = () => {
      const ys = [...part(g, 'out').querySelector('path').getAttribute('d').matchAll(/,(-?[\d.]+)/g)].map((m) => +m[1])
      return Math.max(...ys) - Math.min(...ys)
    }
    expect(height()).toBeCloseTo(6, 1)
    const before = svgCanvas.undoMgr.getUndoStackSize()
    svgCanvas.setArtBrushOptions({ width: 200 })
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
    expect(svgCanvas.getArtBrush(g).opts.width).toBe(200)
    expect(height()).toBeCloseTo(12, 1)
    svgCanvas.undoMgr.undo()
    expect(svgCanvas.getArtBrush(g).opts.width).toBe(100)
  })

  it('a pattern brush tiles', () => {
    const brush = newBrush('pattern')
    svgCanvas.selectOnly([spineOf('sp')], true)
    const [g] = svgCanvas.applyArtBrush(brush)
    expect(g.getAttribute('se:art-brush')).toMatch(/^pattern\(/)
    expect(part(g, 'out').children).toHaveLength(10) // 200 long, tiles 20 wide
    svgCanvas.setArtBrushOptions({ spacing: 100, fit: 'addSpace' })
    expect(part(g, 'out').children).toHaveLength(5) // floor((200 + 20) / 40)
    expect(checks()).toEqual([])
  })

  it('editing the spine regenerates the art; the same spine does nothing', () => {
    const brush = newBrush()
    svgCanvas.selectOnly([spineOf('sp')], true)
    const [g] = svgCanvas.applyArtBrush(brush)
    const spine = part(g, 'spine')
    const first = part(g, 'out').querySelector('path')
    expect(svgCanvas.refreshArtBrush(spine)).toBe(false) // up to date
    spine.setAttribute('d', 'M0,100 L400,100')
    expect(svgCanvas.refreshArtBrush(spine)).toBe(true)
    const xs = [...part(g, 'out').querySelector('path').getAttribute('d').matchAll(/(-?[\d.]+),/g)].map((m) => +m[1])
    expect(Math.max(...xs)).toBeCloseTo(400, 0)
    expect(part(g, 'out').querySelector('path')).not.toBe(first)
    expect(svgCanvas.refreshArtBrush(document.body)).toBe(false)
    expect(svgCanvas.refreshArtBrush(null)).toBe(false)
  })

  it('choosing another brush on a brushed path swaps the art and keeps the spine', () => {
    const a = newBrush('art')
    svgCanvas.selectOnly([spineOf('sp')], true)
    const [g] = svgCanvas.applyArtBrush(a)
    const spineId = part(g, 'spine').id
    const b = newBrush('pattern')
    svgCanvas.selectOnly([g], true)
    const [again] = svgCanvas.applyArtBrush(b)
    expect(again).toBe(g)
    expect(part(g, 'spine').id).toBe(spineId)
    expect(g.getAttribute('se:art-brush')).toMatch(/^pattern\(/)
    expect(part(g, 'out').children.length).toBeGreaterThan(1)
  })

  it('expand keeps the art as plain paths; release gives the path back', () => {
    const brush = newBrush()
    svgCanvas.selectOnly([spineOf('sp')], true)
    const [g] = svgCanvas.applyArtBrush(brush)
    svgCanvas.setArtBrushOptions({ width: 150 })
    const expanded = svgCanvas.expandArtBrush()
    expect(expanded).toEqual([g])
    expect(g.hasAttribute('se:art-brush')).toBe(false)
    expect([...g.children].map((c) => c.tagName)).toEqual(['path'])
    expect(part(g, 'spine')).toBeNull()
    svgCanvas.undoMgr.undo()
    expect(g.hasAttribute('se:art-brush')).toBe(true)
    expect(part(g, 'spine')).not.toBeNull()

    svgCanvas.selectOnly([g], true)
    const [path] = svgCanvas.releaseArtBrush()
    expect(path.tagName).toBe('path')
    expect(path.id).toBe('sp')
    expect(path.getAttribute('opacity')).toBe('0.8')
    expect(path.getAttribute('d')).toBe('M0,100 L200,100')
    expect(path.hasAttribute('se:art-spine')).toBe(false)
    expect(path.hasAttribute('se:art-opacity')).toBe(false)
    expect(checks()).toEqual([])
  })

  it('deleting a brush leaves strokes already brushed alone', () => {
    const brush = newBrush()
    svgCanvas.selectOnly([spineOf('sp')], true)
    const [g] = svgCanvas.applyArtBrush(brush)
    expect(svgCanvas.deleteArtBrush(brush)).toBe(true)
    expect(svgCanvas.getArtBrushLibrary()).toEqual([])
    expect(svgCanvas.deleteArtBrush('nope')).toBe(false)
    expect(svgCanvas.setArtBrushOptions({ width: 120 })).toEqual([g])
    expect(part(g, 'out').children).toHaveLength(1)
  })

  it('checkDrawing flags a malformed brush attribute; a group that lost a part is just a group', () => {
    const brush = newBrush()
    svgCanvas.selectOnly([spineOf('sp')], true)
    const [g] = svgCanvas.applyArtBrush(brush)
    part(g, 'out').remove()
    expect(svgCanvas.getArtBrushGroup(g)).toBeNull()
    expect(svgCanvas.refreshArtBrush(g)).toBe(false)
    expect(svgCanvas.setArtBrushOptions({ width: 150 })).toEqual([])
    expect(checks()).toEqual([])
    g.setAttribute('se:art-brush', 'blob()')
    expect(svgCanvas.checkDrawing().some((f) => f.code === 'se-attr-parse')).toBe(true)
  })

  it('regenerating the same art writes the same document: ids stay, a freshly loaded group is not rewritten', () => {
    const brush = newBrush('pattern')
    svgCanvas.selectOnly([spineOf('sp')], true)
    const [g] = svgCanvas.applyArtBrush(brush)
    const ids = () => [...part(g, 'out').children].map((c) => c.id)
    const before = ids()
    const spine = part(g, 'spine')
    spine.setAttribute('d', 'M0,100 L200,100 L200,140')
    svgCanvas.refreshArtBrush(spine)
    expect(ids().slice(0, before.length)).toEqual(before) // the places that were there keep their ids
    spine.setAttribute('d', 'M0,100 L200,100')
    svgCanvas.refreshArtBrush(spine)
    expect(ids()).toEqual(before)
  })

  it('going back to an earlier spine (an undo, a redo) puts back the very same paths', () => {
    const brush = newBrush()
    svgCanvas.selectOnly([spineOf('sp')], true)
    const [g] = svgCanvas.applyArtBrush(brush)
    const spine = part(g, 'spine')
    const first = part(g, 'out').firstChild
    spine.setAttribute('d', 'M0,100 L400,100')
    svgCanvas.refreshArtBrush(spine)
    const second = part(g, 'out').firstChild
    expect(second).not.toBe(first)
    spine.setAttribute('d', 'M0,100 L200,100')
    expect(svgCanvas.refreshArtBrush(spine)).toBe(true)
    expect(part(g, 'out').firstChild).toBe(first)
    spine.setAttribute('d', 'M0,100 L400,100')
    svgCanvas.refreshArtBrush(spine)
    expect(part(g, 'out').firstChild).toBe(second)
  })
})
