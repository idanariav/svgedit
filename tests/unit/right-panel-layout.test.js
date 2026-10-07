import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const html = readFileSync(join(__dirname, '../../src/editor/panels/RightPanel.html'), 'utf8')
const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')

describe('right panel layout', () => {
  it('keeps ID and Class out of General, inside a collapsed Advanced group', () => {
    const general = doc.querySelector('#sidepanel_general')
    expect(general.querySelector('#elem_id, #elem_class')).toBeNull()
    const adv = doc.querySelector('#sidepanel_advanced details')
    expect(adv).toBeTruthy()
    expect(adv.hasAttribute('open')).toBe(false)
    expect(adv.querySelector('#elem_id')).toBeTruthy()
    expect(adv.querySelector('#elem_class')).toBeTruthy()
  })

  it('General still holds X / Y / Rotate together', () => {
    const ids = [...doc.querySelectorAll('#sidepanel_general [id]')].map((e) => e.id)
    expect(ids).toEqual(expect.arrayContaining(['selected_x', 'selected_y', 'angle']))
  })

  it('Advanced sits in the Design tab and the Text tab has an empty-state hint', () => {
    expect(doc.querySelector('#tab_design #sidepanel_advanced')).toBeTruthy()
    expect(doc.querySelector('#tab_text .sidepanel_hint')).toBeTruthy()
  })
})
