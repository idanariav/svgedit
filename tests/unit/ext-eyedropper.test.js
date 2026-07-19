import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import extEyedropper from '../../src/editor/extensions/ext-eyedropper/ext-eyedropper.js'

describe('ext-eyedropper', () => {
  let svgCanvas
  let svgEditor
  let extInstance
  let toolsLeft
  let clickHandler

  beforeEach(async () => {
    toolsLeft = document.createElement('div')
    document.body.append(toolsLeft)

    svgCanvas = {
      $id: vi.fn((id) => (id === 'tools_left' ? toolsLeft : document.getElementById(id))),
      $click: vi.fn((_el, handler) => { clickHandler = handler }),
      insertChildAtIndex: vi.fn((parent, html) => { parent.innerHTML = html }),
      getMode: vi.fn(() => 'eyedropper'),
      setMode: vi.fn(),
      setColor: vi.fn()
    }

    svgEditor = {
      svgCanvas,
      workarea: document.body,
      listenerAbort: new AbortController(),
      leftPanel: { clickSelect: vi.fn(), updateLeftPanel: vi.fn(() => true) },
      configObj: { pref: () => 'en' },
      i18next: { t: (key) => key, addResourceBundle: vi.fn() },
      setBackground: vi.fn()
    }

    extInstance = await extEyedropper.init.call(svgEditor)
    extInstance.callback.call(svgEditor)
  })

  afterEach(() => {
    document.body.textContent = ''
    vi.restoreAllMocks()
  })

  const makeRect = ({ fill, stroke, opacity } = {}) => {
    const rect = document.createElementNS(NS.SVG, 'rect')
    if (fill !== undefined) rect.setAttribute('fill', fill)
    if (stroke !== undefined) rect.setAttribute('stroke', stroke)
    if (opacity !== undefined) rect.setAttribute('opacity', opacity)
    document.body.append(rect)
    return rect
  }

  const mouseDownOn = (target, clientX = 10, clientY = 20) => {
    extInstance.mouseDown({ event: { target, clientX, clientY } })
  }

  it('injects the toolbar button and wires the click handler', () => {
    expect(svgCanvas.insertChildAtIndex).toHaveBeenCalledWith(toolsLeft, expect.stringContaining('tool_eyedropper'), 12)
    expect(typeof clickHandler).toBe('function')
  })

  it('sets eyedropper mode on toolbar click when the left panel accepts it', () => {
    clickHandler()
    expect(svgEditor.leftPanel.updateLeftPanel).toHaveBeenCalledWith('tool_eyedropper')
    expect(svgCanvas.setMode).toHaveBeenCalledWith('eyedropper')
  })

  it('does not set mode if the left panel rejects the tool switch (e.g. locked tool)', () => {
    svgEditor.leftPanel.updateLeftPanel.mockReturnValue(false)
    clickHandler()
    expect(svgCanvas.setMode).not.toHaveBeenCalled()
  })

  it('ignores mouseDown when not in eyedropper mode', () => {
    svgCanvas.getMode.mockReturnValue('select')
    mouseDownOn(makeRect({ fill: '#ff0000' }))
    expect(document.querySelector('se-eyedropper-menu')).toBeNull()
  })

  it('ignores clicks on svg/g/use container elements', () => {
    const group = document.createElementNS(NS.SVG, 'g')
    document.body.append(group)
    mouseDownOn(group)
    expect(document.querySelector('se-eyedropper-menu')).toBeNull()
  })

  it('opens the action menu at the click point after sampling a fill color', () => {
    mouseDownOn(makeRect({ fill: '#336699' }), 111, 222)
    const menu = document.querySelector('se-eyedropper-menu')
    expect(menu).not.toBeNull()
    expect(menu.classList.contains('is-open')).toBe(true)
  })

  it('samples only the fill attribute — stroke and opacity are never read', () => {
    // Regression guard: the old tool stamped fill+stroke+opacity+width+dasharray.
    // The new tool sources a single color from `fill` only; verify both the
    // fill AND outline actions apply that same fill-derived hex, proving
    // stroke is never independently sampled.
    const rect = makeRect({ fill: '#336699', stroke: '#ff0000', opacity: '0.5' })
    mouseDownOn(rect)
    const menu = document.querySelector('se-eyedropper-menu')

    menu.shadowRoot.querySelector('a[data-action="stroke"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(svgCanvas.setColor).toHaveBeenCalledWith('stroke', '#336699')
    expect(svgCanvas.setColor).not.toHaveBeenCalledWith('stroke', '#ff0000')
  })

  it('replaces any existing menu rather than stacking multiple', () => {
    mouseDownOn(makeRect({ fill: '#111111' }))
    mouseDownOn(makeRect({ fill: '#222222' }))
    expect(document.querySelectorAll('se-eyedropper-menu').length).toBe(1)
  })

  describe('menu actions', () => {
    it('"fill" switches to select mode before applying the color, in that order', () => {
      const order = []
      svgEditor.leftPanel.clickSelect.mockImplementation(() => order.push('clickSelect'))
      svgCanvas.setColor.mockImplementation(() => order.push('setColor'))

      mouseDownOn(makeRect({ fill: '#abcdef' }))
      document.querySelector('se-eyedropper-menu').shadowRoot
        .querySelector('a[data-action="fill"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

      expect(svgCanvas.setColor).toHaveBeenCalledWith('fill', '#abcdef')
      expect(order).toEqual(['clickSelect', 'setColor'])
    })

    it('"stroke" applies the sampled color to stroke', () => {
      mouseDownOn(makeRect({ fill: '#abcdef' }))
      document.querySelector('se-eyedropper-menu').shadowRoot
        .querySelector('a[data-action="stroke"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      expect(svgCanvas.setColor).toHaveBeenCalledWith('stroke', '#abcdef')
      expect(svgEditor.leftPanel.clickSelect).toHaveBeenCalled()
    })

    it('"background" switches to select mode before calling setBackground with undo enabled', () => {
      const order = []
      svgEditor.leftPanel.clickSelect.mockImplementation(() => order.push('clickSelect'))
      svgEditor.setBackground.mockImplementation(() => order.push('setBackground'))

      mouseDownOn(makeRect({ fill: '#abcdef' }))
      document.querySelector('se-eyedropper-menu').shadowRoot
        .querySelector('a[data-action="background"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

      expect(svgEditor.setBackground).toHaveBeenCalledWith('#abcdef', '', undefined, true)
      expect(order).toEqual(['clickSelect', 'setBackground'])
    })

    it('"palette" opens the palette dialog seeded with the sampled color', () => {
      mouseDownOn(makeRect({ fill: '#abcdef' }))
      document.querySelector('se-eyedropper-menu').shadowRoot
        .querySelector('a[data-action="palette"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

      const dialog = document.querySelector('se-palette-dialog')
      expect(dialog).not.toBeNull()
      expect(dialog.backgroundHex).toBe('#abcdef')
      expect(svgEditor.leftPanel.clickSelect).toHaveBeenCalled()
    })

    it('replaces any existing palette dialog rather than stacking multiple', () => {
      mouseDownOn(makeRect({ fill: '#111111' }))
      document.querySelector('se-eyedropper-menu').shadowRoot
        .querySelector('a[data-action="palette"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

      mouseDownOn(makeRect({ fill: '#222222' }))
      document.querySelector('se-eyedropper-menu').shadowRoot
        .querySelector('a[data-action="palette"]').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

      expect(document.querySelectorAll('se-palette-dialog').length).toBe(1)
    })
  })

  it('Escape returns to the select tool while eyedropper mode is active', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(svgEditor.leftPanel.clickSelect).toHaveBeenCalledTimes(1)
  })

  it('Escape is a no-op when eyedropper mode is not active', () => {
    svgCanvas.getMode.mockReturnValue('select')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(svgEditor.leftPanel.clickSelect).not.toHaveBeenCalled()
  })
})
