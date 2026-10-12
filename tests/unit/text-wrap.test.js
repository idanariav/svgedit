import { describe, it, expect } from 'vitest'
import { wrapParagraph, wrapText } from '../../packages/svgcanvas/core/text-wrap.js'

// Every character is 10 wide, so a box of 100 holds 10 characters.
const measure = (s) => Array.from(s).length * 10
const rows = (value, width) => wrapText(value, width, measure)
const texts = (value, width) => rows(value, width).map((r) => r.text)

describe('wrapText', () => {
  it('leaves text that fits on one row', () => {
    expect(rows('hello', 100)).toEqual([{ text: 'hello', soft: null }])
  })

  it('breaks greedily at spaces and swallows the space', () => {
    expect(rows('aaa bbb ccc ddd', 70)).toEqual([
      { text: 'aaa bbb', soft: null },
      { text: 'ccc ddd', soft: 1 }
    ])
  })

  it('counts every space a break swallows', () => {
    expect(rows('aaaaa   bbbbb', 60)).toEqual([
      { text: 'aaaaa', soft: null },
      { text: 'bbbbb', soft: 3 }
    ])
  })

  it('keeps hard newlines as paragraph starts and wraps each paragraph', () => {
    const out = rows('aaa bbb\n\nccc ddd', 40)
    expect(out.map((r) => [r.text, r.soft])).toEqual([
      ['aaa', null], ['bbb', 1], ['', null], ['ccc', null], ['ddd', 1]
    ])
  })

  it('breaks a word wider than the box inside the word', () => {
    expect(rows('abcdefghij', 40)).toEqual([
      { text: 'abcd', soft: null },
      { text: 'efgh', soft: 0 },
      { text: 'ij', soft: 0 }
    ])
  })

  it('breaks a too-long word after the text before it', () => {
    expect(texts('ab cdefghijkl', 50)).toEqual(['ab', 'cdefg', 'hijkl'])
  })

  it('breaks between CJK characters', () => {
    expect(rows('日本語のテキスト', 40)).toEqual([
      { text: '日本語の', soft: null },
      { text: 'テキスト', soft: 0 }
    ])
  })

  it('keeps leading and trailing spaces', () => {
    expect(texts('  ab  ', 100)).toEqual(['  ab  '])
  })

  it('does one character per row in a box narrower than a character', () => {
    expect(texts('abc', 1)).toEqual(['a', 'b', 'c'])
  })

  it('does not wrap when the width is not positive', () => {
    expect(texts('aaa bbb ccc', 0)).toEqual(['aaa bbb ccc'])
  })

  it('wrapParagraph returns one empty row for empty text', () => {
    expect(wrapParagraph('', 100, measure)).toEqual([{ text: '', soft: null }])
  })

  it('rebuilds the original text from its rows', () => {
    const value = 'The quick  brown fox jumps over the lazy dog'
    for (const width of [30, 55, 80, 120, 400]) {
      const out = rows(value, width)
      const rebuilt = out.map((r, i) => (i ? ' '.repeat(r.soft) : '') + r.text).join('')
      expect(rebuilt).toBe(value)
    }
  })
})
