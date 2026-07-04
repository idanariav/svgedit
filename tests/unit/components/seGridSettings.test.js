import { describe, it, expect, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seGridSettings.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

function installGridMock (curConfigOverrides = {}) {
  const prefCalls = []
  return installMockSvgEditor({
    configObj: {
      curConfig: {
        imgPath: 'images',
        showGrid: false,
        gridSnapping: false,
        gridShape: 'square',
        snappingStep: 10,
        gridColor: '#000000',
        ...curConfigOverrides
      },
      pref: (key, value, ...rest) => { prefCalls.push([key, value, ...rest]) }
    },
    _prefCalls: prefCalls
  })
}

describe('se-grid-settings', () => {
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with the trigger and all fields', () => {
    installGridMock()
    const el = mountElement('se-grid-settings')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$show).toBeTruthy()
    expect(el.$shape).toBeTruthy()
    expect(el.$snap).toBeTruthy()
    expect(el.$step).toBeTruthy()
    expect(el.$color).toBeTruthy()
  })

  it('populates the shape select with all shape options', () => {
    installGridMock()
    const el = mountElement('se-grid-settings')
    const values = Array.from(el.$shape.options).map(o => o.value)
    expect(values).toEqual(['square', 'isometric', 'triangle', 'perspective1', 'perspective2'])
  })

  it('syncs fields from curConfig on connect', () => {
    installGridMock({
      showGrid: true,
      gridSnapping: true,
      gridShape: 'triangle',
      snappingStep: 25,
      gridColor: '#f00'
    })
    const el = mountElement('se-grid-settings')
    expect(el.$show.checked).toBe(true)
    expect(el.$snap.checked).toBe(true)
    expect(el.$shape.value).toBe('triangle')
    expect(el.$step.value).toBe('25')
    expect(el.$color.value).toBe('#ff0000') // shorthand hex expanded
  })

  it('defaults snappingStep to 10 and gridColor to #000000 when unset', () => {
    installGridMock({ snappingStep: undefined, gridColor: undefined })
    const el = mountElement('se-grid-settings')
    expect(el.$step.value).toBe('10')
    expect(el.$color.value).toBe('#000000')
  })

  it('sets data-active on the trigger based on showGrid', () => {
    installGridMock({ showGrid: true })
    const el = mountElement('se-grid-settings')
    expect(el.$trigger.getAttribute('data-active')).toBe('true')
  })

  it('_toHex expands 3-digit shorthand and passes through valid 6-digit hex', () => {
    installGridMock()
    const el = mountElement('se-grid-settings')
    expect(el._toHex('#abc')).toBe('#aabbcc')
    expect(el._toHex('#112233')).toBe('#112233')
  })

  it('_toHex falls back to #000000 for invalid values', () => {
    installGridMock()
    const el = mountElement('se-grid-settings')
    expect(el._toHex('not-a-color')).toBe('#000000')
    expect(el._toHex('')).toBe('#000000')
  })

  it('committing the show checkbox writes curConfig, calls pref, updates trigger, and dispatches change', () => {
    const mock = installGridMock()
    const el = mountElement('se-grid-settings')
    const handler = vi.fn()
    el.addEventListener('change', handler)

    el.$show.checked = true
    el.$show.dispatchEvent(new Event('change'))

    expect(mock.configObj.curConfig.showGrid).toBe(true)
    expect(mock._prefCalls).toContainEqual(['grid_show', 'true', true])
    expect(el.$trigger.getAttribute('data-active')).toBe('true')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].detail).toEqual({ key: 'showGrid', value: true })
  })

  it('committing the snap checkbox writes gridSnapping', () => {
    const mock = installGridMock()
    const el = mountElement('se-grid-settings')
    el.$snap.checked = true
    el.$snap.dispatchEvent(new Event('change'))
    expect(mock.configObj.curConfig.gridSnapping).toBe(true)
    expect(mock._prefCalls).toContainEqual(['grid_snapping', 'true', true])
  })

  it('committing the shape select writes gridShape', () => {
    const mock = installGridMock()
    const el = mountElement('se-grid-settings')
    el.$shape.value = 'isometric'
    el.$shape.dispatchEvent(new Event('change'))
    expect(mock.configObj.curConfig.gridShape).toBe('isometric')
    expect(mock._prefCalls).toContainEqual(['grid_shape', 'isometric', true])
  })

  it('committing the color input writes gridColor on "input"', () => {
    const mock = installGridMock()
    const el = mountElement('se-grid-settings')
    el.$color.value = '#123456'
    el.$color.dispatchEvent(new Event('input'))
    expect(mock.configObj.curConfig.gridColor).toBe('#123456')
    expect(mock._prefCalls).toContainEqual(['grid_color', '#123456', true])
  })

  it('committing a valid step value writes snappingStep', () => {
    const mock = installGridMock()
    const el = mountElement('se-grid-settings')
    el.$step.value = '20'
    el.$step.dispatchEvent(new Event('change'))
    expect(mock.configObj.curConfig.snappingStep).toBe(20)
    expect(mock._prefCalls).toContainEqual(['grid_snapping_step', '20', true])
  })

  it('ignores an invalid (non-positive/non-finite) step value', () => {
    const mock = installGridMock()
    const el = mountElement('se-grid-settings')
    el.$step.value = '0'
    el.$step.dispatchEvent(new Event('change'))
    expect(mock._prefCalls.find(c => c[0] === 'grid_snapping_step')).toBeUndefined()

    el.$step.value = 'not-a-number'
    el.$step.dispatchEvent(new Event('change'))
    expect(mock._prefCalls.find(c => c[0] === 'grid_snapping_step')).toBeUndefined()
  })

  it('open() re-syncs fields from curConfig before opening', () => {
    const mock = installGridMock({ showGrid: false })
    const el = mountElement('se-grid-settings')
    mock.configObj.curConfig.showGrid = true
    mock.configObj.curConfig.gridShape = 'perspective2'
    el.open()
    expect(el.$show.checked).toBe(true)
    expect(el.$shape.value).toBe('perspective2')
    expect(el.isOpen).toBe(true)
  })
})
