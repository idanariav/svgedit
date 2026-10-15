import { attachDebugActionStream } from '../../src/editor/DebugActionStream.js'
import { CommandRegistry } from '../../src/editor/commands.js'

const makeEditor = (findings = []) => {
  let sink = null
  const svgCanvas = {
    setDebugEventSink: (s) => { sink = s },
    logDebugEvent: (e, d) => sink?.(e, d),
    getMode: () => 'select',
    getZoom: () => 1,
    getSvgString: () => '<svg/>',
    getSvgContent: () => document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
    getSelectedElements: () => [],
    checkDrawing: () => findings,
    undoMgr: { getUndoStackSize: () => 0 }
  }
  const editor = { svgCanvas }
  editor.commands = new CommandRegistry(editor)
  return editor
}

describe('attachDebugActionStream', () => {
  it('starts with a session-start entry and numbers every entry', () => {
    const editor = makeEditor()
    const log = []
    const { emit } = attachDebugActionStream(editor, (e, d) => log.push([e, d]))
    editor.svgCanvas.logDebugEvent('pointer-down', { mode: 'select' })
    emit('debug-snapshot', {})
    expect(log.map(([e]) => e)).toEqual(['session-start', 'pointer-down', 'debug-snapshot'])
    expect(log.map(([, d]) => d.seq)).toEqual([1, 2, 3])
    expect(log[0][1]).toMatchObject({ mode: 'select', zoom: 1, bytes: 6, drawing: { ok: true } })
    expect(log[1][1].t).toBeGreaterThanOrEqual(0)
  })

  it('logs a command as an action with redacted params, source, undo and drawing health', () => {
    const editor = makeEditor([{ code: 'bad-number', message: 'NaN in x', id: 'r1' }])
    editor.commands.register({ id: 'set', label: 'Set', params: { v: { type: 'string' } }, run: () => {} })
    const log = []
    attachDebugActionStream(editor, (e, d) => log.push([e, d]))
    editor.commands.tryRun('set', { v: 'y'.repeat(100) }, 'button')
    const action = log.find(([e]) => e === 'action')[1]
    expect(action).toMatchObject({
      command: 'set',
      source: 'button',
      outcome: 'ran',
      undo: '0->0',
      mode: 'select',
      params: { v: `${'y'.repeat(80)}…(+20)` },
      drawing: { ok: false, count: 1, findings: [{ code: 'bad-number', id: 'r1' }] }
    })
  })

  it('records a refused command with its reason, and stops cleanly', () => {
    const editor = makeEditor()
    editor.commands.register({ id: 'off', label: 'Off', enabled: () => 'select something', run: () => {} })
    const log = []
    const { stop } = attachDebugActionStream(editor, (e, d) => log.push([e, d]))
    editor.commands.tryRun('off')
    expect(log.at(-1)[1]).toMatchObject({ command: 'off', outcome: 'disabled', error: 'select something' })
    stop()
    const n = log.length
    editor.commands.tryRun('off')
    editor.svgCanvas.logDebugEvent('key', {})
    expect(log).toHaveLength(n)
  })
})
