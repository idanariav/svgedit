import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor } from './testUtils.js'
import '../../../src/editor/components/colorPicker/index.js'
import Paint from '../../../packages/svgcanvas/core/paint.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

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

  it('stops listening for outside clicks once removed', () => {
    const { dialog, events } = open()
    dialog.remove()
    outside()
    expect(events).toEqual([])
  })
})
