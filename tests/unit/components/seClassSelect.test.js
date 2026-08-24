import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import {
  getClass,
  getClassesForScope,
  saveClass,
  deleteClass,
  getDefaultClassForTag,
  setDefaultClassForTag
} from '../../../src/editor/classLibrary.js'
import '../../../src/editor/components/seClassSelect.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))
vi.mock('../../../src/editor/classLibrary.js', () => ({
  getClass: vi.fn(),
  getClassesForScope: vi.fn(() => []),
  saveClass: vi.fn(),
  deleteClass: vi.fn(),
  elementScope: vi.fn(elem => (elem?.tagName?.toLowerCase() === 'text' ? 'text' : 'shape')),
  attrCatalog: vi.fn(() => ['fill', 'stroke']),
  nextClassString: vi.fn((elem, name) => {
    const internal = (elem.getAttribute('class') || '').split(/\s+/).filter(tk => tk.startsWith('se_'))
    const next = [...internal, name].filter(Boolean).join(' ')
    return next || null
  }),
  getDefaultClassForTag: vi.fn(),
  setDefaultClassForTag: vi.fn()
}))

/** Build a minimal SVG rect element with a class attribute for use as selection. */
function makeRect (className = '') {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  if (className) el.setAttribute('class', className)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.appendChild(el)
  return el
}

/** Minimal history stub with BatchCommand/ChangeElementCommand recording. */
function makeHistory () {
  const commands = []
  class BatchCommand {
    constructor (name) { this.name = name; this.subCommands = [] }
    addSubCommand (c) { this.subCommands.push(c) }
    isEmpty () { return this.subCommands.length === 0 }
  }
  class ChangeElementCommand {
    constructor (elem, oldAttrs) { this.elem = elem; this.oldAttrs = oldAttrs }
  }
  return { BatchCommand, ChangeElementCommand, commands }
}

