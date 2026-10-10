import { describe, it, beforeEach, afterEach, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import extShapeFamily from '../../src/editor/extensions/ext-shape-family/ext-shape-family.js'
import en from '../../src/editor/extensions/ext-shape-family/locale/en.js'

describe('ext-shape-family', () => {
  let svgContent
  let svgCanvas
  let svgEditor
  let ext
  let mode
  let nextId
  let history
  let setMode
  let selectOnly
  let started

  const JSON_NS = NS.SVG
  const addFromJson = (data) => {
    const el = document.createElementNS(JSON_NS, data.element)
    for (const [k, v] of Object.entries(data.attr || {})) el.setAttribute(k, v)
    if (data.curStyles) el.setAttribute('stroke-width', '2')
    ;(data.children || []).forEach((c) => el.append(addFromJson(c)))
    if (!el.parentNode && !data.child) svgContent.append(el)
    return el
  }

  const key = (k, extra = {}) => {
    const event = { key: k, code: k === ' ' ? 'Space' : k, shiftKey: false, altKey: false, ...extra }
    return ext.keyDown({ event })
  }

  const press = (m, x, y) => {
    mode = m
    return ext.mouseDown({ start_x: x, start_y: y, event: {} })
  }
  const move = (x, y, event = {}) => ext.mouseMove({ mouse_x: x, mouse_y: y, event })
  const release = (x, y) => ext.mouseUp({ mouse_x: x, mouse_y: y, event: { clientX: 5, clientY: 6 } })

  beforeEach(async () => {
    document.body.innerHTML = '<div id="tools_shapes"></div>'
    svgContent = document.createElementNS(NS.SVG, 'svg')
    document.body.append(svgContent)
    nextId = 1
    started = false
    history = []
    setMode = vi.fn((m) => { mode = m })
    selectOnly = vi.fn()
    class InsertElementCommand { constructor (el) { this.el = el } }
    svgCanvas = {
      $id: (id) => document.getElementById(id),
      $click: (el, fn) => el.addEventListener('click', fn),
      getMode: () => mode,
      setMode,
      getZoom: () => 1,
      getNextId: () => `svg_${nextId++}`,
      getColor: () => '#000000',
      getStyle: () => ({ opacity: 1 }),
      getToolLocked: () => false,
      setStarted: (v) => { started = v },
      selectOnly,
      clearSelection: vi.fn(),
      call: vi.fn(),
      addCommandToHistory: (c) => history.push(c),
      addSVGElementsFromJson: addFromJson,
      history: { InsertElementCommand }
    }
    svgEditor = {
      svgCanvas,
      workarea: document.body,
      leftPanel: { updateLeftPanel: vi.fn(() => true) },
      configObj: { pref: () => 'en' },
      i18next: {
        t: (k) => k.replace(/^shape-family:/, '').split('.').reduce((o, p) => o?.[p], en) ?? k,
        addResourceBundle: vi.fn()
      },
      listenerAbort: new AbortController()
    }
    ext = await extShapeFamily.init.call(svgEditor)
    ext.callback.call(svgEditor)
  })

  afterEach(() => {
    svgEditor.listenerAbort.abort()
    document.body.textContent = ''
    vi.useRealTimers()
  })

  const shape = () => svgContent.lastElementChild

  it('adds the four tools to the shapes flyout and arms the right mode', () => {
    const ids = [...document.querySelectorAll('#tools_shapes > se-button')].map((b) => b.id)
    assert.deepEqual(ids, ['tool_spiral', 'tool_arc', 'tool_rectgrid', 'tool_polargrid'])
    document.getElementById('tool_rectgrid').click()
    assert.equal(svgEditor.leftPanel.updateLeftPanel.mock.calls.at(-1)[0], 'tool_rectgrid')
    assert.equal(setMode.mock.calls.at(-1)[0], 'rectgrid')
  })

  it('clears the selection when a drag starts, so arrow keys cannot nudge it', () => {
    press('rectgrid', 10, 10)
    assert.equal(svgCanvas.clearSelection.mock.calls.length, 1)
    release(10, 10)
  })

  it('ignores other modes', () => {
    assert.equal(press('rect', 10, 10), undefined)
    assert.equal(move(50, 50), undefined)
    assert.equal(release(50, 50), undefined)
    assert.equal(svgContent.children.length, 0)
  })

  it('draws a spiral centred on the press point, radius = drag distance', () => {
    assert.deepEqual(press('spiral', 100, 100), { started: true })
    move(100, 100)
    assert.equal(svgContent.children.length, 0, 'nothing before the drag threshold')
    move(160, 100)
    const path = shape()
    assert.equal(path.tagName, 'path')
    assert.equal(path.getAttribute('fill'), 'none')
    assert.ok(/^M/.test(path.getAttribute('d')))
    const r = release(160, 100)
    assert.equal(r.keep, true)
    assert.equal(r.element, path)
  })

  it('a spiral has segments + 1 nodes and ↑/↓ change that mid-drag', () => {
    press('spiral', 100, 100)
    move(160, 100)
    const nodes = () => (shape().getAttribute('d').match(/C/g) || []).length
    assert.equal(nodes(), 10)
    assert.deepEqual(key('ArrowUp'), { preventDefault: true })
    assert.equal(nodes(), 11)
    key('ArrowDown')
    key('ArrowDown')
    assert.equal(nodes(), 9)
    release(160, 100)
  })

  it('draws an arc between the press point and the pointer; Shift squares it', () => {
    press('arc', 10, 10)
    move(110, 50)
    assert.ok(/^M10,10 C/.test(shape().getAttribute('d')))
    assert.ok(/110,50$/.test(shape().getAttribute('d')))
    move(110, 50, { shiftKey: true })
    assert.ok(/110,110$/.test(shape().getAttribute('d')))
    release(110, 50)
  })

  it('Alt draws an arc from its centre', () => {
    press('arc', 50, 50)
    move(70, 60, { altKey: true })
    assert.ok(/^M30,40 C/.test(shape().getAttribute('d')))
    assert.ok(/70,60$/.test(shape().getAttribute('d')))
    release(70, 60)
  })

  it('a grid is one <g> of lines plus a frame, painted on the group', () => {
    press('rectgrid', 10, 10)
    move(70, 40)
    const g = shape()
    assert.equal(g.tagName, 'g')
    assert.equal(g.getAttribute('fill'), 'none')
    assert.equal(g.querySelectorAll('path').length, 10)
    assert.equal(g.querySelectorAll('rect').length, 1)
    const rect = g.querySelector('rect')
    assert.deepEqual(
      ['x', 'y', 'width', 'height'].map((a) => Number(rect.getAttribute(a))),
      [10, 10, 60, 30]
    )
    const r = release(70, 40)
    assert.equal(r.keep, true)
    assert.ok([...g.children].every((c) => c.id), 'every grid member has an id')
  })

  it('arrow keys step grid rows / columns, keeping the minimum at zero', () => {
    press('rectgrid', 0, 0)
    move(60, 60)
    const lines = () => shape().querySelectorAll('path').length
    assert.equal(lines(), 10)
    key('ArrowUp')
    assert.equal(lines(), 11)
    key('ArrowRight')
    key('ArrowRight')
    assert.equal(lines(), 13)
    for (let i = 0; i < 20; i++) key('ArrowLeft')
    assert.equal(lines(), 6)
    release(60, 60)
  })

  it('polar grid: ←/→ change radial dividers, ↑/↓ concentric rings', () => {
    press('polargrid', 0, 0)
    move(80, 40)
    const count = (tag) => shape().querySelectorAll(tag).length
    assert.equal(count('ellipse'), 6)
    assert.equal(count('path'), 5)
    key('ArrowUp')
    key('ArrowRight')
    assert.equal(count('ellipse'), 7)
    assert.equal(count('path'), 6)
    release(80, 40)
  })

  it('the options chosen with the arrows stick for the next grid', () => {
    press('rectgrid', 0, 0)
    move(60, 60)
    key('ArrowUp')
    key('ArrowUp')
    release(60, 60)
    press('rectgrid', 0, 0)
    move(60, 60)
    assert.equal(shape().querySelectorAll('path').length, 12)
    release(60, 60)
  })

  it('Shift makes a grid square and Alt draws it from the centre', () => {
    press('polargrid', 100, 100)
    move(120, 110, { shiftKey: true, altKey: true })
    const ring = [...shape().querySelectorAll('ellipse')].pop()
    assert.equal(Number(ring.getAttribute('cx')), 100)
    assert.equal(Number(ring.getAttribute('rx')), 20)
    assert.equal(Number(ring.getAttribute('ry')), 20)
    release(120, 110)
  })

  it('Space moves the shape being drawn instead of resizing it', () => {
    press('rectgrid', 10, 10)
    move(70, 40)
    const frame = () => ['x', 'y', 'width', 'height'].map((a) => Number(shape().querySelector('rect').getAttribute(a)))
    assert.deepEqual(frame(), [10, 10, 60, 30])
    assert.deepEqual(key(' '), { preventDefault: true })
    move(90, 60)
    assert.deepEqual(frame(), [30, 30, 60, 30])
    // Space released: it resizes again from the new place.
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))
    move(130, 90)
    assert.deepEqual(frame(), [30, 30, 100, 60])
    release(130, 90)
  })

  it('Escape cancels the drag and removes what was drawn', () => {
    press('spiral', 100, 100)
    move(160, 100)
    assert.equal(svgContent.children.length, 1)
    assert.equal(key('Escape'), undefined)
    assert.equal(svgContent.children.length, 0)
    assert.equal(started, false)
    assert.equal(ext.mouseUp({ mouse_x: 160, mouse_y: 100, event: {} }), undefined)
  })

  it('keys do nothing when no drag is in progress', () => {
    assert.equal(key('ArrowUp'), undefined)
    assert.equal(key(' '), undefined)
    press('spiral', 0, 0)
    // pressed but not dragged yet: arrows are not captured
    assert.equal(key('ArrowUp'), undefined)
    release(0, 0)
  })

  it('a click without a drag opens the options popover and draws nothing', () => {
    press('rectgrid', 40, 50)
    move(41, 50)
    const r = release(41, 50)
    assert.deepEqual(r, { keep: false, element: null })
    assert.equal(svgContent.children.length, 0)
    const pop = document.querySelector('.shape_family_popover')
    assert.ok(pop)
    assert.equal(pop.querySelector('.shape_family_popover_title').textContent, 'Rectangular Grid')
    assert.deepEqual(
      [...pop.querySelectorAll('input')].map((i) => i.name),
      ['width', 'height', 'rows', 'columns', 'frame']
    )
  })

  it('confirming the popover inserts the shape at the click as one undoable insert', () => {
    press('rectgrid', 40, 50)
    release(40, 50)
    const pop = document.querySelector('.shape_family_popover')
    pop.querySelector('[name="width"]').value = '80'
    pop.querySelector('[name="height"]').value = '40'
    pop.querySelector('[name="rows"]').value = '1'
    pop.querySelector('[name="columns"]').value = '2'
    pop.querySelector('[name="frame"]').checked = false
    pop.dispatchEvent(new Event('submit', { cancelable: true }))
    const g = shape()
    assert.equal(g.tagName, 'g')
    assert.equal(g.querySelectorAll('path').length, 3)
    assert.equal(g.querySelectorAll('rect').length, 0)
    assert.equal(history.length, 1)
    assert.equal(history[0].el, g)
    assert.equal(selectOnly.mock.calls.at(-1)[0][0], g)
    assert.equal(setMode.mock.calls.at(-1)[0], 'select')
    assert.equal(document.querySelector('.shape_family_popover'), null)
    assert.ok([...g.children].every((c) => c.id))
  })

  it('a spiral from the popover is centred on the click and clamps its counts', () => {
    press('spiral', 200, 200)
    release(200, 200)
    const pop = document.querySelector('.shape_family_popover')
    pop.querySelector('[name="radius"]').value = '30'
    pop.querySelector('[name="segments"]').value = '99999'
    pop.querySelector('[name="decay"]').value = '99'
    pop.querySelector('[name="clockwise"]').checked = false
    pop.dispatchEvent(new Event('submit', { cancelable: true }))
    const d = shape().getAttribute('d')
    assert.equal((d.match(/C/g) || []).length, 1000)
    // The outer end sits one radius to the right of the click.
    assert.ok(/230,200$/.test(d))
  })

  it('cancel and Escape close the popover without drawing', () => {
    press('arc', 5, 5)
    release(5, 5)
    document.querySelector('.shape_family_popover button[type="button"]').click()
    assert.equal(document.querySelector('.shape_family_popover'), null)
    press('arc', 5, 5)
    release(5, 5)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    assert.equal(document.querySelector('.shape_family_popover'), null)
    assert.equal(svgContent.children.length, 0)
    assert.equal(history.length, 0)
  })

  it('switching to another tool dismisses an open popover', () => {
    press('arc', 5, 5)
    release(5, 5)
    assert.ok(document.querySelector('.shape_family_popover'))
    document.dispatchEvent(new CustomEvent('modeChange', { detail: { getMode: () => 'select' } }))
    assert.equal(document.querySelector('.shape_family_popover'), null)
  })
})
