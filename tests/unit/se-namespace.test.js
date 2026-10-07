import { beforeEach, describe, expect, it } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { declareMissingSeNamespace, hasUnnamespacedSeAttr } from '../../packages/svgcanvas/core/se-namespace.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'

// Regression: corner-radius/taper set `se:*` attributes with setAttribute() (no
// namespace), the serializer never declared `xmlns:se`, and the saved drawing
// could not be loaded again.
describe('se: namespace declaration', () => {
  describe('declareMissingSeNamespace (load-time repair of legacy files)', () => {
    const LEGACY = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><g class="layer"><title>L</title><rect se:corner-radius="4" width="5" height="5"/></g></svg>'

    it('adds the declaration to a drawing that uses se: attributes without one', () => {
      const fixed = declareMissingSeNamespace(LEGACY)
      expect(fixed).toContain(`<svg xmlns:se="${NS.SE}" xmlns=`)
      const doc = new DOMParser().parseFromString(fixed, 'image/svg+xml')
      expect(doc.querySelector('parsererror')).toBeNull()
      expect(doc.querySelector('rect').getAttribute('se:corner-radius')).toBe('4')
    })

    it('leaves strings that already declare it, or never use it, untouched', () => {
      const declared = LEGACY.replace('<svg ', `<svg xmlns:se="${NS.SE}" `)
      expect(declareMissingSeNamespace(declared)).toBe(declared)
      const plain = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'
      expect(declareMissingSeNamespace(plain)).toBe(plain)
    })
  })

  describe('with a real canvas', () => {
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
    })

    it('the serializer declares xmlns:se for un-namespaced se: attributes, so the output reloads', () => {
      const rect = svgCanvas.addSVGElementsFromJson({
        element: 'rect', curStyles: true, attr: { x: 1, y: 1, width: 5, height: 5, id: svgCanvas.getNextId() }
      })
      rect.setAttribute('se:corner-radius', '3') // exactly what corner-radius.js does
      expect(hasUnnamespacedSeAttr([rect])).toBe(true)

      const out = svgCanvas.getSvgString()
      expect(out).toContain(`xmlns:se="${NS.SE}"`)
      expect(svgCanvas.setSvgString(out)).toBe(true)
      expect(svgCanvas.getSvgContent().querySelector('[*|corner-radius]')).not.toBeNull()
    })

    it('opens a legacy file that was saved without the declaration', () => {
      const legacy = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><g class="layer"><title>Layer 1</title><rect id="r" x="5" y="5" width="50" height="30" se:corner-radius="6"/></g></svg>'
      expect(svgCanvas.setSvgString(legacy)).toBe(true)
      expect(svgCanvas.getSvgContent().querySelector('#r')).not.toBeNull()
    })
  })
})
