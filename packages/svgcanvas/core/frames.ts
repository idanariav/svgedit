/**
 * The coordinate frames of the canvas, in one place (roadmap R12): screen (client px), document units (`#svgcontent`'s user
 * space, where layers and the tool overlay live), the space a press draws in (the entered group's, else the current
 * layer's) and an element's own space (its `transform` and every group above it). Each conversion reads the matrices now:
 * a cached one goes stale on the next scroll or zoom.
 *
 * Document units are reached through the first layer's screen matrix, never `#svgcontent`'s own: an inner `<svg>`'s
 * `getScreenCTM` differs across browsers (its `x` / `y` and `viewBox`), its first child's does not.
 * @module frames
 * @license MIT
 */

/** What the frames read of the canvas. */
export interface FramesHost {
  getSvgContent(): Element | null | undefined
  getCurrentGroup(): Element | null
  getCurrentDrawing(): { getCurrentLayer(): Element | null } | null | undefined
}

export interface Frames {
  /** document units → screen, or null before anything is rendered */
  docToScreen(): DOMMatrix | null
  /** screen → document units */
  screenToDoc(): DOMMatrix | null
  /** a screen point in document units, or null before anything is rendered */
  docPoint(clientX: number, clientY: number): { x: number, y: number } | null
  /** `el`'s own space (its transform and every group above it included) → document units; null when it is not rendered */
  localToDoc(el: Element): DOMMatrix | null
  /** document units → `el`'s own space */
  docToLocal(el: Element): DOMMatrix | null
  /** `from`'s own space → `to`'s own space */
  between(from: Element, to: Element): DOMMatrix | null
  /** the space a press draws in: the entered group, else the current layer (null before a drawing has one) */
  drawingSpace(): Element | null
  /** a screen point in the space a press draws in */
  drawingPoint(clientX: number, clientY: number): { x: number, y: number } | null
}

const ctm = (el: Element | null | undefined): DOMMatrix | null => (el as SVGGraphicsElement | null)?.getScreenCTM?.() ?? null
const invertible = (m: DOMMatrix | null): DOMMatrix | null => {
  if (!m) return null
  const det = m.a * m.d - m.b * m.c
  return Number.isFinite(det) && det !== 0 ? m : null
}
const at = (m: DOMMatrix | null, x: number, y: number): { x: number, y: number } | null =>
  m ? { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f } : null

export const createFrames = (canvas: FramesHost): Frames => {
  const docToScreen = (): DOMMatrix | null => invertible(ctm(canvas.getSvgContent()?.querySelector('g')))
  const screenToDoc = (): DOMMatrix | null => docToScreen()?.inverse() ?? null
  const between = (from: Element, to: Element): DOMMatrix | null => {
    const a = invertible(ctm(from))
    const b = invertible(ctm(to))
    return a && b ? b.inverse().multiply(a) : null
  }
  const localToDoc = (el: Element): DOMMatrix | null => {
    const root = docToScreen()
    const own = invertible(ctm(el))
    return root && own ? root.inverse().multiply(own) : null
  }
  const drawingSpace = (): Element | null => canvas.getCurrentGroup() ?? canvas.getCurrentDrawing()?.getCurrentLayer() ?? null
  return {
    docToScreen,
    screenToDoc,
    docPoint: (x, y) => at(screenToDoc(), x, y),
    localToDoc,
    docToLocal: (el) => localToDoc(el)?.inverse() ?? null,
    between,
    drawingSpace,
    drawingPoint: (x, y) => {
      const space = drawingSpace()
      return at(invertible(ctm(space))?.inverse() ?? null, x, y)
    }
  }
}
