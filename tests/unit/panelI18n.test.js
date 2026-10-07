import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { panelKey, localizePanelFragment } from '../../src/editor/panelI18n.js'
import en from '../../src/editor/locale/lang.en.js'

const fake = (dict) => ({ exists: (k) => k in dict, t: (k) => dict[k] })

describe('panelI18n', () => {
  it('slugifies labels into panel.* keys', () => {
    expect(panelKey('Stroke & Opacity')).toBe('panel.stroke_and_opacity')
    expect(panelKey(' Font Family ')).toBe('panel.font_family')
  })

  it('translates section text and label/title attributes when the key exists', () => {
    const tpl = document.createElement('template')
    tpl.innerHTML = '<div class="sidepanel_section_label">General</div><se-spin-input label="Rotate" title="properties.angle"></se-spin-input><div class="sub_label">Unknown</div>'
    localizePanelFragment(tpl.content, fake({ 'panel.general': 'Allgemein', 'panel.rotate': 'Drehen' }))
    expect(tpl.content.querySelector('.sidepanel_section_label').textContent).toBe('Allgemein')
    const el = tpl.content.querySelector('se-spin-input')
    expect(el.getAttribute('label')).toBe('Drehen')
    expect(el.getAttribute('title')).toBe('properties.angle') // key-style values are left to the component
    expect(tpl.content.querySelector('.sub_label').textContent).toBe('Unknown')
  })

  it('every literal label in the panel templates has an English panel.* entry', () => {
    const missing = []
    for (const f of ['RightPanel.html', 'TopPanel.html']) {
      const doc = document.createElement('template')
      doc.innerHTML = readFileSync(join(__dirname, '../../src/editor/panels', f), 'utf8')
      const seen = fake(Object.fromEntries(Object.entries(en.panel).map(([k, v]) => ['panel.' + k, v])))
      doc.content.querySelectorAll('.sidepanel_section_label, .sub_label, .sidepanel_tab, summary').forEach((el) => {
        if (!el.children.length && el.textContent.trim() && !seen.exists(panelKey(el.textContent))) missing.push(el.textContent.trim())
      })
    }
    expect(missing).toEqual([])
  })
})
