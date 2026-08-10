import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import '../../packages/svgcanvas/core/path-seg-shim.js'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

// getDebugSnapshot() aggregates internal visibility state (selection boxes,
// group-context sibling dimming, path-node grips) that is driven by
// display/opacity attributes rather than the live selection/document model,
// and has a documented history of desyncing from that model (see the
// leaveContext() comment in draw.js and the toEditMode() comment in
// path-actions.js). These tests cover both the normal-path aggregation and
// that the `stale` flags actually fire when state is forced out of sync,
// since that's the whole point of exposing this to a debug-mode UI.
describe('SvgCanvas#getDebugSnapshot', () => {
  let svgCanvas

  const createSvgCanvas = () => {
    document.body.textContent = ''
    const svgEditor = document.createElement('div')
    svgEditor.id = 'svg_editor'
    const svgcanvas = document.createElement('div')
    svgcanvas.style.visibility = 'hidden'
    svgcanvas.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(svgcanvas)
    const toolsLeft = document.createElement('div')
    toolsLeft.id = 'tools_left'
    svgEditor.append(workarea, toolsLeft)
    document.body.append(svgEditor)

    svgCanvas = new SvgCanvas(document.getElementById('svgcanvas'), {
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
  }

  beforeEach(createSvgCanvas)
  afterEach(() => { document.body.textContent = '' })

  describe('selection', () => {
    it('reports the live selection with no stale entries', () => {
      const rect = svgCanvas.addSVGElementsFromJson({
        element: 'rect',
        attr: { id: 'rect-normal', x: 0, y: 0, width: 10, height: 10 }
      })
      svgCanvas.selectOnly([rect], true)

      const snapshot = svgCanvas.getDebugSnapshot()

      expect(snapshot.selection.selectedIds).toEqual(['rect-normal'])
      const sel = snapshot.selection.selectors.find((s) => s.elemId === 'rect-normal')
      expect(sel).toBeTruthy()
      expect(sel.display).toBe('inline')
      expect(sel.stale).toBe(false)
    })

    it('flags a selection box left visible after the model selection moved on', () => {
      const rect = svgCanvas.addSVGElementsFromJson({
        element: 'rect',
        attr: { id: 'rect-leaked', x: 0, y: 0, width: 10, height: 10 }
      })
      svgCanvas.selectOnly([rect], true)

      // Simulate the leak class this overlay targets: the model's selection
      // is cleared but the selector box is never released, so it keeps
      // rendering display:inline for an element that's no longer selected.
      svgCanvas.setEmptySelectedElements()

      const snapshot = svgCanvas.getDebugSnapshot()
      const sel = snapshot.selection.selectors.find((s) => s.elemId === 'rect-leaked')
      expect(sel).toBeTruthy()
      expect(sel.display).toBe('inline')
      expect(sel.stale).toBe(true)
      expect(snapshot.selection.selectedIds).toEqual([])
    })
  })

  describe('groupContext', () => {
    it('reports the current group and its dimmed siblings while inside a context', () => {
      svgCanvas.setSvgString(
        '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">' +
          '<g class="layer"><title>Layer 1</title>' +
            '<g id="grp1"><rect id="child1" x="0" y="0" width="10" height="10"/></g>' +
            '<rect id="sibling1" x="20" y="0" width="10" height="10"/>' +
          '</g>' +
        '</svg>'
      )
      svgCanvas.setContext(svgCanvas.getSvgContent().querySelector('#grp1'))

      const snapshot = svgCanvas.getDebugSnapshot()

      expect(snapshot.groupContext.currentGroupId).toBe('grp1')
      expect(snapshot.groupContext.disabledElems.map((e) => e.id)).toContain('sibling1')
      expect(snapshot.groupContext.stale).toBe(false)
    })

    it('flags dimmed siblings left behind when the current-group state disagrees', () => {
      svgCanvas.setSvgString(
        '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">' +
          '<g class="layer"><title>Layer 1</title>' +
            '<g id="grp2"><rect id="child2" x="0" y="0" width="10" height="10"/></g>' +
            '<rect id="sibling2" x="20" y="0" width="10" height="10"/>' +
          '</g>' +
        '</svg>'
      )
      svgCanvas.setContext(svgCanvas.getSvgContent().querySelector('#grp2'))

      // Simulate the leak this overlay targets: leaveContext() failed to run
      // (or was skipped) so `disabledElems` still holds dimmed siblings after
      // the current-group has already been cleared elsewhere.
      const getCurrentGroup = vi.spyOn(svgCanvas, 'getCurrentGroup').mockReturnValue(null)

      const snapshot = svgCanvas.getDebugSnapshot()

      expect(snapshot.groupContext.currentGroupId).toBeNull()
      expect(snapshot.groupContext.disabledElems.length).toBeGreaterThan(0)
      expect(snapshot.groupContext.stale).toBe(true)

      getCurrentGroup.mockRestore()
    })
  })

  describe('pathEditing', () => {
    it('reports the currently-edited path and its node grips', () => {
      svgCanvas.setSvgString(
        '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">' +
          '<g class="layer"><title>Layer 1</title><path id="p1" d="M10,10 L50,10 L50,50"/></g>' +
        '</svg>'
      )
      const pathEl = svgCanvas.getSvgContent().querySelector('#p1')
      svgCanvas.pathActions.toEditMode(pathEl)

      const snapshot = svgCanvas.getDebugSnapshot()

      expect(snapshot.pathEditing.pathElemId).toBe('p1')
      expect(snapshot.pathEditing.segCount).toBe(3)
      const visible = snapshot.pathEditing.grips.filter((g) => g.display === 'inline')
      expect(visible.length).toBeGreaterThan(0)
      expect(visible.every((g) => !g.stale)).toBe(true)
    })

    it('flags a node grip left visible past the live path\'s segment count', () => {
      svgCanvas.setSvgString(
        '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">' +
          '<g class="layer"><title>Layer 1</title><path id="p2" d="M10,10 L50,10 L50,50"/></g>' +
        '</svg>'
      )
      const pathEl = svgCanvas.getSvgContent().querySelector('#p2')
      svgCanvas.pathActions.toEditMode(pathEl)

      // Simulate the leak this overlay targets: a grip cached under an index
      // (see path-method.js's `pathpointgrip_${index}` keying) that belongs
      // to a different, previously-edited path is left shown because the
      // shared, index-keyed grip container was never fully hidden first.
      svgCanvas.addPointGrip(99, 5, 5)

      const snapshot = svgCanvas.getDebugSnapshot()
      const orphan = snapshot.pathEditing.grips.find((g) => g.id === 'pathpointgrip_99')
      expect(orphan).toBeTruthy()
      expect(orphan.display).toBe('inline')
      expect(orphan.stale).toBe(true)
    })
  })
})
