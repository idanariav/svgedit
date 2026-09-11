import { describe, expect, it, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import * as history from '../../packages/svgcanvas/core/history.js'
import { init as initUndo } from '../../packages/svgcanvas/core/undo.js'

const createSvgElement = (name) => document.createElementNS(NS.SVG, name)

const makeCanvas = ({ mode, trackedPath, logDebugEvent }) => {
  const clearCalls = []
  const canvas = {
    getCurrentMode () { return mode },
    getPathObj () { return trackedPath || null },
    getSvgContent () { return createSvgElement('svg') },
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
  initUndo(canvas)
  canvas.clearCalls = clearCalls
  return canvas
}

describe('undo', () => {
  it('refreshes the actively-edited path in place instead of exiting pathedit mode', () => {
    // Regression guard: undoing a node edit while in pathedit mode used to
    // unconditionally call pathActions.clear(), which drops straight out to
    // 'select' mode with nothing selected -- confusing for a plain "undo my
    // last node move" gesture. When the undone/redone command affects the
    // path currently being node-edited, refresh that path's segs/grips in
    // place and stay in pathedit instead.
    const pathElem = /** @type {SVGPathElement} */ (createSvgElement('path'))
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

    const canvas = makeCanvas({ mode: 'pathedit', trackedPath })
    const cmd = new history.ChangeElementCommand(pathElem, { d: 'M0,0 L5,5' })
    canvas.undoMgr.addCommandToHistory(cmd)

    canvas.undoMgr.undo()

    expect(canvas.clearCalls).toHaveLength(0)
    expect(initCalled).toBe(true)
    expect(shownWith).toBe(true)
    expect(trackedPath.dragging).toBe(false)
    expect(trackedPath.dragctrl).toBe(false)
  })

  it('falls back to pathActions.clear() when the undone command does not affect the tracked path', () => {
    const pathElem = /** @type {SVGPathElement} */ (createSvgElement('path'))
    pathElem.setAttribute('d', 'M0,0 L10,10')
    const otherElem = /** @type {SVGRectElement} */ (createSvgElement('rect'))

    const trackedPath = { elem: pathElem, init () { return this }, show () {} }
    const canvas = makeCanvas({ mode: 'pathedit', trackedPath })
    const cmd = new history.ChangeElementCommand(otherElem, { width: '5' })
    canvas.undoMgr.addCommandToHistory(cmd)

    canvas.undoMgr.undo()

    expect(canvas.clearCalls).toHaveLength(1)
  })

  it('falls back to pathActions.clear() when not in pathedit mode', () => {
    const rectElem = /** @type {SVGRectElement} */ (createSvgElement('rect'))
    rectElem.setAttribute('width', '10')

    const canvas = makeCanvas({ mode: 'select', trackedPath: null })
    const cmd = new history.ChangeElementCommand(rectElem, { width: '5' })
    canvas.undoMgr.addCommandToHistory(cmd)

    canvas.undoMgr.undo()

    expect(canvas.clearCalls).toHaveLength(1)
  })

  it('logs a history-apply debug event for undo and redo, including whether the tracked path was refreshed in place', () => {
    // Several past "path node grip" bugs traced back to exactly this
    // undo/redo boundary -- this is the one place a hard-to-reproduce
    // sequence (undo landing mid pathedit, or not) becomes visible in the log.
    const pathElem = /** @type {SVGPathElement} */ (createSvgElement('path'))
    pathElem.id = 'path1'
    pathElem.setAttribute('d', 'M0,0 L10,10')
    const trackedPath = { elem: pathElem, init () { return this }, show () {} }

    const logDebugEvent = vi.fn()
    const canvas = makeCanvas({ mode: 'pathedit', trackedPath, logDebugEvent })
    const cmd = new history.ChangeElementCommand(pathElem, { d: 'M0,0 L5,5' }, 'Move path point(s)')
    canvas.undoMgr.addCommandToHistory(cmd)

    canvas.undoMgr.undo()
    expect(logDebugEvent).toHaveBeenCalledWith('history-apply', {
      direction: 'undo',
      cmdType: 'ChangeElementCommand',
      text: 'Change path Move path point(s)',
      elemIds: ['path1'],
      mode: 'pathedit',
      refreshedInPlace: true
    })

    canvas.undoMgr.redo()
    expect(logDebugEvent).toHaveBeenCalledWith('history-apply', expect.objectContaining({
      direction: 'redo', refreshedInPlace: true
    }))
  })

  it('does not throw when the host has not set up a debug event sink', () => {
    const rectElem = /** @type {SVGRectElement} */ (createSvgElement('rect'))
    const canvas = makeCanvas({ mode: 'select', trackedPath: null })
    const cmd = new history.ChangeElementCommand(rectElem, { width: '5' })
    canvas.undoMgr.addCommandToHistory(cmd)

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
    initUndo(canvas)
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
