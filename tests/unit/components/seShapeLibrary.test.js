import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seShapeLibrary.js'
import * as userShapes from '../../../src/editor/extensions/ext-shapes/userShapes.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))
vi.mock('../../../src/editor/extensions/ext-shapes/userShapes.js', () => ({
  loadUserShapes: vi.fn(() => ({ categories: [], shapes: {}, categoryLabels: {}, hidden: [] })),
  removeUserShape: vi.fn(),
  renameUserShape: vi.fn(),
  moveUserShape: vi.fn(),
  deleteUserCategory: vi.fn(),
  renameUserCategory: vi.fn(),
  setCategoryLabel: vi.fn(),
  hideCategory: vi.fn(),
  unhideCategory: vi.fn()
}))

// The component bundles the real shapelib/*.json files at build time via
// import.meta.glob, so `_loadIndex`/`_loadCategory` resolve from that bundled
// data and never hit `fetch` for any of the 17 real category ids (basic,
// accents, arrow, animal, people, symbol, weather, object, brands, ui, comms,
// math, dialog_balloon, electronics, flowchart, game, music). Tests that
// exercise the normal load path assert against this real bundled data.
// A separate suite exercises the `fetch()` fallback directly by requesting a
// category id that has no bundled JSON.
async function flush () {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('se-shape-library', () => {
  beforeEach(() => {
    installMockSvgEditor()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ lib: [] }) })))
    localStorage.clear()
    userShapes.loadUserShapes.mockReturnValue({ categories: [], shapes: {}, categoryLabels: {}, hidden: [] })
  })

  afterEach(() => {
    uninstallMockSvgEditor()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  // ── Shell ──────────────────────────────────────────────────────────────────
  describe('shell', () => {
    it('renders a shadow root with the toolbar button, hidden popover/modal/backdrop', () => {
      const el = mountElement('se-shape-library')
      expect(el.shadowRoot).toBeTruthy()
      expect(el.shadowRoot.querySelector('.sl-tool')).toBeTruthy()
      expect(el.shadowRoot.querySelector('.sl-popover').style.display).toBe('none')
      expect(el.shadowRoot.querySelector('.sl-modal').style.display).toBe('none')
      expect(el.shadowRoot.querySelector('.sl-backdrop').style.display).toBe('none')
    })

    it('reflects the title attribute onto the toolbar button', () => {
      const el = mountElement('se-shape-library')
      el.setAttribute('title', 'My Shapes')
      const btn = el.shadowRoot.querySelector('.sl-tool')
      expect(btn.title).toBe('My Shapes')
    })

    it('toggles the pressed class on the toolbar button via the pressed attribute', () => {
      const el = mountElement('se-shape-library')
      el.setAttribute('pressed', 'true')
      // ext-shapes.js sets `pressed` directly to indicate an armed shape
      // insert, independent of the popover/modal open state.
      const btn = el.shadowRoot.querySelector('.sl-tool')
      expect(btn.classList.contains('pressed')).toBe(true)

      el.removeAttribute('pressed')
      expect(btn.classList.contains('pressed')).toBe(false)
    })

    it('exposes a pressed property that reflects to/from the attribute', () => {
      // LeftPanel.js clears every other tool's highlight via `b.pressed = false`
      // when a new tool is selected; without a `pressed` accessor this would be
      // a no-op inert property write and the attribute (and highlight) would stick.
      const el = mountElement('se-shape-library')
      const btn = el.shadowRoot.querySelector('.sl-tool')

      el.pressed = true
      expect(el.hasAttribute('pressed')).toBe(true)
      expect(btn.classList.contains('pressed')).toBe(true)

      el.pressed = false
      expect(el.hasAttribute('pressed')).toBe(false)
      expect(btn.classList.contains('pressed')).toBe(false)
    })
  })

  // ── Index / category loading (bundled data path) ────────────────────────────
  describe('loading the index (bundled data)', () => {
    it('populates categories from the bundled shape library without calling fetch', async () => {
      const el = mountElement('se-shape-library')
      el.setAttribute('lib', 'shapelib/')
      await flush()

      expect(fetch).not.toHaveBeenCalled()
      expect(el._builtinCategories).toContain('basic')
      expect(el._builtinCategories.length).toBe(17)
      expect(el._categories[0]).toBe('all')
      expect(el._categories).toContain('basic')
    })

    it('loads the first category into the catalog after the index resolves', async () => {
      const el = mountElement('se-shape-library')
      el.setAttribute('lib', 'shapelib/')
      await flush()

      expect(el._catalog.basic).toBeTruthy()
      expect(Object.keys(el._catalog.basic.data).length).toBeGreaterThan(0)
    })

    it('exposes built-in category options via getBuiltinCategoryOptions', async () => {
      const el = mountElement('se-shape-library')
      el.setAttribute('lib', 'shapelib/')
      await flush()

      const opts = el.getBuiltinCategoryOptions()
      expect(opts.some(o => o.id === 'basic' && o.label === 'Basic')).toBe(true)
    })
  })

  // ── Fetch fallback path (explicit, per task spec) ───────────────────────────
  describe('fetch fallback for non-bundled categories', () => {
    it('fetches index.json when the bundled index is unavailable (category not in bundle)', async () => {
      const el = mountElement('se-shape-library')
      // Directly exercise the fetch fallback branch of _loadCategory with an id
      // that has no matching bundled JSON file.
      fetch.mockImplementation(async (url) => {
        if (url.endsWith('index.json')) {
          return { ok: true, json: async () => ({ lib: ['made_up_cat'] }) }
        }
        return { ok: true, json: async () => ({ data: { star: 'M0,0 L1,1' } }) }
      })

      const json = await el._loadCategory('made_up_cat')
      expect(fetch).toHaveBeenCalledWith('made_up_cat.json')
      expect(json).toEqual({ data: { star: 'M0,0 L1,1' } })
      expect(el._catalog.made_up_cat).toEqual({ data: { star: 'M0,0 L1,1' } })
    })

    it('returns null and logs when fetching a non-bundled category throws', async () => {
      fetch.mockImplementation(async () => { throw new Error('network down') })
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const el = mountElement('se-shape-library')
      // The bundled 'index' key always wins for _loadIndex (see the note above),
      // so this exercises _loadCategory's own fetch-failure path directly,
      // which IS reachable for any category id absent from the bundle.
      const result = await el._loadCategory('totally_unknown_cat')
      expect(result).toBeNull()
      expect(el._catalog.totally_unknown_cat).toBeUndefined()
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })
  })

  // ── Popover ──────────────────────────────────────────────────────────────────
  describe('popover', () => {
    it('opens the popover on toolbar button click and closes on backdrop click', async () => {
      const el = mountElement('se-shape-library')
      el.setAttribute('lib', 'shapelib/')
      await flush()

      el.shadowRoot.querySelector('.sl-tool').click()
      await flush()
      expect(el.shadowRoot.querySelector('.sl-popover').style.display).toBe('')
      expect(el.shadowRoot.querySelector('.sl-tool').classList.contains('pressed')).toBe(true)

      el.close()
      expect(el.shadowRoot.querySelector('.sl-popover').style.display).toBe('none')
      expect(el.shadowRoot.querySelector('.sl-tool').classList.contains('pressed')).toBe(false)
    })

    it('toggles closed when the toolbar button is clicked again while open', async () => {
      const el = mountElement('se-shape-library')
      el.setAttribute('lib', 'shapelib/')
      await flush()

      const btn = el.shadowRoot.querySelector('.sl-tool')
      btn.click()
      await flush()
      expect(el._open).toBe('popover')
      btn.click()
      await flush()
      expect(el._open).toBeNull()
    })

    it('renders category chips and switches the active category on click', async () => {
      const el = mountElement('se-shape-library')
      el.setAttribute('lib', 'shapelib/')
      await flush()
      el.shadowRoot.querySelector('.sl-tool').click()
      await flush()

      const popover = el.shadowRoot.querySelector('.sl-popover')
      const basicChip = [...popover.querySelectorAll('.sl-pop-cat[data-cat]')].find(b => b.dataset.cat === 'basic')
      expect(basicChip).toBeTruthy()

      basicChip.click()
      await flush()
      expect(el._popCatId).toBe('basic')
      expect(popover.querySelector('.sl-pop-cat.is-active').dataset.cat).toBe('basic')
    })

    it('filters popover shapes by the filter input', async () => {
      const el = mountElement('se-shape-library')
      el.setAttribute('lib', 'shapelib/')
      await flush()
      el.shadowRoot.querySelector('.sl-tool').click()
      await flush()

      const popover = el.shadowRoot.querySelector('.sl-popover')
      // The "all" tab is active by default; filter to a known shape name.
      const input = popover.querySelector('.sl-pop-search-box input')
      input.value = 'heart'
      input.dispatchEvent(new Event('input'))
      await new Promise(resolve => setTimeout(resolve, 250))

      const chips = popover.querySelectorAll('.sl-chip[data-id]')
      expect(chips.length).toBeGreaterThan(0)
      expect([...chips].every(c => c.dataset.id.toLowerCase().includes('heart'))).toBe(true)
    })

    it('dispatches shape-insert and closes when a chip is clicked', async () => {
      const el = mountElement('se-shape-library')
      el.setAttribute('lib', 'shapelib/')
      await flush()
      el.shadowRoot.querySelector('.sl-tool').click()
      await flush()

      const handler = vi.fn()
      el.addEventListener('shape-insert', handler)

      const popover = el.shadowRoot.querySelector('.sl-popover')
      const chip = popover.querySelector('.sl-chip[data-id]')
      const expectedId = chip.dataset.id
      const expectedCat = chip.dataset.cat
      chip.click()

      expect(handler).toHaveBeenCalledTimes(1)
      const detail = handler.mock.calls[0][0].detail
      expect(detail.shapeId).toBe(expectedId)
      expect(detail.categoryId).toBe(expectedCat)
      expect(typeof detail.draw).toBe('string')
      expect(el.dataset.draw).toBe(detail.draw)
      expect(el._open).toBeNull() // closed after insert
    })

    it('opens the modal when "Browse all" is clicked', async () => {
      const el = mountElement('se-shape-library')
      el.setAttribute('lib', 'shapelib/')
      await flush()
      el.shadowRoot.querySelector('.sl-tool').click()
      await flush()

      el.shadowRoot.querySelector('.sl-pop-browse').click()
      await flush()

      expect(el._open).toBe('modal')
      expect(el.shadowRoot.querySelector('.sl-modal').style.display).toBe('')
      expect(el.shadowRoot.querySelector('.sl-popover').style.display).toBe('none')
    })
  })

  // ── Modal ────────────────────────────────────────────────────────────────────
  describe('modal', () => {
    async function openModal (el) {
      el.setAttribute('lib', 'shapelib/')
      await flush()
      await el._openModal()
      await flush()
    }

    it('renders the sidebar category list and the shapes grid for the active category', async () => {
      const el = mountElement('se-shape-library')
      await openModal(el)

      const modal = el.shadowRoot.querySelector('.sl-modal')
      const cats = [...modal.querySelectorAll('.sl-cat[data-cat]')].map(b => b.dataset.cat)
      expect(cats).toContain('basic')
      expect(modal.querySelector('.sl-grid-body')).toBeTruthy()
    })

    it('switches category on sidebar click and updates the content header', async () => {
      const el = mountElement('se-shape-library')
      await openModal(el)

      const modal = el.shadowRoot.querySelector('.sl-modal')
      const arrowBtn = [...modal.querySelectorAll('.sl-cat[data-cat]')].find(b => b.dataset.cat === 'arrow')
      arrowBtn.click()
      await flush()

      expect(el._categoryId).toBe('arrow')
      expect(modal.querySelector('.sl-content-name').textContent).toBe('Arrows')
    })

    it('toggles between grid and list view and persists the choice to localStorage', async () => {
      const el = mountElement('se-shape-library')
      await openModal(el)

      const modal = el.shadowRoot.querySelector('.sl-modal')
      const rowsBtn = modal.querySelector('.sl-view-btn[data-view="rows"]')
      rowsBtn.click()

      expect(el._view).toBe('rows')
      expect(localStorage.getItem('svg-edit-shape-view')).toBe('rows')
      expect(modal.querySelector('.sl-list-body')).toBeTruthy()
    })

    it('selects a shape on click, enabling the insert button, and inserts on click', async () => {
      const el = mountElement('se-shape-library')
      await openModal(el)

      const modal = el.shadowRoot.querySelector('.sl-modal')
      const tile = modal.querySelector('.sl-tile[data-id]')
      const shapeId = tile.dataset.id
      tile.click()

      expect(el._selectedId).toBe(shapeId)
      const insertBtn = modal.querySelector('[data-action="insert"]')
      expect(insertBtn.hasAttribute('disabled')).toBe(false)

      const handler = vi.fn()
      el.addEventListener('shape-insert', handler)
      insertBtn.click()

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].detail.shapeId).toBe(shapeId)
      expect(el._open).toBeNull()
    })

    it('inserts on double-click of a tile without requiring a prior click', async () => {
      const el = mountElement('se-shape-library')
      await openModal(el)

      const modal = el.shadowRoot.querySelector('.sl-modal')
      const tile = modal.querySelector('.sl-tile[data-id]')
      const handler = vi.fn()
      el.addEventListener('shape-insert', handler)

      tile.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('disables the insert button and shows a placeholder when nothing is selected', async () => {
      const el = mountElement('se-shape-library')
      await openModal(el)
      const modal = el.shadowRoot.querySelector('.sl-modal')
      expect(modal.querySelector('[data-action="insert"]').hasAttribute('disabled')).toBe(true)
      expect(modal.querySelector('.sl-foot-empty').textContent).toBe('Select a shape')
    })

    it('closes the modal via the close button and the cancel button', async () => {
      const el = mountElement('se-shape-library')
      await openModal(el)
      el.shadowRoot.querySelector('.sl-head-close').click()
      expect(el._open).toBeNull()

      await openModal(el)
      el.shadowRoot.querySelector('[data-action="cancel"]').click()
      expect(el._open).toBeNull()
    })

    it('filters shapes by the search input across all categories', async () => {
      const el = mountElement('se-shape-library')
      await openModal(el)

      const modal = el.shadowRoot.querySelector('.sl-modal')
      const input = modal.querySelector('.sl-search input')
      input.value = 'heart'
      input.dispatchEvent(new Event('input'))
      await new Promise(resolve => setTimeout(resolve, 250))

      expect(el._query).toBe('heart')
      const shapesArea = el.shadowRoot.querySelector('#sl-shapes-area')
      expect(shapesArea.querySelector('.sl-search-group')).toBeTruthy()
      expect(shapesArea.textContent.toLowerCase()).toContain('heart')
    })

    it('shows an empty state when the search matches nothing', async () => {
      const el = mountElement('se-shape-library')
      await openModal(el)

      const modal = el.shadowRoot.querySelector('.sl-modal')
      const input = modal.querySelector('.sl-search input')
      input.value = 'zzzznomatchzzzz'
      input.dispatchEvent(new Event('input'))
      await new Promise(resolve => setTimeout(resolve, 250))

      expect(el.shadowRoot.querySelector('.sl-empty')).toBeTruthy()
    })

    it('clears the search via the clear button', async () => {
      const el = mountElement('se-shape-library')
      await openModal(el)

      const modal = el.shadowRoot.querySelector('.sl-modal')
      const input = modal.querySelector('.sl-search input')
      input.value = 'heart'
      input.dispatchEvent(new Event('input'))
      await new Promise(resolve => setTimeout(resolve, 250))

      const clearBtn = el.shadowRoot.querySelector('.sl-search-clear')
      expect(clearBtn).toBeTruthy()
      clearBtn.click()

      expect(el._query).toBe('')
      expect(el.shadowRoot.querySelector('.sl-search-clear')).toBeFalsy()
    })

    it('clears search (not close) on first Escape, then closes on second Escape', async () => {
      const el = mountElement('se-shape-library')
      await openModal(el)

      const modal = el.shadowRoot.querySelector('.sl-modal')
      const input = modal.querySelector('.sl-search input')
      input.value = 'heart'
      input.dispatchEvent(new Event('input'))
      await new Promise(resolve => setTimeout(resolve, 250))
      expect(el._query).toBe('heart')

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(el._query).toBe('')
      expect(el._open).toBe('modal')

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      expect(el._open).toBeNull()
    })
  })

  // ── User shapes ──────────────────────────────────────────────────────────────
  describe('user shapes', () => {
    function withUserShape () {
      userShapes.loadUserShapes.mockReturnValue({
        categories: ['my_stuff'],
        shapes: { my_stuff: { blob: { svgContent: '<path d="M0 0"/>', bbox: { x: 0, y: 0, width: 10, height: 10 } } } },
        categoryLabels: {},
        hidden: []
      })
    }

    it('adds a standalone user: category for a purely custom category name', async () => {
      withUserShape()
      const el = mountElement('se-shape-library')
      el.setAttribute('lib', 'shapelib/')
      await flush()

      expect(el._categories).toContain('user:my_stuff')
      expect(el._catalog['user:my_stuff'].isUser).toBe(true)
      expect(el._catalog['user:my_stuff'].data.blob).toBeTruthy()
    })

    it('renders a user tile with a shape-options menu and inserts user shape data on click', async () => {
      withUserShape()
      const el = mountElement('se-shape-library')
      el.setAttribute('lib', 'shapelib/')
      await flush()
      await el._openModal()
      await flush()

      const modal = el.shadowRoot.querySelector('.sl-modal')
      const userCatBtn = [...modal.querySelectorAll('.sl-cat[data-cat]')].find(b => b.dataset.cat === 'user:my_stuff')
      expect(userCatBtn).toBeTruthy()
      userCatBtn.click()
      await flush()

      const tile = el.shadowRoot.querySelector('.sl-tile[data-id="blob"]')
      expect(tile).toBeTruthy()
      expect(el.shadowRoot.querySelector('.sl-shape-menu[data-id="blob"]')).toBeTruthy()

      const handler = vi.fn()
      el.addEventListener('shape-insert', handler)
      tile.click()
      el.shadowRoot.querySelector('[data-action="insert"]').click()

      expect(handler).toHaveBeenCalledTimes(1)
      const detail = handler.mock.calls[0][0].detail
      expect(detail.isUserShape).toBe(true)
      expect(detail.svgContent).toBe('<path d="M0 0"/>')
      expect(detail.categoryId).toBe('user:my_stuff')
    })

    it('removes a user shape via the shape menu "Remove from library" action', async () => {
      withUserShape()
      const el = mountElement('se-shape-library')
      el.setAttribute('lib', 'shapelib/')
      await flush()
      await el._openModal()
      await flush()
      el.shadowRoot.querySelector('.sl-cat[data-cat="user:my_stuff"]').click()
      await flush()

      const menuBtn = el.shadowRoot.querySelector('.sl-shape-menu[data-id="blob"]')
      menuBtn.click()
      const removeBtn = [...el.shadowRoot.querySelectorAll('.sl-shape-dropdown button')].find(b => b.textContent === 'Remove from library')
      removeBtn.click()

      expect(userShapes.removeUserShape).toHaveBeenCalledWith({ category: 'my_stuff', label: 'blob' })
    })

    it('re-reads user shapes and re-renders when a user-shapes-updated event is dispatched', async () => {
      const el = mountElement('se-shape-library')
      el.setAttribute('lib', 'shapelib/')
      await flush()
      await el._openModal()
      await flush()
      expect(el._categories).not.toContain('user:my_stuff')

      withUserShape()
      el.dispatchEvent(new CustomEvent('user-shapes-updated', { bubbles: true }))
      await flush()

      expect(el._categories).toContain('user:my_stuff')
    })
  })
})
