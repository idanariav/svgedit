import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { headPlacement, trimSubpath, ARROW_ALIGN_ATTR, ARROW_PTS_ATTR, ARROW_D_ATTR, ARROW_TRIM_ATTR } from '../../packages/svgcanvas/core/arrow-align.js'
import { parseAnchors } from '../../packages/svgcanvas/core/anchor-path.js'
import { runGeometryRemaps } from '../../packages/svgcanvas/core/geometry-remap-registry.js'

describe('headPlacement', () => {
  it('puts the tip of an outward head on the end and says how far the stroke may run into it', () => {
    expect(headPlacement('rightarrow', 'end', 'tip')).toEqual({ refX: 100, inset: 50 })
    expect(headPlacement('leftarrow', 'start', 'tip')).toEqual({ refX: 0, inset: 50 })
    expect(headPlacement('triangle', 'end', 'tip')).toEqual({ refX: 100, inset: 50 })
    expect(headPlacement('openarrow', 'end', 'tip')).toEqual({ refX: 100, inset: 13.5 })
  })

  it('a head that is the same both ways points outward at either end', () => {
    expect(headPlacement('diamond', 'end', 'tip')).toEqual({ refX: 100, inset: 50 })
    expect(headPlacement('diamond', 'start', 'tip')).toEqual({ refX: 0, inset: 50 })
  })

  it('hollow heads take the stroke up to their back wall (or notch)', () => {
    expect(headPlacement('triangle_o', 'end', 'tip').inset).toBe(97.5)
    expect(headPlacement('diamond_o', 'end', 'tip').inset).toBe(97.5)
    expect(headPlacement('rightarrow_o', 'end', 'tip').inset).toBe(70)
    expect(headPlacement('leftarrow_o', 'start', 'tip').inset).toBe(70)
  })

  it('a head pointing into the line has its tip on the end and trims nothing', () => {
    expect(headPlacement('triangle', 'start', 'tip')).toEqual({ refX: 100, inset: 0 })
    expect(headPlacement('leftarrow', 'end', 'tip')).toEqual({ refX: 0, inset: 0 })
  })

  it('extend keeps the stroke and moves the tip one inset past the end', () => {
    expect(headPlacement('rightarrow', 'end', 'extend').refX).toBe(50)
    expect(headPlacement('openarrow', 'end', 'extend').refX).toBe(86.5)
    expect(headPlacement('leftarrow_o', 'start', 'extend').refX).toBe(70)
  })

  it('symmetric heads and unaligned elements stay centred', () => {
    for (const mode of ['tip', 'extend', null]) {
      for (const kind of ['box', 'mcircle', 'star', 'xmark', 'forwardslash', 'box_o']) {
        expect(headPlacement(kind, 'end', mode)).toEqual({ refX: 50, inset: 0 })
      }
    }
    expect(headPlacement('rightarrow', 'end', null)).toEqual({ refX: 50, inset: 0 })
  })
})

