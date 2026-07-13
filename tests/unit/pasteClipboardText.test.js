import { describe, expect, it } from 'vitest'
import { classifyClipboardText } from '../../src/editor/pasteClipboardText.js'

describe('classifyClipboardText', () => {
  it('classifies an internal clipboard JSON array', () => {
    const data = [{ element: 'rect', attr: { id: 'svg_1' } }]
    expect(classifyClipboardText(JSON.stringify(data))).toEqual({ type: 'internal', data })
  })

  it('classifies an external SVG document', () => {
    const text = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
    expect(classifyClipboardText(text)).toEqual({ type: 'external-svg' })
  })

  it('classifies an external SVG document embedded in surrounding text', () => {
    const text = 'some prefix\n<svg><rect/></svg>\nsome suffix'
    expect(classifyClipboardText(text)).toEqual({ type: 'external-svg' })
  })

  it('returns null for plain text that is neither internal JSON nor SVG', () => {
    expect(classifyClipboardText('just some text')).toBeNull()
  })

  it('returns null for a JSON object that is not an array', () => {
    expect(classifyClipboardText(JSON.stringify({ foo: 'bar' }))).toBeNull()
  })

  it('returns null for empty/nullish input', () => {
    expect(classifyClipboardText('')).toBeNull()
    expect(classifyClipboardText(null)).toBeNull()
    expect(classifyClipboardText(undefined)).toBeNull()
  })
})
