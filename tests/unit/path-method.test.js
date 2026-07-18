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
