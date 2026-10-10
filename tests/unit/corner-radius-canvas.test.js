import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

describe('corner-radius on the canvas', () => {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
    const svgEditor = document.createElement('div')
    svgEditor.id = 'svg_editor'
    const svgcanvas = document.createElement('div')
    svgcanvas.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(svgcanvas)
    const toolsLeft = document.createElement('div')
    toolsLeft.id = 'tools_left'
    svgEditor.append(workarea, toolsLeft)
    document.body.append(svgEditor)
    svgCanvas = new SvgCanvas(svgcanvas, {
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

  const add = (element, attr) => {
    const el = svgCanvas.addSVGElementsFromJson({ element, attr: { ...attr, id: svgCanvas.getNextId() } })
    svgCanvas.selectOnly([el], true)
    return el
  }

  it('a rect becomes a path carrying its source on first use, in one undo step', () => {
    const rect = add('rect', { x: 10, y: 20, width: 100, height: 60 })
    const parent = rect.parentNode
    const before = svgCanvas.undoMgr.getUndoStackSize()
    const path = svgCanvas.applyCornerRadius(12)
    assert.equal(path.tagName, 'path')
    assert.equal(path.getAttribute('se:orig-d'), 'M10,20 L110,20 L110,80 L10,80 Z')
    assert.equal(path.getAttribute('se:corner-radius'), '12')
    assert.equal((path.getAttribute('d').match(/A/g) || []).length, 4)
    assert.equal(svgCanvas.undoMgr.getUndoStackSize(), before + 1)
    assert.ok(!parent.contains(rect))
    svgCanvas.undoMgr.undo()
    assert.ok(parent.contains(rect))
    assert.equal(parent.querySelector('path[d^="M10"]'), null)
  })

  it('a polygon becomes a path (a star-like shape keeps all its corners)', () => {
    add('polygon', { points: '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35' })
    const path = svgCanvas.applyCornerRadius(2)
    assert.equal(path.tagName, 'path')
    assert.equal(svgCanvas.getCornerSettings(path).length, 10)
    assert.equal((path.getAttribute('d').match(/A/g) || []).length, 10)
  })

  it('applies a kind to all corners, then to chosen corners only', () => {
    add('path', { d: 'M0,0 L100,0 L100,60 L0,60 Z' })
    let el = svgCanvas.applyCornerRadius(10, { kind: 'c' })
    assert.equal(el.getAttribute('se:corner-radius'), '10:c,10:c,10:c,10:c')
    assert.doesNotMatch(el.getAttribute('d'), /A/)
    el = svgCanvas.applyCornerRadius(10, { kind: 'i', corners: [1] })
    assert.equal(el.getAttribute('se:corner-radius'), '10:c,10:i,10:c,10:c')
    el = svgCanvas.applyCornerRadius(0, { corners: [0, 2, 3] })
    assert.equal(el.getAttribute('se:corner-radius'), '0,10:i')
    const settings = svgCanvas.getCornerSettings(el)
    assert.deepEqual(settings.map((s) => [s.radius, s.kind]), [[0, 'r'], [10, 'i'], [0, 'r'], [0, 'r']])
    // kind-only change keeps radii
    el = svgCanvas.applyCornerRadius(undefined, { kind: 'r' })
    assert.equal(el.getAttribute('se:corner-radius'), '0,10')
  })

  it('radius 0 on every corner restores the source and drops the attributes', () => {
    add('path', { d: 'M0,0 L100,0 L100,60 L0,60 Z' })
    let el = svgCanvas.applyCornerRadius(8)
    el = svgCanvas.applyCornerRadius(0)
    assert.equal(el.getAttribute('d'), 'M0,0 L100,0 L100,60 L0,60 Z')
    assert.equal(el.hasAttribute('se:corner-radius'), false)
    assert.equal(el.hasAttribute('se:orig-d'), false)
  })

  it('does nothing (and records nothing) for radius 0 on an untouched element', () => {
    add('rect', { x: 0, y: 0, width: 10, height: 10 })
    const before = svgCanvas.undoMgr.getUndoStackSize()
    assert.equal(svgCanvas.applyCornerRadius(0), null)
    assert.equal(svgCanvas.undoMgr.getUndoStackSize(), before)
  })

  it('canRoundCorners: paths with a corner, rects, polygons — not smooth shapes or effect paths (a width stroke may stack)', () => {
    assert.ok(svgCanvas.canRoundCorners(add('rect', { x: 0, y: 0, width: 10, height: 10 })))
    assert.ok(svgCanvas.canRoundCorners(add('path', { d: 'M0,0 L50,0 C80,0 80,50 50,50 L0,50 Z' })))
    assert.ok(!svgCanvas.canRoundCorners(add('ellipse', { cx: 10, cy: 10, rx: 5, ry: 5 })))
    assert.ok(!svgCanvas.canRoundCorners(add('path', { d: 'M0,5 C0,-2 10,-2 10,5 C10,12 0,12 0,5 Z' })))
    const fx = add('path', { d: 'M0,0 L10,0 L10,10 Z' })
    fx.setAttribute('se:fx-d', 'M0,0 L10,0 L10,10 Z')
    assert.ok(!svgCanvas.canRoundCorners(fx))
    const taper = add('path', { d: 'M0,0 L10,0 L10,10 Z' })
    taper.setAttribute('se:taper-d', 'M0,0 L10,0 L10,10 Z')
    assert.ok(svgCanvas.canRoundCorners(taper))
  })

  it('a legacy single-number drawing is read back unchanged', () => {
    const path = add('path', {
      d: 'M10,28 A18 18 0 0 1 28,10 L92,10 A18 18 0 0 1 110,28 L110,52 A18 18 0 0 1 92,70 L28,70 A18 18 0 0 1 10,52 Z'
    })
    path.setAttribute('se:orig-d', 'M10,10 L110,10 L110,70 L10,70 Z')
    path.setAttribute('se:corner-radius', '18')
    const settings = svgCanvas.getCornerSettings(path)
    assert.deepEqual(settings.map((s) => [s.index, s.radius, s.kind]), [[0, 18, 'r'], [1, 18, 'r'], [2, 18, 'r'], [3, 18, 'r']])
    // editing the radius regenerates from the stored source
    const el = svgCanvas.applyCornerRadius(6)
    assert.equal(el.getAttribute('se:corner-radius'), '6')
    assert.equal(el.getAttribute('se:orig-d'), 'M10,10 L110,10 L110,70 L10,70 Z')
  })
})
