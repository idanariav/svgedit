import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seZoom.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-zoom', () => {
  beforeEach(() => {
    installMockSvgEditor()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with the input and spinner controls', () => {
    const el = mountElement('se-zoom')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.inputElement.tagName).toBe('INPUT')
    expect(el.arrowUp).toBeTruthy()
    expect(el.arrowDown).toBeTruthy()
    expect(el.optionsContainer).toBeTruthy()
  })

  it('reflects the value attribute onto the input and via the property', () => {
    const el = mountElement('se-zoom')
    el.value = '150'
    expect(el.getAttribute('value')).toBe('150')
    expect(el.inputElement.value).toBe('150')
    expect(el.value).toBe('150')
  })

  it('dispatches a change event with the new value when the value attribute changes', () => {
    const el = mountElement('se-zoom')
    const handler = vi.fn()
    el.addEventListener('change', handler)

    el.setAttribute('value', '200')

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].detail).toEqual({ value: '200' })
  })

  it('does not dispatch a change event when the attribute is set to the same value', () => {
    const el = mountElement('se-zoom')
    el.setAttribute('value', '100')
    const handler = vi.fn()
    el.addEventListener('change', handler)

    el.setAttribute('value', '100')

    expect(handler).not.toHaveBeenCalled()
  })

  it('increments the value by 10 on increment()', () => {
    const el = mountElement('se-zoom')
    el.value = '100'
    el.increment()
    expect(el.value).toBe('110')
  })

  it('decrements the value by 10 on decrement()', () => {
    const el = mountElement('se-zoom')
    el.value = '100'
    el.decrement()
    expect(el.value).toBe('90')
  })

  it('clamps decrement() to 10 when the result would be 0 or below', () => {
    const el = mountElement('se-zoom')
    el.value = '10'
    el.decrement()
    expect(el.value).toBe('10')

    el.value = '5'
    el.decrement()
    expect(el.value).toBe('10')
  })

  it('increments on ArrowUp and decrements on ArrowDown keydown', () => {
    const el = mountElement('se-zoom')
    el.value = '100'

    el.inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(el.value).toBe('110')

    el.inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(el.value).toBe('100')
  })

  it('opens the options popup and selects the input text on click', () => {
    const el = mountElement('se-zoom')
    el.inputElement.select = vi.fn()

    el.inputElement.dispatchEvent(new Event('click'))

    expect(el.optionsContainer.style.display).toBe('flex')
    expect(el.inputElement.select).toHaveBeenCalled()
  })

  it('debounces input change and updates value after the timeout', () => {
    const el = mountElement('se-zoom')
    el.inputElement.value = '250'
    el.inputElement.dispatchEvent(new Event('change'))

    // Not yet applied before the debounce timeout elapses
    expect(el.getAttribute('value')).not.toBe('250')

    vi.advanceTimersByTime(500)

    expect(el.value).toBe('250')
  })

  it('populates options and selectedValue from slotted children on slotchange', () => {
    const el = mountElement('se-zoom')
    const opt1 = document.createElement('div')
    opt1.setAttribute('value', '50')
    opt1.setAttribute('text', 'Zoom to 50%')
    opt1.textContent = '50%'
    el.append(opt1)

    el.slotElement.dispatchEvent(new Event('slotchange'))

    expect(el.options).toEqual([opt1])
    expect(el.selectedValue).toBe('50%')
  })

  it('sets value and title when a slotted option is clicked', () => {
    const el = mountElement('se-zoom')
    const opt1 = document.createElement('div')
    opt1.setAttribute('value', '75')
    opt1.setAttribute('text', 'Zoom to 75%')
    opt1.textContent = '75%'
    el.append(opt1)
    el.slotElement.dispatchEvent(new Event('slotchange'))

    opt1.dispatchEvent(new Event('click'))

    expect(el.value).toBe('75')
    expect(el.title).toBe('Zoom to 75%')
  })

  it('closes the popup and blurs the input when clicking outside', () => {
    const el = mountElement('se-zoom')
    el.optionsContainer.style.display = 'flex'
    el.inputElement.blur = vi.fn()

    document.body.dispatchEvent(new Event('click', { bubbles: true }))

    expect(el.optionsContainer.style.display).toBe('none')
    expect(el.inputElement.blur).toHaveBeenCalled()
  })

  it('increments repeatedly while the up arrow is held down', () => {
    const el = mountElement('se-zoom')
    el.value = '100'

    el.handleMouseDown('up', true)
    expect(el.value).toBe('100') // first call, no immediate increment

    vi.advanceTimersByTime(500)
    expect(el.value).toBe('110') // after initial hold delay

    vi.advanceTimersByTime(50)
    expect(el.value).toBe('120') // subsequent repeat interval

    el.handleMouseUp('up')
    vi.advanceTimersByTime(50)
    expect(el.value).toBe('120') // stopped repeating
  })
})
