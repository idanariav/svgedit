import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor } from './testUtils.js'
import '../../../src/editor/components/seListItem.js'
import '../../../src/editor/components/seList.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

// SeList's constructor reads `this.items[0]` (its se-list-item children) to
// seed the initial selected value, so the items must already exist in the
// light DOM by the time se-list's constructor runs. Assigning innerHTML on a
// wrapper builds the whole subtree first (children included) before running
// custom-element upgrade reactions, unlike incrementally creating <se-list>
// then appending children afterwards.
function mountList (innerHtml, attrs = {}) {
  const wrap = document.createElement('div')
  const attrString = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')
  wrap.innerHTML = `<se-list ${attrString}>${innerHtml}</se-list>`
  document.body.append(wrap)
  return wrap.querySelector('se-list')
}

const basicItems = `
  <se-list-item value="a" option="opt_a"></se-list-item>
  <se-list-item value="b" option="opt_b"></se-list-item>
`

describe('se-list', () => {
  beforeEach(() => installMockSvgEditor())
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with the dropdown trigger and options container', () => {
    const el = mountList(basicItems)
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$dropdown).toBeTruthy()
    expect(el.$optionsContainer.classList.contains('closed')).toBe(true)
  })

  it('selects the first item as the initial value when no src is set', () => {
    const el = mountList(basicItems)
    expect(el.items[0].getAttribute('selected')).toBe('true')
    expect(el.$selection.textContent).toBe('opt_a')
  })

  it('renders a static icon and skips selection highlighting when src is set on the list itself', () => {
    const el = mountList(basicItems, { src: 'some-icon.svg' })
    expect(el.staticIcon).toBe(true)
    // static icon lists don't mark any item selected at construction
    expect(el.items[0].hasAttribute('selected')).toBe(false)
  })

  it('toggles the dropdown open/closed on trigger click', () => {
    const el = mountList(basicItems)
    expect(el.isDropdownOpen).toBe(false)
    el.$selection.dispatchEvent(new Event('click'))
    expect(el.isDropdownOpen).toBe(true)
    expect(el.$optionsContainer.classList.contains('closed')).toBe(false)

    el.$selection.dispatchEvent(new Event('click'))
    expect(el.isDropdownOpen).toBe(false)
    expect(el.$optionsContainer.classList.contains('closed')).toBe(true)
  })

  it('closes the dropdown on focusout', () => {
    const el = mountList(basicItems)
    el.openDropdown()
    expect(el.isDropdownOpen).toBe(true)
    el.$dropdown.dispatchEvent(new Event('focusout'))
    expect(el.isDropdownOpen).toBe(false)
  })

  it('updates value, dispatches change, and re-selects the item on selectedindexchange', () => {
    const el = mountList(basicItems)
    const handler = vi.fn()
    el.addEventListener('change', handler)

    el.$dropdown.dispatchEvent(new CustomEvent('selectedindexchange', { detail: { selectedItem: 'b' } }))

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].detail).toEqual({ value: 'b' })
    expect(el.value).toBe('b')
    expect(el.getAttribute('value')).toBe('b')
  })

  it('reflects the title attribute translated onto the dropdown', () => {
    const el = mountList(basicItems)
    el.setAttribute('title', 'pick_one')
    expect(el.$dropdown.getAttribute('title')).toBe('pick_one')
  })

  it('reflects the label attribute translated onto the label element', () => {
    const el = mountList(basicItems)
    el.setAttribute('label', 'my_label')
    expect(el.$label.textContent).toBe('my_label')
  })

  it('forwards height/width attributes as inline styles on the dropdown', () => {
    const el = mountList(basicItems)
    el.setAttribute('height', '40px')
    el.setAttribute('width', '100px')
    expect(el.$dropdown.style.height).toBe('40px')
    expect(el.$dropdown.style.width).toBe('100px')
  })

  it('reads/writes title, label, width, height properties via attributes', () => {
    const el = mountList(basicItems)
    el.title = 't'
    expect(el.getAttribute('title')).toBe('t')
    expect(el.title).toBe('t')

    el.label = 'l'
    expect(el.getAttribute('label')).toBe('l')
    expect(el.label).toBe('l')

    el.width = '10px'
    expect(el.getAttribute('width')).toBe('10px')
    expect(el.width).toBe('10px')

    el.height = '20px'
    expect(el.getAttribute('height')).toBe('20px')
    expect(el.height).toBe('20px')
  })

  it('closes the dropdown on an outside mousedown but not on an inside one', () => {
    const el = mountList(basicItems)
    el.openDropdown()

    const outside = document.createElement('div')
    document.body.append(outside)
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(el.isDropdownOpen).toBe(false)

    el.openDropdown()
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(el.isDropdownOpen).toBe(true)
  })
})
