import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { BatchCommand, ChangeElementCommand } from '../../packages/svgcanvas/core/history.js'

// BatchCommand used to notify the history handler once per subcommand, so
// undoing a batch of N edits dispatched `changed` (and cleared the selection)
// N times -- ~12 s for 5,000 moved elements. It now brackets the batch with
// beginBatch/endBatch and the handler coalesces both into one.
describe('BatchCommand notification coalescing', () => {
  let canvas
  let rects

  beforeEach(() => {
    document.body.innerHTML = '<div id="svgcanvas"></div>'
    canvas = new SvgCanvas(document.getElementById('svgcanvas'), {
      canvas_expansion: 3,
      dimensions: [640, 480],
      initFill: { color: 'FF0000', opacity: 1 },
      initStroke: { width: 5, color: '000000', opacity: 1 },
      initOpacity: 1,
      imgPath: '',
      langPath: '',
      extPath: '',
      extensions: [],
      initTool: 'select',
      wireframe: false
    })
    rects = [1, 2, 3, 4, 5].map((i) =>
      canvas.addSVGElementsFromJson({ element: 'rect', attr: { id: `r${i}`, x: i, y: i, width: 5, height: 5 } }))
    canvas.undoMgr.resetUndoStack()
  })

  afterEach(() => { document.body.textContent = '' })

  const pushBatch = () => {
    const batch = new BatchCommand('many')
    for (const r of rects) {
      const old = { x: r.getAttribute('x') }
      r.setAttribute('x', '50')
      batch.addSubCommand(new ChangeElementCommand(r, old))
    }
    canvas.addCommandToHistory(batch)
  }

  it('fires `changed` once, with every touched element, when a batch is undone and redone', () => {
    pushBatch()
    const calls = []
    canvas.bind('changed', (win, elems) => calls.push(elems))
    canvas.undoMgr.undo()
    expect(calls).toHaveLength(1)
    expect(new Set(calls[0])).toEqual(new Set(rects))
    expect(rects.map((r) => r.getAttribute('x'))).toEqual(['1', '2', '3', '4', '5'])
    calls.length = 0
    canvas.undoMgr.redo()
    expect(calls).toHaveLength(1)
    expect(rects.every((r) => r.getAttribute('x') === '50')).toBe(true)
  })

  it('clears the selection once per batch', () => {
    pushBatch()
    canvas.selectOnly(rects)
    let clears = 0
    const raw = canvas.clearSelection
    canvas.clearSelection = (...a) => { clears++; return raw(...a) }
    canvas.undoMgr.undo()
    expect(clears).toBe(1)
  })

  it('still fires once per command for a lone (non-batch) command', () => {
    const old = { x: rects[0].getAttribute('x') }
    rects[0].setAttribute('x', '9')
    canvas.addCommandToHistory(new ChangeElementCommand(rects[0], old))
    const calls = []
    canvas.bind('changed', (win, elems) => calls.push(elems))
    canvas.undoMgr.undo()
    expect(calls).toHaveLength(1)
  })

  it('a throwing subcommand does not leave the handler stuck in batch mode', () => {
    const batch = new BatchCommand('boom')
    batch.addSubCommand({ apply () {}, unapply () { throw new Error('boom') }, elements: () => [] })
    canvas.addCommandToHistory(batch)
    expect(() => canvas.undoMgr.undo()).toThrow('boom')
    // a later lone command must notify immediately again
    const old = { x: rects[0].getAttribute('x') }
    rects[0].setAttribute('x', '9')
    canvas.addCommandToHistory(new ChangeElementCommand(rects[0], old))
    const calls = []
    canvas.bind('changed', (win, elems) => calls.push(elems))
    canvas.undoMgr.undo()
    expect(calls).toHaveLength(1)
  })
})