describe('se-class-select', () => {
  let svgCanvas
  let topPanel

  beforeEach(() => {
    getClass.mockReset()
    getClassesForScope.mockReset().mockReturnValue([])
    saveClass.mockReset()
    deleteClass.mockReset()
    getDefaultClassForTag.mockReset()
    setDefaultClassForTag.mockReset()

    svgCanvas = {
      getSelectedElements: vi.fn(() => []),
      history: makeHistory(),
      addCommandToHistory: vi.fn()
    }
    topPanel = { update: vi.fn(), updateContextPanel: vi.fn() }
    installMockSvgEditor({ svgCanvas, topPanel, shadowApi: undefined, outlineApi: undefined })
  })

  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('renders a shadow root with the select, add, and delete controls', () => {
    const el = mountElement('se-class-select')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$select.tagName).toBe('SELECT')
    expect(el.$add.tagName).toBe('BUTTON')
    expect(el.$del.tagName).toBe('BUTTON')
  })

  it('shows the top label when the label attribute is set', () => {
    const el = mountElement('se-class-select', { label: 'my_label' })
    expect(el.$label.textContent).toBe('my_label')
  })

  it('sets the select title when the title attribute is set', () => {
    const el = mountElement('se-class-select', { title: 'my_title' })
    expect(el.$select.getAttribute('title')).toBe('my_title')
  })

  describe('refresh()', () => {
    it('does nothing (keeps _elem null) when elem has no parentNode', () => {
      const el = mountElement('se-class-select')
      const detached = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      el.refresh(detached)
      expect(el._elem).toBeNull()
    })

    it('populates the dropdown with presets for the element scope plus a none option', () => {
      getClassesForScope.mockReturnValue([{ name: 'title', scope: 'text', attrs: {} }])
      const el = mountElement('se-class-select')
      const rect = makeRect()
      el.refresh(rect)

      const values = Array.from(el.$select.options).map(o => o.value)
      expect(values).toEqual(['', 'title'])
      expect(el.$select.value).toBe('')
    })

    it('adds a "(custom: ...)" option for a user class not in the preset list', () => {
      getClassesForScope.mockReturnValue([])
      const el = mountElement('se-class-select')
      const rect = makeRect('myCustom')
      el.refresh(rect)

      const opt = Array.from(el.$select.options).find(o => o.value === 'myCustom')
      expect(opt).toBeTruthy()
      expect(opt.textContent).toBe('(custom: myCustom)')
      expect(el.$select.value).toBe('myCustom')
    })

    it('preserves internal se_ tokens out of the user-facing class computation', () => {
      getClassesForScope.mockReturnValue([])
      const el = mountElement('se-class-select')
      const rect = makeRect('se_layer myClass')
      el.refresh(rect)
      expect(el.$select.value).toBe('myClass')
    })

    it('disables the delete button when the selected value has no stored preset', () => {
      getClass.mockReturnValue(undefined)
      getClassesForScope.mockReturnValue([])
      const el = mountElement('se-class-select')
      const rect = makeRect('unsaved')
      el.refresh(rect)
      expect(el.$del.disabled).toBe(true)
    })

    it('enables the delete button when the selected value has a stored preset', () => {
      getClass.mockImplementation(name => (name === 'saved' ? { name: 'saved', scope: 'shape', attrs: {} } : undefined))
      getClassesForScope.mockReturnValue([{ name: 'saved', scope: 'shape', attrs: {} }])
      const el = mountElement('se-class-select')
      const rect = makeRect('saved')
      el.refresh(rect)
      expect(el.$del.disabled).toBe(false)
    })
  })

  describe('applyClass()', () => {
    it('does nothing when there is no selection', () => {
      const el = mountElement('se-class-select')
      el.applyClass('foo')
      expect(svgCanvas.addCommandToHistory).not.toHaveBeenCalled()
      expect(topPanel.update).not.toHaveBeenCalled()
    })

    it('sets the class attribute on selected elements and records history + refreshes panels', () => {
      const rect = makeRect()
      svgCanvas.getSelectedElements.mockReturnValue([rect])
      getClass.mockReturnValue(undefined)
      const el = mountElement('se-class-select')

      el.applyClass('newClass')

      expect(rect.getAttribute('class')).toBe('newClass')
      expect(svgCanvas.addCommandToHistory).toHaveBeenCalledTimes(1)
      expect(topPanel.update).toHaveBeenCalledTimes(1)
      expect(topPanel.updateContextPanel).toHaveBeenCalledTimes(1)
    })

    it('stamps preset attrs onto the element and adds paint-order when stroke-width is present', () => {
      const rect = makeRect()
      svgCanvas.getSelectedElements.mockReturnValue([rect])
      getClass.mockReturnValue({ name: 'thick', scope: 'shape', attrs: { 'stroke-width': '4' } })
      const el = mountElement('se-class-select')

      el.applyClass('thick')

      expect(rect.getAttribute('stroke-width')).toBe('4')
      expect(rect.getAttribute('paint-order')).toBe('stroke')
    })

    it('calls shadowApi.apply and outlineApi.apply when the preset has shadow/outline', () => {
      const rect = makeRect()
      svgCanvas.getSelectedElements.mockReturnValue([rect])
      const shadow = { angle: 45, length: 4 }
      const outline = { width: 2 }
      getClass.mockReturnValue({ name: 'fancy', scope: 'shape', attrs: {}, shadow, outline })
      const shadowApi = { apply: vi.fn(), read: vi.fn() }
      const outlineApi = { apply: vi.fn(), read: vi.fn() }
      installMockSvgEditor({ svgCanvas, topPanel, shadowApi, outlineApi })
      const el = mountElement('se-class-select')

      el.applyClass('fancy')

      expect(shadowApi.apply).toHaveBeenCalledWith(rect, shadow, expect.anything())
      expect(outlineApi.apply).toHaveBeenCalledWith(rect, outline, expect.anything())
    })

    it('does not add to history when nothing actually changed', () => {
      const rect = makeRect('same')
      svgCanvas.getSelectedElements.mockReturnValue([rect])
      getClass.mockReturnValue(undefined)
      const el = mountElement('se-class-select')

      el.applyClass('same')

      expect(svgCanvas.addCommandToHistory).not.toHaveBeenCalled()
      // Panels still refresh regardless.
      expect(topPanel.update).toHaveBeenCalledTimes(1)
    })

    it('fires via the select change event', () => {
      const rect = makeRect()
      svgCanvas.getSelectedElements.mockReturnValue([rect])
      getClass.mockReturnValue(undefined)
      const el = mountElement('se-class-select')
      el._elem = rect
      el.$select.append(el._option('picked', 'picked'))

      el.$select.value = 'picked'
      el.$select.dispatchEvent(new Event('change'))

      expect(rect.getAttribute('class')).toBe('picked')
    })
  })

  describe('save popover', () => {
    it('openSave populates name/scope from the current element and shows the popover', () => {
      getClassesForScope.mockReturnValue([])
      const el = mountElement('se-class-select')
      const rect = makeRect('myClass')
      el.refresh(rect)

      el.openSave()

      expect(el.$name.value).toBe('myClass')
      expect(el.$scope.value).toBe('shape')
      expect(el.isOpen).toBe(true)
    })

    it('openSave does nothing without a current element', () => {
      const el = mountElement('se-class-select')
      el.openSave()
      expect(el.isOpen).toBe(false)
    })

    it('closeSave hides the popover', () => {
      getClassesForScope.mockReturnValue([])
      const el = mountElement('se-class-select')
      el.refresh(makeRect())
      el.openSave()
      el.closeSave()
      expect(el.isOpen).toBe(false)
    })

    it('save() focuses the name field and returns early when name is blank', () => {
      getClassesForScope.mockReturnValue([])
      const el = mountElement('se-class-select')
      el.refresh(makeRect())
      el.openSave()
      el.$name.value = '   '

      el.save()

      expect(saveClass).not.toHaveBeenCalled()
      expect(el.isOpen).toBe(true)
    })

    it('save() persists a preset with checked attrs and closes the popover', () => {
      getClassesForScope.mockReturnValue([])
      getClass.mockReturnValue(undefined)
      const rect = makeRect()
      rect.setAttribute('fill', 'red')
      const el = mountElement('se-class-select')
      el.refresh(rect)
      el.openSave()
      el.$name.value = 'brandNew'
      const fillCb = el.$checklist.querySelector('input[data-attr="fill"]')
      fillCb.checked = true

      el.save()

      expect(saveClass).toHaveBeenCalledWith(expect.objectContaining({
        name: 'brandNew',
        scope: 'shape',
        attrs: { fill: 'red' }
      }))
      expect(el.isOpen).toBe(false)
    })

    it('save() prompts for overwrite confirmation when the name already exists under a different preset', () => {
      getClassesForScope.mockReturnValue([])
      getClass.mockImplementation(name => (name === 'existing' ? { name: 'existing', scope: 'shape', attrs: {} } : undefined))
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const el = mountElement('se-class-select')
      el.refresh(makeRect())
      el.openSave()
      el.$name.value = 'existing'

      el.save()

      expect(confirmSpy).toHaveBeenCalled()
      expect(saveClass).not.toHaveBeenCalled()
      confirmSpy.mockRestore()
    })

    it('renders a shadow checklist row when shadowApi.read returns a shadow', () => {
      getClassesForScope.mockReturnValue([])
      const shadowApi = { read: vi.fn(() => ({ angle: 30, length: 5 })) }
      installMockSvgEditor({ svgCanvas, topPanel, shadowApi })
      const el = mountElement('se-class-select')
      el.refresh(makeRect())

      el.openSave()

      const row = el.$checklist.querySelector('input[data-shadow]')
      expect(row).toBeTruthy()
      expect(row.checked).toBe(true)
    })

    it('renders an outline checklist row when outlineApi.read returns an outline', () => {
      getClassesForScope.mockReturnValue([])
      const outlineApi = { read: vi.fn(() => ({ width: 3 })) }
      installMockSvgEditor({ svgCanvas, topPanel, outlineApi })
      const el = mountElement('se-class-select')
      el.refresh(makeRect())

      el.openSave()

      const row = el.$checklist.querySelector('input[data-outline]')
      expect(row).toBeTruthy()
      expect(row.checked).toBe(true)
    })

    it('openSave checks the default checkbox when this preset is the tag\'s current default', () => {
      getClassesForScope.mockReturnValue([{ name: 'myClass', scope: 'shape', attrs: {} }])
      getClass.mockReturnValue({ name: 'myClass', scope: 'shape', attrs: {} })
      getDefaultClassForTag.mockReturnValue('myClass')
      const el = mountElement('se-class-select')
      const rect = makeRect('myClass')
      el.refresh(rect)

      el.openSave()

      expect(getDefaultClassForTag).toHaveBeenCalledWith('rect')
      expect(el.$default.checked).toBe(true)
      expect(el.$defaultText.textContent).toContain('rect')
    })

    it('openSave leaves the default checkbox unchecked when this preset is not the tag default', () => {
      getClassesForScope.mockReturnValue([{ name: 'myClass', scope: 'shape', attrs: {} }])
      getClass.mockReturnValue({ name: 'myClass', scope: 'shape', attrs: {} })
      getDefaultClassForTag.mockReturnValue('someOtherClass')
      const el = mountElement('se-class-select')
      const rect = makeRect('myClass')
      el.refresh(rect)

      el.openSave()

      expect(el.$default.checked).toBe(false)
    })

    it('save() sets the tag default when the checkbox is checked', () => {
      getClassesForScope.mockReturnValue([])
      getClass.mockReturnValue(undefined)
      const el = mountElement('se-class-select')
      el.refresh(makeRect())
      el.openSave()
      el.$name.value = 'brandNew'
      el.$default.checked = true

      el.save()

      expect(setDefaultClassForTag).toHaveBeenCalledWith('rect', 'brandNew')
    })

    it('save() clears the tag default when unchecked after previously being the default', () => {
      getClassesForScope.mockReturnValue([{ name: 'myClass', scope: 'shape', attrs: {} }])
      getClass.mockReturnValue({ name: 'myClass', scope: 'shape', attrs: {} })
      getDefaultClassForTag.mockReturnValue('myClass')
      const el = mountElement('se-class-select')
      const rect = makeRect('myClass')
      el.refresh(rect)
      el.openSave()
      expect(el.$default.checked).toBe(true)
      el.$default.checked = false

      el.save()

      expect(setDefaultClassForTag).toHaveBeenCalledWith('rect', null)
    })

    it('save() leaves other tags\' defaults untouched when unchecked and never was the default', () => {
      getClassesForScope.mockReturnValue([])
      getClass.mockReturnValue(undefined)
      getDefaultClassForTag.mockReturnValue(undefined)
      const el = mountElement('se-class-select')
      el.refresh(makeRect())
      el.openSave()
      el.$name.value = 'brandNew'

      el.save()

      expect(setDefaultClassForTag).not.toHaveBeenCalled()
    })
  })

  describe('deleteCurrent()', () => {
    it('does nothing when there is no selected class', () => {
      getClass.mockReturnValue(undefined)
      const el = mountElement('se-class-select')
      el.refresh(makeRect())
      el.deleteCurrent()
      expect(deleteClass).not.toHaveBeenCalled()
    })

    it('confirms then deletes and refreshes when a stored class is selected', () => {
      getClassesForScope.mockReturnValue([{ name: 'gone', scope: 'shape', attrs: {} }])
      getClass.mockImplementation(name => (name === 'gone' ? { name: 'gone', scope: 'shape', attrs: {} } : undefined))
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      const el = mountElement('se-class-select')
      const rect = makeRect('gone')
      el.refresh(rect)

      el.deleteCurrent()

      expect(deleteClass).toHaveBeenCalledWith('gone')
      confirmSpy.mockRestore()
    })

    it('does not delete when the user cancels the confirmation', () => {
      getClassesForScope.mockReturnValue([{ name: 'gone', scope: 'shape', attrs: {} }])
      getClass.mockImplementation(name => (name === 'gone' ? { name: 'gone', scope: 'shape', attrs: {} } : undefined))
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const el = mountElement('se-class-select')
      const rect = makeRect('gone')
      el.refresh(rect)

      el.deleteCurrent()

      expect(deleteClass).not.toHaveBeenCalled()
      confirmSpy.mockRestore()
    })
  })

  describe('keyboard/click-outside handling', () => {
    it('closes the popover on Escape', () => {
      getClassesForScope.mockReturnValue([])
      const el = mountElement('se-class-select')
      el.refresh(makeRect())
      el.openSave()

      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

      expect(el.isOpen).toBe(false)
    })

    it('closes the popover on an outside document click', () => {
      getClassesForScope.mockReturnValue([])
      const el = mountElement('se-class-select')
      el.refresh(makeRect())
      el.openSave()

      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      expect(el.isOpen).toBe(false)
    })
  })
})
