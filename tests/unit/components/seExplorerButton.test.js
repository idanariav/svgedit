import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seExplorerButton.js'
import '../../../src/editor/components/seButton.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

// se-explorerbutton's constructor looks up `[id="workarea"]` from the
// closest editor root (falls back to `document` — see domScope.js) and
// attaches a click listener to it, so one must exist before construction.
function addWorkarea () {
  const workarea = document.createElement('div')
  workarea.id = 'workarea'
  document.body.append(workarea)
  return workarea
}

// Shape expected by the `lib` attribute handler: fetch(`${lib}index.json`) -> { lib: [...] }
function mockLibIndexFetch (libNames, libData) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url.endsWith('index.json')) {
      return { ok: true, json: async () => ({ lib: libNames }) }
    }
    const name = url.slice(url.lastIndexOf('/') + 1).replace('.json', '')
    const data = libData[name]
    if (!data) throw new Error(`unexpected fetch: ${url}`)
    return { ok: true, json: async () => data }
  }))
}

describe('se-explorerbutton', () => {
  beforeEach(() => installMockSvgEditor())
  afterEach(() => {
    uninstallMockSvgEditor()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with menu-button/menu/image-lib/handle structure', () => {
    addWorkarea()
    const el = mountElement('se-explorerbutton')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.shadowRoot.querySelector('.menu-button')).toBeTruthy()
    expect(el.shadowRoot.querySelector('.menu')).toBeTruthy()
    expect(el.shadowRoot.querySelector('.image-lib')).toBeTruthy()
    expect(el.shadowRoot.querySelector('.handle')).toBeTruthy()
  })

  it('reflects the title attribute (with shortcut) onto the inner button title', () => {
    addWorkarea()
    const el = mountElement('se-explorerbutton')
    el.setAttribute('shortcut', 'X')
    el.setAttribute('title', 'Shapes')
    expect(el.$button.getAttribute('title')).toBe('Shapes [X]')
  })

  it('gets/sets the title property via the attribute', () => {
    addWorkarea()
    const el = mountElement('se-explorerbutton')
    el.title = 'my title'
    expect(el.getAttribute('title')).toBe('my title')
    expect(el.title).toBe('my title')
  })

  it('toggles the pressed class via attribute and property', () => {
    addWorkarea()
    const el = mountElement('se-explorerbutton')
    el.pressed = true
    expect(el.$overall.classList.contains('pressed')).toBe(true)
    expect(el.pressed).toBe(true)
    el.pressed = false
    expect(el.$overall.classList.contains('pressed')).toBe(false)
  })

  it('toggles the disabled class via attribute and property', () => {
    addWorkarea()
    const el = mountElement('se-explorerbutton')
    el.disabled = true
    expect(el.$overall.classList.contains('disabled')).toBe(true)
    expect(el.disabled).toBe(true)
    el.disabled = false
    expect(el.$overall.classList.contains('disabled')).toBe(false)
  })

  it('sets the button-icon src from the src attribute using imgPath', () => {
    addWorkarea()
    const el = mountElement('se-explorerbutton')
    el.setAttribute('src', 'explorer.svg')
    expect(el.$img.getAttribute('src')).toBe('images/explorer.svg')
  })

  it('loading the lib attribute fetches index.json and populates the menu, then loads the first sub-library', async () => {
    addWorkarea()
    mockLibIndexFetch(['basic', 'arrows'], {
      basic: { data: { square: 'M0 0 L1 0 L1 1 L0 1 Z' }, size: 100, fill: true }
    })
    const el = mountElement('se-explorerbutton')
    el.setAttribute('lib', '/shapelib/')
    // attributeChangedCallback for 'lib' is async
    await vi.waitFor(() => {
      expect(el.$menu.querySelectorAll('.menu-item').length).toBe(2)
    })
    expect(el.$menu.innerHTML).toContain('data-menu="basic"')
    expect(el.$menu.querySelector('.menu-item.pressed').textContent).toBe('basic')
    expect(el.data).toEqual({ square: 'M0 0 L1 0 L1 1 L0 1 Z' })
    await vi.waitFor(() => {
      expect(el.$lib.querySelectorAll('se-button[data-shape]').length).toBe(1)
    })
  })

  it('updateLib populates se-button entries encoding each shape path as a data URI', async () => {
    addWorkarea()
    mockLibIndexFetch(['basic'], {
      basic: { data: { circle: 'M0 0 A1 1 0 1 0', square: 'M0 0 L1 0' }, size: 200, fill: false }
    })
    const el = mountElement('se-explorerbutton')
    el.setAttribute('lib', '/shapelib/')
    await vi.waitFor(() => {
      expect(el.$lib.querySelectorAll('se-button[data-shape]').length).toBe(2)
    })
    const buttons = [...el.$lib.querySelectorAll('se-button')]
    expect(buttons.map((b) => b.dataset.shape).sort()).toEqual(['circle', 'square'])
    buttons.forEach((b) => {
      expect(b.getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/)
    })
  })

  it('clicking a menu-item switches the active category and reloads the lib', async () => {
    addWorkarea()
    mockLibIndexFetch(['basic', 'arrows'], {
      basic: { data: { square: 'M0 0' }, size: 100, fill: true },
      arrows: { data: { up: 'M1 1', down: 'M2 2' }, size: 100, fill: true }
    })
    const el = mountElement('se-explorerbutton')
    el.setAttribute('lib', '/shapelib/')
    await vi.waitFor(() => {
      expect(el.$menu.querySelectorAll('.menu-item').length).toBe(2)
    })

    await vi.waitFor(() => {
      expect(el.$lib.querySelectorAll('se-button[data-shape]').length).toBe(1)
    })

    const arrowsItem = [...el.$menu.querySelectorAll('.menu-item')].find((i) => i.dataset.menu === 'arrows')
    arrowsItem.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    await vi.waitFor(() => {
      expect(el.$lib.querySelectorAll('se-button[data-shape]').length).toBe(2)
    })
    expect(arrowsItem.classList.contains('pressed')).toBe(true)
    expect(el.$menu.querySelector('.menu-item[data-menu="basic"]').classList.contains('pressed')).toBe(false)
  })

  it('clicking a slotted se-button in the image-lib sets it as the current action and closes the menus', async () => {
    addWorkarea()
    mockLibIndexFetch(['basic'], {
      basic: { data: { square: 'M0 0' }, size: 100, fill: true }
    })
    const el = mountElement('se-explorerbutton')
    el.setAttribute('lib', '/shapelib/')
    await vi.waitFor(() => {
      expect(el.$lib.querySelectorAll('se-button[data-shape]').length).toBe(1)
    })
    el.$menu.classList.add('open')
    el.$lib.classList.add('open-lib')

    const shapeButton = el.$lib.querySelector('se-button')
    shapeButton.setAttribute('src', 'data:image/svg+xml;base64,AAA=')
    shapeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(el.currentAction).toBe(shapeButton)
    expect(el.$img.getAttribute('src')).toBe('data:image/svg+xml;base64,AAA=')
    expect(el.dataset.draw).toBe('M0 0')
    expect(shapeButton.hasAttribute('pressed')).toBe(true)
    expect(el.$menu.classList.contains('open')).toBe(false)
    expect(el.$lib.classList.contains('open-lib')).toBe(false)
  })

  it('clicking the host toggles open/open-lib on the menu and image-lib', () => {
    addWorkarea()
    const el = mountElement('se-explorerbutton')
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el.$menu.classList.contains('open')).toBe(true)
    expect(el.$lib.classList.contains('open-lib')).toBe(true)

    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el.$menu.classList.contains('open')).toBe(false)
    expect(el.$lib.classList.contains('open-lib')).toBe(false)
  })

  it('clicking the handle toggles open/open-lib', () => {
    addWorkarea()
    const el = mountElement('se-explorerbutton')
    el.$handle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el.$menu.classList.contains('open')).toBe(true)
    expect(el.$lib.classList.contains('open-lib')).toBe(true)
  })

  it('clicking the workarea closes the open menu/lib', () => {
    const workarea = addWorkarea()
    const el = mountElement('se-explorerbutton')
    el.$menu.classList.add('open')
    el.$lib.classList.add('open-lib')

    workarea.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(el.$menu.classList.contains('open')).toBe(false)
    expect(el.$lib.classList.contains('open-lib')).toBe(false)
  })

  it('logs an error and leaves the menu empty if the index.json fetch fails', async () => {
    addWorkarea()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const el = mountElement('se-explorerbutton')
    el.setAttribute('lib', '/shapelib/')

    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })
    // the static template's placeholder menu-item is left untouched since the
    // fetch failure short-circuits before $menu.innerHTML is ever rewritten
    expect(el.$menu.querySelectorAll('.menu-item').length).toBe(1)
    expect(el.$menu.querySelector('.menu-item').textContent).toBe('menu')
  })
})
