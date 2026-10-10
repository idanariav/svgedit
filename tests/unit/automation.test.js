import { vi } from 'vitest'
import { Automation, docToClient, clientToDoc, parseKeyCombo } from '../../src/editor/automation.js'

describe('document <-> client mapping (the single definition of the origin formula)', () => {
  // #svgroot at (100, 50) on screen; #svgcontent offset by (200, 200) inside it
  const frame = (zoom) => ({ rootLeft: 100, rootTop: 50, contentX: 200, contentY: 200, zoom })

  it.each([0.5, 1, 2])('maps at zoom %s and round-trips', (zoom) => {
    const f = frame(zoom)
    expect(docToClient(f, 0, 0)).toEqual({ x: 300, y: 250 })
    expect(docToClient(f, 40, 20)).toEqual({ x: 300 + 40 * zoom, y: 250 + 20 * zoom })
    const back = clientToDoc(f, 300 + 40 * zoom, 250 + 20 * zoom)
    expect(back.x).toBeCloseTo(40)
    expect(back.y).toBeCloseTo(20)
  })

  it('follows scrolling: the same document point moves with #svgroot', () => {
    const scrolled = { ...frame(1), rootLeft: 100 - 80, rootTop: 50 - 30 }
    expect(docToClient(scrolled, 10, 10)).toEqual({ x: 230, y: 230 })
  })
})

describe('parseKeyCombo', () => {
  it('parses modifiers and named keys', () => {
    expect(parseKeyCombo('escape')).toMatchObject({ key: 'Escape', ctrlKey: false, shiftKey: false })
    expect(parseKeyCombo('ctrl+shift+Z')).toMatchObject({ key: 'z', ctrlKey: true, shiftKey: true })
    expect(parseKeyCombo('alt+ArrowLeft')).toMatchObject({ key: 'ArrowLeft', altKey: true })
    expect(parseKeyCombo('space')).toMatchObject({ key: ' ', code: 'Space' })
  })

  it('maps "mod" to the platform command key (jsdom is non-Mac: Ctrl)', () => {
    expect(parseKeyCombo('mod+d')).toMatchObject({ key: 'd', ctrlKey: true, metaKey: false })
  })

  it('rejects an unknown modifier', () => {
    expect(() => parseKeyCombo('hyper+d')).toThrow(/Unknown modifier/)
  })
})

