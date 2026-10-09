import { vi } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import '../../src/editor/components/seSpinInput.js'
import extCornerRadius from '../../src/editor/extensions/ext-corner-radius/ext-corner-radius.js'
import { installMockSvgEditor, uninstallMockSvgEditor } from './components/testUtils.js'

vi.mock('../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('ext-corner-radius', function () {
  let svgCanvas
  let ext

  const $ = (id) => document.getElementById(id)
  const select = (elem) => {
    svgCanvas.selectOnly([elem], true)
    ext.selectedChanged({ elems: [elem], selectedElement: elem })
  }
  const add = (element, attr) => svgCanvas.addSVGElementsFromJson({
    element, attr: { ...attr, id: svgCanvas.getNextId() }
  })
  const setRadius = (value) => {
    $('corner_radius_value').value = value
    $('corner_radius_value').dispatchEvent(new CustomEvent('change'))
  }
  const selected = () => svgCanvas.getSelectedElements().filter(Boolean)[0]
  // The extension system dispatches `changed` to elementChanged.
  const changed = () => ext.elementChanged({ elems: [selected()] })

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
    tab.id = 'tab_design'
    const objectPanel = document.createElement('div')
    objectPanel.className = 'selected_panel'
    tab.append(objectPanel)
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
    const svgEditor = {
      svgCanvas,
      configObj: { pref: () => 'en' },
      i18next: { t: (key) => key, addResourceBundle () {} }
    }
    ext = await extCornerRadius.init.call(svgEditor)
    ext.callback.call(svgEditor)
  })

  afterEach(function () {
    uninstallMockSvgEditor()
    document.body.textContent = ''
  })

  it('injects a hidden Corners section before the Object section', function () {
    assert.equal($('corner_panel').nextElementSibling.className, 'selected_panel')
    assert.equal($('corner_panel').style.display, 'none')
    for (const k of ['r', 'i', 'c']) assert.ok($(`corner_kind_${k}`))
  })

  it('shows for a rect or a path with a corner, hides for an ellipse', function () {
    select(add('rect', { x: 0, y: 0, width: 50, height: 30 }))
    assert.equal($('corner_panel').style.display, 'block')
    select(add('ellipse', { cx: 10, cy: 10, rx: 5, ry: 5 }))
    assert.equal($('corner_panel').style.display, 'none')
    select(add('path', { d: 'M0,0 L50,0 C80,0 80,50 50,50 L0,50 Z' }))
    assert.equal($('corner_panel').style.display, 'block')
  })

  it('the radius field cuts a rect into a path; the kind buttons switch kind', function () {
    select(add('rect', { x: 0, y: 0, width: 100, height: 60 }))
    setRadius(10)
    let el = selected()
    assert.equal(el.tagName, 'path')
    assert.equal(el.getAttribute('se:corner-radius'), '10')
    assert.equal($('corner_radius_value').value, '10')

    $('corner_kind_c').dispatchEvent(new Event('click'))
    el = selected()
    assert.equal(el.getAttribute('se:corner-radius'), '10:c,10:c,10:c,10:c')
    assert.doesNotMatch(el.getAttribute('d'), /A/)
    changed()
    assert.equal($('corner_kind_c').pressed, true)
    assert.equal($('corner_kind_r').pressed, false)

    // a later radius edit keeps the kind
    setRadius(6)
    assert.equal(selected().getAttribute('se:corner-radius'), '6:c,6:c,6:c,6:c')
  })

  it('a kind picked before any radius is used when the radius is first set', function () {
    select(add('path', { d: 'M0,0 L100,0 L100,60 L0,60 Z' }))
    $('corner_kind_i').dispatchEvent(new Event('click'))
    assert.equal(selected().hasAttribute('se:corner-radius'), false)
    assert.equal($('corner_kind_i').pressed, true)
    setRadius(8)
    assert.equal(selected().getAttribute('se:corner-radius'), '8:i,8:i,8:i,8:i')
  })

  it('a mixed per-corner drawing keeps its kinds when the radius changes', function () {
    const path = add('path', { d: 'M0,0 L100,0 L100,60 L0,60 Z' })
    select(path)
    svgCanvas.applyCornerRadius(10, { kind: 'c', corners: [0] })
    svgCanvas.applyCornerRadius(10, { kind: 'i', corners: [2] })
    select(selected())
    assert.equal(selected().getAttribute('se:corner-radius'), '10:c,0,10:i')
    setRadius(5)
    assert.equal(selected().getAttribute('se:corner-radius'), '5:c,5,5:i,5')
  })

  it('drops the attributes when d was rewritten outside the pipeline', function () {
    select(add('path', { d: 'M0,0 L100,0 L100,60 L0,60 Z' }))
    setRadius(10)
    const el = selected()
    el.setAttribute('d', 'M0,0 L50,0 L50,50 Z')
    select(el)
    assert.equal(el.hasAttribute('se:orig-d'), false)
    assert.equal(el.hasAttribute('se:corner-radius'), false)
  })
})
