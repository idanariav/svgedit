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
  let tools
  let ctx
  let down
  let transacted
  let finished
  let released
  let setMode
  let selectOnly

  const JSON_NS = NS.SVG
  const addFromJson = (data) => {
    const el = document.createElementNS(JSON_NS, data.element)
    for (const [k, v] of Object.entries(data.attr || {})) el.setAttribute(k, v)
    if (data.curStyles) el.setAttribute('stroke-width', '2')
    ;(data.children || []).forEach((c) => el.append(addFromJson(c)))
    if (!el.parentNode && !data.child) svgContent.append(el)
    return el
  }

  // The extension registers one tool per mode; these drive them the way the
  // canvas's tool registry (core/tool-registry.js) would: document-space events.
  const key = (k, extra = {}) => {
    const event = { key: k, code: k === ' ' ? 'Space' : k, shiftKey: false, altKey: false, ...extra }
    return tools[mode]?.keyDown(ctx, event)
  }

  const press = (m, x, y, mods = {}) => {
    mode = m
    down = { x, y }
    ctx.start = { x, y }
    return tools[m].pointerDown(ctx, ev(x, y, mods))
  }
  const ev = (x, y, mods = {}, event = {}) => ({
    x,
    y,
    rawX: x,
    rawY: y,
    screenX: x,
    screenY: y,
    dragDistance: down ? Math.hypot(x - down.x, y - down.y) : 0,
    mods: { shift: false, alt: false, ctrl: false, meta: false, mod: false, ...mods },
    button: 0,
    event
  })
  const move = (x, y, event = {}) => tools[mode].pointerMove(ctx, ev(x, y, {
    shift: !!event.shiftKey, alt: !!event.altKey
  }))
  const release = (x, y) => tools[mode].pointerUp(ctx, ev(x, y, {}, { clientX: 5, clientY: 6 }))

  beforeEach(async () => {
    document.body.innerHTML = '<div id="tools_shapes"></div>'
    svgContent = document.createElementNS(NS.SVG, 'svg')
    document.body.append(svgContent)
    nextId = 1
    transacted = []
    finished = []
    released = []
    tools = {}
    down = null
    setMode = vi.fn((m) => { mode = m })
    selectOnly = vi.fn()
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
      selectOnly,
      clearSelection: vi.fn(),
      call: vi.fn(),
      addSVGElementsFromJson: addFromJson,
      registerTool: (def) => { tools[def.id] = def },
      transact: (label, fn) => { transacted.push(label); return fn() },
      finishCreatedElement: (el) => finished.push(el),
      getCurrentDrawing: () => ({ releaseId: (id) => released.push(id) })
    }
    ctx = { canvas: svgCanvas, zoom: 1, start: null }
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

  it('registers one tool per mode, each with its own undo label', () => {
    assert.deepEqual(Object.keys(tools), ['spiral', 'arc', 'rectgrid', 'polargrid'])
    assert.equal(tools.spiral.undoLabel, 'Draw spiral')
    assert.equal(tools.polargrid.undoLabel, 'Draw polar grid')
  })

  it('does not register legacy mouse hooks any more', () => {
    for (const hook of ['mouseDown', 'mouseMove', 'mouseUp', 'keyDown']) assert.equal(ext[hook], undefined)
  })

  it('draws a spiral centred on the press point, radius = drag distance', () => {
    assert.equal(press('spiral', 100, 100), undefined) // not declined: the registry starts the gesture
    move(100, 100)
    assert.equal(svgContent.children.length, 0, 'nothing before the drag threshold')
    move(160, 100)
    const path = shape()
    assert.equal(path.tagName, 'path')
    assert.equal(path.getAttribute('fill'), 'none')
    assert.ok(/^M/.test(path.getAttribute('d')))
    assert.deepEqual(release(160, 100), { created: path })
  })

  it('a spiral has segments + 1 nodes and ↑/↓ change that mid-drag', () => {
    press('spiral', 100, 100)
    move(160, 100)
    const nodes = () => (shape().getAttribute('d').match(/C/g) || []).length
    assert.equal(nodes(), 10)
    assert.equal(key('ArrowUp'), true)
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
    assert.deepEqual(release(70, 40), { created: g })
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
    assert.equal(key(' '), true)
    move(90, 60)
    assert.deepEqual(frame(), [30, 30, 60, 30])
    // Space released: it resizes again from the new place.
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))
    move(130, 90)
    assert.deepEqual(frame(), [30, 30, 100, 60])
    release(130, 90)
  })

  it('when the registry cancels the gesture (Escape, tool switch) the tool forgets the drag', () => {
    press('spiral', 100, 100)
    move(160, 100)
    // The registry rolls the drawing back through its transaction, then tells the tool.
    tools.spiral.cancel(ctx)
    assert.equal(key('ArrowUp'), false)
    assert.equal(release(160, 100), undefined)
  })

  it('keys do nothing when no drag is in progress', () => {
    mode = 'spiral'
    assert.equal(key('ArrowUp'), false)
    assert.equal(key(' '), false)
    press('spiral', 0, 0)
    // pressed but not dragged yet: arrows are not captured
    assert.equal(key('ArrowUp'), false)
    release(0, 0)
  })

  it('a zero-size drag is rolled back (and its id released) instead of left behind', () => {
    press('spiral', 50, 50)
    move(54, 50) // past the threshold: an element exists
    move(50, 50) // ... then back to the centre: radius 0
    assert.equal(release(50, 50), 'cancel')
    assert.equal(released.length, 1)
  })

  it('a click without a drag opens the options popover and draws nothing', () => {
    press('rectgrid', 40, 50)
    move(41, 50)
    assert.equal(release(41, 50), undefined) // nothing to commit: the popover takes over
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
    // created inside one transaction (= one undo step), then finished like a drawn shape
    assert.deepEqual(transacted, ['Draw rectangular grid'])
    assert.deepEqual(finished, [g])
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
    assert.equal(transacted.length, 0)
  })

  it('switching to another tool dismisses an open popover', () => {
    press('arc', 5, 5)
    release(5, 5)
    assert.ok(document.querySelector('.shape_family_popover'))
    document.dispatchEvent(new CustomEvent('modeChange', { detail: { getMode: () => 'select' } }))
    assert.equal(document.querySelector('.shape_family_popover'), null)
  })
})
