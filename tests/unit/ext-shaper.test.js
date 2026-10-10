import { describe, it, beforeEach, afterEach, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import extShaper, { describeShape, sampleStroke, strokeTouches } from '../../src/editor/extensions/ext-shaper/ext-shaper.js'
import en from '../../src/editor/extensions/ext-shaper/locale/en.js'
import { mockCommands } from './helpers/commands.js'

const P = (x, y) => ({ x, y })
const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

describe('describeShape', () => {
  it('maps a line to its endpoints', () => {
    const d = describeShape({ type: 'line', a: P(1, 2), b: P(30.126, 40) })
    assert.equal(d.element, 'line')
    assert.equal(d.open, true)
    assert.deepEqual(d.attr, { x1: 1, y1: 2, x2: 30.13, y2: 40 })
  })

  it('maps an upright rectangle without a transform', () => {
    const d = describeShape({ type: 'rectangle', rect: { cx: 100, cy: 50, width: 40, height: 20 }, rotation: 0 })
    assert.deepEqual(d.attr, { x: 80, y: 40, width: 40, height: 20 })
  })

  it('rotates a tilted rectangle and ellipse about their own centre', () => {
    const rect = describeShape({ type: 'rectangle', rect: { cx: 100, cy: 50, width: 40, height: 20 }, rotation: 45 })
    assert.equal(rect.attr.transform, 'rotate(45 100 50)')
    const ell = describeShape({ type: 'ellipse', rect: { cx: 10, cy: 20, width: 60, height: 30 }, rotation: 135 })
    assert.equal(ell.element, 'ellipse')
    assert.deepEqual(ell.attr, { cx: 10, cy: 20, rx: 30, ry: 15, transform: 'rotate(135 10 20)' })
  })

  it('puts a triangle apex straight up at rotation 0 and straight down at 180', () => {
    const vertices = (rotation) => describeShape({ type: 'polygon', center: P(0, 0), radius: 10, sides: 3, rotation })
      .attr.points.split(' ').map((s) => s.split(',').map(Number))
    const up = vertices(0)
    assert.equal(up.length, 3)
    assert.deepEqual(up[0], [0, -10])
    assert.deepEqual(vertices(180)[0], [0, 10])
  })

  it('has no element for a scribble', () => {
    assert.equal(describeShape({ type: 'scribble', rect: { x: 0, y: 0, width: 1, height: 1 } }), null)
  })
})

describe('sampleStroke', () => {
  it('keeps the ends and leaves no gap wider than the spacing', () => {
    const out = sampleStroke([P(0, 0), P(10, 0), P(10, 10)])
    assert.deepEqual(out[0], P(0, 0))
    assert.deepEqual(out[out.length - 1], P(10, 10))
    for (let i = 1; i < out.length; i++) assert.ok(Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y) <= 0.5 + 1e-9)
  })

  it('caps the sample count on a very long stroke', () => {
    assert.ok(sampleStroke([P(0, 0), P(100000, 0)]).length <= 2100)
  })
})

