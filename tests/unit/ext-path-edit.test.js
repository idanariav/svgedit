import { vi } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import '../../src/editor/components/seSelect.js'
import extPathEdit from '../../src/editor/extensions/ext-path-edit/ext-path-edit.js'
import { buildEditorShortcuts } from '../../src/editor/editorShortcuts.js'
import { installMockSvgEditor, uninstallMockSvgEditor } from './components/testUtils.js'
import { mockCommands } from './helpers/commands.js'

vi.mock('../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('ext-path-edit', function () {
  let svgCanvas
  let ext

  const $ = (id) => document.getElementById(id)
  const add = (d) => svgCanvas.addSVGElementsFromJson({ element: 'path', attr: { id: svgCanvas.getNextId(), d } })
  const select = (...els) => {
    svgCanvas.selectOnly(els, true)
    ext.selectedChanged({ elems: els, selectedElement: els[0], multiselected: els.length > 1 })
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
    const chrome = document.createElement('div')
    chrome.innerHTML = `
      <div class="path_node_panel"><button id="tool_node_delete"></button><button id="tool_openclose_path"></button></div>
      <div class="selected_panel"><button id="tool_stroke_to_path"></button></div>
      <div class="multiselected_panel"><button id="tool_match_strokes"></button></div>`
    document.body.append(workarea, chrome)
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
      $container: document.body,
      configObj: { pref: () => 'en' },
      i18next: { t: (key) => key, addResourceBundle () {} }
    }
    mockCommands(svgEditor)
    ext = await extPathEdit.init.call(svgEditor)
    ext.callback.call(svgEditor)
  })

  afterEach(function () {
    uninstallMockSvgEditor()
    document.body.textContent = ''
  })

  it('injects Average and Add anchors into the node tray, right after Delete Node', function () {
    assert.equal($('tool_node_delete').nextElementSibling.id, 'tool_node_average')
    assert.equal($('tool_node_average').nextElementSibling.id, 'tool_node_add_anchors')
    assert.equal($('tool_openclose_path').previousElementSibling.id, 'tool_node_add_anchors')
  })

  it('Average runs the chosen axis and goes back to the placeholder', async function () {
    const spy = vi.fn()
    svgCanvas.pathActions.averageSelectedNodes = spy
    const sel = $('tool_node_average')
    sel.$select.value = 'h'
    sel.$select.dispatchEvent(new Event('change'))
    assert.deepEqual(spy.mock.calls, [['h']])
    await new Promise((resolve) => setTimeout(resolve, 5))
    assert.equal(sel.value, '')
    // choosing the placeholder does nothing
    sel.$select.value = ''
    sel.$select.dispatchEvent(new Event('change'))
    assert.equal(spy.mock.calls.length, 1)
  })

  it('Add anchor points button calls the path action, but only while a path is being node-edited', function () {
    const spy = vi.fn()
    svgCanvas.pathActions.addAnchorPoints = spy
    $('tool_node_add_anchors').dispatchEvent(new Event('click'))
    assert.equal(spy.mock.calls.length, 0)
    vi.spyOn(svgCanvas, 'getMode').mockReturnValue('pathedit')
    $('tool_node_add_anchors').dispatchEvent(new Event('click'))
    assert.equal(spy.mock.calls.length, 1)
  })

  it('Close shows for one open path, Join for two; both hidden otherwise', function () {
    const a = add('M0,0 L10,0')
    const b = add('M10,0 L20,0')
    const closed = add('M0,0 L5,0 L5,5 Z')
    assert.equal($('tool_join_paths').style.display, 'none')
    assert.equal($('tool_join_paths_multi').style.display, 'none')
    select(a)
    assert.equal($('tool_join_paths').style.display, '')
    assert.equal($('tool_join_paths_multi').style.display, 'none')
    select(a, b)
    assert.equal($('tool_join_paths').style.display, 'none')
    assert.equal($('tool_join_paths_multi').style.display, '')
    select(closed)
    assert.equal($('tool_join_paths').style.display, 'none')
    assert.equal($('tool_join_paths_multi').style.display, 'none')
  })

  it('the Join button joins the two selected paths in one undo step', function () {
    const a = add('M0,0 L10,0')
    const b = add('M10,0 L20,0')
    select(a, b)
    const before = svgCanvas.undoMgr.getUndoStackSize()
    $('tool_join_paths_multi').dispatchEvent(new Event('click'))
    assert.equal(a.getAttribute('d'), 'M0,0 L10,0 L20,0')
    assert.ok(!b.isConnected)
    assert.equal(svgCanvas.undoMgr.getUndoStackSize(), before + 1)
  })

  it('the Close button closes the selected open path', function () {
    const a = add('M0,0 L10,0 L10,10')
    select(a)
    $('tool_join_paths').dispatchEvent(new Event('click'))
    assert.match(a.getAttribute('d'), /z$/i)
  })

  it('has keyless Hotkey Manager / Command Search entries', function () {
    const calls = []
    const editor = {
      svgCanvas: {
        getMode: () => 'pathedit',
        joinSelectedPaths: () => calls.push('join'),
        pathActions: {
          averageSelectedNodes: (axis) => calls.push(`avg:${axis}`),
          addAnchorPoints: () => calls.push('add')
        }
      }
    }
    const byId = Object.fromEntries(buildEditorShortcuts(editor).map((s) => [s.id, s]))
    for (const id of ['path_average_h', 'path_average_v', 'path_average_both', 'path_add_anchors', 'path_join']) {
      assert.ok(byId[id], id)
      assert.equal(byId[id].key, undefined)
      assert.equal(byId[id].group, 'Path')
      byId[id].fn()
    }
    assert.deepEqual(calls, ['avg:h', 'avg:v', 'avg:both', 'add', 'join'])
    // the node actions only run in pathedit mode
    editor.svgCanvas.getMode = () => 'select'
    calls.length = 0
    byId.path_average_h.fn()
    byId.path_add_anchors.fn()
    assert.deepEqual(calls, [])
  })

  it('those entries say why they are unavailable', function () {
    let mode = 'select'
    let joinable = false
    const editor = {
      svgCanvas: {
        getMode: () => mode,
        getSelectedElements: () => [null, {}],
        canJoinPaths: () => joinable
      }
    }
    const byId = Object.fromEntries(buildEditorShortcuts(editor).map((s) => [s.id, s]))
    for (const id of ['path_average_h', 'path_average_v', 'path_average_both', 'path_add_anchors']) {
      assert.match(byId[id].enabled(), /Edit a path/)
    }
    assert.match(byId.path_join.enabled(), /open path/)
    mode = 'pathedit'
    joinable = true
    for (const id of ['path_average_h', 'path_average_v', 'path_average_both', 'path_add_anchors', 'path_join']) {
      assert.equal(byId[id].enabled(), true, id)
    }
  })
})
