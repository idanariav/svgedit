import { describe, it, expect, afterEach, vi } from 'vitest'
import { mountElement } from './testUtils.js'
import '../../../src/editor/components/seInput.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-input', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('renders a shadow root with an input field', () => {
    const el = mountElement('se-input')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$input.tagName).toBe('INPUT')
  })

  it('reflects the value attribute onto the input', () => {
    const el = mountElement('se-input')
    el.setAttribute('value', 'hello')
    expect(el.$input.value).toBe('hello')
    expect(el.value).toBe('hello')
  })

  it('sets the value property directly on the input', () => {
    const el = mountElement('se-input')
    el.value = 'world'
    expect(el.$input.value).toBe('world')
  })

  it('shows/hides the top label based on the label attribute', () => {
    const el = mountElement('se-input')
    el.setAttribute('label', 'Width')
    expect(el.$label.textContent).toBe('Width')
    expect(el.$label.style.display).toBe('block')

    el.removeAttribute('label')
    expect(el.$label.style.display).toBe('none')
  })

  it('reflects the title attribute onto the field div', () => {
    const el = mountElement('se-input')
    el.title = 'my title'
    expect(el.$div.getAttribute('title')).toBe('my title')
    expect(el.title).toBe('my title')
  })

  it('forwards the size attribute to the inner input', () => {
    const el = mountElement('se-input')
    el.size = '4'
    expect(el.$input.getAttribute('size')).toBe('4')
    expect(el.size).toBe('4')
  })

  it('dispatches a change event and updates value on input change/keyup', () => {
    const el = mountElement('se-input')
    const handler = vi.fn()
    el.addEventListener('change', handler)

    el.$input.value = 'typed'
    el.$input.dispatchEvent(new Event('change'))

    expect(el.value).toBe('typed')
    expect(handler).toHaveBeenCalledTimes(1)

    el.$input.value = 'typed2'
    el.$input.dispatchEvent(new Event('keyup'))
    expect(el.value).toBe('typed2')
    expect(handler).toHaveBeenCalledTimes(2)
  })
})
