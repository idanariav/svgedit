import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seColorPicker.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-colorpicker', () => {
  beforeEach(() => installMockSvgEditor())
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with the swatch/block/logo structure', () => {
    const el = mountElement('se-colorpicker')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.shadowRoot.getElementById('swatch')).toBeTruthy()
    expect(el.shadowRoot.getElementById('block')).toBeTruthy()
    expect(el.shadowRoot.getElementById('logo')).toBeTruthy()
  })

  it('creates a PaintBox on connect', () => {
    const el = mountElement('se-colorpicker')
    expect(el.paintBox).toBeTruthy()
    expect(el.paintBox.type).toBe(el.type)
  })

  it('reflects the label attribute onto the title', () => {
    const el = mountElement('se-colorpicker')
    el.setAttribute('label', 'fill_color')
    expect(el.getAttribute('title')).toBe('fill_color')
  })

  it('gets/sets the label property via the label attribute', () => {
    const el = mountElement('se-colorpicker')
    el.label = 'stroke_color'
    expect(el.getAttribute('label')).toBe('stroke_color')
  })

  it('sets the label title on the inner label element for the type attribute', () => {
    const el = mountElement('se-colorpicker')
    el.setAttribute('type', 'stroke')
    expect(el.$label.getAttribute('title')).toBe('config.pick_paint_opavity')
  })

  it('gets/sets the type property via the type attribute', () => {
    const el = mountElement('se-colorpicker')
    el.type = 'fill'
    expect(el.getAttribute('type')).toBe('fill')
    expect(el.type).toBe('fill')
  })

  it('sets the inner label title from config-change_xxx_color attribute', () => {
    const el = mountElement('se-colorpicker')
    el.setAttribute('config-change_xxx_color', 'change the fill color')
    expect(el.$label.getAttribute('title')).toBe('change the fill color')
  })

  it('calls init() to set the config-change_xxx_color attribute via t()', () => {
    const el = mountElement('se-colorpicker')
    el.init({})
    expect(el.getAttribute('config-change_xxx_color')).toBe('config.change_xxx_color')
  })

  it('gets/sets the src property via the src attribute', () => {
    const el = mountElement('se-colorpicker')
    el.src = 'fill.svg'
    expect(el.getAttribute('src')).toBe('fill.svg')
    expect(el.src).toBe('fill.svg')
  })

  it('binds a click handler on the picker that opens the color dialog', () => {
    const el = mountElement('se-colorpicker')
    const spy = vi.spyOn(el, 'openColorDialog')
    el.$picker.dispatchEvent(new MouseEvent('click'))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('openColorDialog appends a se-color-dialog seeded with the current paint/type', () => {
    const el = mountElement('se-colorpicker')
    el.type = 'fill'
    el.openColorDialog()
    const dialog = document.querySelector('se-color-dialog')
    expect(dialog).toBeTruthy()
    expect(dialog.paint).toBe(el.paintBox.paint)
    expect(dialog.type).toBe('fill')
  })

  it('openColorDialog removes a pre-existing dialog before creating a new one', () => {
    const el = mountElement('se-colorpicker')
    el.openColorDialog()
    const first = document.querySelector('se-color-dialog')
    el.openColorDialog()
    const dialogs = document.querySelectorAll('se-color-dialog')
    expect(dialogs.length).toBe(1)
    expect(dialogs[0]).not.toBe(first)
  })

  it('setPaint delegates to the paintBox', () => {
    const el = mountElement('se-colorpicker')
    const spy = vi.spyOn(el.paintBox, 'setPaint')
    const fakePaint = { type: 'solidColor', solidColor: 'ff0000', alpha: 100 }
    el.setPaint(fakePaint)
    expect(spy).toHaveBeenCalledWith(fakePaint)
  })

  it('update() applies paint and dispatches change when apply is true and a paint is returned', () => {
    const el = mountElement('se-colorpicker')
    const fakePaint = { type: 'solidColor', solidColor: 'ff0000', alpha: 100 }
    vi.spyOn(el.paintBox, 'update').mockReturnValue(fakePaint)
    const setPaintSpy = vi.spyOn(el, 'setPaint')
    const handler = vi.fn()
    el.addEventListener('change', handler)

    el.update({}, {}, true)

    expect(setPaintSpy).toHaveBeenCalledWith(fakePaint)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].detail.paint).toBe(fakePaint)
  })

  it('update() does not dispatch change when apply is false', () => {
    const el = mountElement('se-colorpicker')
    const fakePaint = { type: 'solidColor', solidColor: 'ff0000', alpha: 100 }
    vi.spyOn(el.paintBox, 'update').mockReturnValue(fakePaint)
    const handler = vi.fn()
    el.addEventListener('change', handler)

    el.update({}, {}, false)

    expect(handler).not.toHaveBeenCalled()
  })

  it('update() does not dispatch change when paintBox.update returns null', () => {
    const el = mountElement('se-colorpicker')
    vi.spyOn(el.paintBox, 'update').mockReturnValue(null)
    const handler = vi.fn()
    el.addEventListener('change', handler)

    el.update({}, {}, true)

    expect(handler).not.toHaveBeenCalled()
  })
})