describe('Automation', () => {
  let editor
  let auto
  let events
  let abort

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"><div id="svgcanvas"></div></div><div id="dlg" dialog="open"></div>'
    const root = document.getElementById('root')
    root.getBoundingClientRect = () => ({ left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600 })
    const content = document.createElement('div')
    content.setAttribute('x', '200')
    content.setAttribute('y', '200')
    events = []
    const layerGroup = document.createElement('g')
    layerGroup.append(document.createElement('title'), document.createElement('rect'), document.createElement('rect'))
    editor = {
      $id: (id) => ({ svgroot: root, svgcontent: content, svgcanvas: document.getElementById('svgcanvas') })[id],
      $container: document.body,
      workarea: { scrollLeft: 0, scrollTop: 0, getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 800 }) },
      commands: { run: vi.fn() },
      svgCanvas: {
        getZoom: () => 2,
        getMode: () => 'select',
        getToolLocked: () => false,
        getResolution: () => ({ w: 640, h: 480 }),
        getSelectedElements: () => [Object.assign(document.createElement('rect'), { id: 'a' }), null],
        getStrokedBBoxDefaultVisible: () => ({ x: 1, y: 2, width: 3, height: 4 }),
        undoMgr: { getUndoStackSize: () => 3, getRedoStackSize: () => 1, getNextUndoCommandText: () => 'Draw' },
        getCurrentDrawing: () => ({
          getCurrentLayerName: () => 'L2',
          getNumLayers: () => 2,
          getLayerName: (i) => ['L1', 'L2'][i],
          getLayerByName: () => ({ getGroup: () => layerGroup }),
          getLayerVisibility: (n) => n === 'L1',
          getLayerLocked: (n) => n === 'L2'
        })
      }
    }
    auto = new Automation(editor)
    abort = new AbortController()
    for (const type of ['mousedown', 'mousemove', 'mouseup', 'click', 'dblclick']) {
      document.addEventListener(type, (e) => events.push({ type, x: e.clientX, y: e.clientY, buttons: e.buttons, shift: e.shiftKey }), { signal: abort.signal })
    }
    document.elementFromPoint = () => document.getElementById('svgcanvas')
  })

  afterEach(() => {
    abort.abort()
    document.body.textContent = ''
  })

  it('exposes the command registry', () => {
    expect(auto.commands).toBe(editor.commands)
  })

  it('inspect() reports mode, zoom, selection (doc units), layers, undo, canvas, dialog', () => {
    const s = auto.inspect()
    expect(s).toMatchObject({
      mode: 'select',
      zoom: 2,
      toolLocked: false,
      selection: [{ id: 'a', tag: 'rect', bbox: { x: 1, y: 2, width: 3, height: 4 } }],
      undo: { size: 3, redo: 1, next: 'Draw' },
      canvas: { width: 640, height: 480 },
      viewport: { scrollX: 0, scrollY: 0 },
      openDialog: 'div'
    })
    expect(s.layers).toEqual([
      { name: 'L1', visible: true, locked: false, current: false, childCount: 2 },
      { name: 'L2', visible: false, locked: true, current: true, childCount: 2 }
    ])
  })

  it('pointer() maps document points through the frame (zoom 2) and uses real button state', () => {
    auto.pointer([
      { kind: 'down', x: 10, y: 10 },
      { kind: 'move', x: 20, y: 10 },
      { kind: 'up', x: 20, y: 10 }
    ])
    // client = rootLeft 100 + content 200 + doc * 2
    expect(events.map((e) => [e.type, e.x, e.y, e.buttons])).toEqual([
      ['mousedown', 320, 270, 1],
      ['mousemove', 340, 270, 1],
      ['mouseup', 340, 270, 0]
    ])
  })

  it('pointer() in screen space uses the numbers as given', () => {
    auto.pointer([{ kind: 'click', x: 55, y: 66, space: 'screen' }])
    expect(events.map((e) => [e.type, e.x, e.y])).toEqual([['mousedown', 55, 66], ['mouseup', 55, 66], ['click', 55, 66]])
  })

  it('drag expands into down, N moves, up; modifiers are passed through', () => {
    auto.pointer([{ kind: 'drag', x: 0, y: 0, to: { x: 10, y: 0 }, steps: 5, mods: { shift: true } }])
    expect(events.map((e) => e.type)).toEqual(['mousedown', 'mousemove', 'mousemove', 'mousemove', 'mousemove', 'mousemove', 'mouseup'])
    expect(events.every((e) => e.shift)).toBe(true)
    expect(events.at(-1).x).toBe(300 + 10 * 2)
  })

  it('dblclick fires two clicks then a dblclick', () => {
    auto.pointer([{ kind: 'dblclick', x: 0, y: 0 }])
    expect(events.filter((e) => e.type === 'click')).toHaveLength(2)
    expect(events.at(-1).type).toBe('dblclick')
  })

  it('a drag without a target and an unknown kind are errors', () => {
    expect(() => auto.pointer([{ kind: 'drag', x: 0, y: 0 }])).toThrow(/"to"/)
    expect(() => auto.pointer([{ kind: 'wiggle', x: 0, y: 0 }])).toThrow(/Unknown pointer/)
  })

  it('scrolls the workarea so an off-screen document point becomes visible', () => {
    // doc (5000, 0) at zoom 2 -> client x 10300, far right of the 1000px workarea
    auto.pointer([{ kind: 'move', x: 5000, y: 0 }])
    expect(editor.workarea.scrollLeft).toBeGreaterThan(9000)
  })

  it('key() dispatches keydown+keyup on the body and reports whether it was consumed', () => {
    const seen = []
    document.addEventListener('keydown', (e) => { seen.push([e.key, e.ctrlKey]); if (e.key === 'd') e.preventDefault() }, { signal: abort.signal })
    expect(auto.key('mod+d')).toBe(true)
    expect(auto.key('x')).toBe(false)
    expect(seen).toEqual([['d', true], ['x', false]])
  })
})
