import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createGestureSession } from '../../packages/svgcanvas/core/gesture-session.ts'

// A canvas with a recording transaction and debug log: enough for the session.
const fakeCanvas = () => {
  const calls = []
  const log = []
  const canvas = {
    destroyAbort: new AbortController(),
    beginTransaction: (label) => {
      calls.push(`begin ${label}`)
      return { commit: () => calls.push(`commit ${label}`), cancel: () => calls.push(`cancel ${label}`) }
    },
    logDebugEvent: (type, detail) => log.push({ type, ...detail })
  }
  return { canvas, calls, log }
}

describe('gesture session', () => {
  let f, session
  beforeEach(() => { f = fakeCanvas(); session = createGestureSession(f.canvas) })
  afterEach(() => f.canvas.destroyAbort.abort())

  it('begins a gesture with its own state and transaction, and commits it as one step', () => {
    const g = session.beginGesture('move', { state: { dx: 1 }, label: 'position' })
    expect(session.activeGesture()).toBe(g)
    expect(g.state).toEqual({ dx: 1 })
    g.commit()
    expect(f.calls).toEqual(['begin position', 'commit position'])
    expect(session.activeGesture()).toBeNull()
    expect(g.ended).toBe(true)
    expect(f.log.map((e) => `${e.kind} ${e.phase}`)).toEqual(['move begin', 'move commit'])
  })

  it('a cancel rolls the transaction back, then runs onCancel with the reason', () => {
    const onCancel = vi.fn()
    session.beginGesture('rotate', { state: {}, onCancel })
    session.cancelGesture('escape')
    expect(f.calls).toEqual(['begin rotate', 'cancel rotate'])
    expect(onCancel).toHaveBeenCalledWith('escape')
    expect(session.activeGesture()).toBeNull()
    expect(f.log.at(-1)).toMatchObject({ type: 'gesture', kind: 'rotate', phase: 'cancel', why: 'escape' })
  })

  it('an open preview is cancelled before the roll-back', () => {
    const order = []
    f.canvas.snapshotHistory = { previewing: true, cancelPreview () { order.push('cancelPreview'); this.previewing = false } }
    f.canvas.beginTransaction = () => ({ commit () {}, cancel () { order.push('tx.cancel') } })
    session.beginGesture('move', { state: {}, onCancel: () => order.push('onCancel') })
    session.cancelGesture('escape')
    expect(order).toEqual(['cancelPreview', 'tx.cancel', 'onCancel'])
  })

  it('onCancel runs even when the roll-back throws', () => {
    f.canvas.beginTransaction = () => ({ commit () {}, cancel () { throw new Error('boom') } })
    const onCancel = vi.fn()
    session.beginGesture('resize', { state: {}, onCancel })
    expect(() => session.cancelGesture('error')).toThrow('boom')
    expect(onCancel).toHaveBeenCalled()
    expect(session.activeGesture()).toBeNull()
  })

  it('a gesture ends once: a second commit or cancel does nothing', () => {
    const g = session.beginGesture('move', { state: {} })
    g.commit()
    g.cancel('escape')
    g.commit()
    expect(f.calls).toEqual(['begin move', 'commit move'])
  })

  it('a new press cancels the gesture whose release never came', () => {
    const onCancel = vi.fn()
    const first = session.beginGesture('move', { state: {}, onCancel })
    const second = session.beginGesture('marquee', { state: {} })
    expect(first.ended).toBe(true)
    expect(onCancel).toHaveBeenCalledWith('new press')
    expect(session.activeGesture()).toBe(second)
  })

  it('a detached gesture is no longer active, and its owner still ends it', () => {
    const g = session.beginGesture('tool:pen', { state: {} })
    g.detach()
    expect(session.activeGesture()).toBeNull()
    session.cancelGesture('mode switch') // a setMode() during the release: not this gesture's business
    expect(g.ended).toBe(false)
    g.commit()
    expect(f.calls).toEqual(['begin tool:pen', 'commit tool:pen'])
  })

  it('ownsUndo opens no transaction', () => {
    session.beginGesture('tool:warp', { state: {}, ownsUndo: true }).commit()
    expect(f.calls).toEqual([])
  })

  it('cancelling with no gesture is a no-op', () => {
    expect(() => session.cancelGesture('escape')).not.toThrow()
  })

  it.each([
    ['the window losing focus', () => window.dispatchEvent(new Event('blur')), 'focus lost'],
    ['a context menu', () => window.dispatchEvent(new Event('contextmenu')), 'context menu'],
    ['the canvas being destroyed', () => f.canvas.destroyAbort.abort(), 'destroy']
  ])('%s cancels the gesture', (_, exit, why) => {
    const onCancel = vi.fn()
    session.beginGesture('move', { state: {}, onCancel })
    exit()
    expect(onCancel).toHaveBeenCalledWith(why)
    expect(session.activeGesture()).toBeNull()
  })

  it('the page being hidden cancels the gesture', () => {
    const onCancel = vi.fn()
    session.beginGesture('move', { state: {}, onCancel })
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    spy.mockRestore()
    expect(onCancel).toHaveBeenCalledWith('focus lost')
  })

  it('a destroyed canvas stops listening', () => {
    f.canvas.destroyAbort.abort()
    const onCancel = vi.fn()
    session.beginGesture('move', { state: {}, onCancel })
    window.dispatchEvent(new Event('blur'))
    expect(onCancel).not.toHaveBeenCalled()
  })
})
