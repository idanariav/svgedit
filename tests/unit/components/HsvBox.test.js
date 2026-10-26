import { describe, it, expect, afterEach } from 'vitest'
import { createHsvBox } from '../../../src/editor/components/colorPicker/panels/shared/HsvBox.ts'

function paste (input, text) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  event.clipboardData = { getData: () => text }
  input.dispatchEvent(event)
}

describe('createHsvBox — hex field paste', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('strips a leading "#" from pasted text before applying the hex', () => {
    const box = createHsvBox('000000', 100)
    document.body.appendChild(box)
    const hexInput = box.querySelector('[data-field="hex"] input')

    paste(hexInput, '#ff00aa')

    expect(box.hex.toLowerCase()).toBe('ff00aa')
    expect(hexInput.value).toBe('ff00aa')
  })

  it('strips "#" characters wherever they appear, then truncates to 6 chars', () => {
    const box = createHsvBox('000000', 100)
    document.body.appendChild(box)
    const hexInput = box.querySelector('[data-field="hex"] input')

    paste(hexInput, '#112233445#')

    expect(box.hex.toLowerCase()).toBe('112233')
  })

  it('ignores an empty paste (e.g. clipboard containing only "#")', () => {
    const box = createHsvBox('2962ff', 100)
    document.body.appendChild(box)
    const hexInput = box.querySelector('[data-field="hex"] input')
    const before = box.hex

    paste(hexInput, '#')

    expect(box.hex).toBe(before)
  })
})

describe('createHsvBox — exact hex round-trip', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  // Hex colors whose HSV conversion doesn't round-trip losslessly through
  // integer h/s/v (e.g. 2A52BE -> hsv(224,78,75) -> back to 2a52bf).
  const lossyHexColors = ['2A52BE', '6495ED', '1E90FF', '32CD32', '4682B4', 'DAA520']

  it.each(lossyHexColors)('preserves %s exactly after typing it into the hex field', (hex) => {
    const box = createHsvBox('000000', 100)
    document.body.appendChild(box)
    const hexInput = box.querySelector('[data-field="hex"] input')

    hexInput.value = hex
    hexInput.dispatchEvent(new Event('input'))

    expect(box.hex.toLowerCase()).toBe(hex.toLowerCase())
    expect(hexInput.value.toLowerCase()).toBe(hex.toLowerCase())
  })

  it('keeps the hex field showing the typed value after a blur-triggered redraw', () => {
    const box = createHsvBox('000000', 100)
    document.body.appendChild(box)
    const hexInput = box.querySelector('[data-field="hex"] input')

    hexInput.value = '2A52BE'
    hexInput.dispatchEvent(new Event('input'))
    hexInput.dispatchEvent(new Event('blur'))

    expect(hexInput.value.toLowerCase()).toBe('2a52be')
  })

  it('emits the exact typed hex on the color-change event', () => {
    const box = createHsvBox('000000', 100)
    document.body.appendChild(box)
    const hexInput = box.querySelector('[data-field="hex"] input')

    let emittedHex = null
    box.addEventListener('color-change', (e) => { emittedHex = e.detail.hex })

    hexInput.value = '2A52BE'
    hexInput.dispatchEvent(new Event('input'))

    expect(emittedHex.toLowerCase()).toBe('2a52be')
  })
})

describe('createHsvBox — click without a drag', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it.each(['.cp-hsv', '.cp-hue', '.cp-alpha'])('a single pointerdown on %s emits color-change', (sel) => {
    const box = createHsvBox('ff0000', 100)
    document.body.appendChild(box)
    const el = box.querySelector(sel)
    el.setPointerCapture = () => {}
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 })
    const emitted = []
    box.addEventListener('color-change', (e) => emitted.push(e.detail))
    el.dispatchEvent(new MouseEvent('pointerdown', { clientX: 20, clientY: 30, bubbles: true }))
    expect(emitted).toHaveLength(1)
  })
})
