import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seSpinInput.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-spin-input', () => {
  beforeEach(() => installMockSvgEditor())
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('renders a shadow root with the input and spin buttons', () => {
    const el = mountElement('se-spin-input')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$input.tagName).toBe('INPUT')
    expect(el.$upBtn.tagName).toBe('BUTTON')
    expect(el.$downBtn.tagName).toBe('BUTTON')
  })

  it('defaults min=1, step=1 and disables the down button at/below the default min', () => {
    const el = mountElement('se-spin-input')
    el.value = '2'
    expect(el.$downBtn.disabled).toBe(false)
    el.value = '1'
    expect(el.$downBtn.disabled).toBe(true)
    el.value = '0'
    expect(el.$downBtn.disabled).toBe(true)
  })

  it('reflects the value attribute onto the input', () => {
    const el = mountElement('se-spin-input')
    el.setAttribute('value', '5')
    expect(el.$input.value).toBe('5')
    expect(el.value).toBe('5')
  })

  it('sets the value property directly on the input', () => {
    const el = mountElement('se-spin-input')
    el.value = '7'
    expect(el.$input.value).toBe('7')
  })

  it('shows/hides the top label based on the label attribute and hides the fallback icon', () => {
    const el = mountElement('se-spin-input')
    el.setAttribute('label', 'Width')
    expect(el.$label.textContent).toBe('Width')
    expect(el.$label.style.display).toBe('block')
    expect(el.$iconWrap.style.display).toBe('none')

    el.setAttribute('label', '')
    expect(el.$label.style.display).toBe('none')
  })

  it('reflects the title attribute (with translated shortcut) onto the field div', () => {
    const el = mountElement('se-spin-input', { shortcut: 'ctrl+w' })
    el.setAttribute('title', 'width_title')
    expect(el.$div.getAttribute('title')).toBe('width_title [ctrl+w]')
  })

  it('forwards the size attribute to the inner input', () => {
    const el = mountElement('se-spin-input')
    el.setAttribute('size', '4')
    expect(el.$input.size).toBe(4)
    expect(el.$input.style.width).toBe('unset')
  })

  it('reads/writes title, label, src, size properties via attributes', () => {
    const el = mountElement('se-spin-input')
    el.title = 't'
    expect(el.getAttribute('title')).toBe('t')
    expect(el.title).toBe('t')

    el.label = 'l'
    expect(el.getAttribute('label')).toBe('l')
    expect(el.label).toBe('l')

    el.src = 'icon.svg'
    expect(el.getAttribute('src')).toBe('icon.svg')
    expect(el.src).toBe('icon.svg')

    el.size = '3'
    expect(el.getAttribute('size')).toBe('3')
    expect(el.size).toBe('3')
  })

  it('clamps stepping at min/max', () => {
    const el = mountElement('se-spin-input')
    el.setAttribute('min', '0')
    el.setAttribute('max', '10')
    el.setAttribute('step', '1')
    el.value = '10'

    el.$upBtn.dispatchEvent(new Event('mousedown'))
    expect(el.value).toBe('10') // clamped at max
    // sitting exactly at the bound disables further stepping in that direction
    expect(el.$upBtn.disabled).toBe(true)

    el.value = '0'
    el.$downBtn.dispatchEvent(new Event('mousedown'))
    expect(el.value).toBe('0') // clamped at min
    expect(el.$downBtn.disabled).toBe(true)
  })

  it('disables the up/down button once the current value reaches or exceeds max/min', () => {
    const el = mountElement('se-spin-input')
    el.setAttribute('min', '0')
    el.setAttribute('max', '10')
    el.value = '10'
    expect(el.$upBtn.disabled).toBe(true)
    expect(el.$downBtn.disabled).toBe(false)

    el.value = '11'
    expect(el.$upBtn.disabled).toBe(true)
    expect(el.$downBtn.disabled).toBe(false)

    el.value = '0'
    expect(el.$downBtn.disabled).toBe(true)

    el.value = '-1'
    expect(el.$downBtn.disabled).toBe(true)
  })

  it('steps up/down by the step value and dispatches change', () => {
    const el = mountElement('se-spin-input')
    el.setAttribute('min', '')
    el.setAttribute('max', '')
    el.setAttribute('step', '2')
    el.value = '4'
    const handler = vi.fn()
    el.addEventListener('change', handler)

    el.$upBtn.dispatchEvent(new Event('mousedown'))
    expect(el.value).toBe('6')
    expect(handler).toHaveBeenCalledTimes(1)

    el.$downBtn.dispatchEvent(new Event('mousedown'))
    expect(el.value).toBe('4')
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('formats stepped values at the step decimal precision', () => {
    const el = mountElement('se-spin-input')
    el.setAttribute('min', '')
    el.setAttribute('max', '')
    el.setAttribute('step', '0.5')
    el.value = '1'

    el.$upBtn.dispatchEvent(new Event('mousedown'))
    expect(el.value).toBe('1.5')
  })

  it('steps via ArrowUp/ArrowDown keydown on the input', () => {
    const el = mountElement('se-spin-input')
    el.setAttribute('min', '')
    el.setAttribute('max', '')
    el.setAttribute('step', '1')
    el.value = '5'

    el.$input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(el.value).toBe('6')

    el.$input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(el.value).toBe('5')
  })

  it('updates value and dispatches change on keyup with a numeric value', () => {
    const el = mountElement('se-spin-input')
    const handler = vi.fn()
    el.addEventListener('change', handler)
    el.$input.value = '42'

    el.$input.dispatchEvent(new Event('keyup'))

    expect(el.value).toBe('42')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('updates value and dispatches change on the input change event', () => {
    const el = mountElement('se-spin-input')
    const handler = vi.fn()
    el.addEventListener('change', handler)
    el.$input.value = '99'

    el.$input.dispatchEvent(new Event('change'))

    expect(el.value).toBe('99')
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
