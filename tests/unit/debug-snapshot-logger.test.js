import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import DebugSnapshotLogger from '../../src/editor/DebugSnapshotLogger.js'

// Replaces the old <se-debug-overlay> UI panel: instead of rendering
// svgCanvas.getDebugSnapshot() in a DOM overlay, Editor.setDebugLogger()
// polls the same snapshot through this class and forwards it to a
// host-provided sink (e.g. the Obsidian plugin's file-based debug log)
// whenever it changes.
describe('DebugSnapshotLogger', () => {
  let getSnapshot
  let logger

  beforeEach(() => {
    vi.useFakeTimers()
    getSnapshot = vi.fn()
    logger = new DebugSnapshotLogger(getSnapshot)
  })

  afterEach(() => {
    logger.stop()
    vi.useRealTimers()
  })

  it('forwards the first snapshot to the sink as soon as it starts', () => {
    const snapshot = { selection: { selectedIds: [], selectors: [] } }
    getSnapshot.mockReturnValue(snapshot)
    const sink = vi.fn()

    logger.start(sink)

    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenCalledWith('debug-snapshot', snapshot)
  })

  it('does not re-log an unchanged snapshot on later polls', () => {
    getSnapshot.mockReturnValue({ selection: { selectedIds: ['a'], selectors: [] } })
    const sink = vi.fn()

    logger.start(sink)
    vi.advanceTimersByTime(400 * 3)

    expect(sink).toHaveBeenCalledTimes(1)
  })

  it('logs again once the snapshot actually changes', () => {
    let selectedIds = []
    getSnapshot.mockImplementation(() => ({ selection: { selectedIds, selectors: [] } }))
    const sink = vi.fn()

    logger.start(sink)
    selectedIds = ['rect1']
    vi.advanceTimersByTime(400)

    expect(sink).toHaveBeenCalledTimes(2)
    expect(sink).toHaveBeenLastCalledWith('debug-snapshot', { selection: { selectedIds: ['rect1'], selectors: [] } })
  })

  it('stops polling once the sink is cleared', () => {
    getSnapshot.mockReturnValue({ selection: { selectedIds: [], selectors: [] } })
    const sink = vi.fn()

    logger.start(sink)
    logger.start(null)
    vi.advanceTimersByTime(400 * 5)

    expect(sink).toHaveBeenCalledTimes(1)
  })

  it('stops polling on stop()', () => {
    getSnapshot.mockReturnValue({ selection: { selectedIds: [], selectors: [] } })
    const sink = vi.fn()

    logger.start(sink)
    logger.stop()
    vi.advanceTimersByTime(400 * 5)

    expect(sink).toHaveBeenCalledTimes(1)
  })

  it('swallows getSnapshot errors instead of throwing', () => {
    getSnapshot.mockImplementation(() => { throw new Error('boom') })

    expect(() => logger.start(vi.fn())).not.toThrow()
  })
})