describe('trimSubpath', () => {
  const lineSp = (...xs) => parseAnchors(`M${xs.map((x) => `${x},0`).join(' L')}`)[0]

  it('shortens a straight run by the asked length at each end', () => {
    const sp = trimSubpath(lineSp(0, 100), 5, 10)
    expect(sp.anchors.map((a) => a.p.x)).toEqual([5, 90])
  })

  it('walks across segments and keeps the anchors between', () => {
    const sp = trimSubpath(lineSp(0, 10, 20, 100), 15, 0)
    expect(sp.anchors.map((a) => a.p.x)).toEqual([15, 20, 100])
  })

  it('trims a curve by arc length and keeps it on the curve', () => {
    const arc = parseAnchors('M0,0 C0,50 100,50 100,0')[0]
    const cut = trimSubpath(arc, 10, 10)
    const length = (sp) => {
      let len = 0
      for (let i = 1; i < 200; i++) {
        // sample through the cubic
        const t0 = (i - 1) / 199
        const t1 = i / 199
        const at = (t) => {
          const [a, b] = sp.anchors
          const u = 1 - t
          return {
            x: u * u * u * a.p.x + 3 * u * u * t * a.hOut.x + 3 * u * t * t * b.hIn.x + t * t * t * b.p.x,
            y: u * u * u * a.p.y + 3 * u * u * t * a.hOut.y + 3 * u * t * t * b.hIn.y + t * t * t * b.p.y
          }
        }
        len += Math.hypot(at(t1).x - at(t0).x, at(t1).y - at(t0).y)
      }
      return len
    }
    expect(cut.anchors).toHaveLength(2)
    expect(length(arc) - length(cut)).toBeCloseTo(20, 0)
    // The cut ends are on the original curve: the cubic is symmetric, so they mirror each other.
    expect(cut.anchors[0].p.x + cut.anchors[1].p.x).toBeCloseTo(100, 1)
    expect(Math.abs(cut.anchors[0].p.y - cut.anchors[1].p.y)).toBeLessThan(0.25)
  })

  it('never trims away the whole stroke', () => {
    const sp = trimSubpath(lineSp(0, 10), 20, 20)
    const [a, b] = sp.anchors.map((an) => an.p.x)
    expect(b - a).toBeGreaterThan(0)
    expect(b - a).toBeLessThan(10)
    expect(a).toBeCloseTo(10 - b, 6) // the two ends give way alike
  })
})

