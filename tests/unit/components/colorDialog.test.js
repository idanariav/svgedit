import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor } from './testUtils.js'
import '../../../src/editor/components/colorPicker/index.ts'
import Paint from '../../../packages/svgcanvas/core/paint.ts'

vi.mock('../../../src/editor/locale.ts', () => ({ t: (key) => key }))

describe('se-color-dialog as a popover', () => {
  let anchor
  beforeEach(() => {
    installMockSvgEditor()
    anchor = document.createElement('div')
    document.body.append(anchor)
  })
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  const open = (withAnchor = true) => {
    const dialog = document.createElement('se-color-dialog')
    dialog.paint = new Paint({ alpha: 100, solidColor: 'ff0000' })
    dialog.type = 'fill'
    if (withAnchor) dialog.anchor = anchor
    document.body.append(dialog)
    const events = []
    dialog.addEventListener('change', () => events.push('change'))
    dialog.addEventListener('cancel', () => events.push('cancel'))
    return { dialog, events }
  }
  const touch = (dialog) => dialog._shadowRoot.querySelector('.cp-body-slot')
    .dispatchEvent(new CustomEvent('color-change', { bubbles: true }))
  const outside = () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))

  it('is a popover only when it has an anchor', () => {
    expect(open().dialog.classList.contains('popover')).toBe(true)
    document.body.innerHTML = ''
    anchor = document.createElement('div')
    document.body.append(anchor)
    expect(open(false).dialog.classList.contains('popover')).toBe(false)
  })

  it('applies on an outside click once a colour was changed, and closes', () => {
    const { dialog, events } = open()
    touch(dialog)
    outside()
    expect(events).toEqual(['change'])
    expect(dialog.isConnected).toBe(false)
  })

  it('closes without applying when nothing was changed (no no-op history entry)', () => {
    const { dialog, events } = open()
    outside()
    expect(events).toEqual(['cancel'])
    expect(dialog.isConnected).toBe(false)
  })

  it('ignores clicks inside itself and on its own swatch', () => {
    const { dialog, events } = open()
    touch(dialog)
    dialog.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))
    anchor.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))
    expect(events).toEqual([])
    expect(dialog.isConnected).toBe(true)
  })

  it('Escape cancels even after a change; the modal keeps ignoring outside clicks', () => {
    const { dialog, events } = open()
    touch(dialog)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(events).toEqual(['cancel'])
    const modal = open(false)
    outside()
    expect(modal.events).toEqual([])
    expect(modal.dialog.isConnected).toBe(true)
  })

  const enterOn = (target) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }))

  it('Enter applies from a field or a focused tab button, not only from empty space', () => {
    const fromField = open()
    touch(fromField.dialog)
    enterOn(fromField.dialog._shadowRoot.querySelector('[data-field="hex"] input'))
    expect(fromField.events).toEqual(['change'])
    expect(fromField.dialog.isConnected).toBe(false)

    const fromTab = open()
    touch(fromTab.dialog)
    enterOn(fromTab.dialog._shadowRoot.querySelector('.cp-tab'))
    expect(fromTab.events).toEqual(['change'])
  })

  it('leaves Enter on the Apply/Cancel buttons to the buttons themselves', () => {
    const { dialog, events } = open()
    touch(dialog)
    enterOn(dialog._shadowRoot.querySelector('.cp-btn-ghost'))
    expect(events).toEqual([])
    expect(dialog.isConnected).toBe(true)
  })

  it('shows Apply/Cancel: Apply applies even an untouched popover, Cancel reverts a changed one', () => {
    const applied = open()
    applied.dialog._shadowRoot.querySelector('.cp-btn-primary').click()
    expect(applied.events).toEqual(['change'])
    expect(applied.dialog.isConnected).toBe(false)

    const cancelled = open()
    touch(cancelled.dialog)
    cancelled.dialog._shadowRoot.querySelector('.cp-btn-ghost').click()
    expect(cancelled.events).toEqual(['cancel'])
  })

  it('stops listening for outside clicks once removed', () => {
    const { dialog, events } = open()
    dialog.remove()
    outside()
    expect(events).toEqual([])
  })
})
