import { describe, expect, it, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.ts'
import * as history from '../../packages/svgcanvas/core/history.js'
import { createUndo as initUndo } from '../../packages/svgcanvas/core/undo.ts'

const createSvgElement = (name) => document.createElementNS(NS.SVG, name)

const makeCanvas = ({ mode, trackedPath, logDebugEvent, build }) => {
  const clearCalls = []
  const content = createSvgElement('svg')
  document.body.append(content)
  const root = createSvgElement('svg')
  const canvas = {
    contentW: 100,
    contentH: 100,
    getCurrentMode () { return mode },
    getPathObj () { return trackedPath || null },
    getSvgContent () { return content },
    getSvgRoot () { return root },
    updateCanvas () {},
    inTransaction: () => false,
    destroyAbort: new AbortController(),
    clearSelection () {},
    identifyLayers () {},
    restoreRefElements () {},
    setUseData () {},
    call () {},
    logDebugEvent,
    pathActions: {
      clear () { clearCalls.push(true) }
    }
  }
  Object.assign(canvas, initUndo(canvas))
  build?.(content)
  canvas.undoMgr.resetUndoStack() // what was built is where the first step starts from
  canvas.clearCalls = clearCalls
  canvas.content = content
  return canvas
}

describe('undo', () => {
  it('refreshes the actively-edited path in place instead of exiting pathedit mode', () => {
    // Regression guard: undoing a node edit while in pathedit mode used to
    // unconditionally call pathActions.clear(), which drops straight out to
    // 'select' mode with nothing selected -- confusing for a plain "undo my
    // last node move" gesture. When the step changed the path currently being
    // node-edited, refresh that path's segs/grips in place and stay in pathedit.
    const pathElem = /** @type {SVGPathElement} */ (createSvgElement('path'))
    pathElem.id = 'p1'
    pathElem.setAttribute('d', 'M0,0 L10,10')

    let initCalled = false
    let shownWith = null
    const trackedPath = {
      elem: pathElem,
      dragging: [1, 2],
      dragctrl: true,
      init () { initCalled = true; return this },
      show (y) { shownWith = y }
    }

    const canvas = makeCanvas({ mode: 'pathedit', trackedPath, build: (c) => c.append(pathElem) })
    pathElem.setAttribute('d', 'M0,0 L5,5')
    canvas.undoMgr.addCommandToHistory(new history.ChangeElementCommand(pathElem, { d: 'M0,0 L10,10' }))

    canvas.undoMgr.undo()

    expect(pathElem.getAttribute('d')).toBe('M0,0 L10,10')
    expect(canvas.clearCalls).toHaveLength(0)
    expect(initCalled).toBe(true)
    expect(shownWith).toBe(true)
    expect(trackedPath.dragging).toBe(false)
    expect(trackedPath.dragctrl).toBe(false)
  })

  it('falls back to pathActions.clear() when the undone step does not affect the tracked path', () => {
    const pathElem = /** @type {SVGPathElement} */ (createSvgElement('path'))
    pathElem.id = 'p1'
    pathElem.setAttribute('d', 'M0,0 L10,10')
    const otherElem = /** @type {SVGRectElement} */ (createSvgElement('rect'))
    otherElem.id = 'r1'

    const trackedPath = { elem: pathElem, init () { return this }, show () {} }
    const canvas = makeCanvas({ mode: 'pathedit', trackedPath, build: (c) => c.append(pathElem, otherElem) })
    otherElem.setAttribute('width', '5')
    canvas.undoMgr.addCommandToHistory(new history.ChangeElementCommand(otherElem, { width: null }))

    canvas.undoMgr.undo()

    expect(canvas.clearCalls).toHaveLength(1)
  })

  it('falls back to pathActions.clear() when not in pathedit mode', () => {
    const rectElem = /** @type {SVGRectElement} */ (createSvgElement('rect'))
    rectElem.id = 'r1'
    rectElem.setAttribute('width', '10')

    const canvas = makeCanvas({ mode: 'select', trackedPath: null, build: (c) => c.append(rectElem) })
    rectElem.setAttribute('width', '5')
    canvas.undoMgr.addCommandToHistory(new history.ChangeElementCommand(rectElem, { width: '10' }))

    canvas.undoMgr.undo()

    expect(rectElem.getAttribute('width')).toBe('10')
    expect(canvas.clearCalls).toHaveLength(1)
  })

  it('logs a history-apply debug event for undo and redo, with the elements the step changed', () => {
    // Several past "path node grip" bugs traced back to exactly this
    // undo/redo boundary -- this is the one place a hard-to-reproduce
    // sequence (undo landing mid pathedit, or not) becomes visible in the log.
    const pathElem = /** @type {SVGPathElement} */ (createSvgElement('path'))
    pathElem.id = 'path1'
    pathElem.setAttribute('d', 'M0,0 L10,10')
    const trackedPath = { elem: pathElem, init () { return this }, show () {} }

    const logDebugEvent = vi.fn()
    const canvas = makeCanvas({ mode: 'pathedit', trackedPath, logDebugEvent, build: (c) => c.append(pathElem) })
    pathElem.setAttribute('d', 'M0,0 L5,5')
    canvas.undoMgr.addCommandToHistory(new history.ChangeElementCommand(pathElem, { d: 'M0,0 L10,10' }, 'Move path point(s)'))

    canvas.undoMgr.undo()
    expect(logDebugEvent).toHaveBeenCalledWith('history-apply', {
      direction: 'snapshot',
      elemIds: ['path1'],
      mode: 'pathedit'
    })

    canvas.undoMgr.redo()
    expect(logDebugEvent).toHaveBeenCalledWith('history-apply', expect.objectContaining({ direction: 'snapshot', elemIds: ['path1'] }))
    expect(pathElem.getAttribute('d')).toBe('M0,0 L5,5')
  })

  it('announces one history step for a batch, not one per subcommand', () => {
    const rectElem = /** @type {SVGRectElement} */ (createSvgElement('rect'))
    rectElem.id = 'rect1'
    rectElem.setAttribute('width', '10')
    rectElem.setAttribute('height', '10')

    const logDebugEvent = vi.fn()
    const canvas = makeCanvas({ mode: 'select', trackedPath: null, logDebugEvent, build: (c) => c.append(rectElem) })
    rectElem.setAttribute('width', '5')
    rectElem.setAttribute('height', '5')
    const batch = new history.BatchCommand('Resize')
    batch.addSubCommand(new history.ChangeElementCommand(rectElem, { width: '10' }))
    batch.addSubCommand(new history.ChangeElementCommand(rectElem, { height: '10' }))
    canvas.undoMgr.addCommandToHistory(batch)
    logDebugEvent.mockClear() // the push above logs a history-push

    canvas.undoMgr.undo()
    expect(logDebugEvent).toHaveBeenCalledTimes(1)
    expect(rectElem.getAttribute('width')).toBe('10')
    expect(rectElem.getAttribute('height')).toBe('10')

    logDebugEvent.mockClear()
    canvas.undoMgr.redo()
    expect(logDebugEvent).toHaveBeenCalledTimes(1)
    expect(rectElem.getAttribute('width')).toBe('5')
  })

  it('does not throw when the host has not set up a debug event sink', () => {
    const rectElem = /** @type {SVGRectElement} */ (createSvgElement('rect'))
    rectElem.id = 'r1'
    const canvas = makeCanvas({ mode: 'select', trackedPath: null, build: (c) => c.append(rectElem) })
    rectElem.setAttribute('width', '5')
    canvas.undoMgr.addCommandToHistory(new history.ChangeElementCommand(rectElem, { width: null }))

    expect(() => canvas.undoMgr.undo()).not.toThrow()
  })
})

describe('changeSelectedAttributeNoUndo', () => {
  const makeAttrCanvas = (initialSelection) => {
    let selected = initialSelection
    const resizeCalls = []
    const canvas = {
      getSelectedElements () { return selected },
      setSelected (elems) { selected = elems },
      getCurrentMode () { return 'select' },
      getZoom () { return 1 },
      selectorManager: {
        requestSelector (elem) {
          resizeCalls.push(elem)
          return { resize () {} }
        }
      }
    }
    Object.assign(canvas, initUndo(canvas))
    canvas.resizeCalls = resizeCalls
    return canvas
  }

  it('does not resurrect a selector for an element deselected before the deferred resize runs', async () => {
    // Regression guard: changing fill/stroke on a selected element schedules
    // a setTimeout(0) to resize its selector (needed for Opera/Firefox).
    // If the user clicks away (deselecting) before that timeout fires,
    // requestSelector() must not be called -- it locks and re-shows
    // whatever selector it returns, which would leave a stale selection
    // bbox stuck on screen for an element that is no longer selected.
    const rectElem = /** @type {SVGRectElement} */ (createSvgElement('rect'))
    document.body.append(rectElem)

    const canvas = makeAttrCanvas([rectElem])
    canvas.changeSelectedAttributeNoUndo('fill', '#00ff00', [rectElem])
    // Simulate clicking away synchronously, before the deferred resize fires.
    canvas.setSelected([])

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(canvas.resizeCalls).toHaveLength(0)
    rectElem.remove()
  })

  it('still resizes the selector when the element remains selected', async () => {
    const rectElem = /** @type {SVGRectElement} */ (createSvgElement('rect'))
    document.body.append(rectElem)

    const canvas = makeAttrCanvas([rectElem])
    canvas.changeSelectedAttributeNoUndo('fill', '#00ff00', [rectElem])

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(canvas.resizeCalls).toEqual([rectElem])
    rectElem.remove()
  })
})
