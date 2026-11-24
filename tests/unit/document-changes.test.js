import { describe, expect, it } from 'vitest'
import { createDocumentChanges } from '../../packages/svgcanvas/core/document-changes.ts'

// The announcer compares the model of the shown drawing by identity (the history hands back the same object when nothing
// differs) and raises `documentChanged` only on a real difference.
const setup = () => {
  const calls = []
  const state = { model: { v: 0 }, held: false, started: false }
  const history = { previewing: false, revision: () => state.model, changedSince: (prev, shown) => [`${prev.v}->${shown.v}`] }
  const target = {
    inTransaction: () => state.held,
    getStarted: () => state.started,
    call: (ev, detail) => { calls.push([ev, detail.cause]); state.elems = detail.elems; state.onCall?.() }
  }
  const changes = createDocumentChanges(target, history)
  changes.reset()
  const change = () => { state.model = { v: state.model.v + 1 } }
  return { calls, state, history, changes, change }
}

describe('document changes announcer', () => {
  it('announces a step that changed the drawing, once', () => {
    const { calls, changes, change } = setup()
    change()
    changes.check('step')
    changes.check('edit')
    expect(calls).toEqual([['documentChanged', 'step']])
  })

  it('announces nothing for a step or a `changed` call that left the drawing as it was', () => {
    const { calls, changes } = setup()
    changes.check('step')
    changes.check('edit')
    expect(calls).toEqual([])
  })

  it('announces an undo that took the drawing back', () => {
    const { calls, changes, change } = setup()
    change()
    changes.check('step')
    change()
    changes.check('history')
    expect(calls.map(([, cause]) => cause)).toEqual(['step', 'history'])
  })

  it('waits while a transaction is open, a preview is shown or a press is down', () => {
    const { calls, state, history, changes, change } = setup()
    change()
    state.held = true
    changes.check('step')
    state.held = false
    history.previewing = true
    changes.check('edit')
    history.previewing = false
    state.started = true
    changes.check('edit')
    expect(calls).toEqual([])
    state.started = false
    changes.check('step')
    expect(calls).toEqual([['documentChanged', 'step']])
  })

  it('takes a loaded drawing as the new reference without announcing it', () => {
    const { calls, changes, change } = setup()
    change()
    changes.reset()
    changes.check('edit')
    expect(calls).toEqual([])
  })

  it('coalesces a burst of `changed` calls into one check after the task', async () => {
    const { calls, changes, change } = setup()
    change()
    changes.schedule()
    changes.schedule()
    expect(calls).toEqual([])
    await Promise.resolve()
    expect(calls).toEqual([['documentChanged', 'edit']])
  })

  it('announces a first step even with nothing to compare against', () => {
    const calls = []
    const model = { v: 1 }
    const changes = createDocumentChanges(
      { inTransaction: () => false, getStarted: () => false, call: (ev, d) => calls.push(d.cause) },
      { previewing: false, revision: () => model, changedSince: () => ['x'] }
    )
    changes.check('edit')
    expect(calls).toEqual([])
    const other = createDocumentChanges(
      { inTransaction: () => false, getStarted: () => false, call: (ev, d) => calls.push(d.cause) },
      { previewing: false, revision: () => model, changedSince: () => ['x'] }
    )
    other.check('step')
    expect(calls).toEqual(['step'])
  })

  it('names what differs from the drawing last announced', () => {
    const { state, changes, change } = setup()
    change()
    change()
    changes.check('step')
    expect(state.elems).toEqual(['0->2'])
  })

  it('takes what its handlers wrote as part of the change it announced', () => {
    const { calls, state, changes, change } = setup()
    state.onCall = () => { state.onCall = null; change() } // a feature re-deriving its data
    change()
    changes.check('step')
    changes.check('edit')
    expect(calls).toEqual([['documentChanged', 'step']])
  })

  it('is pending when the drawing differs from what was last announced and no check is coming', () => {
    const { state, changes, change } = setup()
    expect(changes.pending()).toBe(false)
    change() // an edit outside any step, without `changed`
    expect(changes.pending()).toBe(true)
    changes.schedule() // a `changed` call: the check is coming
    expect(changes.pending()).toBe(false)
    state.started = true // a press is down: not a change yet
    expect(changes.pending()).toBe(false)
    state.started = false
    changes.check('edit')
    expect(changes.pending()).toBe(false)
  })
})
