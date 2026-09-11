import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import '../../packages/svgcanvas/core/path-seg-shim.js'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

// getDebugSnapshot() aggregates internal visibility state (selection boxes,
// group-context sibling dimming, path-node grips, clip-path/mask references)
// that is driven by display/opacity attributes or url(#id) references rather
// than the live selection/document model, and has a documented history of
// desyncing from that model (see the leaveContext() comment in draw.js and
// the toEditMode() comment in path-actions.js). These tests cover both the
// normal-path aggregation and that the `stale` flags actually fire when
// state is forced out of sync, since that's the whole point of exposing
// this to a debug-mode UI.
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

  describe('masking', () => {
    it('reports a clip-path/mask reference that resolves to its target', () => {
      svgCanvas.setSvgString(
        '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><clipPath id="clip1"><rect x="0" y="0" width="10" height="10"/></clipPath></defs>' +
          '<g class="layer"><title>Layer 1</title>' +
            '<rect id="clipped1" x="0" y="0" width="20" height="20" clip-path="url(#clip1)"/>' +
          '</g>' +
        '</svg>'
      )

      const snapshot = svgCanvas.getDebugSnapshot()

      const ref = snapshot.masking.refs.find((r) => r.id === 'clipped1')
      expect(ref).toStrictEqual({ id: 'clipped1', attr: 'clip-path', ref: 'clip1', refExists: true, refTag: 'clipPath' })
      expect(snapshot.masking.stale).toBe(false)
    })

    it('flags a mask reference whose target no longer exists', () => {
      svgCanvas.setSvgString(
        '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><mask id="mask1"><rect x="0" y="0" width="10" height="10" fill="#fff"/></mask></defs>' +
          '<g class="layer"><title>Layer 1</title>' +
            '<rect id="masked1" x="0" y="0" width="20" height="20" mask="url(#mask1)"/>' +
          '</g>' +
        '</svg>'
      )

      // Simulate the bug class this section targets: something removed the
      // <mask> definition (or renamed its id) without also clearing/updating
      // every element's `mask` attribute referencing it -- the masked
      // element silently renders as if unmasked, with no error anywhere.
      svgCanvas.getSvgContent().querySelector('#mask1').remove()

      const snapshot = svgCanvas.getDebugSnapshot()

      const ref = snapshot.masking.refs.find((r) => r.id === 'masked1')
      expect(ref).toStrictEqual({ id: 'masked1', attr: 'mask', ref: 'mask1', refExists: false, refTag: null })
      expect(snapshot.masking.stale).toBe(true)
    })

    it('ignores non-url() clip-path/mask values (CSS keywords, hand-edited files)', () => {
      svgCanvas.setSvgString(
        '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">' +
          '<g class="layer"><title>Layer 1</title>' +
            '<rect id="rect-none" x="0" y="0" width="10" height="10" clip-path="none"/>' +
          '</g>' +
        '</svg>'
      )

      const snapshot = svgCanvas.getDebugSnapshot()

      expect(snapshot.masking.refs).toEqual([])
      expect(snapshot.masking.stale).toBe(false)
    })
  })
})

// setDebugEventSink()/logDebugEvent() are the discrete-event complement to
// getDebugSnapshot() above -- see svgcanvas.js's doc comment on
// setDebugEventSink() for why a polled state diff alone can't reconstruct a
// hard-to-reproduce path-node bug.
describe('SvgCanvas#logDebugEvent', () => {
  let svgCanvas

  beforeEach(() => {
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
  })
  afterEach(() => { document.body.textContent = '' })

  it('is a no-op when no sink has been set', () => {
    expect(() => svgCanvas.logDebugEvent('path-commit', { elemId: 'p1' })).not.toThrow()
  })

  it('forwards events to the sink set via setDebugEventSink', () => {
    const sink = vi.fn()
    svgCanvas.setDebugEventSink(sink)

    svgCanvas.logDebugEvent('path-commit', { elemId: 'p1' })

    expect(sink).toHaveBeenCalledWith('path-commit', { elemId: 'p1' })
  })

  it('stops forwarding once the sink is cleared with null', () => {
    const sink = vi.fn()
    svgCanvas.setDebugEventSink(sink)
    svgCanvas.setDebugEventSink(null)

    svgCanvas.logDebugEvent('path-commit', { elemId: 'p1' })

    expect(sink).not.toHaveBeenCalled()
  })
})
