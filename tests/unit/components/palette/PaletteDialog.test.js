import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import '../../../../src/editor/components/palette/PaletteDialog.js'

function mountDialog (attrs = {}) {
  const el = document.createElement('se-palette-dialog')
  Object.assign(el, { backgroundHex: '#202020', ...attrs })
  document.body.append(el)
  return el
}

describe('se-palette-dialog', () => {
  let writeText

  beforeEach(() => {
    writeText = vi.fn(() => Promise.resolve())
    navigator.clipboard = { writeText }
  })

  afterEach(() => {
    document.body.innerHTML = ''
    delete navigator.clipboard
    vi.useRealTimers()
  })

  it('renders 8 swatches for the default purpose', () => {
    const el = mountDialog()
    const swatches = el.shadowRoot.querySelectorAll('.pd-swatch')
    expect(swatches.length).toBe(8)
  })

  it('shows hex values by default and switches to oklch on format toggle', () => {
    const el = mountDialog()
    const firstValue = () => el.shadowRoot.querySelector('.pd-swatch-value').textContent
    expect(firstValue()).toMatch(/^#[0-9a-f]{6}$/)

    el.shadowRoot.querySelector('#pd-format button[data-format="oklch"]').click()
    expect(firstValue()).toMatch(/^oklch\(/)
  })

  it('re-generates the palette when purpose changes', () => {
    const el = mountDialog()
    const iconsHex = el.shadowRoot.querySelector('.pd-swatch-color').style.background

    const select = el.shadowRoot.querySelector('#pd-purpose')
    select.value = 'illustrations'
    select.dispatchEvent(new Event('change'))

    const illustrationsHex = el.shadowRoot.querySelector('.pd-swatch-color').style.background
    expect(illustrationsHex).not.toBe(iconsHex)
  })

  it('re-generates the palette when min-contrast changes', () => {
    const el = mountDialog({ purpose: 'text' })
    const input = el.shadowRoot.querySelector('#pd-min-contrast')
    input.value = '15'
    input.dispatchEvent(new Event('change'))
    const degraded = el.shadowRoot.querySelectorAll('.pd-swatch-degraded')
    // Against a dark background, a 15:1 floor for dark-on-dark hues is
    // unreachable for at least some hues -> degraded marker shown.
    expect(degraded.length).toBeGreaterThan(0)
  })

  it('flags degraded swatches when no candidate meets the contrast floor', () => {
    const el = mountDialog({ backgroundHex: '#ff0000', minContrast: 19 })
    const degraded = el.shadowRoot.querySelectorAll('.pd-swatch-degraded')
    expect(degraded.length).toBe(8)
  })

  it('renders a copy button for every swatch', () => {
    const el = mountDialog()
    expect(el.shadowRoot.querySelectorAll('.pd-copy-btn').length).toBe(8)
  })

  it('copies the displayed hex value to the clipboard', async () => {
    const el = mountDialog()
    const firstSwatch = el.shadowRoot.querySelector('.pd-swatch')
    const expectedHex = firstSwatch.querySelector('.pd-swatch-value').textContent
    firstSwatch.querySelector('.pd-copy-btn').click()
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith(expectedHex)
  })

  it('copies the displayed oklch value after switching format', async () => {
    const el = mountDialog()
    el.shadowRoot.querySelector('#pd-format button[data-format="oklch"]').click()
    const firstSwatch = el.shadowRoot.querySelector('.pd-swatch')
    const expectedOklch = firstSwatch.querySelector('.pd-swatch-value').textContent
    firstSwatch.querySelector('.pd-copy-btn').click()
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith(expectedOklch)
  })

  it('flashes a checkmark on the clicked copy button, then resets after ~1.2s', async () => {
    vi.useFakeTimers()
    const el = mountDialog()
    const btn = el.shadowRoot.querySelector('.pd-copy-btn')
    btn.click()
    await Promise.resolve() // flush the writeText().then(markCopied) microtask
    expect(btn.classList.contains('is-copied')).toBe(true)

    vi.advanceTimersByTime(1300)
    expect(btn.classList.contains('is-copied')).toBe(false)
  })

  it('warns instead of throwing when the Clipboard API is unavailable', () => {
    delete navigator.clipboard
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const el = mountDialog()
    el.shadowRoot.querySelector('.pd-copy-btn').click()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('closes on Escape', () => {
    const el = mountDialog()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(el.isConnected).toBe(false)
  })

  it('closes on backdrop click', () => {
    const el = mountDialog()
    el.shadowRoot.querySelector('.pd-backdrop').click()
    expect(el.isConnected).toBe(false)
  })

  it('closes on the header close button', () => {
    const el = mountDialog()
    el.shadowRoot.querySelector('.pd-head-close').click()
    expect(el.isConnected).toBe(false)
  })
})
