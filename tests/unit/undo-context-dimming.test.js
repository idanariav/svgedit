import { beforeEach, describe, expect, it } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.ts'

// Regression: entering a group dims every sibling on the way up to the layer. The dimming was `opacity="0.33"` on them, and
// undo snapshots read the DOM as it was, so a command made inside the group recorded the dimmed siblings as the drawing:
// undoing it after leaving the group brought the dimming back for good, and it was saved (the layers, groups and texts of a
// drawing all stuck at 33%). Since roadmap R11 the dimming is a rule in the canvas's interaction sheet: the drawing carries
// none of it.
describe('undo after editing inside a group', () => {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    const container = document.createElement('div')
    container.id = 'svgcanvas'
    workarea.append(container)
    document.body.append(workarea)

    svgCanvas = new SvgCanvas(container, {
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
    svgCanvas.setSvgString(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>Layer 1</title>' +
      '<g id="grp"><rect id="inner" x="10" y="10" width="40" height="40" fill="blue"/></g>' +
      '<rect id="sib" x="300" y="300" width="40" height="40" fill="red"/>' +
      '<rect id="half" x="400" y="300" width="40" height="40" opacity="0.5"/>' +
      '</g><g class="layer"><title>Layer 2</title><rect id="other" x="1" y="1" width="5" height="5"/></g></svg>'
    )
  })

  const byId = (id) => document.getElementById(id)
  /** the interaction sheet dims element `id` */
  const dims = (id) => svgCanvas.getDisabledElems().includes(byId(id)) && svgCanvas.interactionStyle.text().includes('/* context-dim */')

  it('does not bring the in-group dimming back', () => {
    svgCanvas.setContext(byId('grp'))
    expect(dims('sib')).toBe(true) // dimmed while inside
    expect(byId('sib').hasAttribute('opacity')).toBe(false) // by the sheet, not on the shape
    svgCanvas.snapshotHistory.baseline() // a press inside the group
    svgCanvas.selectOnly([byId('inner')])
    svgCanvas.changeSelectedAttribute('fill', '#00ff00')
    svgCanvas.leaveContext()
    expect(byId('sib').hasAttribute('opacity')).toBe(false)

    svgCanvas.undoMgr.undo()
    expect(byId('inner').getAttribute('fill')).toBe('blue')
    expect(byId('sib').hasAttribute('opacity')).toBe(false)
    expect(byId('half').getAttribute('opacity')).toBe('0.5')
    expect(document.querySelector('#svgcontent title').hasAttribute('opacity')).toBe(false)
    expect(svgCanvas.checkDrawing()).toEqual([])

    svgCanvas.undoMgr.redo()
    expect(byId('inner').getAttribute('fill')).toBe('#00ff00')
    expect(byId('sib').hasAttribute('opacity')).toBe(false)
  })

  it('keeps the dimming on while the user is still inside the group', () => {
    svgCanvas.setContext(byId('grp'))
    svgCanvas.snapshotHistory.baseline()
    svgCanvas.selectOnly([byId('inner')])
    svgCanvas.changeSelectedAttribute('fill', '#00ff00')
    expect(dims('sib')).toBe(true)
    expect(dims('half')).toBe(true)
    expect(byId('half').getAttribute('opacity')).toBe('0.5')
  })

  it('an undo made inside the group leaves the dimming on (opacity and pointer-events)', () => {
    svgCanvas.setContext(byId('grp'))
    svgCanvas.snapshotHistory.baseline()
    svgCanvas.selectOnly([byId('inner')])
    svgCanvas.changeSelectedAttribute('fill', '#00ff00')
    svgCanvas.undoMgr.undo()
    expect(byId('inner').getAttribute('fill')).toBe('blue')
    svgCanvas.interactionStyle.refresh() // the observer does this in a browser, after the undo re-rendered
    expect(dims('sib')).toBe(true)
    expect(byId('sib').hasAttribute('style')).toBe(false)
    expect(svgCanvas.checkDrawing()).toEqual([])
    svgCanvas.leaveContext()
    expect(dims('sib')).toBe(false)
    expect(byId('half').getAttribute('opacity')).toBe('0.5')
  })
})
