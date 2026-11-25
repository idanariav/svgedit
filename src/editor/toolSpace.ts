/**
 * Tool space: where a canvas tool's pointer and the shapes it edits meet. A tool that draws handles on the shape it edits
 * (Gradient, Distort, Width) works in *document units*, the space of the tool overlay (the first layer's coordinates, which is
 * also `#svgcontent`'s user space), and gets there from the screen with the screen matrices, so every group above the shape
 * counts: the element's own `transform` alone would leave the handles where the shape would be without its groups, and the
 * registry's `ev.x` / `ev.rawX` are local to the *entered* group, which the overlay is not. The conversions are the
 * engine's (`svgCanvas.frames`, `core/frames.ts`); this gives them as plain matrices.
 * @module toolSpace
 */
import type { Matrix, Point } from '@svgedit/svgcanvas/core/gradient-edit.ts'

const toMatrix = (m: DOMMatrix): Matrix => ({ a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f })

/** The pieces of the canvas this needs: its frames (`core/frames.ts`). */
interface Canvas { frames: import('@svgedit/svgcanvas/core/frames.ts').Frames }

export interface ToolSpace {
  /** the first layer's screen matrix: what every pointer event is mapped through (null before anything is rendered) */
  rootMatrix: () => Matrix | null
  /** a pointer event in document units, whatever group is entered */
  docPoint: (ev: { screenX: number, screenY: number, rawX: number, rawY: number }) => Point
  /** the element's local space to document units, through every group above it; null when it is not rendered */
  localToDoc: (el: Element) => Matrix | null
}

/** The canvas's frames (roadmap R12) as the plain matrices the tools' geometry (`gradient-edit.ts`) works in. */
export const toolSpace = (svgCanvas: Canvas): ToolSpace => ({
  rootMatrix: () => {
    const m = svgCanvas.frames.docToScreen()
    return m ? toMatrix(m) : null
  },
  docPoint: (ev) => svgCanvas.frames.docPoint(ev.screenX, ev.screenY) ?? { x: ev.rawX, y: ev.rawY },
  localToDoc: (el) => {
    const m = svgCanvas.frames.localToDoc(el)
    return m ? toMatrix(m) : null
  }
})

/**
 * An element of a tool's overlay (`ctx.addOverlay`): handles and outlines drawn in document units, never part of the
 * drawing, so they are built here rather than stated on the model.
 */
export const overlayElement = (tag: string, attrs: Record<string, string | number>, children: Element[] = []): SVGElement => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  el.append(...children)
  return el
}
