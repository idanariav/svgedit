import { describe, expect, it } from 'vitest'
import '../../packages/svgcanvas/core/path-seg-shim.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import { init as pathMethodInit } from '../../packages/svgcanvas/core/path-method.js'
import { init as pathInit } from '../../packages/svgcanvas/core/path.js'

const createSvgElement = (name) => document.createElementNS(NS.SVG, name)

const makeCanvas = () => {
  const byId = new Map()
  const svgCanvas = {
    getElement (id) { return byId.get(id) || null },
    getUIStrings () { return {} },
    getPathObj () { return null }
  }
  pathMethodInit(svgCanvas)

  const parentGroup = createSvgElement('g')
  parentGroup.id = 'selectorParentGroup'
  byId.set('selectorParentGroup', parentGroup)
  // getGripContainerMethod() creates and registers 'pathpointgrip_container'
  // lazily the first time it's asked for -- wire that up too so repeated
  // calls reuse the same node the way the real getElement() would.
  const originalGetElement = svgCanvas.getElement
  svgCanvas.getElement = (id) => {
    if (id === 'pathpointgrip_container' && !byId.has(id)) {
      // populated on first addPointGrip() call below via append
    }
    return originalGetElement(id)
  }

  return { svgCanvas, byId }
}

describe('path-method addPointGrip', () => {
  it('positions and displays a grip at a non-zero coordinate', () => {
    const { svgCanvas } = makeCanvas()
    const grip = svgCanvas.addPointGrip(0, 50, 60)

    expect(grip.getAttribute('display')).toBe('inline')
    expect(Number(grip.getAttribute('x'))).toBeCloseTo(50 - 9 / 2)
    expect(Number(grip.getAttribute('y'))).toBeCloseTo(60 - 9 / 2)
  })

  it('positions and displays a grip placed at exactly pixel 0 on either axis', () => {
    // Regression guard: `if (x && y)` treated 0 as "no coordinate given" and
    // silently skipped positioning/display -- a point landing exactly on the
    // canvas origin (e.g. via grid-snapping) got a grip that was created but
    // never shown, permanently invisible/unclickable.
    const { svgCanvas } = makeCanvas()

    const gripAtOriginX = svgCanvas.addPointGrip(1, 0, 40)
    expect(gripAtOriginX.getAttribute('display')).toBe('inline')
    expect(Number(gripAtOriginX.getAttribute('x'))).toBeCloseTo(0 - 9 / 2)

    const gripAtOriginY = svgCanvas.addPointGrip(2, 40, 0)
    expect(gripAtOriginY.getAttribute('display')).toBe('inline')
    expect(Number(gripAtOriginY.getAttribute('y'))).toBeCloseTo(0 - 9 / 2)

    const gripAtOrigin = svgCanvas.addPointGrip(3, 0, 0)
    expect(gripAtOrigin.getAttribute('display')).toBe('inline')
  })
})

describe('path-method Path#addPtsToSelection', () => {
  it('keeps selected_pts in numeric order past index 9', () => {
    // Regression guard: the default Array#sort comparator is lexicographic,
    // so selecting indexes [2, 10] on an 11+ node path used to yield
    // selected_pts === [10, 2] instead of [2, 10] -- every consumer that
    // reads selected_pts[0] as "the first selected node" (getNodePoint,
    // subpathIsClosed, moveNode, opencloseSubPath) then acted on the wrong
    // node.
    const svg = createSvgElement('svg')
    const selectorParentGroup = createSvgElement('g')
    selectorParentGroup.setAttribute('id', 'selectorParentGroup')
    svg.append(selectorParentGroup)

    const svgCanvas = {
      getSvgRoot () { return svg },
      getZoom () { return 1 },
      getElement (id) { return svg.querySelector(`#${id}`) },
      addPtsToSelection () {} // canvas-level UI hook, irrelevant to sort order
    }
    pathInit(svgCanvas)

    const pathEl = createSvgElement('path')
    // M + 11 line segments => segment indexes 0..11, so index 10 exists and
    // sorts before index 2 under a lexicographic (string) comparator.
    const coords = Array.from({ length: 11 }, (_, i) => `${i + 1},${i + 1}`)
    pathEl.setAttribute('d', `M0,0 L${coords.join(' L')}`)

    const path = new svgCanvas.PathClass(pathEl)
    path.addPtsToSelection([2, 10])

    expect(path.selected_pts).toEqual([2, 10])
  })
})

