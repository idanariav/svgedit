import { describe, it, expect, afterEach } from 'vitest'
import { createHsvBox } from '../../../src/editor/components/colorPicker/panels/shared/HsvBox.js'

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
