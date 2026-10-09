import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

describe('path-join on the canvas', () => {
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

  const add = (d, attr = {}) =>
    svgCanvas.addSVGElementsFromJson({ element: 'path', attr: { id: svgCanvas.getNextId(), d, ...attr } })
  const select = (...els) => svgCanvas.selectOnly(els, true)

  it('joins two open paths: the first keeps its id and style, the second is removed, one undo step', () => {
    const a = add('M0,0 L10,0', { stroke: '#f00' })
    const b = add('M10,0 L20,0', { stroke: '#00f' })
    select(a, b)
    assert.ok(svgCanvas.canJoinPaths([a, b]))
    const before = svgCanvas.undoMgr.getUndoStackSize()
    const out = svgCanvas.joinSelectedPaths()
    assert.equal(out, a)
    assert.equal(a.getAttribute('d'), 'M0,0 L10,0 L20,0')
    assert.equal(a.getAttribute('stroke'), '#f00')
    assert.ok(!b.isConnected)
    assert.equal(svgCanvas.undoMgr.getUndoStackSize(), before + 1)
    svgCanvas.undoMgr.undo()
    assert.ok(b.isConnected)
    assert.equal(a.getAttribute('d'), 'M0,0 L10,0')
    svgCanvas.undoMgr.redo()
    assert.equal(a.getAttribute('d'), 'M0,0 L10,0 L20,0')
    assert.ok(!b.isConnected)
  })

  it('connects distant endpoints with a straight segment', () => {
    const a = add('M0,0 L10,0')
    const b = add('M30,0 L20,0')
    select(a, b)
    svgCanvas.joinSelectedPaths()
    assert.equal(a.getAttribute('d'), 'M0,0 L10,0 L20,0 L30,0')
  })

  it('a single open path is closed', () => {
    const a = add('M0,0 L10,0 L10,10')
    select(a)
    assert.ok(svgCanvas.canJoinPaths([a]))
    svgCanvas.joinSelectedPaths()
    assert.match(a.getAttribute('d'), /z$/i)
    assert.equal(svgCanvas.canJoinPaths([a]), false) // now closed
  })

  it('aligns the second path into the first when they carry different transforms', () => {
    const a = add('M0,0 L10,0')
    const b = add('M0,0 L10,0', { transform: 'translate(10 0)' })
    select(a, b)
    svgCanvas.joinSelectedPaths()
    assert.equal(a.getAttribute('d'), 'M0,0 L10,0 L20,0')
  })

  it('is not offered for closed paths, shapes, live-geometry paths, or other parents', () => {
    const closed = add('M0,0 L10,0 L10,10 Z')
    const open = add('M0,0 L10,0')
    const rect = svgCanvas.addSVGElementsFromJson({ element: 'rect', attr: { id: 'r', x: 0, y: 0, width: 5, height: 5 } })
    assert.ok(!svgCanvas.canJoinPaths([closed]))
    assert.ok(!svgCanvas.canJoinPaths([open, rect]))
    const live = add('M0,0 L10,0')
    live.setAttribute('se:fx-d', 'M0,0 L10,0')
    assert.ok(!svgCanvas.canJoinPaths([live]))
    assert.ok(!svgCanvas.canJoinPaths([open, live]))
    assert.ok(!svgCanvas.canJoinPaths([open, open, open]))
    assert.ok(!svgCanvas.canJoinPaths([]))
    select(closed)
    assert.equal(svgCanvas.joinSelectedPaths(), null)
  })
})
