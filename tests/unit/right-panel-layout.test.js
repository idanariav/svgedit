import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const html = readFileSync(join(__dirname, '../../src/editor/panels/RightPanel.html'), 'utf8')
const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')

describe('right panel layout', () => {
  it('keeps Class in General, always visible', () => {
    const general = doc.querySelector('#sidepanel_general')
    expect(general.querySelector('#elem_class')).toBeTruthy()
    expect(general.querySelector('#elem_id, #selected_x, #selected_y, #angle')).toBeNull()
  })

  it('Advanced is collapsed and holds X / Y / Rotate / ID', () => {
    const adv = doc.querySelector('#sidepanel_advanced details')
    expect(adv).toBeTruthy()
    expect(adv.hasAttribute('open')).toBe(false)
    for (const id of ['selected_x', 'selected_y', 'angle', 'elem_id']) {
      expect(adv.querySelector('#' + id), id).toBeTruthy()
    }
    expect(adv.querySelector('#elem_class')).toBeNull()
  })

  it('Advanced sits in the Design tab and the Text tab has an empty-state hint', () => {
    expect(doc.querySelector('#tab_design #sidepanel_advanced')).toBeTruthy()
    expect(doc.querySelector('#tab_text .sidepanel_hint')).toBeTruthy()
  })
})
