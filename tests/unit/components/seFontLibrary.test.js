import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mountElement } from './testUtils.js'
import { ensureFont, isCached } from '../../../src/editor/extensions/ext-fonts/fontStore.js'
import '../../../src/editor/components/seFontLibrary.js'

vi.mock('../../../src/editor/extensions/ext-fonts/fontStore.js', () => ({
  ensureFont: vi.fn(async () => {}),
  isCached: vi.fn(() => false),
  restoreAll: vi.fn(async () => [])
}))
vi.mock('../../../src/editor/extensions/ext-fonts/google-fonts-catalog.json', () => ({
  default: {
    categories: ['handwriting', 'sans-serif'],
    fonts: [
      { family: 'Caveat', category: 'handwriting' },
      { family: 'Roboto', category: 'sans-serif' },
      { family: 'Pacifico', category: 'handwriting' }
    ]
  }
}))

// jsdom does not implement IntersectionObserver; the component uses it purely
// to lazily trigger in-font-face previews, which is irrelevant to these tests.
class IntersectionObserverStub {
  observe () {}
  unobserve () {}
  disconnect () {}
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)

describe('se-font-library', () => {
  beforeEach(() => {
    ensureFont.mockClear()
    isCached.mockClear().mockReturnValue(false)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    document.head.querySelectorAll('link[data-font-preview]').forEach(l => l.remove())
    vi.useRealTimers()
  })

  it('renders a shadow root with the toolbar button and closed popover', () => {
    const el = mountElement('se-font-library')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.shadowRoot.querySelector('.fl-tool')).toBeTruthy()
    expect(el.shadowRoot.querySelector('.fl-popover').style.display).toBe('none')
  })

  it('sets the button title from the title attribute at connect time', () => {
    const el = mountElement('se-font-library', { title: 'Pick a font' })
    expect(el.shadowRoot.querySelector('.fl-tool').getAttribute('title')).toBe('Pick a font')
  })

  it('updates the button title when the title attribute changes after connect', () => {
    const el = mountElement('se-font-library', { title: 'Fonts' })
    el.setAttribute('title', 'New title')
    expect(el.shadowRoot.querySelector('.fl-tool').title).toBe('New title')
  })

  it('loads the bundled catalog into _fonts/_categories on first toggle', async () => {
    const el = mountElement('se-font-library')
    await el._toggle()

    expect(el._loaded).toBe(true)
    expect(el._categories).toEqual(['handwriting', 'sans-serif'])
    expect(el._fonts).toHaveLength(3)
    expect(el._open).toBe(true)
    expect(el.shadowRoot.querySelector('.fl-popover').style.display).toBe('')
    expect(el.shadowRoot.querySelector('.fl-tool').classList.contains('pressed')).toBe(true)
  })

  it('toggling again closes the popover and unpresses the button', async () => {
    const el = mountElement('se-font-library')
    await el._toggle()
    await el._toggle()

    expect(el._open).toBe(false)
    expect(el.shadowRoot.querySelector('.fl-popover').style.display).toBe('none')
    expect(el.shadowRoot.querySelector('.fl-tool').classList.contains('pressed')).toBe(false)
  })

  it('renders only fonts in the active category by default (handwriting)', async () => {
    const el = mountElement('se-font-library')
    await el._toggle()

    const items = el.shadowRoot.querySelectorAll('.fl-item[data-family]')
    const families = Array.from(items).map(i => i.dataset.family)
    expect(families).toEqual(['Caveat', 'Pacifico'])
  })

  it('renders category tab buttons and switches category on click', async () => {
    const el = mountElement('se-font-library')
    await el._toggle()

    const tabs = el.shadowRoot.querySelectorAll('.fl-cat[data-cat]')
    expect(Array.from(tabs).map(t => t.dataset.cat)).toEqual(['handwriting', 'sans-serif'])

    const sansTab = el.shadowRoot.querySelector('.fl-cat[data-cat="sans-serif"]')
    sansTab.click()

    expect(el._catId).toBe('sans-serif')
    const items = el.shadowRoot.querySelectorAll('.fl-item[data-family]')
    expect(Array.from(items).map(i => i.dataset.family)).toEqual(['Roboto'])
  })

  it('search query overrides the category filter and matches by family substring', async () => {
    vi.useFakeTimers()
    const el = mountElement('se-font-library')
    await el._toggle()

    const input = el.shadowRoot.querySelector('.fl-search input')
    input.value = 'paci'
    input.dispatchEvent(new Event('input'))
    vi.advanceTimersByTime(200)

    const items = el.shadowRoot.querySelectorAll('.fl-item[data-family]')
    expect(Array.from(items).map(i => i.dataset.family)).toEqual(['Pacifico'])
  })

  it('shows the empty state when no fonts match the search query', async () => {
    vi.useFakeTimers()
    const el = mountElement('se-font-library')
    await el._toggle()

    const input = el.shadowRoot.querySelector('.fl-search input')
    input.value = 'zzz-nomatch'
    input.dispatchEvent(new Event('input'))
    vi.advanceTimersByTime(200)

    expect(el.shadowRoot.querySelector('.fl-empty')).toBeTruthy()
  })

  it('marks a font item as cached when isCached returns true', async () => {
    isCached.mockImplementation(family => family === 'Caveat')
    const el = mountElement('se-font-library')
    await el._toggle()

    const item = el.shadowRoot.querySelector('.fl-item[data-family="Caveat"]')
    expect(item.classList.contains('is-cached')).toBe(true)
    const other = el.shadowRoot.querySelector('.fl-item[data-family="Pacifico"]')
    expect(other.classList.contains('is-cached')).toBe(false)
  })

  it('picking a font calls ensureFont, dispatches font-pick, and closes the popover', async () => {
    const el = mountElement('se-font-library')
    const handler = vi.fn()
    el.addEventListener('font-pick', handler)
    await el._toggle()

    const item = el.shadowRoot.querySelector('.fl-item[data-family="Caveat"]')
    await el._pick(item)

    expect(ensureFont).toHaveBeenCalledWith('Caveat')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].detail).toEqual({ family: 'Caveat' })
    expect(el._open).toBe(false)
  })

  it('shows an inline error in the footer and stops the loading state when ensureFont rejects', async () => {
    ensureFont.mockRejectedValueOnce(new Error('network down'))
    const el = mountElement('se-font-library')
    await el._toggle()

    const item = el.shadowRoot.querySelector('.fl-item[data-family="Caveat"]')
    await el._pick(item)

    expect(item.classList.contains('is-loading')).toBe(false)
    expect(el.shadowRoot.querySelector('.fl-foot').textContent).toContain('Could not download "Caveat"')
    // Failure does not close the popover.
    expect(el._open).toBe(true)
  })

  it('restoreCachedFonts delegates to fontStore.restoreAll', async () => {
    const el = mountElement('se-font-library')
    const result = await el.restoreCachedFonts()
    expect(result).toEqual([])
  })

  it('closes on Escape while open', async () => {
    const el = mountElement('se-font-library')
    await el._toggle()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(el._open).toBe(false)
  })

  it('closes on an outside click while open', async () => {
    const el = mountElement('se-font-library')
    await el._toggle()
    await new Promise(resolve => setTimeout(resolve, 0))
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el._open).toBe(false)
  })
})
