import { vi } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import '../../src/editor/components/seSpinInput.js'
import '../../src/editor/components/seSelect.js'
import extGlow from '../../src/editor/extensions/ext-glow/ext-glow.js'
import { createFxComposer } from '../../src/editor/extensions/fx-filter.js'
import { installMockSvgEditor, uninstallMockSvgEditor } from './components/testUtils.js'
import { mockCommands } from './helpers/commands.js'

vi.mock('../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('ext-glow', function () {
  let svgCanvas
  let svgEditor
  let ext
  let fx

  const $ = (id) => document.getElementById(id)
  const select = (elem) => {
    svgCanvas.selectOnly([elem], true)
    ext.selectedChanged({ elems: [elem], selectedElement: elem })
  }
  const addRect = () => svgCanvas.addSVGElementsFromJson({
    element: 'rect', attr: { id: svgCanvas.getNextId(), x: 10, y: 20, width: 100, height: 50, fill: '#f00' }
  })
  const field = (id, value) => {
    $(id).value = value
    $(id).dispatchEvent(new CustomEvent('change'))
  }
  const undoSize = () => svgCanvas.undoMgr.getUndoStackSize()

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
    tab.innerHTML = '<div id="shadow_panel"></div><div id="outline_panel"></div><div id="after"></div>'
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
    const labels = { 'glow:name': 'Glow' }
    svgEditor = {
      svgCanvas,
      configObj: { pref: () => 'en' },
      i18next: { t: (key) => labels[key] ?? key, addResourceBundle () {} }
    }
    mockCommands(svgEditor)
    ext = await extGlow.init.call(svgEditor)
    ext.callback.call(svgEditor)
    fx = svgEditor.fxFilter
  })

  afterEach(function () {
    uninstallMockSvgEditor()
    document.body.textContent = ''
  })

  it('injects a hidden Glow section right after the Outline section', function () {
    assert.equal($('outline_panel').nextElementSibling.id, 'glow_panel')
    assert.equal($('glow_panel').style.display, 'none')
  })

  it('shows for any single element (text too) and hides for none or several', function () {
    const text = svgCanvas.addSVGElementsFromJson({ element: 'text', attr: { id: 'txt', x: 0, y: 30 } })
    select(text)
    assert.equal($('glow_panel').style.display, '')
    const rect = addRect()
    ext.selectedChanged({ elems: [rect, text], selectedElement: rect, multiselected: true })
    assert.equal($('glow_panel').style.display, 'none')
    ext.selectedChanged({ elems: [], selectedElement: null })
    assert.equal($('glow_panel').style.display, 'none')
  })

  it('blur sets an outer glow in one undo step; blur 0 removes it and its filter', function () {
    const rect = addRect()
    select(rect)
    const before = undoSize()
    field('glow_outer_blur', 8)
    assert.equal(undoSize(), before + 1)
    assert.deepEqual(fx.readEffects(rect).glow.outer, { blur: 8, color: '#ffff00', opacity: 0.75 })
    assert.equal(fx.readEffects(rect).glow.inner, null)
    assert.equal($('glow_panel').querySelector('[data-glow=outer]').hasAttribute('data-off'), false)

    field('glow_outer_blur', 0)
    assert.equal(undoSize(), before + 2)
    assert.equal(rect.hasAttribute('filter'), false)
    assert.equal($('glow_panel').querySelector('[data-glow=outer]').hasAttribute('data-off'), true)
    svgCanvas.undoMgr.undo()
    assert.equal(fx.readEffects(rect).glow.outer.blur, 8)
  })

  it('editing opacity or colour of a glow that is off switches it on at a default blur', function () {
    const rect = addRect()
    select(rect)
    field('glow_inner_color', '#00ff00')
    const inner = fx.readEffects(rect).glow.inner
    assert.equal(inner.blur, 5)
    assert.equal(inner.color, '#00ff00')
    assert.equal(inner.source, 'edge')
  })

  it('the inner source switches between edge and centre', function () {
    const rect = addRect()
    select(rect)
    field('glow_inner_blur', 6)
    field('glow_inner_source', 'centre')
    assert.equal(fx.readEffects(rect).glow.inner.source, 'centre')
    assert.equal(rect.ownerDocument.querySelector('feComponentTransfer'), null)
    field('glow_inner_source', 'edge')
    assert.ok(rect.ownerDocument.querySelector('feComponentTransfer'))
  })

  it('keeps an existing shadow and outline, and shows the stored values on reselect', function () {
    const rect = addRect()
    const batch = new svgCanvas.history.BatchCommand('setup')
    fx.writeEffects(rect, {
      outline: { width: 2, color: '#fff', opacity: 1 },
      shadow: { dx: 3, dy: 3, blur: 2, color: '#000', opacity: 0.5 },
      glow: { outer: null, inner: null }
    }, batch)
    select(rect)
    field('glow_outer_blur', 6)
    const spec = fx.readEffects(rect)
    assert.equal(spec.outline.width, 2)
    assert.equal(spec.shadow.dx, 3)
    assert.equal(spec.glow.outer.blur, 6)

    const other = addRect()
    select(other)
    assert.equal($('glow_outer_blur').value, '0')
    select(rect)
    assert.equal($('glow_outer_blur').value, '6')
    assert.equal($('glow_outer_opacity').value, '75')
  })

  it('the remove button clears both glows but not the shadow', function () {
    const rect = addRect()
    select(rect)
    const batch = new svgCanvas.history.BatchCommand('setup')
    const spec = fx.readEffects(rect)
    spec.shadow = { dx: 3, dy: 3, blur: 2, color: '#000', opacity: 0.5 }
    fx.writeEffects(rect, spec, batch)
    field('glow_outer_blur', 6)
    field('glow_inner_blur', 6)
    $('glow_remove').dispatchEvent(new Event('click'))
    const after = fx.readEffects(rect)
    assert.deepEqual(after.glow, { outer: null, inner: null })
    assert.ok(after.shadow)
  })

  it('the feather radius fades the edges in one undo step; 0 removes it; glows and shadow are kept', function () {
    const rect = addRect()
    select(rect)
    field('glow_outer_blur', 6)
    const before = undoSize()
    field('glow_feather_radius', 10)
    assert.equal(undoSize(), before + 1)
    let spec = fx.readEffects(rect)
    assert.deepEqual(spec.feather, { radius: 10 })
    assert.equal(spec.glow.outer.blur, 6)
    assert.equal($('glow_panel').querySelector('[data-glow=feather]').hasAttribute('data-off'), false)
    // glow edits keep the feather
    field('glow_inner_blur', 4)
    assert.deepEqual(fx.readEffects(rect).feather, { radius: 10 })
    field('glow_feather_radius', 0)
    spec = fx.readEffects(rect)
    assert.equal(spec.feather, null)
    assert.equal(spec.glow.outer.blur, 6)
    assert.equal($('glow_panel').querySelector('[data-glow=feather]').hasAttribute('data-off'), true)
  })

  it('a feather alone works, shows on reselect, and the remove button clears it', function () {
    const rect = addRect()
    select(rect)
    field('glow_feather_radius', 12)
    assert.ok(rect.hasAttribute('filter'))
    select(addRect())
    assert.equal($('glow_feather_radius').value, '0')
    select(rect)
    assert.equal($('glow_feather_radius').value, '12')
    $('glow_remove').dispatchEvent(new Event('click'))
    assert.equal(rect.hasAttribute('filter'), false)
  })

  it('glowApi reads and stamps glow onto another element inside the given batch', function () {
    const a = addRect()
    const b = addRect()
    select(a)
    field('glow_outer_blur', 7)
    const glow = svgEditor.glowApi.read(a)
    assert.equal(glow.outer.blur, 7)
    assert.equal(svgEditor.glowApi.read(b), null)
    field('glow_feather_radius', 9)
    assert.deepEqual(svgEditor.glowApi.read(a).feather, { radius: 9 })
    const batch = new svgCanvas.history.BatchCommand('stamp')
    svgEditor.glowApi.apply(b, glow, batch)
    assert.ok(!batch.isEmpty())
    assert.equal(createFxComposer(svgCanvas).readEffects(b).glow.outer.blur, 7)
    assert.deepEqual(createFxComposer(svgCanvas).readEffects(b).feather, null)
    svgEditor.glowApi.apply(b, { remove: true }, new svgCanvas.history.BatchCommand('rm'))
    assert.equal(svgEditor.glowApi.read(b), null)
  })
})
