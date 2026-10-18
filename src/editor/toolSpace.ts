/**
 * Tool space: where a canvas tool's pointer and the shapes it edits meet. A tool that draws handles on the shape it edits
 * (Gradient, Distort, Width) works in *document units*, the space of the tool overlay (the first layer's coordinates, which is
 * also `#svgcontent`'s user space), and gets there from the screen with the screen matrices, so every group above the shape
 * counts: the element's own `transform` alone would leave the handles where the shape would be without its groups, and the
 * registry's `ev.x` / `ev.rawX` are local to the *entered* group, which the overlay is not.
 * @module toolSpace
 */
import { applyMatrix, invert, multiply } from '@svgedit/svgcanvas/core/gradient-edit.ts'
import type { Matrix, Point } from '@svgedit/svgcanvas/core/gradient-edit.ts'

const toMatrix = (m: DOMMatrix): Matrix => ({ a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f })

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

/** The pieces of the canvas this needs. */
interface Canvas { getSvgContent: () => Element }

export interface ToolSpace {
  /** the first layer's screen matrix: what every pointer event is mapped through (null before anything is rendered) */
  rootMatrix: () => Matrix | null
  /** a pointer event in document units, whatever group is entered */
  docPoint: (ev: { screenX: number, screenY: number, rawX: number, rawY: number }) => Point
  /** the element's local space to document units, through every group above it; null when it is not rendered */
  localToDoc: (el: Element) => Matrix | null
}

export const toolSpace = (svgCanvas: Canvas): ToolSpace => {
  const rootMatrix = (): Matrix | null => {
    const m = (svgCanvas.getSvgContent().querySelector('g') as SVGGraphicsElement | null)?.getScreenCTM?.()
    return m ? toMatrix(m) : null
  }
  return {
    rootMatrix,
    docPoint: (ev) => {
      const inv = invert(rootMatrix() ?? IDENTITY)
      return inv ? applyMatrix(inv, { x: ev.screenX, y: ev.screenY }) : { x: ev.rawX, y: ev.rawY }
    },
    localToDoc: (el) => {
      const root = rootMatrix()
      const own = (el as SVGGraphicsElement).getScreenCTM?.()
      const inv = root && invert(root)
      return inv && own ? multiply(inv, toMatrix(own)) : null
    }
  }
}
