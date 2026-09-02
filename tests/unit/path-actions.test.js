import '../../packages/svgcanvas/core/path-seg-shim.js'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { init as pathActionsInit } from '../../packages/svgcanvas/core/path-actions.js'
import { init as domUtilsInit } from '../../packages/svgcanvas/core/dom-utils.js'
import { init as bboxUtilsInit } from '../../packages/svgcanvas/core/bbox-utils.js'
import { init as unitsInit } from '../../packages/svgcanvas/core/units.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'

describe('PathActions', () => {
  let svgRoot
  let pathElement
  let svgCanvas
  let mockPath
  // path-actions.js's init attaches a per-instance PathActions onto the
  // canvas (svgCanvas.pathActions = new PathActions()) rather than exporting
  // a module-level singleton.
  let pathActionsMethod

  beforeEach(() => {
    // Create mock SVG elements
    svgRoot = document.createElementNS(NS.SVG, 'svg')
    svgRoot.setAttribute('width', '640')
    svgRoot.setAttribute('height', '480')
    document.body.append(svgRoot)

    pathElement = document.createElementNS(NS.SVG, 'path')
    pathElement.setAttribute('id', 'path1')
    pathElement.setAttribute('d', 'M10,10 L50,50 L90,10 z')
    svgRoot.append(pathElement)

    // Create mock path object (simulating the path module's internal Path class)
    mockPath = {
      elem: pathElement,
      segs: [
        { index: 0, item: { x: 10, y: 10 }, type: 2, selected: false, move: vi.fn() },
        { index: 1, item: { x: 50, y: 50 }, type: 4, selected: false, move: vi.fn() },
        { index: 2, item: { x: 90, y: 10 }, type: 4, selected: false, move: vi.fn() }
      ],
      selected_pts: [],
      matrix: null,
      show: vi.fn(() => mockPath),
      update: vi.fn(() => mockPath),
      init: vi.fn(() => mockPath),
      setPathContext: vi.fn(),
      storeD: vi.fn(),
      selectPt: vi.fn(),
      addPtsToSelection: vi.fn(),
      removePtFromSelection: vi.fn(),
      clearSelection: vi.fn(),
      setSegType: vi.fn(),
      movePts: vi.fn(),
      moveCtrl: vi.fn(),
      addSeg: vi.fn(),
      deleteSeg: vi.fn(),
      endChanges: vi.fn(),
      dragctrl: false,
      dragging: null,
      cur_pt: null,
      oldbbox: { x: 0, y: 0, width: 100, height: 100 }
    }

    // Mock svgCanvas
    svgCanvas = {
      getSvgRoot: () => svgRoot,
      getZoom: () => 1,
      setCurrentMode: vi.fn(),
      getCurrentMode: vi.fn(() => 'select'),
      clearSelection: vi.fn(),
      addToSelection: vi.fn(),
      deleteSelectedElements: vi.fn(),
      call: vi.fn(),
      getSelectedElements: vi.fn(() => [pathElement]),
      getDrawnPath: vi.fn(() => null),
      setDrawnPath: vi.fn(),
      getCurrentGroup: vi.fn(() => null),
      leaveContext: vi.fn(),
      getPath_: vi.fn(() => mockPath),
      getId: vi.fn(() => 'svg_1'),
      getNextId: vi.fn(() => 'svg_2'),
      setStarted: vi.fn(),
      addPointGrip: vi.fn(),
      addCtrlGrip: vi.fn(() => {
        const grip = document.createElementNS(NS.SVG, 'circle')
        grip.setAttribute('cx', '0')
        grip.setAttribute('cy', '0')
        grip.setAttribute('r', '4')
        return grip
      }),
      getCtrlLine: vi.fn(() => {
        const line = document.createElementNS(NS.SVG, 'line')
        return line
      }),
      replacePathSeg: vi.fn(),
      getGridSnapping: vi.fn(() => false),
      getOpacity: vi.fn(() => 1),
      round: (val) => Math.round(val),
      getRoundDigits: vi.fn(() => 2),
      addSVGElementsFromJson: vi.fn((json) => {
        const elem = document.createElementNS(NS.SVG, json.element)
        if (json.attr) {
          Object.entries(json.attr).forEach(([key, value]) => {
            elem.setAttribute(key, value)
          })
        }
        return elem
      }),
      createSVGElement: vi.fn((config) => {
        const elem = document.createElementNS(NS.SVG, config.element)
        if (config.attr) {
          Object.entries(config.attr).forEach(([key, value]) => {
            elem.setAttribute(key, value)
          })
        }
        return elem
      }),
      selectorManager: {
        getRubberBandBox: vi.fn(() => {
          const rect = document.createElementNS(NS.SVG, 'rect')
          rect.setAttribute('id', 'selectorRubberBand')
          return rect
        }),
        requestSelector: vi.fn(() => ({
          showGrips: vi.fn()
        }))
      },
      getRubberBox: vi.fn(() => null),
      setRubberBox: vi.fn((box) => box),
      getPointFromGrip: vi.fn((point) => point),
      getGripPt: vi.fn((seg) => ({ x: seg.item.x, y: seg.item.y })),
      getContainer: vi.fn(() => svgRoot),
      getMouseTarget: vi.fn(() => pathElement),
      getMouseTargetFromNode: vi.fn((node) => node),
      getElement: vi.fn((id) => svgRoot.querySelector(`#${id}`)),
      smoothControlPoints: vi.fn(),
      removePath_: vi.fn(),
      recalcRotatedPath: vi.fn(),
      remapElement: vi.fn(),
      addCommandToHistory: vi.fn(),
      reorientGrads: vi.fn(),
      setLinkControlPoints: vi.fn(),
      contentW: 640,
      undoMgr: {
        beginUndoableChange: vi.fn(),
        finishUndoableChange: vi.fn(() => ({ isEmpty: () => false }))
      }
    }

    // Create selector parent group
    const selectorParentGroup = document.createElementNS(NS.SVG, 'g')
    selectorParentGroup.id = 'selectorParentGroup'
    svgRoot.append(selectorParentGroup)

    // Create pathpointgrip container
    const pathpointgripContainer = document.createElementNS(NS.SVG, 'g')
    pathpointgripContainer.id = 'pathpointgrip_container'
    svgRoot.append(pathpointgripContainer)

    // Initialize modules
    domUtilsInit(svgCanvas)
    bboxUtilsInit(svgCanvas)
    unitsInit(svgCanvas)
    pathActionsInit(svgCanvas)
    pathActionsMethod = svgCanvas.pathActions
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  describe('Class instantiation', () => {
    it('should export pathActionsMethod as singleton instance', () => {
      expect(pathActionsMethod).toBeDefined()
      expect(typeof pathActionsMethod.mouseDown).toBe('function')
      expect(typeof pathActionsMethod.mouseMove).toBe('function')
      expect(typeof pathActionsMethod.mouseUp).toBe('function')
    })

    it('should have all public methods', () => {
      const publicMethods = [
        'mouseDown',
        'mouseMove',
        'mouseUp',
        'toEditMode',
        'toSelectMode',
        'addSubPath',
        'select',
        'clear',
        'resetOrientation',
        'zoomChange',
        'getNodePoint',
        'linkControlPoints',
        'clonePathNode',
        'opencloseSubPath',
        'deletePathNode',
        'smoothPolylineIntoPath',
        'setSegType',
        'moveNode',
        'fixEnd',
        'convertPath'
      ]

      publicMethods.forEach(method => {
        expect(typeof pathActionsMethod[method]).toBe('function')
      })
    })
  })

  describe('mouseDown', () => {
    it('should handle mouse down in path mode', () => {
      svgCanvas.getCurrentMode.mockReturnValue('path')
      svgCanvas.getDrawnPath.mockReturnValue(null)

      const mockEvent = { target: pathElement, shiftKey: false }
      const result = pathActionsMethod.mouseDown(mockEvent, pathElement, 100, 100)

      expect(svgCanvas.addPointGrip).toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('should handle mouse down on existing path point', () => {
      // First enter edit mode to initialize path
      pathActionsMethod.toEditMode(pathElement)
      svgCanvas.getCurrentMode.mockReturnValue('pathedit')

      const grip = document.createElementNS(NS.SVG, 'circle')
      grip.id = 'pathpointgrip_0'
      const mockEvent = { target: grip, shiftKey: false }

      pathActionsMethod.mouseDown(mockEvent, grip, 100, 100)

      expect(mockPath.clearSelection).toHaveBeenCalled()
      expect(mockPath.addPtsToSelection).toHaveBeenCalled()
    })
  })

  describe('mouseMove', () => {
    it('should handle mouse move in path mode', () => {
      svgCanvas.getCurrentMode.mockReturnValue('path')
      const drawnPath = document.createElementNS(NS.SVG, 'path')
      drawnPath.setAttribute('d', 'M10,10 L50,50')
      svgCanvas.getDrawnPath.mockReturnValue(drawnPath)

      // mouseMove only updates the stretchy line if mouseDown already
      // created it (svgCanvas.getElement('path_stretch_line')).
      const stretchy = document.createElementNS(NS.SVG, 'path')
      stretchy.id = 'path_stretch_line'
      svgRoot.append(stretchy)

      pathActionsMethod.mouseMove(120, 120)

      // Should update path stretchy line
      expect(svgCanvas.replacePathSeg).toHaveBeenCalled()
    })

    it('should handle dragging path points', () => {
      pathActionsMethod.toEditMode(pathElement)
      svgCanvas.getCurrentMode.mockReturnValue('pathedit')
      mockPath.dragging = [100, 100]

      pathActionsMethod.mouseMove(110, 110)

      expect(mockPath.movePts).toHaveBeenCalled()
    })
  })

  describe('mouseUp', () => {
    it('should handle mouse up in path mode', () => {
      svgCanvas.getCurrentMode.mockReturnValue('path')
      const drawnPath = document.createElementNS(NS.SVG, 'path')
      svgCanvas.getDrawnPath.mockReturnValue(drawnPath)

      const mockEvent = { target: pathElement }
      const result = pathActionsMethod.mouseUp(mockEvent, drawnPath, 100, 100)

      expect(result).toEqual({ keep: true, element: drawnPath })
    })

    it('should finalize path point dragging', () => {
      pathActionsMethod.toEditMode(pathElement)
      svgCanvas.getCurrentMode.mockReturnValue('pathedit')
      mockPath.dragging = [100, 100]
      mockPath.cur_pt = 1

      pathActionsMethod.mouseMove(105, 105)
      const mockEvent = { target: pathElement, shiftKey: false }
      pathActionsMethod.mouseUp(mockEvent, pathElement, 105, 105)

      expect(mockPath.update).toHaveBeenCalled()
      expect(mockPath.endChanges).toHaveBeenCalledWith('Move path point(s)')
    })

    it('should discard a curve baked in by mid-click jitter when the pointer settles back near the clicked point', () => {
      // Regression test: a plain click to place a path point can dispatch a
      // mousemove mid-gesture (trackpad/mouse jitter, or a bigger flick that
      // drifts back) that bends the segment into a curve with a spurious
      // tangent. If the pointer is back near the clicked point by the time
      // the button is released, that curve must be discarded — otherwise it
      // stays baked in and renders as a self-intersecting notch at the tip.
      svgCanvas.getCurrentMode.mockReturnValue('path')
      svgCanvas.getDrawnPath.mockReturnValue(null)

      // Place the first point at (10,10) — arms `#newPoint` and creates drawnPath.
      pathActionsMethod.mouseDown({ target: svgRoot }, svgRoot, 10, 10)
      const drawnPath = svgCanvas.setDrawnPath.mock.calls[0][0]
      svgCanvas.getDrawnPath.mockReturnValue(drawnPath)

      // Simulate a flick mid-click that bent the segment into a curve whose
      // endpoint is still the clicked point (10,10) — matches what mouseMove
      // would have produced before the pointer drifted back.
      drawnPath.pathSegList.appendItem(drawnPath.createSVGPathSegCurvetoCubicAbs(10, 10, 20, 4, 4, 20))

      // Pointer is back within 1px of the clicked point at release.
      pathActionsMethod.mouseUp({ target: pathElement }, drawnPath, 11, 11)

      expect(svgCanvas.replacePathSeg).toHaveBeenCalledWith(4, 1, [10, 10], drawnPath)
    })

    it('should leave a deliberately dragged curve handle intact on release far from the anchor', () => {
      svgCanvas.getCurrentMode.mockReturnValue('path')
      svgCanvas.getDrawnPath.mockReturnValue(null)

      pathActionsMethod.mouseDown({ target: svgRoot }, svgRoot, 10, 10)
      const drawnPath = svgCanvas.setDrawnPath.mock.calls[0][0]
      svgCanvas.getDrawnPath.mockReturnValue(drawnPath)

      drawnPath.pathSegList.appendItem(drawnPath.createSVGPathSegCurvetoCubicAbs(10, 10, 20, 4, 4, 20))

      // Release well away from the anchor — a genuine curve-handle drag.
      pathActionsMethod.mouseUp({ target: pathElement }, drawnPath, 60, 60)

      expect(svgCanvas.replacePathSeg).not.toHaveBeenCalled()
    })
  })

  describe('toEditMode', () => {
    it('should switch to path edit mode', () => {
      pathActionsMethod.toEditMode(pathElement)

      expect(svgCanvas.setCurrentMode).toHaveBeenCalledWith('pathedit')
      expect(svgCanvas.clearSelection).toHaveBeenCalled()
      expect(mockPath.show).toHaveBeenCalledWith(true)
      expect(mockPath.update).toHaveBeenCalled()
    })

    it('rebuilds segs from the live pathSegList on every entry, not just on cache miss', () => {
      // Regression guard: getPath_() caches its Path wrapper by element id for
      // the whole session. If this element's `d` changed while some other
      // path was being tracked (e.g. edited, then reverted via undo/redo
      // while a different path was active), the cached segs/grips never got
      // refreshed and could silently disagree with the live pathSegList.
      // toEditMode() must rebuild via init() on every (re-)entry.
      pathActionsMethod.toEditMode(pathElement)
      expect(mockPath.init).toHaveBeenCalled()
    })
  })

  describe('toSelectMode', () => {
    it('should switch to select mode', () => {
      pathActionsMethod.toEditMode(pathElement)
      pathActionsMethod.toSelectMode(pathElement)

      expect(svgCanvas.setCurrentMode).toHaveBeenCalledWith('select')
      expect(mockPath.show).toHaveBeenCalledWith(false)
      expect(svgCanvas.clearSelection).toHaveBeenCalled()
    })

    it('should select element if it was the path element', () => {
      pathActionsMethod.toEditMode(pathElement)
      pathActionsMethod.toSelectMode(pathElement)

      expect(svgCanvas.call).toHaveBeenCalledWith('selected', [pathElement])
      expect(svgCanvas.addToSelection).toHaveBeenCalled()
    })

    it('should select a different element when the exiting click resolves to it', () => {
      // Regression: clicking straight onto a different path while node-editing
      // used to drop to select mode with nothing selected, instead of
      // selecting the clicked element like a plain select-mode click would.
      const otherPath = document.createElementNS(NS.SVG, 'path')
      otherPath.setAttribute('id', 'path2')
      svgRoot.append(otherPath)
      svgCanvas.getMouseTargetFromNode = vi.fn(() => otherPath)

      pathActionsMethod.toEditMode(pathElement)
      pathActionsMethod.toSelectMode(otherPath)

      expect(svgCanvas.call).toHaveBeenCalledWith('selected', [otherPath])
      expect(svgCanvas.addToSelection).toHaveBeenCalledWith([otherPath], true)
    })

    it('should not select anything when the exiting click resolves to the svg root (background)', () => {
      svgCanvas.getMouseTargetFromNode = vi.fn(() => svgRoot)

      pathActionsMethod.toEditMode(pathElement)
      pathActionsMethod.toSelectMode(svgRoot)

      expect(svgCanvas.call).not.toHaveBeenCalled()
      expect(svgCanvas.addToSelection).not.toHaveBeenCalled()
    })

    it('should leave the current group context when exiting pathedit while one is active', () => {
      // Regression: node-editing a path inside a group is entered implicitly
      // via double-click drill-in. Without releasing currentGroup here, it
      // stays stale after exiting pathedit - group siblings remain
      // dimmed/pointer-events:none, and the next new shape drawn silently
      // lands inside the stale group instead of the current layer.
      const group = document.createElementNS(NS.SVG, 'g')
      svgCanvas.getCurrentGroup = vi.fn(() => group)

      pathActionsMethod.toEditMode(pathElement)
      pathActionsMethod.toSelectMode(pathElement)

      expect(svgCanvas.leaveContext).toHaveBeenCalled()
    })

    it('should not touch group context when none is active', () => {
      pathActionsMethod.toEditMode(pathElement)
      pathActionsMethod.toSelectMode(pathElement)

      expect(svgCanvas.leaveContext).not.toHaveBeenCalled()
    })
  })

  describe('addSubPath', () => {
    it('should enable subpath mode', () => {
      pathActionsMethod.toEditMode(pathElement)
      pathActionsMethod.addSubPath(true)

      expect(svgCanvas.setCurrentMode).toHaveBeenCalledWith('path')
    })

    it('should disable subpath mode', () => {
      pathActionsMethod.toEditMode(pathElement)
      pathActionsMethod.addSubPath(false)

      expect(mockPath.init).toHaveBeenCalled()
    })

    // A new subpath is normally drawn to punch a hole (e.g. the counter of a
    // letter "a"/"o"). Under the default nonzero fill-rule, that hole (and
    // even the new loop's own stroke, given paint-order:stroke on new
    // shapes) only renders when the loop happens to wind opposite the outer
    // one -- so this switches the path to evenodd, which works regardless
    // of winding direction.
    it('should switch the path to evenodd fill-rule when entering subpath mode', () => {
      pathActionsMethod.toEditMode(pathElement)
      pathActionsMethod.addSubPath(true)

      expect(pathElement.getAttribute('fill-rule')).toBe('evenodd')
      expect(svgCanvas.undoMgr.beginUndoableChange).toHaveBeenCalledWith('fill-rule', [pathElement])
      expect(svgCanvas.addCommandToHistory).toHaveBeenCalled()
    })

    it('should not touch fill-rule or history if already evenodd', () => {
      pathElement.setAttribute('fill-rule', 'evenodd')
      pathActionsMethod.toEditMode(pathElement)

      pathActionsMethod.addSubPath(true)

      expect(svgCanvas.undoMgr.beginUndoableChange).not.toHaveBeenCalled()
      expect(svgCanvas.addCommandToHistory).not.toHaveBeenCalled()
    })
  })

  describe('select', () => {
    it('should select a path and enter edit mode if already current', () => {
      pathActionsMethod.select(pathElement)
      pathActionsMethod.select(pathElement)

      expect(svgCanvas.setCurrentMode).toHaveBeenCalledWith('pathedit')
    })
  })

  describe('clear', () => {
    it('should clear drawn path', () => {
      const drawnPath = document.createElementNS(NS.SVG, 'path')
      drawnPath.id = 'svg_1'
      const stretchy = document.createElementNS(NS.SVG, 'path')
      stretchy.id = 'path_stretch_line'
      svgRoot.append(drawnPath)
      svgRoot.append(stretchy)

      svgCanvas.getDrawnPath.mockReturnValue(drawnPath)

      pathActionsMethod.clear()

      expect(svgCanvas.setDrawnPath).toHaveBeenCalledWith(null)
      expect(svgCanvas.setStarted).toHaveBeenCalledWith(false)
    })

    it('should switch to select mode if in pathedit mode', () => {
      pathActionsMethod.toEditMode(pathElement)
      svgCanvas.getCurrentMode.mockReturnValue('pathedit')
      svgCanvas.getDrawnPath.mockReturnValue(null)

      pathActionsMethod.clear()

      expect(svgCanvas.setCurrentMode).toHaveBeenCalledWith('select')
    })

    it('should reset a node stuck mid-drag (e.g. mouseup lost outside the canvas)', () => {
      // If the mouse button is released outside the canvas, mouseUp's own
      // `path.dragging = false` never runs, so the node keeps following the
      // pointer on every later mousemove. Switching tools must always clear
      // this, even though currentMode may not be 'pathedit' by then.
      pathActionsMethod.toEditMode(pathElement)
      mockPath.dragging = [100, 100]
      mockPath.dragctrl = true
      svgCanvas.getCurrentMode.mockReturnValue('select')
      svgCanvas.getDrawnPath.mockReturnValue(null)

      pathActionsMethod.clear()

      expect(mockPath.dragging).toBe(false)
      expect(mockPath.dragctrl).toBe(false)
    })

    it('should not throw when the drawn-path DOM elements are already missing', () => {
      // clear() runs on every svgCanvas.setMode() call before the new mode is
      // committed; if it throws, the mode switch aborts and the toolbar ends
      // up showing a different tool than the one actually still active.
      const drawnPath = document.createElementNS(NS.SVG, 'path')
      drawnPath.id = 'svg_1'
      svgCanvas.getDrawnPath.mockReturnValue(drawnPath)
      // Note: no #svg_1 or #path_stretch_line element is appended to svgRoot.

      expect(() => pathActionsMethod.clear()).not.toThrow()
      expect(svgCanvas.setDrawnPath).toHaveBeenCalledWith(null)
    })

    it('should reset started even when neither drawnPath nor pathedit mode apply', () => {
      // Guards against currentMode getting stuck on a stale value (e.g. 'path'
      // left over from addSubPath) with no drawnPath to signal cleanup is needed.
      svgCanvas.getCurrentMode.mockReturnValue('path')
      svgCanvas.getDrawnPath.mockReturnValue(null)

      pathActionsMethod.clear()

      expect(svgCanvas.setStarted).toHaveBeenCalledWith(false)
    })

    it('should hide leftover point grips when a locked path tool re-arms after committing a path', () => {
      // Regression: with the path tool locked (double-click to keep it
      // armed), finishing a path skips getPath_(element).show(false) and
      // re-arms mode 'path' directly (see event.js's toolLocked branch), so
      // drawnPath is already null while mode is still 'path'. If the user
      // never entered node-edit mode this session (`path` stays unset),
      // neither the drawnPath branch nor the pathedit branch below fired,
      // so the just-committed path's point grips were never hidden and sat
      // display:inline indefinitely.
      const container = svgRoot.querySelector('#pathpointgrip_container')
      const grip0 = document.createElementNS(NS.SVG, 'circle')
      grip0.id = 'pathpointgrip_0'
      grip0.setAttribute('display', 'inline')
      const grip1 = document.createElementNS(NS.SVG, 'circle')
      grip1.id = 'pathpointgrip_1'
      grip1.setAttribute('display', 'inline')
      container.append(grip0, grip1)

      svgCanvas.getCurrentMode.mockReturnValue('path')
      svgCanvas.getDrawnPath.mockReturnValue(null)

      pathActionsMethod.clear()

      expect(grip0.getAttribute('display')).toBe('none')
      expect(grip1.getAttribute('display')).toBe('none')
    })

    it('should NOT reset started for a plain select-mode click on a non-path shape', () => {
      // event-select.js calls pathActions.clear() on every mousedown that
      // selects a new (non-path) element, right after setStarted(true) was
      // set for that same click. Resetting `started` here would kill the
      // drag/mouseup handling for every such click (no selection bbox,
      // element stuck unmovable).
      svgCanvas.getCurrentMode.mockReturnValue('select')
      svgCanvas.getDrawnPath.mockReturnValue(null)

      pathActionsMethod.clear()

      expect(svgCanvas.setStarted).not.toHaveBeenCalled()
    })

    it('should NOT reset started on a later plain click after an earlier, unrelated path-edit session', () => {
      // `path` (the current path-edit session) is set once by toEditMode()
      // and is never nulled out again — so its mere presence must not be
      // used as the signal for "this clear() call is path-related". Confirm
      // that clicking a plain shape after having edited some path earlier in
      // the session still leaves `started` alone.
      pathActionsMethod.toEditMode(pathElement)
      svgCanvas.setStarted.mockClear()
      svgCanvas.getCurrentMode.mockReturnValue('select')
      svgCanvas.getDrawnPath.mockReturnValue(null)

      pathActionsMethod.clear()

      expect(svgCanvas.setStarted).not.toHaveBeenCalled()
    })
  })

  describe('resetOrientation', () => {
    it('should reset path orientation', () => {
      pathElement.setAttribute('transform', 'rotate(45 50 50)')

      const result = pathActionsMethod.resetOrientation(pathElement)

      expect(svgCanvas.reorientGrads).toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('should return false for non-path elements', () => {
      const rect = document.createElementNS(NS.SVG, 'rect')

      const result = pathActionsMethod.resetOrientation(rect)

      expect(result).toBe(false)
    })
  })

  describe('zoomChange', () => {
    it('should update path on zoom change in pathedit mode', () => {
      pathActionsMethod.toEditMode(pathElement)
      svgCanvas.getCurrentMode.mockReturnValue('pathedit')

      pathActionsMethod.zoomChange()

      expect(mockPath.update).toHaveBeenCalled()
    })

    it('should do nothing if not in pathedit mode', () => {
      svgCanvas.getCurrentMode.mockReturnValue('select')

      pathActionsMethod.zoomChange()

      expect(mockPath.update).not.toHaveBeenCalled()
    })
  })

  describe('getNodePoint', () => {
    it('should return selected node point', () => {
      mockPath.selected_pts = [1]
      svgCanvas.getPath_.mockReturnValue(mockPath)
      pathActionsMethod.toEditMode(pathElement)

      const result = pathActionsMethod.getNodePoint()

      expect(result).toEqual({
        x: 50,
        y: 50,
        type: 4
      })
    })

    it('should return first point if no selection', () => {
      mockPath.selected_pts = []
      svgCanvas.getPath_.mockReturnValue(mockPath)
      pathActionsMethod.toEditMode(pathElement)

      const result = pathActionsMethod.getNodePoint()

      expect(result.x).toBeDefined()
      expect(result.y).toBeDefined()
    })
  })

  describe('linkControlPoints', () => {
    it('should set link control points flag', () => {
      pathActionsMethod.linkControlPoints(true)

      expect(svgCanvas.setLinkControlPoints).toHaveBeenCalledWith(true)
    })
  })

  describe('clonePathNode', () => {
    it('should clone selected path nodes', () => {
      pathActionsMethod.toEditMode(pathElement)
      mockPath.selected_pts = [1]

      pathActionsMethod.clonePathNode()

      expect(mockPath.storeD).toHaveBeenCalled()
      expect(mockPath.addSeg).toHaveBeenCalled()
      expect(mockPath.init).toHaveBeenCalled()
      expect(mockPath.endChanges).toHaveBeenCalledWith('Clone path node(s)')
    })
  })

  describe('deletePathNode', () => {
    it('should drop the selected node and reconnect its neighbors directly, without splitting the path', () => {
      pathActionsMethod.toEditMode(pathElement)
      // deletePathNode rebuilds `d` via buildReconnectedPathData, which drops
      // the deleted point and joins its two surviving neighbors directly —
      // splitting a shape open is the cutter tool's job now, not this one's.
      mockPath.selected_pts = [1]

      // Mock canDeleteNodes property
      Object.defineProperty(pathActionsMethod, 'canDeleteNodes', {
        get: () => true,
        configurable: true
      })

      pathActionsMethod.deletePathNode()

      expect(mockPath.storeD).toHaveBeenCalled()
      expect(pathElement.getAttribute('d')).toBe('M 10 10 L 90 10')
      expect(mockPath.init).toHaveBeenCalled()
      expect(mockPath.clearSelection).toHaveBeenCalled()
      expect(mockPath.endChanges).toHaveBeenCalledWith('Delete path node(s)')
    })

    it('should do nothing when canDeleteNodes is false', () => {
      pathActionsMethod.toEditMode(pathElement)
      mockPath.selected_pts = [1]

      Object.defineProperty(pathActionsMethod, 'canDeleteNodes', {
        get: () => false,
        configurable: true
      })

      pathActionsMethod.deletePathNode()

      expect(mockPath.storeD).not.toHaveBeenCalled()
      expect(pathElement.getAttribute('d')).toBe('M10,10 L50,50 L90,10 z')
    })
  })

  describe('opencloseSubPath', () => {
    /**
     * Build a path-object stand-in faithful enough to exercise
     * opencloseSubPath's own open/closed detection: a real `elem.pathSegList`
     * backs all mutations, `segs` mirrors it 1:1, and `.mate` is set on the
     * segment right before a closing `Z`, mirroring path-method.js's
     * `Path#init()` "closed sub-path" wiring.
     * @param {string} d
     * @returns {object} path-object stand-in
     */
    const buildPathObj = (d) => {
      const elem = document.createElementNS(NS.SVG, 'path')
      elem.setAttribute('d', d)
      svgRoot.append(elem)

      const list = elem.pathSegList
      const segs = []
      for (let i = 0; i < list.numberOfItems; i++) {
        const item = list.getItem(i)
        segs.push({ index: i, item, type: item.pathSegType })
      }
      if (segs.length && segs[segs.length - 1].type === 1 /* Z */) {
        segs[segs.length - 2].mate = segs[0]
      }

      // path-actions.test.js's shared `svgCanvas` stubs `replacePathSeg` as a
      // no-op (its real implementation lives in path-method.js, not under
      // test here); the generic node-removal branch of opencloseSubPath
      // needs it to actually turn a segment into the new "M", so give it one
      // scoped to this path's element.
      svgCanvas.replacePathSeg.mockImplementation((type, index, pts) => {
        const seg = type === 2
          ? elem.createSVGPathSegMovetoAbs(pts[0], pts[1])
          : elem.createSVGPathSegLinetoAbs(pts[0], pts[1])
        elem.pathSegList.replaceItem(seg, index)
      })

      return {
        elem,
        segs,
        selected_pts: [],
        eachSeg (fn) {
          for (let i = 0; i < this.segs.length; i++) {
            if (fn.call(this.segs[i], i) === false) break
          }
        },
        init: vi.fn(function () { return this }),
        show: vi.fn(function () { return this }),
        update: vi.fn(function () { return this }),
        setPathContext: vi.fn(),
        selectPt: vi.fn(),
        storeD: vi.fn(),
        endChanges: vi.fn()
      }
    }

    it('opens an already-closed sub-path instead of appending a redundant L/Z (regression)', () => {
      const closedPath = buildPathObj('M100,100 L200,100 L150,180 Z')
      svgCanvas.getPath_.mockReturnValue(closedPath)
      pathActionsMethod.toEditMode(closedPath.elem)
      closedPath.selected_pts = [1] // middle node: not the mate-shortcut node

      pathActionsMethod.opencloseSubPath()

      // Before the fix, `if (!openPt)` treated "already closed"
      // (openPt === false) the same as "not found" (openPt === null), so
      // this always re-entered the close branch and appended a redundant
      // `L100,100 Z` after the existing `Z` on every call.
      const d = closedPath.elem.getAttribute('d')
      expect(d).not.toMatch(/Z\s*L/i)
      expect((d.match(/Z/gi) || []).length).toBe(0)
      expect(closedPath.elem.pathSegList.numberOfItems).toBe(2)
    })

    it('opens via the mate shortcut when the pre-closing node is selected (regression)', () => {
      const closedPath = buildPathObj('M100,100 L200,100 L150,180 Z')
      svgCanvas.getPath_.mockReturnValue(closedPath)
      pathActionsMethod.toEditMode(closedPath.elem)
      closedPath.selected_pts = [2] // last real seg before Z, carries `.mate`

      pathActionsMethod.opencloseSubPath()

      const d = closedPath.elem.getAttribute('d')
      expect(d).not.toMatch(/Z\s*L/i)
      expect((d.match(/Z/gi) || []).length).toBe(0)
      expect(closedPath.elem.pathSegList.numberOfItems).toBe(2)
    })

    it('still closes an open sub-path (baseline, unaffected by the fix)', () => {
      const openPath = buildPathObj('M100,100 L200,100 L150,180')
      svgCanvas.getPath_.mockReturnValue(openPath)
      pathActionsMethod.toEditMode(openPath.elem)
      openPath.selected_pts = [0]

      pathActionsMethod.opencloseSubPath()

      expect(openPath.elem.getAttribute('d')).toMatch(/Z\s*$/i)
      expect(openPath.elem.pathSegList.numberOfItems).toBe(5)
    })

    it('re-closing after opening does not accumulate extra Z segments (repeated-press regression)', () => {
      const closedPath = buildPathObj('M100,100 L200,100 L150,180 Z')
      svgCanvas.getPath_.mockReturnValue(closedPath)
      pathActionsMethod.toEditMode(closedPath.elem)
      closedPath.selected_pts = [1]

      pathActionsMethod.opencloseSubPath() // closed -> open
      // Rebuild `segs` from the now-open pathSegList, as a real path.init()
      // would, and select the new first point (index 0) the way
      // opencloseSubPath's own `path.init().selectPt(0)` call intends.
      const list = closedPath.elem.pathSegList
      closedPath.segs = []
      for (let i = 0; i < list.numberOfItems; i++) {
        const item = list.getItem(i)
        closedPath.segs.push({ index: i, item, type: item.pathSegType })
      }
      closedPath.selected_pts = [0]

      pathActionsMethod.opencloseSubPath() // open -> closed

      const d = closedPath.elem.getAttribute('d')
      expect((d.match(/Z/gi) || []).length).toBe(1)
    })
  })

  describe('smoothPolylineIntoPath', () => {
    it('should convert polyline to smooth path', () => {
      const polyline = document.createElementNS(NS.SVG, 'polyline')
      polyline.setAttribute('points', '10,10 50,50 90,10 130,50')

      const mockPoints = {
        numberOfItems: 4,
        getItem: vi.fn((i) => {
          const points = [[10, 10], [50, 50], [90, 10], [130, 50]]
          return { x: points[i][0], y: points[i][1] }
        })
      }
      Object.defineProperty(polyline, 'points', {
        get: () => mockPoints,
        configurable: true
      })

      const result = pathActionsMethod.smoothPolylineIntoPath(polyline)

      expect(svgCanvas.addSVGElementsFromJson).toHaveBeenCalled()
      expect(result).toBeDefined()
      // Marks the path as freehand-drawn so TopPanel can scope "Smooth Path"
      // to paths this curve-fit algorithm is actually tuned for.
      expect(result.getAttribute('data-freehand')).toBe('1')
    })
  })

  describe('setSegType', () => {
    it('should set path segment type', () => {
      pathActionsMethod.toEditMode(pathElement)

      pathActionsMethod.setSegType(6)

      expect(mockPath.setSegType).toHaveBeenCalledWith(6)
    })
  })

  describe('moveNode', () => {
    it('should move selected path node', () => {
      pathActionsMethod.toEditMode(pathElement)
      mockPath.selected_pts = [1]

      pathActionsMethod.moveNode('x', 60)

      expect(mockPath.segs[1].move).toHaveBeenCalled()
      expect(mockPath.endChanges).toHaveBeenCalledWith('Move path point')
    })

    it('should do nothing if no points selected', () => {
      pathActionsMethod.toEditMode(pathElement)
      mockPath.selected_pts = []

      // When no points selected, should return early
      pathActionsMethod.moveNode('x', 60)

      // Verify no seg.move was called
      mockPath.segs.forEach(seg => {
        expect(seg.move).not.toHaveBeenCalled()
      })
    })
  })

  describe('convertPath', () => {
    it('should convert path to relative coordinates', () => {
      const path = document.createElementNS(NS.SVG, 'path')
      path.setAttribute('d', 'M10,10 L50,50 L90,10 z')

      const result = pathActionsMethod.convertPath(path, true)

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      expect(result).toContain('m') // Should have relative move command
    })

    it('should convert path to absolute coordinates', () => {
      const path = document.createElementNS(NS.SVG, 'path')
      path.setAttribute('d', 'm10,10 l40,40 l40,-40 z')

      const result = pathActionsMethod.convertPath(path, false)

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      expect(result).toContain('M') // Should have absolute move command
    })
  })

  describe('Private field encapsulation', () => {
    it('should not expose private fields', () => {
      const privateFields = ['subpath', 'newPoint', 'firstCtrl', 'currentPath', 'hasMoved']

      privateFields.forEach(field => {
        expect(pathActionsMethod[field]).toBeUndefined()
        expect(pathActionsMethod[`#${field}`]).toBeUndefined()
      })
    })
  })

  describe('Integration scenarios', () => {
    it('should handle complete path drawing workflow', () => {
      // Start drawing
      svgCanvas.getCurrentMode.mockReturnValue('path')
      svgCanvas.getDrawnPath.mockReturnValue(null)

      // First point
      pathActionsMethod.mouseDown({ target: svgRoot }, svgRoot, 10, 10)
      expect(svgCanvas.addPointGrip).toHaveBeenCalled()

      // Add more points
      const drawnPath = document.createElementNS(NS.SVG, 'path')
      drawnPath.setAttribute('d', 'M10,10 L50,50')
      svgCanvas.getDrawnPath.mockReturnValue(drawnPath)

      pathActionsMethod.mouseMove(50, 50)
      expect(svgCanvas.replacePathSeg).toHaveBeenCalled()
    })

    it('should handle path editing with transform', () => {
      pathElement.setAttribute('transform', 'translate(10,10) rotate(45)')
      mockPath.matrix = { a: 0.707, b: 0.707, c: -0.707, d: 0.707, e: 10, f: 10 }

      pathActionsMethod.toEditMode(pathElement)

      expect(mockPath.show).toHaveBeenCalledWith(true)
      expect(mockPath.update).toHaveBeenCalled()
    })
  })
})