describe('on the canvas', () => {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
    const host = document.createElement('div')
    host.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(host)
    const toolsLeft = document.createElement('div')
    toolsLeft.id = 'tools_left'
    document.body.append(workarea, toolsLeft)
    svgCanvas = new SvgCanvas(host, {
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
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  const marker = (kind, id) => {
    const m = document.createElementNS('http://www.w3.org/2000/svg', 'marker')
    m.setAttribute('id', id)
    m.setAttribute('se_type', kind)
    m.setAttribute('markerWidth', 5)
    m.setAttribute('refX', 50)
    svgCanvas.findDefs().append(m)
    return m
  }
  /** A shape with a head of `kind` at `pos`, stroke width 2. */
  const headed = (tag, attr, kind = 'rightarrow', pos = 'end') => {
    const el = svgCanvas.addSVGElementsFromJson({
      element: tag, attr: { id: svgCanvas.getNextId(), stroke: '#000', 'stroke-width': 2, fill: 'none', ...attr }
    })
    const m = marker(kind, `mkr_${pos}_${el.id}`)
    el.setAttribute(`marker-${pos}`, `url(#${m.id})`)
    return { el, m }
  }
  const aLine = (extra) => headed('line', { x1: 0, y1: 0, x2: 100, y2: 0 }, ...(extra ?? []))

  it('Tip trims a line by the head inset (half a head: 2.5 stroke widths) and keeps the real ends', () => {
    const { el, m } = aLine()
    expect(svgCanvas.setArrowAlign(el, 'tip')).toBe(true)
    expect(el.getAttribute(ARROW_ALIGN_ATTR)).toBe('tip')
    expect(m.getAttribute('refX')).toBe('100')
    expect(Number(el.getAttribute('x2'))).toBeCloseTo(95, 4)
    expect(Number(el.getAttribute('x1'))).toBe(0)
    expect(el.getAttribute(ARROW_PTS_ATTR)).toBe('0,0 100,0')
    expect(el.getAttribute(ARROW_TRIM_ATTR)).toBe('0,5')
    expect(svgCanvas.getArrowSourcePoints(el)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }])
  })

  it('trims the start of a line for a head there, and both for two', () => {
    const { el } = headed('line', { x1: 0, y1: 0, x2: 100, y2: 0 }, 'leftarrow', 'start')
    const end = marker('rightarrow', `mkr_end_${el.id}`)
    el.setAttribute('marker-end', `url(#${end.id})`)
    svgCanvas.setArrowAlign(el, 'tip')
    expect(Number(el.getAttribute('x1'))).toBeCloseTo(5, 4)
    expect(Number(el.getAttribute('x2'))).toBeCloseTo(95, 4)
  })

  it('follows the stroke width', () => {
    const { el } = aLine()
    svgCanvas.setArrowAlign(el, 'tip')
    el.setAttribute('stroke-width', 4)
    expect(svgCanvas.syncArrowAlign(el)).toBe(true)
    expect(Number(el.getAttribute('x2'))).toBeCloseTo(90, 4)
    el.setAttribute('stroke-width', 1)
    svgCanvas.syncArrowAlign(el)
    expect(Number(el.getAttribute('x2'))).toBeCloseTo(97.5, 4)
    expect(svgCanvas.syncArrowAlign(el)).toBe(false) // idempotent
  })

  it('follows the markers: a head changed to one that points into the line trims nothing', () => {
    const { el, m } = aLine()
    svgCanvas.setArrowAlign(el, 'tip')
    m.setAttribute('se_type', 'leftarrow')
    svgCanvas.syncArrowAlign(el)
    expect(Number(el.getAttribute('x2'))).toBe(100)
    expect(el.hasAttribute(ARROW_PTS_ATTR)).toBe(false)
    expect(m.getAttribute('refX')).toBe('0')
  })

  it('removing the marker gives the stroke its full length back', () => {
    const { el } = aLine()
    svgCanvas.setArrowAlign(el, 'tip')
    el.removeAttribute('marker-end')
    svgCanvas.syncArrowAlign(el)
    expect(Number(el.getAttribute('x2'))).toBe(100)
    expect(el.hasAttribute(ARROW_PTS_ATTR)).toBe(false)
    expect(el.getAttribute(ARROW_ALIGN_ATTR)).toBe('tip')
  })

  it('Extend keeps the geometry and moves the head', () => {
    const { el, m } = aLine(['openarrow'])
    svgCanvas.setArrowAlign(el, 'tip')
    expect(Number(el.getAttribute('x2'))).toBeCloseTo(100 - 13.5 * 0.1, 4)
    svgCanvas.setArrowAlign(el, 'extend')
    expect(Number(el.getAttribute('x2'))).toBe(100)
    expect(el.hasAttribute(ARROW_PTS_ATTR)).toBe(false)
    expect(m.getAttribute('refX')).toBe('86.5')
  })

  it('clearing puts the legacy centred head and the full stroke back', () => {
    const { el, m } = aLine()
    svgCanvas.setArrowAlign(el, 'tip')
    expect(svgCanvas.setArrowAlign(el, null)).toBe(true)
    expect(el.hasAttribute(ARROW_ALIGN_ATTR)).toBe(false)
    expect(Number(el.getAttribute('x2'))).toBe(100)
    expect(m.getAttribute('refX')).toBe('50')
  })

  it('trims a path along its curve and restores it', () => {
    const { el } = headed('path', { d: 'M0,0 C0,50 100,50 100,0' })
    svgCanvas.setArrowAlign(el, 'tip')
    const src = el.getAttribute(ARROW_D_ATTR)
    expect(src).toBe('M0,0 C0,50 100,50 100,0')
    const [sp] = parseAnchors(el.getAttribute('d'))
    expect(sp.anchors[0].p).toEqual({ x: 0, y: 0 })
    expect(Math.hypot(sp.anchors[1].p.x - 100, sp.anchors[1].p.y)).toBeGreaterThan(4.5)
    svgCanvas.setArrowAlign(el, null)
    expect(el.getAttribute('d')).toBe(src)
    expect(el.hasAttribute(ARROW_D_ATTR)).toBe(false)
  })

  it('trims a polyline at its end and keeps the middle points', () => {
    const { el } = headed('polyline', { points: '0,0 50,0 100,0' })
    svgCanvas.setArrowAlign(el, 'tip')
    expect(el.getAttribute('points')).toBe('0,0 50,0 95,0')
  })

  it('a geometry edited from outside makes the element Extend on what it now has, drawing the same picture', () => {
    const { el, m } = aLine()
    svgCanvas.setArrowAlign(el, 'tip')
    el.setAttribute('x2', 60) // e.g. an undo that restored only the geometry
    svgCanvas.syncArrowAlign(el)
    expect(el.getAttribute(ARROW_ALIGN_ATTR)).toBe('extend')
    expect(el.hasAttribute(ARROW_PTS_ATTR)).toBe(false)
    expect(el.getAttribute('x2')).toBe('60')
    expect(m.getAttribute('refX')).toBe('50')
  })

  it('a sync that changes nothing writes nothing: a saved, rounded path stays as it was and stays Tip', () => {
    const { el } = headed('path', { d: 'M0,0 C0,50 100,50 100,0' })
    svgCanvas.setArrowAlign(el, 'tip')
    const rounded = el.getAttribute('d').replace(/-?\d+\.\d+/g, (n) => (Math.round(Number(n) * 100) / 100).toString())
    el.setAttribute('d', rounded)
    expect(svgCanvas.syncArrowAlign(el)).toBe(false)
    expect(el.getAttribute('d')).toBe(rounded)
    expect(el.getAttribute(ARROW_ALIGN_ATTR)).toBe('tip')
  })

  it('only a line, a polyline or one open path with its own geometry can be aligned', () => {
    expect(svgCanvas.canAlignArrows(aLine().el)).toBe(true)
    expect(svgCanvas.canAlignArrows(headed('path', { d: 'M0,0 L10,0 L10,10 Z' }).el)).toBe(false)
    expect(svgCanvas.canAlignArrows(headed('path', { d: 'M0,0 L10,0 M20,0 L30,0' }).el)).toBe(false)
    expect(svgCanvas.canAlignArrows(headed('path', { d: 'M0,0 L10,0', 'se:taper-d': 'M0,0 L10,0' }).el)).toBe(false)
    expect(svgCanvas.canAlignArrows(headed('polygon', { points: '0,0 10,0 10,10' }).el)).toBe(false)
    expect(svgCanvas.canAlignArrows(headed('rect', { x: 0, y: 0, width: 5, height: 5 }).el)).toBe(false)
    const { el } = headed('polygon', { points: '0,0 10,0 10,10' })
    expect(svgCanvas.setArrowAlign(el, 'tip')).toBe(false)
    expect(el.hasAttribute(ARROW_ALIGN_ATTR)).toBe(false)
  })

  it('an element that stops being alignable gets its geometry back', () => {
    const { el, m } = headed('path', { d: 'M0,0 L100,0' })
    svgCanvas.setArrowAlign(el, 'tip')
    el.setAttribute('d', `${el.getAttribute('d')} Z`) // closed: no ends any more
    svgCanvas.syncArrowAlign(el)
    expect(el.hasAttribute(ARROW_ALIGN_ATTR)).toBe(false)
    expect(el.hasAttribute(ARROW_D_ATTR)).toBe(false)
    expect(m.getAttribute('refX')).toBe('50')
  })

  it('when another feature takes the geometry over, the alignment goes and the geometry is left to it', () => {
    const { el } = headed('path', { d: 'M0,0 L100,0' })
    svgCanvas.setArrowAlign(el, 'tip')
    const trimmed = el.getAttribute('d')
    el.setAttribute('se:orig-d', trimmed) // e.g. corners were cut
    svgCanvas.syncArrowAlign(el)
    expect(el.hasAttribute(ARROW_ALIGN_ATTR)).toBe(false)
    expect(el.hasAttribute(ARROW_D_ATTR)).toBe(false)
    expect(el.getAttribute('d')).toBe(trimmed)
  })

  it('tells a connector how far to keep the stroke from the shape', () => {
    const { el } = aLine()
    expect(svgCanvas.getArrowOffset(el, 'end')).toBeNull()
    svgCanvas.setArrowAlign(el, 'tip')
    expect(svgCanvas.getArrowOffset(el, 'end')).toBe(0)
    expect(svgCanvas.getArrowOffset(el, 'start')).toBe(0)
    svgCanvas.setArrowAlign(el, 'extend')
    expect(svgCanvas.getArrowOffset(el, 'end')).toBeCloseTo(5, 6)
    expect(svgCanvas.getArrowOffset(el, 'start')).toBe(0)
  })

  it('a connector moving the ends re-trims from the real ends', () => {
    const { el } = aLine()
    svgCanvas.setArrowAlign(el, 'tip')
    expect(svgCanvas.setArrowSourcePoints(el, [{ x: 0, y: 0 }, { x: 0, y: 200 }])).toBe(true)
    expect(Number(el.getAttribute('y2'))).toBeCloseTo(195, 4)
    expect(Number(el.getAttribute('x2'))).toBeCloseTo(0, 6)
    expect(svgCanvas.setArrowSourcePoints(aLine().el, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false)
  })

  it('a baked transform moves the source and trims again', () => {
    const { el } = aLine()
    svgCanvas.setArrowAlign(el, 'tip')
    // What coords.js does: its own attributes move with the map, then the registered hooks run.
    const remap = (x, y) => ({ x: x + 10, y: y + 20 })
    el.setAttribute('x1', 10); el.setAttribute('y1', 20); el.setAttribute('x2', 105); el.setAttribute('y2', 20)
    runGeometryRemaps(el, remap, (v) => v, (v) => v, svgCanvas)
    expect(el.getAttribute(ARROW_PTS_ATTR)).toBe('10,20 110,20')
    expect(Number(el.getAttribute('x2'))).toBeCloseTo(105, 4)
    expect(el.getAttribute(ARROW_TRIM_ATTR)).toBe('0,5')
  })

  it('is one undo step inside a transaction, and the head position survives undo and redo', () => {
    const { el } = aLine()
    const before = svgCanvas.undoMgr.getUndoStackSize()
    svgCanvas.transact('Head position', () => svgCanvas.setArrowAlign(el, 'tip'))
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
    svgCanvas.undoMgr.undo()
    expect(el.hasAttribute(ARROW_ALIGN_ATTR)).toBe(false)
    expect(Number(el.getAttribute('x2'))).toBe(100)
    svgCanvas.undoMgr.redo()
    expect(el.getAttribute(ARROW_ALIGN_ATTR)).toBe('tip')
    expect(Number(el.getAttribute('x2'))).toBeCloseTo(95, 4)
  })

  it('moving the selection records the source, so undo gives back a consistent element', () => {
    const { el } = aLine()
    svgCanvas.setArrowAlign(el, 'tip')
    svgCanvas.selectOnly([el], true)
    svgCanvas.moveSelectedElements(10, 20, true)
    expect(el.getAttribute(ARROW_PTS_ATTR)).toBe('10,20 110,20')
    expect(Number(el.getAttribute('x2'))).toBeCloseTo(105, 4)
    svgCanvas.undoMgr.undo()
    expect(el.getAttribute(ARROW_PTS_ATTR)).toBe('0,0 100,0')
    expect(Number(el.getAttribute('x2'))).toBeCloseTo(95, 4)
    expect(el.getAttribute(ARROW_ALIGN_ATTR)).toBe('tip')
    svgCanvas.syncArrowAlign(el)
    expect(el.getAttribute(ARROW_ALIGN_ATTR)).toBe('tip') // not reconciled away
  })

  it('checkDrawing is clean for an aligned line and flags a broken source', () => {
    const { el } = aLine()
    svgCanvas.setArrowAlign(el, 'tip')
    expect(svgCanvas.checkDrawing().filter((f) => f.code === 'se-attr-parse')).toEqual([])
    el.setAttribute(ARROW_PTS_ATTR, 'nonsense')
    expect(svgCanvas.checkDrawing().some((f) => f.code === 'se-attr-parse')).toBe(true)
  })
})
