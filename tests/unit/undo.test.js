import { describe, expect, it } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import * as history from '../../packages/svgcanvas/core/history.js'
import { init as initUndo } from '../../packages/svgcanvas/core/undo.js'

const createSvgElement = (name) => document.createElementNS(NS.SVG, name)

const makeCanvas = ({ mode, trackedPath }) => {
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
})
