import { describe, it, expect } from 'vitest'
import { collectDocumentColors, normalizeColor } from '../../src/editor/documentColors.js'

describe('documentColors', () => {
  it('normalises solid colours and rejects everything else', () => {
    expect(normalizeColor('#ABC')).toBe('#aabbcc')
    expect(normalizeColor('#FF0000')).toBe('#ff0000')
    expect(normalizeColor('rgb(255, 0, 16)')).toBe('#ff0010')
    for (const bad of ['none', 'url(#g)', 'currentColor', 'red', '', null, 'rgb(300,0,0)']) {
      expect(normalizeColor(bad)).toBeNull()
    }
  })

  it('collects distinct fill/stroke colours, most recent first, skipping <defs>', () => {
    const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    root.innerHTML = `
      <defs><rect fill="#000001"/></defs>
      <rect fill="#ff0000" stroke="#00f"/>
      <rect fill="#FF0000" stroke="none"/>
      <circle style="fill: rgb(0, 255, 0)" fill="url(#g)"/>`
    // #00ff00 is on the last element, #ff0000 on the second, #0000ff only on the first
    expect(collectDocumentColors(root)).toEqual(['#00ff00', '#ff0000', '#0000ff'])
    expect(collectDocumentColors(root, 1)).toEqual(['#00ff00'])
    expect(collectDocumentColors(null)).toEqual([])
  })

  it('shows only the last five colours by default', () => {
    const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    root.innerHTML = Array.from({ length: 8 }, (_, i) => `<rect fill="#00000${i}"/>`).join('')
    expect(collectDocumentColors(root)).toEqual(['#000007', '#000006', '#000005', '#000004', '#000003'])
  })
})