describe('strokeTouches', () => {
  const geometry = ({ fill, stroke, strokeWidth = '1', inFill = () => false, inStroke = () => false, ctm = IDENTITY }) => {
    const el = document.createElementNS(NS.SVG, 'rect')
    el.getScreenCTM = () => ctm
    el.isPointInFill = vi.fn(inFill)
    el.isPointInStroke = vi.fn(inStroke)
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ fill, stroke, strokeWidth })
    return el
  }
  afterEach(() => vi.restoreAllMocks())

  it('tests the fill only when the element has one', () => {
    const outline = geometry({ fill: 'none', stroke: 'rgb(0, 0, 0)', inFill: () => true })
    assert.equal(strokeTouches(outline, [P(5, 5)], IDENTITY), false)
    assert.equal(outline.isPointInFill.mock.calls.length, 0)
    const solid = geometry({ fill: 'rgb(255, 0, 0)', stroke: 'none', inFill: () => true })
    assert.equal(strokeTouches(solid, [P(5, 5)], IDENTITY), true)
  })

  it('tests the stroke only when the element has one', () => {
    const noStroke = geometry({ fill: 'none', stroke: 'none', inStroke: () => true })
    assert.equal(strokeTouches(noStroke, [P(5, 5)], IDENTITY), false)
    const zeroWidth = geometry({ fill: 'none', stroke: 'rgb(0, 0, 0)', strokeWidth: '0', inStroke: () => true })
    assert.equal(strokeTouches(zeroWidth, [P(5, 5)], IDENTITY), false)
    const line = geometry({ fill: 'none', stroke: 'rgb(0, 0, 0)', inStroke: (p) => p.x === 5 })
    assert.equal(strokeTouches(line, [P(1, 1), P(5, 1)], IDENTITY), true)
    assert.equal(strokeTouches(line, [P(1, 1), P(2, 1)], IDENTITY), false)
  })

  it('maps the samples into the element own space', () => {
    // The element sits at translate(100, 0): document x=105 is local x=5.
    const el = geometry({ fill: 'rgb(0, 0, 0)', stroke: 'none', ctm: { ...IDENTITY, e: 100 }, inFill: (p) => p.x === 5 && p.y === 7 })
    assert.equal(strokeTouches(el, [P(105, 7)], IDENTITY), true)
    assert.equal(strokeTouches(el, [P(5, 7)], IDENTITY), false)
  })

  it('ignores frames and ephemeral scaffolding, and elements that are not rendered', () => {
    const frame = geometry({ fill: 'rgb(0, 0, 0)', stroke: 'none', inFill: () => true })
    frame.setAttribute('data-frame', '1')
    assert.equal(strokeTouches(frame, [P(1, 1)], IDENTITY), false)
    const ghost = geometry({ fill: 'rgb(0, 0, 0)', stroke: 'none', inFill: () => true })
    ghost.setAttribute('data-se-ephemeral', '')
    assert.equal(strokeTouches(ghost, [P(1, 1)], IDENTITY), false)
    const hidden = geometry({ fill: 'rgb(0, 0, 0)', stroke: 'none', inFill: () => true, ctm: null })
    assert.equal(strokeTouches(hidden, [P(1, 1)], IDENTITY), false)
  })

  it('looks inside groups', () => {
    const group = document.createElementNS(NS.SVG, 'g')
    group.append(geometry({ fill: 'none', stroke: 'none' }), geometry({ fill: 'rgb(0, 0, 0)', stroke: 'none', inFill: () => true }))
    assert.equal(strokeTouches(group, [P(1, 1)], IDENTITY), true)
  })

  it('falls back to the bounding box for elements without geometry methods', () => {
    const text = document.createElementNS(NS.SVG, 'text')
    text.getScreenCTM = () => IDENTITY
    text.getBBox = () => ({ x: 10, y: 10, width: 20, height: 10 })
    assert.equal(strokeTouches(text, [P(15, 15)], IDENTITY), true)
    assert.equal(strokeTouches(text, [P(50, 15)], IDENTITY), false)
  })
})

