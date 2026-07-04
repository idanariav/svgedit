import { describe, it, expect, afterEach, vi } from 'vitest'
import { mountElement } from './testUtils.js'
import '../../../src/editor/components/seText.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-text', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('renders a shadow root with an inner div', () => {
    const el = mountElement('se-text')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$div.tagName).toBe('DIV')
  })

  it('sets the div textContent (translated) from the text attribute', () => {
    const el = mountElement('se-text')
    el.setAttribute('text', 'hello_key')
    expect(el.$div.textContent).toBe('hello_key')
  })

  it('the text getter reads back the div textContent', () => {
    const el = mountElement('se-text')
    el.setAttribute('text', 'hello_key')
    expect(el.text).toBe('hello_key')
  })

  it('sets the div title (translated) from the title attribute', () => {
    const el = mountElement('se-text')
    el.setAttribute('title', 'a_title')
    expect(el.$div.getAttribute('title')).toBe('a_title')
  })

  it('reads/writes the title property via the attribute', () => {
    const el = mountElement('se-text')
    el.title = 'another_title'
    expect(el.getAttribute('title')).toBe('another_title')
    expect(el.title).toBe('another_title')
  })

  it('forwards the id attribute onto the inner div', () => {
    const el = mountElement('se-text')
    el.setAttribute('id', 'my-id')
    expect(el.$div.id).toBe('my-id')
  })

  it('applies an inline style string from the style attribute', () => {
    const el = mountElement('se-text')
    el.setAttribute('style', 'color: red;')
    expect(el.$div.style.color).toBe('red')
  })

  it('the text setter sets the div textContent (translated)', () => {
    const el = mountElement('se-text')
    el.text = 'via_setter'
    expect(el.$div.textContent).toBe('via_setter')
  })

  it('reads/writes the value property via the inner div', () => {
    const el = mountElement('se-text')
    el.value = 'some_value'
    expect(el.$div.value).toBe('some_value')
    expect(el.value).toBe('some_value')
  })
})
