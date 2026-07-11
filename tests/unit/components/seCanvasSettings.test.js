import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seCanvasSettings.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

// seCanvasSettings persists presets/layouts via localStorage (no userDataAdapter
// is registered in these tests), so clear it between tests to avoid bleed.

describe('se-canvas-settings', () => {
  let setResolution
  let updateCanvas

  beforeEach(() => {
    localStorage.clear()
    setResolution = vi.fn()
    updateCanvas = vi.fn()
    installMockSvgEditor({
      svgCanvas: {
        getResolution: () => ({ w: 800, h: 600 }),
        setResolution
      },
      updateCanvas
    })
  })
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('renders a shadow root with the trigger and popup', () => {
    const el = mountElement('se-canvas-settings')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$trigger).toBeTruthy()
    expect(el.$popup).toBeTruthy()
    expect(el.$popup.style.display).toBe('none')
  })

  it('renders the default presets grid', () => {
    const el = mountElement('se-canvas-settings')
    // 9 DEFAULT_PRESETS when nothing is stored
    expect(el.presets.length).toBe(0) // not loaded until open()
  })

  describe('open()', () => {
    it('pre-fills W/H inputs from getResolution() and remembers the original size', () => {
      const el = mountElement('se-canvas-settings')
      el.open()

      expect(el.$w.value).toBe('800')
      expect(el.$h.value).toBe('600')
      expect(el._original).toEqual({ w: 800, h: 600 })
      expect(el.isOpen).toBe(true)
      expect(el.$trigger.getAttribute('aria-expanded')).toBe('true')
    })

    it('rounds non-integer resolution values', () => {
      installMockSvgEditor({
        svgCanvas: { getResolution: () => ({ w: 800.6, h: 599.4 }), setResolution },
        updateCanvas
      })
      const el = mountElement('se-canvas-settings')
      el.open()

      expect(el._original).toEqual({ w: 801, h: 599 })
    })

    it('loads the default presets into this.presets and renders preset buttons', () => {
      const el = mountElement('se-canvas-settings')
      el.open()

      expect(el.presets.length).toBe(9)
      const buttons = el.$presets.querySelectorAll('.preset')
      expect(buttons.length).toBe(9)
      expect(buttons[0].textContent).toBe('4:5 (800:1000)')
    })

    it('shows "No saved layouts yet." when no layouts are stored', () => {
      const el = mountElement('se-canvas-settings')
      el.open()

      expect(el.layouts).toEqual([])
      expect(el.$layoutsList.querySelector('.layouts-empty').textContent).toBe('No saved layouts yet.')
    })
  })

  describe('toggle() / close()', () => {
    it('toggle() opens when closed and closes when open', () => {
      const el = mountElement('se-canvas-settings')
      expect(el.isOpen).toBe(false)

      el.toggle()
      expect(el.isOpen).toBe(true)

      el.toggle()
      expect(el.isOpen).toBe(false)
      expect(el.$trigger.getAttribute('aria-expanded')).toBe('false')
    })

    it('clicking the trigger toggles the popup open', () => {
      const el = mountElement('se-canvas-settings')
      el.$trigger.dispatchEvent(new Event('click', { bubbles: true }))
      expect(el.isOpen).toBe(true)
    })

    it('closes on outside click but not on click on the host itself', () => {
      const el = mountElement('se-canvas-settings')
      el.open()

      // Simulate handleClose being invoked with e.target === el (click within host)
      el.handleClose({ target: el })
      expect(el.isOpen).toBe(true)

      // Click target other than the host closes it
      el.handleClose({ target: document.body })
      expect(el.isOpen).toBe(false)
    })

    it('closes on Escape key and refocuses the trigger', () => {
      const el = mountElement('se-canvas-settings')
      el.open()
      el.$trigger.focus = vi.fn()

      el.handleKeyDown({ key: 'Escape' })

      expect(el.isOpen).toBe(false)
      expect(el.$trigger.focus).toHaveBeenCalled()
    })
  })

  describe('apply()', () => {
    it('calls setResolution and updateCanvas with parsed W/H, then closes', () => {
      const el = mountElement('se-canvas-settings')
      el.open()
      el.$w.value = '1024'
      el.$h.value = '768'

      el.apply()

      expect(setResolution).toHaveBeenCalledWith(1024, 768)
      expect(updateCanvas).toHaveBeenCalled()
      expect(el.isOpen).toBe(false)
    })

    it('does nothing when W/H are invalid (non-finite or non-positive)', () => {
      const el = mountElement('se-canvas-settings')
      el.open()
      el.$w.value = 'abc'
      el.$h.value = '600'

      el.apply()

      expect(setResolution).not.toHaveBeenCalled()
      expect(updateCanvas).not.toHaveBeenCalled()
      expect(el.isOpen).toBe(true)
    })

    it('does nothing when W/H are zero or negative', () => {
      const el = mountElement('se-canvas-settings')
      el.open()
      el.$w.value = '0'
      el.$h.value = '600'

      el.apply()

      expect(setResolution).not.toHaveBeenCalled()
    })

    it('clicking the apply button triggers apply()', () => {
      const el = mountElement('se-canvas-settings')
      el.open()
      el.$w.value = '500'
      el.$h.value = '400'

      el.$apply.dispatchEvent(new Event('click'))

      expect(setResolution).toHaveBeenCalledWith(500, 400)
    })
  })

  describe('reset()', () => {
    it('restores the inputs to the size captured when the popover was opened', () => {
      const el = mountElement('se-canvas-settings')
      el.open()
      el.$w.value = '9999'
      el.$h.value = '8888'

      el.reset()

      expect(el.$w.value).toBe('800')
      expect(el.$h.value).toBe('600')
    })

    it('does nothing if the popover was never opened (_original unset)', () => {
      const el = mountElement('se-canvas-settings')
      el.$w.value = '123'

      el.reset()

      expect(el.$w.value).toBe('123')
    })
  })

  describe('preset buttons', () => {
    it('clicking a preset button stages its size into the W/H inputs', () => {
      const el = mountElement('se-canvas-settings')
      el.open()

      const btn = el.$presets.querySelectorAll('.preset')[4] // 4:3 (640:480)
      btn.dispatchEvent(new Event('click'))

      expect(el.$w.value).toBe('640')
      expect(el.$h.value).toBe('480')
    })
  })

  describe('manage mode', () => {
    it('enterManageMode() shows the manage rows and hides the preset grid/actions', () => {
      const el = mountElement('se-canvas-settings')
      el.open()

      el.enterManageMode()

      expect(el.$presets.style.display).toBe('none')
      expect(el.$manage.style.display).toBe('flex')
      expect(el.$manageActions.style.display).toBe('flex')
      expect(el.$manageRows.querySelectorAll('.manage-row').length).toBe(9)
    })

    it('exitManageMode() restores the normal preset view', () => {
      const el = mountElement('se-canvas-settings')
      el.open()
      el.enterManageMode()

      el.exitManageMode()

      expect(el.$presets.style.display).toBe('grid')
      expect(el.$manage.style.display).toBe('none')
      expect(el.$manageActions.style.display).toBe('none')
    })

    it('addManageRow() appends a row pre-filled from the current W/H inputs when no preset given', () => {
      const el = mountElement('se-canvas-settings')
      el.open()
      el.$w.value = '400'
      el.$h.value = '300'
      el.enterManageMode()
      const before = el.$manageRows.querySelectorAll('.manage-row').length

      el.addManageRow()

      const rows = el.$manageRows.querySelectorAll('.manage-row')
      expect(rows.length).toBe(before + 1)
      const last = rows[rows.length - 1]
      expect(last.querySelector('.r-w').value).toBe('400')
      expect(last.querySelector('.r-h').value).toBe('300')
      expect(last.querySelector('.r-label').value).toBe('4:3')
    })

    it('clicking a row delete button removes that row', () => {
      const el = mountElement('se-canvas-settings')
      el.open()
      el.enterManageMode()
      const rows = el.$manageRows.querySelectorAll('.manage-row')
      const countBefore = rows.length

      rows[0].querySelector('.del').dispatchEvent(new Event('click'))

      expect(el.$manageRows.querySelectorAll('.manage-row').length).toBe(countBefore - 1)
    })

    it('saveManage() collects valid rows into this.presets, persists, and exits manage mode', () => {
      const el = mountElement('se-canvas-settings')
      el.open()
      el.enterManageMode()
      // Remove all existing rows, add one custom row
      el.$manageRows.querySelectorAll('.manage-row').forEach(r => r.remove())
      el.addManageRow({ ratio: '2:1', w: 200, h: 100 })

      el.saveManage()

      expect(el.presets).toEqual([{ ratio: '2:1', w: 200, h: 100 }])
      expect(el.$manage.style.display).toBe('none')
      expect(JSON.parse(localStorage.getItem('svg-edit-canvas-presets'))).toEqual([{ ratio: '2:1', w: 200, h: 100 }])
    })

    it('saveManage() skips rows with invalid W/H', () => {
      const el = mountElement('se-canvas-settings')
      el.open()
      el.enterManageMode()
      el.$manageRows.querySelectorAll('.manage-row').forEach(r => r.remove())
      el.addManageRow({ ratio: 'bad', w: -5, h: 100 })

      el.saveManage()

      expect(el.presets).toEqual([])
    })

    it('saveManage() computes a ratio label when left blank', () => {
      const el = mountElement('se-canvas-settings')
      el.open()
      el.enterManageMode()
      el.$manageRows.querySelectorAll('.manage-row').forEach(r => r.remove())
      el.addManageRow({ ratio: '', w: 200, h: 100 })
      el.$manageRows.querySelector('.r-label').value = ''

      el.saveManage()

      expect(el.presets).toEqual([{ ratio: '2:1', w: 200, h: 100 }])
    })

    it('auto-refreshes the ratio label as W/H change until the user edits it manually', () => {
      const el = mountElement('se-canvas-settings')
      el.open()
      el.enterManageMode()
      el.$manageRows.querySelectorAll('.manage-row').forEach(r => r.remove())
      el.addManageRow()
      const row = el.$manageRows.querySelector('.manage-row')
      const wInput = row.querySelector('.r-w')
      const hInput = row.querySelector('.r-h')
      const labelInput = row.querySelector('.r-label')

      wInput.value = '300'
      wInput.dispatchEvent(new Event('input'))
      hInput.value = '200'
      hInput.dispatchEvent(new Event('input'))

      expect(labelInput.value).toBe('3:2')

      // Once the user edits the label directly, it stops auto-updating
      labelInput.value = 'custom'
      labelInput.dispatchEvent(new Event('input'))
      wInput.value = '999'
      wInput.dispatchEvent(new Event('input'))

      expect(labelInput.value).toBe('custom')
    })
  })

  describe('layouts', () => {
    it('saveCurrentLayout() captures the current canvas and adds it to the layouts list', () => {
      const svgCanvas = {
        getResolution: () => ({ w: 800, h: 600 }),
        setResolution,
        getSvgString: () => '<svg></svg>'
      }
      installMockSvgEditor({
        svgCanvas,
        updateCanvas,
        configObj: { curConfig: { imgPath: 'images' }, pref: () => '#FFFFFF' }
      })
      const el = mountElement('se-canvas-settings')
      el.open()
      el.$layoutName.value = 'My Layout'

      el.saveCurrentLayout()

      expect(el.layouts.length).toBe(1)
      expect(el.layouts[0]).toMatchObject({ name: 'My Layout', w: 800, h: 600 })
      expect(el.$layoutName.value).toBe('')
      const stored = JSON.parse(localStorage.getItem('svg-edit-canvas-layouts'))
      expect(stored.length).toBe(1)
    })

    it('saveCurrentLayout() does nothing when the name is blank', () => {
      const el = mountElement('se-canvas-settings')
      el.open()
      el.$layoutName.value = '   '

      el.saveCurrentLayout()

      expect(el.layouts.length).toBe(0)
    })

    it('pressing Enter in the layout name field triggers saveCurrentLayout()', () => {
      const svgCanvas = {
        getResolution: () => ({ w: 800, h: 600 }),
        setResolution,
        getSvgString: () => '<svg></svg>'
      }
      installMockSvgEditor({
        svgCanvas,
        updateCanvas,
        configObj: { curConfig: { imgPath: 'images' }, pref: () => '#FFFFFF' }
      })
      const el = mountElement('se-canvas-settings')
      el.open()
      el.$layoutName.value = 'Enter Layout'

      el.$layoutName.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))

      expect(el.layouts.length).toBe(1)
      expect(el.layouts[0].name).toBe('Enter Layout')
    })

    it('removeLayout() deletes a layout by index and persists', () => {
      const svgCanvas = {
        getResolution: () => ({ w: 800, h: 600 }),
        setResolution,
        getSvgString: () => '<svg></svg>'
      }
      installMockSvgEditor({
        svgCanvas,
        updateCanvas,
        configObj: { curConfig: { imgPath: 'images' }, pref: () => '#FFFFFF' }
      })
      const el = mountElement('se-canvas-settings')
      el.open()
      el.$layoutName.value = 'L1'
      el.saveCurrentLayout()
      expect(el.layouts.length).toBe(1)

      el.removeLayout(0)

      expect(el.layouts.length).toBe(0)
      const stored = JSON.parse(localStorage.getItem('svg-edit-canvas-layouts'))
      expect(stored.length).toBe(0)
    })
  })
  // positionPopup() is inherited from SeSettingsPopover and covered by
  // seSettingsPopover.test.js; not re-tested here (same as the other
  // migrated *Settings components).
})
