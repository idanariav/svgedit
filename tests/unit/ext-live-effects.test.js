import { vi } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import '../../src/editor/components/seSpinInput.js'
import '../../src/editor/components/seSelect.js'
import extLiveEffects from '../../src/editor/extensions/ext-live-effects/ext-live-effects.js'
import { installMockSvgEditor, uninstallMockSvgEditor } from './components/testUtils.js'

vi.mock('../../src/editor/locale.js', () => ({ t: (key) => key }))

const P = 'ext-live-effects'

describe('ext-live-effects', function () {
  let svgCanvas
  let ext

  const $ = (id) => document.getElementById(id)
  const display = (id) => $(id).style.display
  const rows = () => [...document.querySelectorAll(`.${P}-row`)]
  const button = (text) => [...document.querySelectorAll(`#${P}-panel button`)].find((b) => b.textContent === text)
  const select = (elem) => {
    svgCanvas.selectOnly([elem], true)
    ext.selectedChanged({ elems: [elem], selectedElement: elem })
  }
  const addRect = () => svgCanvas.addSVGElementsFromJson({
    element: 'rect', attr: { id: svgCanvas.getNextId(), x: 10, y: 20, width: 100, height: 50, fill: '#f00' }
  })
  const chooseEffect = (name) => {
    const add = $(`${P}-add`)
    add.$select.value = name
    add.$select.dispatchEvent(new Event('change'))
  }
  const setDx = (value) => {
    const field = document.querySelector(`#${P}-editor se-spin-input`)
    field.value = value
    field.dispatchEvent(new CustomEvent('change'))
  }

  beforeEach(async function () {
    installMockSvgEditor()
    document.body.textContent = ''
    const canvasHost = document.createElement('div')
    canvasHost.id = 'svgcanvas'
    canvasHost.style.visibility = 'hidden'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(canvasHost)
    const tab = document.createElement('div')
    tab.id = 'tab_effects'
    document.body.append(workarea, tab)
    svgCanvas = new SvgCanvas(canvasHost, {
      canvas_expansion: 3,
      dimensions: [640, 480],
      initFill: { color: 'FF0000', opacity: 1 },
      initStroke: { width: 5, color: '000000', opacity: 1 },
      initOpacity: 1,
      imgPath: '../editor/images',
      langPath: 'locale/',
      extPath: 'extensions/',
      extensions: [],
      initTool: 'select',
      wireframe: false
    })
    const labels = {
      'live-effects:label': 'Distort',
      'live-effects:addPlaceholder': 'Add effect…',
      'live-effects:apply': 'Apply',
      'live-effects:cancel': 'Cancel',
      'live-effects:expand': 'Expand',
      'live-effects:randomize': 'Randomize'
    }
    const svgEditor = {
      svgCanvas,
      configObj: { pref: () => 'en' },
      i18next: { t: (key) => labels[key] ?? key, addResourceBundle () {} }
    }
    ext = await extLiveEffects.init.call(svgEditor)
    ext.callback.call(svgEditor)
  })

  afterEach(function () {
    uninstallMockSvgEditor()
    document.body.textContent = ''
  })

  const registerEffect = () => svgCanvas.registerLiveEffect('uishift', {
    label: 'UI Shift',
    defaults: { dx: 10, dy: 0, flag: false, mode: 'a' },
    choices: { mode: ['a', 'b'] },
    apply: (sps, _bbox, p) => sps.map((sp) => ({
      closed: sp.closed,
      anchors: sp.anchors.map((a) => ({
        p: { x: a.p.x + p.dx, y: a.p.y + p.dy },
        hIn: { x: a.hIn.x + p.dx, y: a.hIn.y + p.dy },
        hOut: { x: a.hOut.x + p.dx, y: a.hOut.y + p.dy }
      }))
    }))
  })

  it('injects a hidden section into the Effects tab', function () {
    assert.equal($(`${P}-panel`).parentNode.id, 'tab_effects')
    assert.equal(display(`${P}-panel`), 'none')
  })

  it('stays hidden while the selection cannot take effects, shows once it can', function () {
    registerEffect()
    const text = svgCanvas.addSVGElementsFromJson({ element: 'text', attr: { id: 'txt', x: 0, y: 0 } })
    const group = svgCanvas.addSVGElementsFromJson({ element: 'g', attr: { id: 'grp' } })
    select(group)
    assert.equal(display(`${P}-panel`), 'none')
    select(addRect())
    assert.equal(display(`${P}-panel`), '')
    assert.equal(display(`${P}-body`), '')
    assert.equal(display(`${P}-hint`), 'none')
    // text: explained rather than silently hidden
    select(text)
    assert.equal(display(`${P}-panel`), '')
    assert.equal(display(`${P}-body`), 'none')
    assert.equal(display(`${P}-hint`), '')
  })

  it('lists registered effects in the Add select', function () {
    registerEffect()
    select(addRect())
    const options = [...$(`${P}-add`).$select.options].map((o) => o.value)
    assert.ok(options.includes('uishift'))
  })

  it('choosing an effect opens a param form and previews without an undo step', function () {
    registerEffect()
    const rect = addRect()
    select(rect)
    const before = svgCanvas.undoMgr.getUndoStackSize()
    chooseEffect('uishift')
    assert.equal(display(`${P}-editor`), '')
    // number, boolean, choice → spin input, checkbox, se-select
    assert.equal(document.querySelectorAll(`#${P}-editor se-spin-input`).length, 2)
    assert.equal(document.querySelectorAll(`#${P}-editor input[type=checkbox]`).length, 1)
    assert.equal(document.querySelectorAll(`#${P}-editor se-select`).length, 1)
    const clone = rect.nextElementSibling
    assert.ok(clone.getAttribute('d').startsWith('M20,20'))
    setDx(35)
    assert.ok(clone.getAttribute('d').startsWith('M45,20'))
    assert.equal(svgCanvas.undoMgr.getUndoStackSize(), before)
    assert.equal(rect.tagName, 'rect')
  })

  it('Apply commits one undo step and shows the stack row; Cancel discards', function () {
    registerEffect()
    const rect = addRect()
    select(rect)
    const before = svgCanvas.undoMgr.getUndoStackSize()
    chooseEffect('uishift')
    setDx(35)
    button('Cancel').click()
    assert.equal(display(`${P}-editor`), 'none')
    assert.equal(rect.isConnected, true)
    assert.equal(rect.hasAttribute('visibility'), false)
    assert.equal(rect.nextElementSibling, null)
    assert.equal(svgCanvas.undoMgr.getUndoStackSize(), before)

    chooseEffect('uishift')
    setDx(35)
    button('Apply').click()
    assert.equal(svgCanvas.undoMgr.getUndoStackSize(), before + 1)
    const path = $(rect.id)
    assert.equal(path.tagName, 'path')
    assert.equal(path.getAttribute('se:fx'), 'uishift(dx=35,dy=0,flag=false,mode=a)')
    assert.equal(rows().length, 1)
    assert.equal(rows()[0].querySelector(`.${P}-row-label`).textContent, 'UI Shift')
    assert.notEqual($(`${P}-expand`).style.display, 'none')
  })

  it('edit reopens the stack entry with its stored params; remove drops it', function () {
    registerEffect()
    select(addRect())
    chooseEffect('uishift')
    setDx(35)
    button('Apply').click()

    const [row] = rows()
    row.querySelectorAll(`.${P}-icon-btn`)[0].click()
    assert.equal(document.querySelector(`#${P}-editor se-spin-input`).value, '35')
    button('Cancel').click()

    rows()[0].querySelectorAll(`.${P}-icon-btn`)[1].click()
    const el = svgCanvas.getSelectedElements()[0]
    assert.equal(el.hasAttribute('se:fx'), false)
    assert.equal(rows().length, 0)
    assert.equal($(`${P}-expand`).style.display, 'none')
  })

  it('Expand bakes the effect into d and drops the stack', function () {
    registerEffect()
    select(addRect())
    chooseEffect('uishift')
    button('Apply').click()
    button('Expand').click()
    const el = svgCanvas.getSelectedElements()[0]
    assert.equal(el.hasAttribute('se:fx'), false)
    assert.equal(el.hasAttribute('se:fx-d'), false)
    assert.ok(el.getAttribute('d').startsWith('M20,20'))
  })

  it('changing the selection cancels an open edit', function () {
    registerEffect()
    const a = addRect()
    const b = addRect()
    select(a)
    chooseEffect('uishift')
    assert.equal(a.getAttribute('visibility'), 'hidden')
    select(b)
    assert.equal(a.hasAttribute('visibility'), false)
    assert.equal(display(`${P}-editor`), 'none')
    assert.equal(document.querySelectorAll('path[pointer-events="none"]').length, 0)
  })

  it('seeded effects start with a random seed and offer Randomize', function () {
    const rect = addRect()
    select(rect)
    chooseEffect('roughen')
    const seedField = [...document.querySelectorAll(`#${P}-editor se-spin-input`)].pop()
    const first = Number(seedField.value)
    assert.ok(first > 0)
    const clone = rect.nextElementSibling
    const dBefore = clone.getAttribute('d')
    button('Randomize').click()
    assert.notEqual(Number(seedField.value), first)
    assert.notEqual(clone.getAttribute('d'), dBefore)
    button('Apply').click()
    const [entry] = svgCanvas.getLiveEffects()
    assert.equal(entry.name, 'roughen')
    assert.equal(entry.params.seed, Number(seedField.value))
  })

  it('effects without a seed have no Randomize button', function () {
    select(addRect())
    chooseEffect('twist')
    assert.equal(button('Randomize'), undefined)
  })
})
