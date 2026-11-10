import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createToolHint } from '../../src/editor/toolHint.ts'

describe('createToolHint', () => {
  let editor
  beforeEach(() => {
    document.body.innerHTML = ''
    const root = document.createElement('div')
    document.body.append(root)
    editor = { $svgEditor: root, i18next: { t: (key) => key }, leftPanel: { clickSelect: vi.fn() } }
  })

  it('adds nothing to the page until it is first shown', () => {
    createToolHint(editor, 'x_hint')
    expect(document.getElementById('x_hint')).toBeNull()
  })

  it('shows the text and the status, and hides again', () => {
    const hint = createToolHint(editor, 'x_hint')
    hint.show('Click a shape', '1 picked')
    const el = document.getElementById('x_hint')
    expect(el.classList.contains('tool_hint')).toBe(true)
    expect(el.classList.contains('visible')).toBe(true)
    expect(el.querySelector('.tool-hint-text').textContent).toBe('Click a shape')
    expect(el.querySelector('.tool-hint-status').textContent).toBe('1 picked')
    hint.show('Click another')
    expect(el.querySelector('.tool-hint-status').textContent).toBe('')
    hint.hide()
    expect(el.classList.contains('visible')).toBe(false)
    expect(document.querySelectorAll('#x_hint')).toHaveLength(1)
  })

  it('Done leaves the tool for Select', () => {
    createToolHint(editor, 'x_hint').show('Click a shape')
    const done = document.querySelector('#x_hint .tool-hint-done')
    expect(done.textContent).toBe('common.done')
    done.click()
    expect(editor.leftPanel.clickSelect).toHaveBeenCalledTimes(1)
  })
})