describe('path-method Path#smoothSelectedNodes', () => {
  const makePathSvgCanvas = () => {
    const svg = createSvgElement('svg')
    const selectorParentGroup = createSvgElement('g')
    selectorParentGroup.setAttribute('id', 'selectorParentGroup')
    svg.append(selectorParentGroup)

    const svgCanvas = {
      getSvgRoot () { return svg },
      getZoom () { return 1 },
      getElement (id) { return svg.querySelector(`#${id}`) },
      addPtsToSelection () {},
      endChanges () {}
    }
    pathInit(svgCanvas)
    return svgCanvas
  }

  it('recomputes both handles of a selected node so they are collinear through it, without moving the anchor or touching a non-selected neighbor', () => {
    const svgCanvas = makePathSvgCanvas()
    const pathEl = createSvgElement('path')
    // Nodes at (0,0) (20,0) (60,0) (90,0), all curve segments; node 2's
    // handles are deliberately mis-aimed so smoothing has visible work to do.
    pathEl.setAttribute('d', 'M0,0 C5,-5 10,-15 20,0 C30,20 40,-20 60,0 C70,10 80,15 90,0')

    const path = new svgCanvas.PathClass(pathEl)
    path.selected_pts = [2]
    path.smoothSelectedNodes()

    const node1 = path.segs[1].item // not selected -- must be untouched
    expect(node1.x1).toBeCloseTo(5)
    expect(node1.y1).toBeCloseTo(-5)

    const node2 = path.segs[2].item
    expect(node2.x).toBeCloseTo(60) // anchor unchanged
    expect(node2.y).toBeCloseTo(0)
    // Neighbor anchors (20,0) and (90,0) are collinear on y=0, so both
    // recomputed handles should land on that same line.
    expect(node2.x2).toBeCloseTo(60 - (40 / 3))
    expect(node2.y2).toBeCloseTo(0)

    const node3 = path.segs[3].item
    expect(node3.x1).toBeCloseTo(60 + (30 / 3))
    expect(node3.y1).toBeCloseTo(0)
  })

  it('leaves a side bordering a straight segment untouched and no-ops on a path endpoint', () => {
    const svgCanvas = makePathSvgCanvas()
    const pathEl = createSvgElement('path')
    // Node 2 sits between a straight-in segment and a curved-out one.
    pathEl.setAttribute('d', 'M0,0 C5,-5 10,-15 20,0 L50,0 C60,10 70,-15 90,0')

    const path = new svgCanvas.PathClass(pathEl)
    path.selected_pts = [0, 2] // 0 is the path start -- no `prev`, must no-op
    path.smoothSelectedNodes()

    expect(path.segs[0].item.x).toBeCloseTo(0)
    expect(path.segs[0].item.y).toBeCloseTo(0)

    expect(path.segs[2].type).toBe(4) // still a straight line, not converted
    expect(path.segs[2].item.x).toBeCloseTo(50)
    expect(path.segs[2].item.y).toBeCloseTo(0)

    const node3 = path.segs[3].item
    expect(node3.x1).toBeCloseTo(50 + (40 / 3))
    expect(node3.y1).toBeCloseTo(0)
  })

  it('does nothing when no node is selected', () => {
    const svgCanvas = makePathSvgCanvas()
    const pathEl = createSvgElement('path')
    const d = 'M0,0 C5,-5 10,-15 20,0 C30,20 40,-20 60,0'
    pathEl.setAttribute('d', d)

    const path = new svgCanvas.PathClass(pathEl)
    path.smoothSelectedNodes()

    expect(pathEl.getAttribute('d')).toBe(d)
  })
})
