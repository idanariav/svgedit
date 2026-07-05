import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor } from './testUtils.js'

const activateCommandSearchResult = vi.fn()
let mockCatalog = () => [
  { group: 'Tools', actions: [{ id: 'undo', label: 'Undo' }, { id: 'redo', label: 'Redo' }] },
  { group: 'Style', actions: [{ id: 'fill_color', label: 'Fill color' }] }
]

vi.mock('../../../src/editor/commandSearch.js', () => ({
  buildCommandSearchCatalog: (...args) => mockCatalog(...args),
  activateCommandSearchResult: (...args) => activateCommandSearchResult(...args)
}))

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

// jsdom doesn't implement <dialog>'s showModal()/close() (only the plain
// `open` attribute reflection). Polyfill just enough for the component's
// open()/close() lifecycle to be testable.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

import '../../../src/editor/dialogs/commandSearchDialog.js'

function mountDialog () {
  const el = document.createElement('se-command-search-dialog')
  document.body.append(el)
  return el
}

describe('se-command-search-dialog', () => {
  beforeEach(() => {
    installMockSvgEditor()
    Element.prototype.scrollIntoView = vi.fn()
    activateCommandSearchResult.mockClear()
    mockCatalog = () => [
      { group: 'Tools', actions: [{ id: 'undo', label: 'Undo' }, { id: 'redo', label: 'Redo' }] },
      { group: 'Style', actions: [{ id: 'fill_color', label: 'Fill color' }] }
    ]
  })
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with a search input and results list', () => {
    const el = mountDialog()
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$search).toBeTruthy()
    expect(el.$list).toBeTruthy()
  })

  it('open() renders the full catalog and focuses the search field', () => {
    const el = mountDialog()
    el.open()
    const rows = el.$list.querySelectorAll('.cs-row')
    expect(rows.length).toBe(3)
    expect(el._flatIds).toEqual(['undo', 'redo', 'fill_color'])
  })

  it('filters results as the query changes', () => {
    const el = mountDialog()
    el.open()
    el.$search.value = 'fill'
    el.$search.dispatchEvent(new Event('input'))
    const rows = el.$list.querySelectorAll('.cs-row')
    expect(rows.length).toBe(1)
    expect(rows[0].dataset.id).toBe('fill_color')
  })

  it('shows an empty state when nothing matches', () => {
    const el = mountDialog()
    el.open()
    el.$search.value = 'nonexistent-xyz'
    el.$search.dispatchEvent(new Event('input'))
    expect(el.$list.querySelector('.cs-empty')).toBeTruthy()
  })

  it('ArrowDown/ArrowUp move the highlighted row, wrapping at the ends', () => {
    const el = mountDialog()
    el.open()
    expect(el._selectedIndex).toBe(0)
    el.$search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(el._selectedIndex).toBe(1)
    el.$search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    el.$search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(el._selectedIndex).toBe(2) // wrapped to the last result
  })

  it('Enter activates the highlighted row and closes the dialog', () => {
    const el = mountDialog()
    el.open()
    el.close = vi.fn()
    el.$search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    el.$search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(activateCommandSearchResult).toHaveBeenCalledWith(globalThis.svgEditor, 'redo')
    expect(el.close).toHaveBeenCalled()
  })

  it('clicking a row activates it and closes the dialog', () => {
    const el = mountDialog()
    el.open()
    el.close = vi.fn()
    el.$list.querySelector('[data-id="fill_color"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(activateCommandSearchResult).toHaveBeenCalledWith(globalThis.svgEditor, 'fill_color')
    expect(el.close).toHaveBeenCalled()
  })

  it('clicking the dialog backdrop (not the inner container) closes it', () => {
    const el = mountDialog()
    el.open()
    el.close = vi.fn()
    el.$dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el.close).toHaveBeenCalled()
  })
})
