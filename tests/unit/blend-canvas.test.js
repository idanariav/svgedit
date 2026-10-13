import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { parseBlend, formatBlend, sanitizeBlendOptions, blendParts } from '../../packages/svgcanvas/core/blend-canvas.js'
import { getTransformList } from '../../packages/svgcanvas/core/math.js'

describe('blend attribute', () => {
  it('parses and formats, filling defaults and clamping', () => {
    expect(parseBlend('blend(mode=distance,steps=8,distance=12)')).toEqual({ mode: 'distance', steps: 8, distance: 12 })
    expect(parseBlend('blend()')).toEqual({ mode: 'steps', steps: 5, distance: 20 })
    expect(parseBlend('art(x=1)')).toBeNull()
    expect(parseBlend(null)).toBeNull()
    expect(sanitizeBlendOptions({ mode: 'wild', steps: 9999, distance: -4 })).toEqual({ mode: 'steps', steps: 200, distance: 0.1 })
    expect(parseBlend(formatBlend({ mode: 'smooth', steps: 3.6 }))).toEqual({ mode: 'smooth', steps: 4, distance: 20 })
  })
})

describe('blends on the canvas', () => {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
    const host = document.createElement('div')
    host.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(host)
    document.body.append(workarea)
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
  const square = (x, extra = {}) => make('rect', { x, y: 100, width: 20, height: 20, fill: '#ff0000', stroke: '#000000', 'stroke-width': 2, ...extra })
  const disc = (cx, extra = {}) => make('circle', { cx, cy: 110, r: 20, fill: '#0000ff', stroke: '#000000', 'stroke-width': 6, ...extra })
  const steps = (g) => [...g.children].filter((c) => c.hasAttribute('se:blend-steps')).map((s) => [...s.children])
  const checks = () => svgCanvas.checkDrawing().filter((f) => /blend|se-attr/.test(f.code))

  it('two shapes make a blend in one undo step; the keys keep their ids and the group takes the first one\'s place', () => {
    const a = square(0)
    const b = disc(200)
    const other = square(400)
    expect(svgCanvas.canBlend([a])).toBe(false)
    expect(svgCanvas.canBlend([a, b])).toBe(true)
    const before = svgCanvas.undoMgr.getUndoStackSize()
    const g = svgCanvas.makeBlend([b, a]) // order of the argument does not matter: stacking order does
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
    expect(g.tagName).toBe('g')
    expect(parseBlend(g.getAttribute('se:blend'))).toEqual({ mode: 'steps', steps: 5, distance: 20 })
    const p = blendParts(g)
    expect(p.keys.map((k) => k.id)).toEqual([a.id, b.id])
    expect(p.keys.every((k) => k.getAttribute('se:blend-key') === '1')).toBe(true)
    expect(g.nextElementSibling).toBe(other)
    expect(steps(g)).toHaveLength(1)
    expect(steps(g)[0]).toHaveLength(5)
    expect(svgCanvas.getSelectedElements().filter(Boolean)).toEqual([g])
    expect(checks()).toEqual([])
  })

  it('steps morph geometry and colour between the keys, in order', () => {
    const a = square(0)
    const b = disc(200)
    const g = svgCanvas.makeBlend([a, b])
    const [one, , three, , five] = steps(g)[0]
    expect(one.tagName).toBe('path')
    expect(one.getAttribute('fill')).not.toBe('#ff0000')
    expect(one.getAttribute('fill')).not.toBe('#0000ff')
    expect(three.getAttribute('stroke-width')).toBe('4') // 2 → 6, halfway
    expect(five.getAttribute('stroke-width')).toBe('5.3333')
    const x = (el) => svgCanvas.getBBox ? el.getBBox?.().x : 0
    expect(x).toBeTypeOf('function')
    // the middle step sits halfway between the keys' centres: (10 + 200) / 2
    const d = three.getAttribute('d')
    const nums = [...d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => parseFloat(m[0]))
    const xs = nums.filter((_, i) => i % 2 === 0)
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeGreaterThan(90)
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeLessThan(120)
  })

  it('a key\'s transform is baked into the steps', () => {
    const a = square(0)
    const b = square(0, { transform: 'translate(300,0)' })
    const g = svgCanvas.makeBlend([a, b], { steps: 1 })
    const [mid] = steps(g)[0]
    const nums = [...mid.getAttribute('d').matchAll(/-?\d+(\.\d+)?/g)].map((m) => parseFloat(m[0]))
    const xs = nums.filter((_, i) => i % 2 === 0)
    expect(Math.min(...xs)).toBeCloseTo(150, 3)
    expect(Math.max(...xs)).toBeCloseTo(170, 3)
  })

  it('options change the number of steps in one undo step; the ids of the steps that remain are kept', () => {
    const g = svgCanvas.makeBlend([square(0), disc(200)])
    const ids = steps(g)[0].map((s) => s.id)
    svgCanvas.selectOnly([g], true)
    const before = svgCanvas.undoMgr.getUndoStackSize()
    expect(svgCanvas.setBlendOptions({ steps: 8 })).toEqual([g])
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
    const now = steps(g)[0]
    expect(now).toHaveLength(8)
    expect(now.slice(0, 5).map((s) => s.id)).toEqual(ids)
    expect(svgCanvas.getBlend(g).steps).toBe(8)
    svgCanvas.undoMgr.undo()
    expect(steps(g)[0].map((s) => s.id)).toEqual(ids)
    expect(svgCanvas.getBlend(g).steps).toBe(5)
    svgCanvas.undoMgr.redo()
    expect(steps(g)[0]).toHaveLength(8)
  })

  it('distance and smooth colour spacing', () => {
    const g = svgCanvas.makeBlend([square(0), square(120, { fill: '#ff0000' })], { mode: 'distance', distance: 20 })
    expect(steps(g)[0]).toHaveLength(5) // 120 apart, a step every 20
    svgCanvas.selectOnly([g], true)
    svgCanvas.setBlendOptions({ mode: 'smooth' })
    expect(steps(g)[0]).toHaveLength(60) // same colours: by distance, 2 units apiece
  })

  it('the steps follow a key when it changes, with no undo step of their own, and an undo puts them back', () => {
    const a = square(0)
    const b = square(200)
    const g = svgCanvas.makeBlend([a, b], { steps: 3 })
    const was = steps(g)[0].map((s) => s.getAttribute('d'))
    expect(was).toHaveLength(3)
    const undo = svgCanvas.undoMgr.getUndoStackSize()
    b.setAttribute('x', '400')
    expect(svgCanvas.refreshBlend(b)).toBe(true)
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(undo)
    expect(steps(g)[0].map((s) => s.getAttribute('d'))).not.toEqual(was)
    b.setAttribute('x', '200')
    expect(svgCanvas.refreshBlend(g)).toBe(true)
    expect(steps(g)[0].map((s) => s.getAttribute('d'))).toEqual(was)
    expect(svgCanvas.refreshBlend(a)).toBe(false) // nothing to do
  })

  it('a blend and a shape make a longer blend, with steps in every gap', () => {
    const g = svgCanvas.makeBlend([square(0), square(100)], { steps: 2 })
    const c = disc(300)
    expect(svgCanvas.canBlend([g, c])).toBe(true)
    expect(svgCanvas.makeBlend([g, c])).toBe(g)
    const p = blendParts(g)
    expect(p.keys).toHaveLength(3)
    expect(p.keys[2]).toBe(c)
    expect(steps(g).map((s) => s.length)).toEqual([2, 2])
    expect(svgCanvas.canBlend([g, g])).toBe(false)
    expect(checks()).toEqual([])
  })

  it('shapes in different groups or already in a blend are not offered', () => {
    const layerless = square(0)
    const other = make('g', {})
    const inside = make('rect', { x: 0, y: 0, width: 10, height: 10 })
    other.append(inside)
    expect(svgCanvas.canBlend([layerless, inside])).toBe(false)
    const g = svgCanvas.makeBlend([square(0), square(100)])
    expect(svgCanvas.isBlendKeyCandidate(blendParts(g).keys[0])).toBe(false)
    expect(svgCanvas.isBlendKeyCandidate(make('text', {}))).toBe(false)
    expect(svgCanvas.isBlendKeyCandidate(layerless)).toBe(true)
  })

  it('expand keeps keys and steps as plain shapes, release gives the keys back', () => {
    const a = square(0)
    const b = disc(200)
    const g = svgCanvas.makeBlend([a, b])
    svgCanvas.selectOnly([g], true)
    const before = svgCanvas.undoMgr.getUndoStackSize()
    svgCanvas.expandBlend()
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
    expect(g.hasAttribute('se:blend')).toBe(false)
    expect([...g.children].map((c) => c.tagName)).toEqual(['rect', 'path', 'path', 'path', 'path', 'path', 'circle'])
    expect(g.querySelectorAll('[id]')).toHaveLength(7)
    expect(a.hasAttribute('se:blend-key')).toBe(false)
    svgCanvas.undoMgr.undo()
    expect(g.hasAttribute('se:blend')).toBe(true)
    expect(steps(g)[0]).toHaveLength(5)

    svgCanvas.selectOnly([g], true)
    const keys = svgCanvas.releaseBlend()
    expect(keys).toEqual([a, b])
    expect(g.isConnected).toBe(false)
    expect(a.parentNode).toBe(b.parentNode)
    expect(a.hasAttribute('se:blend-key')).toBe(false)
    expect(checks()).toEqual([])
  })

  it('a blend that lost a part is just a group: nothing regenerates and nothing is reported', () => {
    const a = square(0)
    const b = square(200)
    const g = svgCanvas.makeBlend([a, b])
    const [gap] = [...g.children].filter((c) => c.hasAttribute('se:blend-steps'))
    gap.remove()
    expect(blendParts(g)).toBeNull()
    expect(svgCanvas.refreshBlend(a)).toBe(false)
    expect(svgCanvas.getBlendGroup(a)).toBeNull()
  })

  it('an invalid se:blend value is reported', () => {
    const g = svgCanvas.makeBlend([square(0), square(100)])
    g.setAttribute('se:blend', 'swirl(1)')
    expect(svgCanvas.checkDrawing().some((f) => f.code === 'se-attr-parse')).toBe(true)
  })

  it('the tool\'s defaults are what new blends start with', () => {
    svgCanvas.setBlendDefaults({ steps: 2 })
    expect(svgCanvas.getBlendDefaults().steps).toBe(2)
    const g = svgCanvas.makeBlend([square(0), square(100)])
    expect(steps(g)[0]).toHaveLength(2)
  })

  describe('spine', () => {
    // An L-shaped spine, 300 + 300 long, and keys whose centres are at 100,110 / 200,110 / …
    const SPINE = 'M0,300 L300,300 L300,0'
    const spinePath = () => make('path', { d: SPINE, fill: 'none', stroke: '#000000' })
    const centre = (el) => {
      const b = el.getBBox()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }
    /** The centre of a step, from its path data. */
    const stepCentre = (el) => {
      const nums = [...el.getAttribute('d').matchAll(/-?\d+(\.\d+)?/g)].map((m) => parseFloat(m[0]))
      const xs = nums.filter((_, i) => i % 2 === 0)
      const ys = nums.filter((_, i) => i % 2 === 1)
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
    }
    const keysOf = (g) => blendParts(g).keys
    const near = (p, x, y) => {
      expect(p.x).toBeCloseTo(x, 1)
      expect(p.y).toBeCloseTo(y, 1)
    }
    let g
    let path
    beforeEach(() => {
      g = svgCanvas.makeBlend([square(0), disc(200)], { steps: 5 })
      path = spinePath()
    })

    it('a blend and a path can be a spine, nothing else can', () => {
      expect(svgCanvas.canReplaceBlendSpine([g, path])).toBe(true)
      expect(svgCanvas.canReplaceBlendSpine([g])).toBe(false)
      expect(svgCanvas.canReplaceBlendSpine([path])).toBe(false)
      expect(svgCanvas.canReplaceBlendSpine([g, path, square(500)])).toBe(false)
      expect(svgCanvas.getBlendSpine(g)).toBeNull()
    })

    it('replacing the spine moves the keys onto it and the steps follow it, in one undo step', () => {
      const undo = svgCanvas.undoMgr.getUndoStackSize()
      expect(svgCanvas.replaceBlendSpine([g, path])).toBe(g)
      expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(undo + 1)
      expect(path.isConnected).toBe(false) // used up
      expect(g.getAttribute('se:blend-spine')).toBe(svgCanvas.getBlendSpine(g))
      const [a, b] = keysOf(g)
      near(centre(a), 0, 300) // the first key at the start, the last at the end
      near(centre(b), 300, 0)
      // 5 steps between the keys, 600 along: one every 100, round the corner at (300, 300)
      const mids = steps(g)[0].map(stepCentre)
      near(mids[0], 100, 300)
      near(mids[1], 200, 300)
      near(mids[2], 300, 300)
      near(mids[3], 300, 200)
      near(mids[4], 300, 100)
      expect(checks()).toEqual([])
    })

    it('undo takes the keys and the path back, redo does it again', () => {
      const [a, b] = keysOf(g)
      const startA = centre(a)
      const startB = centre(b)
      const was = steps(g)[0].map((s) => s.getAttribute('d'))
      svgCanvas.replaceBlendSpine([g, path])
      svgCanvas.undoMgr.undo()
      expect(path.isConnected).toBe(true)
      expect(g.hasAttribute('se:blend-spine')).toBe(false)
      near(centre(a), startA.x, startA.y)
      near(centre(b), startB.x, startB.y)
      expect(steps(g)[0].map((s) => s.getAttribute('d'))).toEqual(was)
      svgCanvas.undoMgr.redo()
      expect(g.hasAttribute('se:blend-spine')).toBe(true)
      near(centre(keysOf(g)[1]), 300, 0)
    })

    it('three keys are spread evenly along the spine', () => {
      const three = svgCanvas.makeBlend([square(0), square(100), square(200)], { steps: 1 })
      svgCanvas.replaceBlendSpine([three, spinePath()])
      const [k0, k1, k2] = keysOf(three)
      near(centre(k0), 0, 300)
      near(centre(k1), 300, 300) // 300 along: the corner
      near(centre(k2), 300, 0)
    })

    it('distance spacing counts along the spine, not the straight line', () => {
      svgCanvas.selectOnly([g], true)
      svgCanvas.setBlendOptions({ mode: 'distance', distance: 50 })
      const straight = steps(g)[0].length
      svgCanvas.replaceBlendSpine([g, path])
      expect(steps(g)[0].length).toBeGreaterThan(straight) // 600 / 50 - 1 = 11, against about 4 straight
      expect(steps(g)[0]).toHaveLength(11)
    })

    it('reversing the spine swaps the ends the keys sit on, in one undo step', () => {
      svgCanvas.replaceBlendSpine([g, path])
      svgCanvas.selectOnly([g], true)
      const [a, b] = keysOf(g)
      const undo = svgCanvas.undoMgr.getUndoStackSize()
      expect(svgCanvas.reverseBlendSpine()).toEqual([g])
      expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(undo + 1)
      near(centre(a), 300, 0)
      near(centre(b), 0, 300)
      near(steps(g)[0].map(stepCentre)[0], 300, 100) // the first step is now next to the first key's new place
      svgCanvas.undoMgr.undo()
      near(centre(a), 0, 300)
    })

    it('reverse does nothing for a blend that goes straight', () => {
      svgCanvas.selectOnly([g], true)
      expect(svgCanvas.reverseBlendSpine()).toEqual([])
    })

    it('detaching gives the spine back as a path and the steps go straight again', () => {
      svgCanvas.replaceBlendSpine([g, path])
      svgCanvas.selectOnly([g], true)
      const undo = svgCanvas.undoMgr.getUndoStackSize()
      const out = svgCanvas.detachBlendSpine()
      expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(undo + 1)
      expect(out.tagName).toBe('path')
      expect(out.previousElementSibling).toBe(g)
      expect(g.hasAttribute('se:blend-spine')).toBe(false)
      expect(out.getAttribute('d')).toMatch(/^M\s*0[ ,]300/)
      // straight between the keys (0,300) and (300,0): the middle step is at (150, 150)
      near(stepCentre(steps(g)[0][2]), 150, 150)
      svgCanvas.undoMgr.undo()
      expect(g.hasAttribute('se:blend-spine')).toBe(true)
    })

    it('a spine is carried by expand (the attributes go) and release (the group goes)', () => {
      svgCanvas.replaceBlendSpine([g, path])
      svgCanvas.selectOnly([g], true)
      svgCanvas.expandBlend()
      expect(g.hasAttribute('se:blend')).toBe(false)
      expect(g.hasAttribute('se:blend-spine')).toBe(false)
    })

    it('a spine of a blend in a transformed group is kept in the group\'s own coordinates', () => {
      // through the transform list: jsdom does not keep it in step with a setAttribute
      const move = svgCanvas.getSvgRoot().createSVGTransform()
      move.setTranslate(50, 20)
      getTransformList(g).appendItem(move)
      svgCanvas.selectOnly([g], true)
      const onPage = make('path', { d: 'M50,320 L350,320', fill: 'none', stroke: '#000' }) // 300 long, in the page's
      svgCanvas.replaceBlendSpine([g, onPage])
      expect(svgCanvas.getBlendSpine(g)).toMatch(/^M\s*0[ ,]300/)
    })

    it('an unusable se:blend-spine is reported and ignored: the steps stay straight', () => {
      g.setAttribute('se:blend-spine', 'not a path')
      expect(svgCanvas.getBlendSpine(g)).toBeNull()
      expect(svgCanvas.checkDrawing().some((f) => f.code === 'se-attr-parse')).toBe(true)
    })
  })
})
