import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seSelect.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-select', () => {
  beforeEach(() => installMockSvgEditor())
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with a native select', () => {
    const el = mountElement('se-select')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$select.tagName).toBe('SELECT')
  })

  it('populates options (translated) from the options attribute', () => {
    const el = mountElement('se-select')
    el.setAttribute('options', 'opt_one,opt_two,opt_three')
    const texts = Array.from(el.$select.options).map(o => o.textContent)
    expect(texts).toEqual(['opt_one', 'opt_two', 'opt_three'])
  })

  it('clears existing options when options is set to an empty string', () => {
    const el = mountElement('se-select')
    el.setAttribute('options', 'a,b')
    expect(el.$select.options.length).toBe(2)
    el.setAttribute('options', '')
    expect(el.$select.options.length).toBe(0)
  })

  it('assigns values to existing options via the values attribute', () => {
    const el = mountElement('se-select')
    el.setAttribute('options', 'Label A,Label B')
    el.setAttribute('values', 'a::b')
    expect(el.$select.children[0].getAttribute('value')).toBe('a')
    expect(el.$select.children[1].getAttribute('value')).toBe('b')
  })

  it('shows/hides the top label based on the label attribute and hides the fallback icon', () => {
    const el = mountElement('se-select')
    el.setAttribute('label', 'Font')
    expect(el.$label.textContent).toBe('Font')
    expect(el.$label.style.display).toBe('block')
    expect(el.$iconWrap.style.display).toBe('none')

    el.setAttribute('label', '')
    expect(el.$label.style.display).toBe('none')
  })

  it('reflects the title attribute translated onto the select', () => {
    const el = mountElement('se-select')
    el.setAttribute('title', 'pick_a_font')
    expect(el.$select.getAttribute('title')).toBe('pick_a_font')
  })

  it('toggles the disabled attribute on the select', () => {
    const el = mountElement('se-select')
    el.setAttribute('disabled', 'true')
    expect(el.$select.hasAttribute('disabled')).toBe(true)
    el.removeAttribute('disabled')
    expect(el.$select.hasAttribute('disabled')).toBe(false)
  })

  it('forwards height/width attributes as inline styles on the select', () => {
    const el = mountElement('se-select')
    el.setAttribute('height', '30px')
    el.setAttribute('width', '120px')
    expect(el.$select.style.height).toBe('30px')
    expect(el.$select.style.width).toBe('120px')
  })

  it('reads/writes label, width, height, value, disabled properties', () => {
    const el = mountElement('se-select')
    el.label = 'l'
    expect(el.getAttribute('label')).toBe('l')
    expect(el.label).toBe('l')

    el.width = '10px'
    expect(el.getAttribute('width')).toBe('10px')
    expect(el.width).toBe('10px')

    el.height = '20px'
    expect(el.getAttribute('height')).toBe('20px')
    expect(el.height).toBe('20px')

    el.setAttribute('options', 'a,b')
    el.value = 'a'
    expect(el.value).toBe('a')

    el.disabled = true
    expect(el.$select.getAttribute('disabled')).toBe('true')
    expect(el.disabled).toBe('true')
  })

  it('adds a new option via addOption() and skips duplicates', () => {
    const el = mountElement('se-select')
    el.addOption('woff2-font', 'My Font')
    expect(el.$select.options.length).toBe(1)
    expect(el.$select.options[0].value).toBe('woff2-font')
    expect(el.$select.options[0].textContent).toBe('My Font')

    el.addOption('woff2-font', 'My Font (dup)')
    expect(el.$select.options.length).toBe(1)
  })

  it('dispatches a change event with the selected value and updates value on native select change', () => {
    const el = mountElement('se-select')
    el.setAttribute('options', 'a,b')
    el.setAttribute('values', 'a::b')
    const handler = vi.fn()
    el.addEventListener('change', handler)

    el.$select.value = 'b'
    el.$select.dispatchEvent(new Event('change'))

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].detail).toEqual({ value: 'b' })
    expect(el.value).toBe('b')
  })
})
