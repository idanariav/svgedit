import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initTooltips } from '../../src/editor/tooltips.js'

describe('tooltips', () => {
  let root, host, btn, other, ctl, abort
  const over = (el) => el.dispatchEvent(new Event('pointerover', { bubbles: true, composed: true }))
  const bubble = () => host.querySelector('.se-tooltip')
  const visible = () => bubble().dataset.open !== undefined

  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    root = document.createElement('div')
    host = document.createElement('div')
    btn = document.createElement('button')
    btn.setAttribute('title', 'Rectangle (R)')
    other = document.createElement('button')
    other.setAttribute('title', 'Ellipse (E)')
    root.append(host, btn, other)
    document.body.append(root)
    abort = new AbortController()
    ctl = initTooltips(root, host, abort.signal)
  })
  afterEach(() => { ctl.destroy(); vi.useRealTimers() })

  it('shows the title text after a short delay and holds the native title back meanwhile', () => {
    over(btn)
    expect(btn.hasAttribute('title')).toBe(false)
    expect(visible()).toBe(false)
    vi.advanceTimersByTime(400)
    expect(visible()).toBe(true)
    expect(bubble().textContent).toBe('Rectangle (R)')
  })

  it('gives the title back and hides when the pointer moves off', () => {
    over(btn)
    vi.advanceTimersByTime(400)
    over(host)
    expect(visible()).toBe(false)
    expect(btn.getAttribute('title')).toBe('Rectangle (R)')
  })

  it('moving to a neighbour while a bubble is up swaps it almost at once', () => {
    over(btn)
    vi.advanceTimersByTime(400)
    over(other)
    expect(visible()).toBe(false)
    vi.advanceTimersByTime(60)
    expect(visible()).toBe(true)
    expect(bubble().textContent).toBe('Ellipse (E)')
    expect(btn.getAttribute('title')).toBe('Rectangle (R)')
  })

  it('a press cancels a pending bubble', () => {
    over(btn)
    btn.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    vi.advanceTimersByTime(400)
    expect(visible()).toBe(false)
    expect(btn.getAttribute('title')).toBe('Rectangle (R)')
  })

  it('does not overwrite a title the component set while the bubble was up', () => {
    over(btn)
    vi.advanceTimersByTime(400)
    btn.setAttribute('title', 'Rectangle (Shift+R)')
    over(host)
    expect(btn.getAttribute('title')).toBe('Rectangle (Shift+R)')
  })

  it('finds a title inside a shadow root', () => {
    const el = document.createElement('x-widget')
    const shadow = el.attachShadow({ mode: 'open' })
    const inner = document.createElement('div')
    inner.setAttribute('title', 'Inner tip')
    shadow.append(inner)
    root.append(el)
    over(inner)
    vi.advanceTimersByTime(400)
    expect(bubble().textContent).toBe('Inner tip')
  })

  it('ignores touch pointers', () => {
    const e = new Event('pointerover', { bubbles: true, composed: true })
    Object.defineProperty(e, 'pointerType', { value: 'touch' })
    btn.dispatchEvent(e)
    vi.advanceTimersByTime(400)
    expect(btn.getAttribute('title')).toBe('Rectangle (R)')
    expect(visible()).toBe(false)
  })

  it('aborting the signal removes the bubble and restores the title', () => {
    over(btn)
    abort.abort()
    expect(host.querySelector('.se-tooltip')).toBeNull()
    expect(btn.getAttribute('title')).toBe('Rectangle (R)')
  })
})