describe('ext-shaper', () => {
  let svgContent
  let tools
  let svgCanvas
  let svgEditor
  let ctx
  let nextId
  let overlays
  let selected
  let deleted
  let setMode

  const addFromJson = (data) => {
    const el = document.createElementNS(NS.SVG, data.element)
    for (const [k, v] of Object.entries(data.attr || {})) el.setAttribute(k, v)
    svgContent.append(el)
    return el
  }
  const ev = (x, y) => ({
    x,
    y,
    rawX: x,
    rawY: y,
    screenX: x,
    screenY: y,
    dragDistance: 0,
    button: 0,
    event: {},
    mods: { shift: false, alt: false, ctrl: false, meta: false, mod: false }
  })
  const stroke = (pts) => {
    const tool = tools.shaper
    tool.pointerDown(ctx, ev(pts[0].x, pts[0].y))
    pts.slice(1, -1).forEach((p) => tool.pointerMove(ctx, ev(p.x, p.y)))
    const last = pts[pts.length - 1]
    return tool.pointerUp(ctx, ev(last.x, last.y))
  }
  const square = (x, y, size) => {
    const corners = [P(x, y), P(x + size, y), P(x + size, y + size), P(x, y + size)]
    const out = []
    corners.forEach((a, i) => {
      const b = corners[(i + 1) % 4]
      for (let j = 0; j < 20; j++) out.push(P(a.x + (b.x - a.x) * j / 20, a.y + (b.y - a.y) * j / 20))
    })
    out.push(P(x + 2, y + 1))
    return out
  }

  beforeEach(async () => {
    document.body.innerHTML = '<div id="tools_left"><se-button id="tool_select"></se-button><se-button id="tool_fhpath"></se-button><se-button id="tool_line"></se-button></div>'
    svgContent = document.createElementNS(NS.SVG, 'svg')
    document.body.append(svgContent)
    nextId = 1
    tools = {}
    overlays = []
    selected = []
    deleted = []
    setMode = vi.fn()
    svgCanvas = {
      $id: (id) => document.getElementById(id),
      insertChildAtIndex: (parent, html, index) => {
        const t = document.createElement('template')
        t.innerHTML = html
        parent.insertBefore(t.content.firstElementChild, parent.children[index] ?? null)
      },
      getNextId: () => `svg_${nextId++}`,
      setMode,
      getMode: () => 'select',
      getColor: () => '#336699',
      addSVGElementsFromJson: addFromJson,
      registerTool: (def) => { tools[def.id] = def },
      getCurrentGroup: () => null,
      getCurrentDrawing: () => ({ getCurrentLayer: () => svgContent }),
      getVisibleElements: (parent) => [...parent.children].reverse(),
      getStrokedBBoxDefaultVisible: ([el]) => el.bbox,
      selectOnly: (els) => { selected = els },
      deleteSelectedElements: () => { deleted = selected; deleted.forEach((e) => e.remove()) }
    }
    ctx = { canvas: svgCanvas, zoom: 1, addOverlay: (el) => overlays.push(el), clearOverlays: () => { overlays = [] } }
    svgEditor = {
      svgCanvas,
      leftPanel: { updateLeftPanel: vi.fn(() => true) },
      configObj: { pref: () => 'en' },
      i18next: {
        t: (k) => k.replace(/^shaper:/, '').split('.').reduce((o, p) => o?.[p], en) ?? k,
        addResourceBundle: vi.fn()
      },
      listenerAbort: new AbortController()
    }
    mockCommands(svgEditor)
    const ext = await extShaper.init.call(svgEditor)
    ext.callback.call(svgEditor)
  })

  afterEach(() => {
    svgEditor.listenerAbort.abort()
    document.body.textContent = ''
    vi.restoreAllMocks()
  })

  it('adds one button right after the pencil and arms the shaper mode', () => {
    const ids = [...document.querySelectorAll('#tools_left > se-button')].map((b) => b.id)
    assert.deepEqual(ids, ['tool_select', 'tool_fhpath', 'tool_shaper', 'tool_line'])
    assert.equal(document.getElementById('tool_shaper').getAttribute('command'), 'tool_shaper')
    document.getElementById('tool_shaper').click()
    assert.equal(svgEditor.leftPanel.updateLeftPanel.mock.calls.at(-1)[0], 'tool_shaper')
    assert.equal(setMode.mock.calls.at(-1)[0], 'shaper')
  })

  it('draws a preview while the stroke is down and removes it on release', () => {
    tools.shaper.pointerDown(ctx, ev(0, 0))
    tools.shaper.pointerMove(ctx, ev(10, 5))
    assert.equal(overlays.length, 1)
    assert.equal(overlays[0].getAttribute('points'), '0,0 10,5')
    tools.shaper.pointerUp(ctx, ev(20, 5))
    assert.equal(overlays.length, 0)
  })

  it('turns a rough square into a rect with the current paint and hands it back as created', () => {
    const result = stroke(square(100, 100, 100))
    assert.equal(svgContent.children.length, 1)
    const rect = svgContent.firstElementChild
    assert.equal(rect.tagName, 'rect')
    assert.equal(result.created, rect)
    assert.equal(rect.id, 'svg_1')
    assert.ok(Math.abs(Number(rect.getAttribute('width')) - 100) < 5)
    assert.equal(rect.getAttribute('transform'), null)
  })

  it('gives a recognized line a fill of none and a visible stroke', () => {
    svgCanvas.getColor = () => 'none'
    stroke(Array.from({ length: 31 }, (_, i) => P(i * 8, i * 2)))
    const line = svgContent.firstElementChild
    assert.equal(line.tagName, 'line')
    assert.equal(line.getAttribute('fill'), 'none')
    assert.equal(line.getAttribute('stroke'), '#000000')
  })

  it('discards a stroke that is not a shape: nothing created, the gesture rolls back', () => {
    const curl = Array.from({ length: 60 }, (_, i) => P(100 + 50 * Math.cos(i * 0.08), 100 + 50 * Math.sin(i * 0.08)))
    assert.equal(stroke(curl), 'cancel')
    assert.equal(svgContent.children.length, 0)
    assert.equal(stroke([P(5, 5), P(5, 5)]), 'cancel')
  })

  it('a scribble deletes the elements it touches and nothing else, through the canvas delete', () => {
    const make = (id, x, hits) => {
      const el = document.createElementNS(NS.SVG, 'rect')
      el.id = id
      el.bbox = { x, y: 100, width: 60, height: 60 }
      el.getScreenCTM = () => IDENTITY
      el.isPointInFill = () => hits
      el.isPointInStroke = () => false
      svgContent.append(el)
      return el
    }
    svgContent.getScreenCTM = () => IDENTITY
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ fill: 'rgb(0, 0, 0)', stroke: 'none', strokeWidth: '1' })
    const hit = make('hit', 100, true)
    make('far', 1000, true) // fails the bounding-box cull before any geometry test
    make('near', 100, false) // in range, but the scribble does not touch it
    const zig = Array.from({ length: 40 }, (_, i) => P(100 + (i % 2) * 60, 100 + i * 2))
    assert.equal(stroke(zig), undefined)
    assert.deepEqual(deleted, [hit])
    assert.deepEqual([...svgContent.children].map((e) => e.id), ['far', 'near'])
  })

  it('a scribble over nothing is cancelled so it costs no undo step', () => {
    svgContent.getScreenCTM = () => IDENTITY
    const zig = Array.from({ length: 40 }, (_, i) => P(100 + (i % 2) * 60, 100 + i * 2))
    assert.equal(stroke(zig), 'cancel')
  })

  it('cancel() forgets a stroke in progress', () => {
    tools.shaper.pointerDown(ctx, ev(0, 0))
    tools.shaper.cancel(ctx)
    assert.equal(tools.shaper.pointerUp(ctx, ev(1, 1)), 'cancel')
  })
})
