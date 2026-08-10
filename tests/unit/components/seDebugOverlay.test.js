import { describe, it, expect, afterEach, vi } from 'vitest'
import { mountElement } from './testUtils.js'
import '../../../src/editor/components/seDebugOverlay.js'

const emptySnapshot = () => ({
  selection: { selectedIds: [], selectors: [] },
  groupContext: { currentGroupId: null, disabledElems: [], stale: false },
  pathEditing: { pathElemId: null, segCount: 0, grips: [] }
})

describe('se-debug-overlay', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('renders a shadow root with the three sections', () => {
    const el = mountElement('se-debug-overlay')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.shadowRoot.querySelector('#selection-table')).toBeTruthy()
    expect(el.shadowRoot.querySelector('#group-table')).toBeTruthy()
    expect(el.shadowRoot.querySelector('#path-table')).toBeTruthy()
  })

  it('is hidden until active is set true', () => {
    const el = mountElement('se-debug-overlay')
    expect(el.active).toBe(false)
    expect(el.hasAttribute('active')).toBe(false)
  })

  it('renders empty-state rows when the snapshot has nothing to show', () => {
    const el = mountElement('se-debug-overlay')
    el.svgCanvas = { getDebugSnapshot: () => emptySnapshot() }
    el.active = true

    expect(el.shadowRoot.querySelector('#selection-table').textContent).toContain('no selection boxes')
    expect(el.shadowRoot.querySelector('#group-table').textContent).toContain('no dimmed siblings')
    expect(el.shadowRoot.querySelector('#path-table').textContent).toContain('no visible grips')
  })

  it('renders a selection row and marks it stale when the snapshot flags it', () => {
    const el = mountElement('se-debug-overlay')
    el.svgCanvas = {
      getDebugSnapshot: () => ({
        ...emptySnapshot(),
        selection: {
          selectedIds: [],
          selectors: [{ id: 0, elemId: 'rect-leaked', locked: true, display: 'inline', stale: true }]
        }
      })
    }
    el.active = true

    const table = el.shadowRoot.querySelector('#selection-table')
    expect(table.textContent).toContain('rect-leaked')
    expect(table.textContent).toContain('STALE')
    expect(table.querySelector('tr.stale')).toBeTruthy()
  })

  it('renders group-context dimmed siblings and the path-editing section', () => {
    const el = mountElement('se-debug-overlay')
    el.svgCanvas = {
      getDebugSnapshot: () => ({
        selection: { selectedIds: [], selectors: [] },
        groupContext: {
          currentGroupId: null,
          disabledElems: [{ id: 'sibling1', opacity: '0.33' }],
          stale: true
        },
        pathEditing: {
          pathElemId: 'p1',
          segCount: 3,
          grips: [
            { id: 'pathpointgrip_0', kind: 'pathpointgrip', index: 0, display: 'inline', stale: false },
            { id: 'pathpointgrip_99', kind: 'pathpointgrip', index: 99, display: 'inline', stale: true }
          ]
        }
      })
    }
    el.active = true

    const groupTable = el.shadowRoot.querySelector('#group-table')
    expect(groupTable.textContent).toContain('sibling1')
    expect(groupTable.querySelector('tr.stale')).toBeTruthy()

    const pathTable = el.shadowRoot.querySelector('#path-table')
    expect(pathTable.textContent).toContain('p1')
    const staleRows = pathTable.querySelectorAll('tr.stale')
    expect(staleRows.length).toBe(1)
    expect(staleRows[0].textContent).toContain('99')
  })

  it('polls getDebugSnapshot repeatedly while active, and stops when deactivated', () => {
    vi.useFakeTimers()
    const el = mountElement('se-debug-overlay')
    const getDebugSnapshot = vi.fn(() => emptySnapshot())
    el.svgCanvas = { getDebugSnapshot }
    el.active = true

    expect(getDebugSnapshot).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1200)
    expect(getDebugSnapshot.mock.calls.length).toBeGreaterThan(1)

    const callsWhileActive = getDebugSnapshot.mock.calls.length
    el.active = false
    vi.advanceTimersByTime(1200)
    expect(getDebugSnapshot.mock.calls.length).toBe(callsWhileActive)
  })

  it('the close button deactivates the overlay', () => {
    const el = mountElement('se-debug-overlay')
    el.svgCanvas = { getDebugSnapshot: () => emptySnapshot() }
    el.active = true

    el.shadowRoot.querySelector('#close').dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(el.active).toBe(false)
    expect(el.hasAttribute('active')).toBe(false)
  })

  it('does not throw when svgCanvas.getDebugSnapshot throws mid-poll', () => {
    const el = mountElement('se-debug-overlay')
    el.svgCanvas = {
      getDebugSnapshot: () => { throw new Error('canvas torn down') }
    }
    expect(() => { el.active = true }).not.toThrow()
  })
})
