import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { compactHtmlTemplate } from '../../scripts/html-template.mjs'

const TEMPLATE_DIRS = ['src/editor/templates', 'src/editor/panels', 'src/editor/dialogs']
const templates = TEMPLATE_DIRS.flatMap(dir =>
  readdirSync(dir).filter(f => f.endsWith('.html')).map(f => join(dir, f)))

const parse = (html) => {
  const t = document.createElement('template')
  t.innerHTML = html
  return t.content
}

describe('compactHtmlTemplate', () => {
  it('drops the indentation between tags', () => {
    expect(compactHtmlTemplate('<div>\n  <span>a</span>\n  <span>b</span>\n</div>\n'))
      .toBe('<div><span>a</span><span>b</span></div>')
  })

  it('keeps CSS operators intact (calc needs the spaces around -)', () => {
    const out = compactHtmlTemplate('<style>\n  .x { max-width: calc(100vw - 32px); }\n</style>')
    expect(out).toContain('calc(100vw - 32px)')
  })

  it('keeps attributes on consecutive lines apart', () => {
    const el = parse(compactHtmlTemplate('<se-input id="a"\n    label="L"\n    title="T"></se-input>')).firstElementChild
    expect(el.getAttribute('label')).toBe('L')
    expect(el.getAttribute('title')).toBe('T')
  })

  it('keeps entities, punctuation and the word break of a wrapped line', () => {
    const text = parse(compactHtmlTemplate('<p>\n  Stroke &amp; Opacity, a / b - c!\n  next line\n</p>')).firstElementChild.textContent
    expect(text).toBe('Stroke & Opacity, a / b - c!\nnext line')
  })

  it('keeps a space on the same line as a tag', () => {
    expect(compactHtmlTemplate('<p><b>Hi</b> there</p>')).toBe('<p><b>Hi</b> there</p>')
  })

  it.each(templates)('%s parses to the same elements as the raw file', (file) => {
    const raw = readFileSync(file, 'utf8')
    const shape = (frag) => [...frag.querySelectorAll('*')].map(el =>
      el.tagName + [...el.attributes].map(a => ` ${a.name}=${a.value}`).join(''))
    expect(shape(parse(compactHtmlTemplate(raw)))).toEqual(shape(parse(raw)))
  })
})
