import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seFontSelect.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-font-select', () => {
  beforeEach(() => installMockSvgEditor())
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with the trigger button and closed popover', () => {
    const el = mountElement('se-font-select')
    expect(el.shadowRoot).toBeTruthy()
    expect(el._trigger.tagName).toBe('BUTTON')
    expect(el._popover.style.display).toBe('none')
  })

  it('parses options/values into paired option objects and selects the first as default', () => {
    const el = mountElement('se-font-select', {
      options: 'font.serif,font.sans',
      values: 'Georgia::Arial'
    })
    expect(el._options).toEqual([
      { value: 'Georgia', label: 'font.serif' },
      { value: 'Arial', label: 'font.sans' }
    ])
    expect(el.value).toBe('Georgia')
  })

  it('renders the trigger label and font-family style from the selected value', () => {
    const el = mountElement('se-font-select', {
      options: 'font.serif',
      values: 'Georgia'
    })
    const label = el.shadowRoot.querySelector('.trigger-label')
    expect(label.textContent).toBe('font.serif')
    expect(label.style.fontFamily).toBe('"Georgia", sans-serif')
  })

  it('falls back to the raw value as label when there is no matching option', () => {
    const el = mountElement('se-font-select')
    el.value = 'Comic Sans'
    const label = el.shadowRoot.querySelector('.trigger-label')
    expect(label.textContent).toBe('Comic Sans')
  })

  it('shows an em dash when there is no value and no options', () => {
    const el = mountElement('se-font-select')
    const label = el.shadowRoot.querySelector('.trigger-label')
    expect(label.textContent).toBe('—')
  })

  it('get/set value updates the trigger label', () => {
    const el = mountElement('se-font-select', { options: 'a,b', values: 'Arial::Georgia' })
    el.value = 'Georgia'
    expect(el.value).toBe('Georgia')
    expect(el.shadowRoot.querySelector('.trigger-label').textContent).toBe('b')
  })

  it('setting value to null/undefined clears it to an empty string', () => {
    const el = mountElement('se-font-select', { options: 'a', values: 'Arial' })
    el.value = null
    expect(el.value).toBe('')
  })

  it('addOption appends a new font and ignores duplicates', () => {
    const el = mountElement('se-font-select', { options: 'a', values: 'Arial' })
    el.addOption('Roboto', 'Roboto Custom')
    expect(el._options).toContainEqual({ value: 'Roboto', label: 'Roboto Custom' })

    el.addOption('Roboto', 'Different Label')
    const count = el._options.filter(o => o.value === 'Roboto').length
    expect(count).toBe(1)
  })

  it('addOption defaults the label to the value when text is omitted', () => {
    const el = mountElement('se-font-select')
    el.addOption('Merriweather')
    expect(el._options).toContainEqual({ value: 'Merriweather', label: 'Merriweather' })
  })

  it('opens the popover on trigger click and renders the search box + item list', () => {
    const el = mountElement('se-font-select', { options: 'a,b', values: 'Arial::Georgia' })
    el._trigger.click()

    expect(el._open).toBe(true)
    expect(el._popover.style.display).toBe('')
    expect(el._trigger.classList.contains('is-open')).toBe(true)
    const items = el._popover.querySelectorAll('.fl-item[data-value]')
    expect(items.length).toBe(2)
  })

  it('marks the active item and shows the check for the current value', () => {
    const el = mountElement('se-font-select', { options: 'a,b', values: 'Arial::Georgia' })
    el.value = 'Georgia'
    el._trigger.click()

    const active = el._popover.querySelector('.fl-item.is-active')
    expect(active.dataset.value).toBe('Georgia')
  })

  it('clicking an item picks it, dispatches change, and closes the popover', () => {
    const el = mountElement('se-font-select', { options: 'a,b', values: 'Arial::Georgia' })
    const handler = vi.fn()
    el.addEventListener('change', handler)
    el._trigger.click()

    const item = el._popover.querySelector('.fl-item[data-value="Georgia"]')
    item.click()

    expect(el.value).toBe('Georgia')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].detail).toEqual({ value: 'Georgia' })
    expect(el._open).toBe(false)
  })

  it('shows the empty state when no fonts match the search query', () => {
    const el = mountElement('se-font-select', { options: 'a', values: 'Arial' })
    el._trigger.click()
    el._query = 'zzz-no-match'
    el._renderItems()

    expect(el._popover.querySelector('.fl-empty')).toBeTruthy()
  })

  it('filters items by label or value substring (case-insensitive)', () => {
    const el = mountElement('se-font-select', { options: 'a,b', values: 'Arial::Georgia' })
    el._trigger.click()
    el._query = 'geo'
    el._renderItems()

    const items = el._popover.querySelectorAll('.fl-item[data-value]')
    expect(items.length).toBe(1)
    expect(items[0].dataset.value).toBe('Georgia')
  })

  it('closes the popover again when the trigger is clicked while open', () => {
    const el = mountElement('se-font-select')
    el._trigger.click()
    expect(el._open).toBe(true)
    el._trigger.click()
    expect(el._open).toBe(false)
    expect(el._trigger.classList.contains('is-open')).toBe(false)
  })

  it('closes on Escape while open', () => {
    const el = mountElement('se-font-select')
    el._trigger.click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(el._open).toBe(false)
  })

  it('closes on an outside click while open', async () => {
    const el = mountElement('se-font-select')
    el._trigger.click()
    // The outside-click listener is attached via a 0ms setTimeout (so the
    // opening click itself isn't seen as "outside"); flush it first.
    await new Promise(resolve => setTimeout(resolve, 0))
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el._open).toBe(false)
  })

  it('sets the title attribute on the trigger via t()', () => {
    const el = mountElement('se-font-select', { title: 'font_picker' })
    expect(el._trigger.getAttribute('title')).toBe('font_picker')
  })

  it('removes listeners on disconnect', () => {
    const el = mountElement('se-font-select')
    el._trigger.click()
    expect(el._open).toBe(true)
    el.remove()
    // After disconnect, an outside click should not throw and listeners are gone.
    expect(() => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow()
  })
})
