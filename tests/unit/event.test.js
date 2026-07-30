import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import { init as initEvent } from '../../packages/svgcanvas/core/event.js'

const createSvgElement = (name) => {
  return document.createElementNS(NS.SVG, name)
}

describe('event', () => {
  /** @type {HTMLDivElement} */
  let root
  /** @type {any} */
  let canvas
  /** @type {HTMLDivElement} */
  let svgcanvas
  /** @type {SVGSVGElement} */
  let svgcontent
  /** @type {SVGGElement} */
  let contentGroup
  /** @type {SVGRectElement} */
  let rubberBox

  beforeEach(() => {
    root = document.createElement('div')
    root.id = 'root'
    document.body.append(root)

    svgcanvas = document.createElement('div')
    svgcanvas.id = 'svgcanvas'
    root.append(svgcanvas)

    svgcontent = /** @type {SVGSVGElement} */ (createSvgElement('svg'))
    svgcontent.id = 'svgcontent'
    root.append(svgcontent)

    contentGroup = /** @type {SVGGElement} */ (createSvgElement('g'))
    svgcontent.append(contentGroup)

    contentGroup.getScreenCTM = () => ({
      inverse: () => ({
        a: 1,
        b: 0,
        c: 0,
        d: 1,
        e: 0,
        f: 0
      })
    })

    Object.defineProperty(contentGroup, 'transform', {
      value: { baseVal: { numberOfItems: 0 } },
      configurable: true
    })

    rubberBox = /** @type {SVGRectElement} */ (createSvgElement('rect'))

    canvas = {
      spaceKey: false,
      started: false,
      rootSctm: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      rubberBox: null,
      selectorManager: {
        selectorParentGroup: createSvgElement('g'),
        getRubberBandBox () {
          return rubberBox
        }
      },
      $id (id) {
        return document.getElementById(id)
      },
      getDataStorage () {
        return { get () {} }
      },
      getSelectedElements () {
        return []
      },
      getZoom () {
        return 1
      },
      getStyle () {
        return { opacity: 1 }
      },
      getSvgRoot () {
        return svgcontent
      },
      getCurConfig () {
        return { gridSnapping: false, showRulers: false }
      },
      setRootSctm (m) {
        this.rootSctm = m
      },
      getrootSctm () {
        return this.rootSctm
      },
      getStarted () {
        return this.started
      },
      setStarted (started) {
        this.started = started
      },
      setStartX (x) {
        this.startX = x
      },
      setStartY (y) {
        this.startY = y
      },
      getStartX () {
        return this.startX
      },
      getStartY () {
        return this.startY
      },
      setRStartX (x) {
        this.rStartX = x
      },
      setRStartY (y) {
        this.rStartY = y
      },
      getMouseTarget () {
        return contentGroup
      },
      getCurrentMode () {
        return this.currentMode || 'zoom'
      },
      getCurrentGroup () {
        return null
      },
      setCurrentMode (mode) {
        this.currentMode = mode
      },
      setMode () {},
      setLastClickPoint () {},
      setStartTransform () {},
      clearSelection () {},
      setCurrentResizeMode () {},
      setJustSelected () {},
      pathActions: {
        clear () {}
      },
      setRubberBox (box) {
        this.rubberBox = box
      },
      getRubberBox () {
        return this.rubberBox
      },
      runExtensions () {
        return []
      }
    }

    initEvent(canvas)
  })

  afterEach(() => {
    root.remove()
  })

  it('mouseDownEvent() zoom mode uses clientY for rubberbox y', () => {
    canvas.setCurrentMode('zoom')
    canvas.mouseDownEvent({
      clientX: 10,
      clientY: 20,
      button: 0,
      altKey: false,
      shiftKey: false,
      preventDefault () {},
      target: contentGroup
    })

    expect(rubberBox.getAttribute('x')).toBe('10')
    expect(rubberBox.getAttribute('y')).toBe('20')
  })

  it('mouseDownEvent() ignores stale selection grips outside select mode', () => {
    // Regression guard: switching to a creation tool (e.g. the pen tool) never
    // clears the previous selection, so a previously-selected element's
    // resize/rotate grips can still be sitting in selectorParentGroup while a
    // brand-new shape is being drawn elsewhere on the canvas. Without gating
    // this on select mode (matching the sibling checks earlier in the same
    // function), a click that happens to land on one of those stale grips
    // silently flips currentMode to 'resize'/'rotate' mid-draw; the following
    // mouseup then routes through the select-mode epilogue against the
    // *stale* selectedElements[0] instead of the shape actually being drawn
    // — e.g. finishing a new path ends up node-editing an unrelated path left
    // selected on a previous layer.
    const staleElement = createSvgElement('path')
    contentGroup.append(staleElement)

    Object.defineProperty(canvas.selectorManager.selectorParentGroup, 'transform', {
      value: { baseVal: { numberOfItems: 0 } },
      configurable: true
    })
    const gripEl = createSvgElement('circle')
    canvas.selectorManager.selectorParentGroup.append(gripEl)

    canvas.getMouseTarget = () => canvas.selectorManager.selectorParentGroup
    canvas.getSelectedElements = () => [staleElement]
    canvas.getDataStorage = () => ({ get: () => 'resize' })
    canvas.pathActions.mouseDown = () => {}

    canvas.setCurrentMode('path')

    canvas.mouseDownEvent({
      clientX: 10,
      clientY: 10,
      button: 0,
      altKey: false,
      shiftKey: false,
      preventDefault () {},
      target: gripEl
    })

    expect(canvas.getCurrentMode()).toBe('path')
  })

  it('mouseDownEvent() resets drag state instead of leaving it stuck when the mode dispatch throws', () => {
    // event-zoom.js's down() calls svgCanvas.setStarted(true) *before*
    // reaching getRubberBandBox() — if that throws, `started` would be left
    // stuck at true (and hasDragStartTransform/dragStartTransforms at
    // whatever stale value a previous gesture left) with no cleanup ever
    // running, since mouseDownEvent's steps are one data-flow pipeline, not
    // independently-continuable steps.
    canvas.setCurrentMode('zoom')
    canvas.selectorManager.getRubberBandBox = () => { throw new Error('boom') }
    canvas.hasDragStartTransform = true
    canvas.dragStartTransforms = { stale: true }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      canvas.mouseDownEvent({
        clientX: 10,
        clientY: 20,
        button: 0,
        altKey: false,
        shiftKey: false,
        preventDefault () {},
        target: contentGroup
      })
    }).not.toThrow()

    expect(canvas.getStarted()).toBe(false)
    expect(canvas.hasDragStartTransform).toBe(false)
    expect(canvas.dragStartTransforms).toBe(null)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('mouseUpEvent() resets drag state instead of leaving it stuck when the mode dispatch throws', () => {
    // event-rotate.js's up() reaches svgCanvas.undoMgr.finishUndoableChange(),
    // which this mock canvas doesn't provide, so it throws mid-dispatch —
    // before the group-rotate/-resize state below would normally be cleared.
    canvas.setCurrentMode('rotate')
    canvas.setStarted(true)
    canvas.groupResizeStart = { stale: true }
    canvas.groupRotateStart = { stale: true }
    canvas.groupRotateCenter = { stale: true }
    canvas.groupRotateBBox = { stale: true }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      canvas.mouseUpEvent({
        clientX: 10,
        clientY: 20,
        button: 0,
        shiftKey: false,
        preventDefault () {},
        target: contentGroup
      })
    }).not.toThrow()

    expect(canvas.getStarted()).toBe(false)
    expect(canvas.groupResizeStart).toBe(null)
    expect(canvas.groupRotateStart).toBe(null)
    expect(canvas.groupRotateCenter).toBe(null)
    expect(canvas.groupRotateBBox).toBe(null)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('mouseOutEvent() dispatches mouseup with coordinates', () => {
    canvas.setCurrentMode('rect')
    canvas.setStarted(true)

    /** @type {{ x: number, y: number }|null} */
    let received = null
    svgcanvas.addEventListener('mouseup', (evt) => {
      received = { x: evt.clientX, y: evt.clientY }
    })

    canvas.mouseOutEvent(new MouseEvent('mouseleave', { clientX: 15, clientY: 25 }))

    expect(received).toEqual({ x: 15, y: 25 })
  })

  it('mouseDownEvent() returns early if root group is missing', () => {
    while (svgcontent.firstChild) {
      svgcontent.firstChild.remove()
    }
    expect(() => {
      canvas.mouseDownEvent({ button: 0 })
    }).not.toThrow()
  })

  it('mouseUpEvent() switches to select mode (not pathedit) after finishing a path', async () => {
    const pathElement = /** @type {SVGPathElement} */ (createSvgElement('path'))
    pathElement.setAttribute('d', 'M0,0 L10,10')
    contentGroup.append(pathElement)

    canvas.textActions = { init () {}, mouseUp () {} }
    canvas.getJustSelected = () => null
    canvas.getOpacAni = () => ({})
    canvas.getToolLocked = () => false
    canvas.getElement = () => null
    canvas.getId = () => 'test-path'
    canvas.getCurrentDrawing = () => ({ releaseId () {} })
    canvas.addCommandToHistory = () => {}
    canvas.call = () => {}
    canvas.pathActions.mouseUp = () => ({ element: pathElement, keep: true })

    let gripsHidden = false
    canvas.getPath_ = () => ({ show: (y) => { gripsHidden = (y === false) } })

    const modes = []
    canvas.setMode = (mode) => { modes.push(mode) }
    let selectedWith = null
    canvas.selectOnly = (elems, showGrips) => { selectedWith = { elems, showGrips } }

    canvas.setCurrentMode('path')
    canvas.setStarted(true)

    canvas.mouseUpEvent({
      button: 0,
      clientX: 10,
      clientY: 10,
      preventDefault () {}
    })

    // The opacity-animation branch defers the mode switch by 0ms via setTimeout.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(modes).toContain('select')
    expect(modes).not.toContain('pathedit')
    expect(selectedWith.elems).toEqual([pathElement])
    // Regression guard: the in-progress drawing's point/control grips must be
    // hidden, otherwise they linger in the shared pathpointgrip_container even
    // after the path is moved or deleted.
    expect(gripsHidden).toBe(true)
  })

  it('mouseUpEvent() switches out of path mode synchronously, before the opacity-fade timer fires', () => {
    // Regression guard: the mode transition used to be deferred inside the
    // opacity-fade setTimeout, leaving currentMode === 'path' (with drawnPath
    // already null) for that whole window. Any click landing there — e.g. the
    // second click of the double-click that just closed this path — was read
    // as starting a brand-new path, silently absorbing further clicks until
    // the deferred setMode('select') finally fired and discarded them. The
    // switch must happen in the same tick as mouseUpEvent, not after a delay.
    const pathElement = /** @type {SVGPathElement} */ (createSvgElement('path'))
    pathElement.setAttribute('d', 'M0,0 L10,10')
    contentGroup.append(pathElement)

    canvas.textActions = { init () {}, mouseUp () {} }
    canvas.getJustSelected = () => null
    canvas.getOpacAni = () => ({})
    canvas.getToolLocked = () => false
    canvas.getElement = () => null
    canvas.getId = () => 'test-path'
    canvas.getCurrentDrawing = () => ({ releaseId () {} })
    canvas.addCommandToHistory = () => {}
    canvas.call = () => {}
    canvas.pathActions.mouseUp = () => ({ element: pathElement, keep: true })
    canvas.getPath_ = () => ({ show () {} })

    const modes = []
    canvas.setMode = (mode) => { modes.push(mode) }
    canvas.selectOnly = () => {}

    canvas.setCurrentMode('path')
    canvas.setStarted(true)

    canvas.mouseUpEvent({
      button: 0,
      clientX: 10,
      clientY: 10,
      preventDefault () {}
    })

    // No await here: check state in the same synchronous tick as mouseUpEvent.
    expect(modes).toContain('select')
  })

  it('mouseUpEvent() does not select a newly drawn shape when tool-locked', async () => {
    const rectElement = /** @type {SVGRectElement} */ (createSvgElement('rect'))
    contentGroup.append(rectElement)

    canvas.textActions = { init () {}, mouseUp () {} }
    canvas.getJustSelected = () => null
    canvas.getOpacAni = () => ({})
    canvas.getToolLocked = () => true
    canvas.getElement = () => rectElement
    canvas.getId = () => 'test-rect'
    canvas.getCurConfig = () => ({ gridSnapping: false, showRulers: false, selectNew: true })
    canvas.getCurrentDrawing = () => ({ releaseId () {} })
    canvas.addCommandToHistory = () => {}
    canvas.call = () => {}

    const modes = []
    canvas.setMode = (mode) => { modes.push(mode) }
    let selectOnlyCalled = false
    canvas.selectOnly = () => { selectOnlyCalled = true }

    canvas.setCurrentMode('rect')
    canvas.setStarted(true)

    canvas.mouseUpEvent({
      button: 0,
      clientX: 10,
      clientY: 10,
      preventDefault () {}
    })

    // The opacity-animation branch defers this by 0ms via setTimeout.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(modes).not.toContain('select')
    expect(selectOnlyCalled).toBe(false)
  })

  it('mouseUpEvent() defaults curProperties.stroke_width to 1 for a selected element with no stroke-width attribute', () => {
    // cleanupElement strips stroke-width="1" (the SVG initial value), leaving
    // a real, visible 1px stroke with no stroke-width attribute at all.
    // getStrokeWidth() (used to seed the width for the next-drawn shape, e.g.
    // TabletShell's width slider) reads curProperties.stroke_width directly,
    // so a null here would previously surface as 0.
    const rectElement = /** @type {SVGRectElement} */ (createSvgElement('rect'))
    rectElement.setAttribute('stroke', 'black')
    contentGroup.append(rectElement)

    canvas.textActions = { init () {}, mouseUp () {} }
    canvas.getJustSelected = () => null
    canvas.getOpacAni = () => ({})
    canvas.getElement = () => null
    canvas.getId = () => ''
    canvas.getSelectedElements = () => [rectElement]
    canvas.getRStartX = () => 10
    canvas.getRStartY = () => 10
    canvas.curProperties = {}
    canvas.setCurProperties = (key, value) => { canvas.curProperties[key] = value }
    canvas.selectorManager.requestSelector = () => ({ showGrips () {} })

    canvas.setCurrentMode('select')
    canvas.setStarted(true)

    canvas.mouseUpEvent({
      button: 0,
      clientX: 10,
      clientY: 10,
      target: rectElement,
      preventDefault () {}
    })

    expect(canvas.curProperties.stroke_width).toBe(1)
  })

  it('mouseUpEvent() does not let a stale opacity-fade callback re-select an earlier path once a newer one has been drawn', async () => {
    // Regression guard: the deferred (setTimeout) half of the shape-creation
    // epilogue unconditionally re-ran selectOnly(element) via closure once
    // getCurConfig().selectNew is true. A fast double-click-to-finish workflow
    // routinely starts and finishes the NEXT path before that earlier timer
    // fires, so the stale callback silently swapped the selection back to the
    // path drawn before it -- symptom: finishing a path selects/edits an
    // unrelated earlier one.
    const pathA = /** @type {SVGPathElement} */ (createSvgElement('path'))
    pathA.setAttribute('d', 'M0,0 L10,10')
    contentGroup.append(pathA)
    const pathB = /** @type {SVGPathElement} */ (createSvgElement('path'))
    pathB.setAttribute('d', 'M20,20 L30,30')
    contentGroup.append(pathB)

    canvas.textActions = { init () {}, mouseUp () {} }
    canvas.getJustSelected = () => null
    canvas.getOpacAni = () => ({})
    canvas.getToolLocked = () => false
    canvas.getElement = () => null
    canvas.getCurrentDrawing = () => ({ releaseId () {} })
    canvas.addCommandToHistory = () => {}
    canvas.call = () => {}
    canvas.getCurConfig = () => ({ gridSnapping: false, showRulers: false, selectNew: true })
    canvas.getPath_ = () => ({ show () {} })
    canvas.setMode = () => {}

    const selections = []
    canvas.selectOnly = (elems) => { selections.push(elems[0]) }

    // Finish path A.
    canvas.getId = () => 'path-a'
    canvas.pathActions.mouseUp = () => ({ element: pathA, keep: true })
    canvas.setCurrentMode('path')
    canvas.setStarted(true)
    canvas.mouseUpEvent({ button: 0, clientX: 10, clientY: 10, preventDefault () {} })

    // Before path A's deferred setTimeout(0) reselect fires, path B is drawn
    // and finished too -- the realistic timing for a quick double-click to
    // finish one path immediately followed by drawing the next.
    canvas.getId = () => 'path-b'
    canvas.pathActions.mouseUp = () => ({ element: pathB, keep: true })
    canvas.setCurrentMode('path')
    canvas.setStarted(true)
    canvas.mouseUpEvent({ button: 0, clientX: 20, clientY: 20, preventDefault () {} })

    // Let both deferred setTimeout(0) callbacks run.
    await new Promise((resolve) => setTimeout(resolve, 0))

    const pathASelectCount = selections.filter((e) => e === pathA).length
    expect(pathASelectCount).toBe(1) // only the synchronous path-mode selection, no stray re-select
    expect(selections.at(-1)).toBe(pathB)
  })

  it('dblClickEvent() enters a group without baking its transform into children', () => {
    // Regression guard: entering a group (even a rotated one) must use
    // setContext and must NOT call pushGroupProperties, which previously baked
    // the group's transform into its children and dissolved the group on undo.
    const group = /** @type {SVGGElement} */ (createSvgElement('g'))
    group.setAttribute('transform', 'rotate(30 100 100)')
    const child = /** @type {SVGRectElement} */ (createSvgElement('rect'))
    group.append(child)
    contentGroup.append(group)

    let pushed = false
    let contextEntered = null
    canvas.getMouseTarget = () => group
    canvas.getCurrentDrawing = () => ({ getCurrentLayer: () => contentGroup })
    canvas.setContext = (el) => { contextEntered = el; canvas._cg = el }
    canvas.leaveContext = () => { canvas._cg = null }
    canvas.getCurrentGroup = () => canvas._cg || null
    canvas.selectOnly = () => {}
    canvas.pushGroupProperties = () => { pushed = true }
    canvas.addCommandToHistory = () => {}

    canvas.dblClickEvent({
      clientX: 50,
      clientY: 50,
      target: child,
      preventDefault () {}
    })

    expect(pushed).toBe(false)
    expect(contextEntered).toBe(group)
  })
})
