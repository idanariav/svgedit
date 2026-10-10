import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor } from './components/testUtils.js'
import '../../src/editor/components/seSelect.js'
import '../../src/editor/components/seSpinInput.js'
import { refreshToolOptions } from '../../src/editor/panels/toolOptionsBar.js'

// The bar is drawn from the current tool's options(); controls are kept while the visible set stays the same.
vi.mock('../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('tool options bar', () => {
  let tray
  let options
  let mode
  let changes
  let editor

  beforeEach(() => {
    installMockSvgEditor()
    document.body.innerHTML = '<div id="tool_options_panel" style="display:none"></div>'
    tray = document.getElementById('tool_options_panel')
    mode = 'blend'
    changes = []
    options = [
      { id: 'mode', type: 'select', label: 'Spacing', value: 'steps', choices: [{ value: 'steps', label: 'Steps' }, { value: 'distance', label: 'Distance' }] },
      { id: 'steps', type: 'number', label: 'Steps', value: 5, min: 1, max: 200, step: 1 },
      { id: 'distance', type: 'number', label: 'Distance', value: 20, hidden: true },
      { id: 'flag', type: 'checkbox', label: 'Flag', value: true }
    ]
    editor = {
      $id: (id) => document.getElementById(id),
      svgCanvas: {
        getMode: () => mode,
        getToolOptions: () => options,
        setToolOption: vi.fn((id, value) => { changes.push([id, value]); return true })
      }
    }
  })

  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('shows the visible options and hides the bar when there are none', () => {
    refreshToolOptions(editor)
    expect(tray.style.display).toBe('')
    expect([...tray.children].map((c) => c.dataset.option)).toEqual(['mode', 'steps', 'flag'])
    options = []
    refreshToolOptions(editor)
    expect(tray.style.display).toBe('none')
    expect(tray.children).toHaveLength(0)
  })

  it('keeps the controls (and their focus) while the same options are visible, refreshing the values', () => {
    refreshToolOptions(editor)
    const steps = tray.querySelector('[data-option="steps"]')
    options = options.map((o) => (o.id === 'steps' ? { ...o, value: 9 } : o))
    refreshToolOptions(editor)
    expect(tray.querySelector('[data-option="steps"]')).toBe(steps)
    expect(String(steps.getAttribute('value'))).toBe('5') // built once; the value property is what is refreshed
  })

  it('rebuilds when an option appears or the tool changes', () => {
    refreshToolOptions(editor)
    const steps = tray.querySelector('[data-option="steps"]')
    options = options.map((o) => ({ ...o, hidden: o.id === 'steps' ? true : o.id === 'distance' ? false : o.hidden }))
    refreshToolOptions(editor)
    expect([...tray.children].map((c) => c.dataset.option)).toEqual(['mode', 'distance', 'flag'])
    expect(steps.isConnected).toBe(false)
  })

  it('sends a change to the tool and reads the bar again', () => {
    refreshToolOptions(editor)
    const flag = tray.querySelector('[data-option="flag"] input')
    flag.checked = false
    flag.dispatchEvent(new Event('change'))
    expect(changes).toEqual([['flag', false]])
    const spin = tray.querySelector('[data-option="steps"]')
    spin.value = '8'
    spin.dispatchEvent(new Event('change'))
    expect(changes.at(-1)).toEqual(['steps', 8])
    spin.value = 'abc'
    spin.dispatchEvent(new Event('change'))
    expect(changes).toHaveLength(2) // not a number: ignored
  })

  it('does nothing without the tray (a host that dropped it)', () => {
    tray.remove()
    expect(() => refreshToolOptions(editor)).not.toThrow()
  })
})
