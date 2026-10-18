/**
 * Shape-creation mode mouse handlers, extracted from the
 * rect/square/frame/foreignObject/image/circle/ellipse/line/text/
 * fhellipse/fhrect/fhpath cases of `event.js`'s mouseDown/mouseMove/mouseUp
 * switches. Each handler runs its own internal switch reproducing the
 * original grouped case labels (and fallthrough) verbatim.
 * @module event-shape-draw
 * @license MIT
 */
import { assignAttributes, preventClickDefault, setHref } from './dom-utils.ts'
import { snapToAngle } from './math.ts'
import { areaAttrsForBox, writeAreaAttrs, TEXT_LINE_HEIGHT } from './text-rows.ts'
import type SvgCanvas from '../svgcanvas.ts'
import type { StyleProps } from './canvas-state.ts'
import type { PenEnd } from './pen-continue.ts'

interface DownContext { x: number, y: number, realX: number, realY: number, curShape: StyleProps }
interface MoveContext { x: number, y: number, realX: number, realY: number, shape: SVGElement }
interface UpContext { element: Element | null | undefined, keep: boolean }

/** Screen pixels the pointer must travel with the Text tool before the press becomes a box (area text). */
const TEXT_DRAG_PX = 5

/**
 * Cubic B-spline point used to smooth the freehand pencil stroke as it's
 * drawn (fhpath mouseMove).
 */
const getBsplinePoint = (svgCanvas: SvgCanvas, t: number): { x: number, y: number } => {
  const spline = { x: 0, y: 0 }
  const p0 = { x: svgCanvas.getControllPoint2('x'), y: svgCanvas.getControllPoint2('y') }
  const p1 = { x: svgCanvas.getControllPoint1('x'), y: svgCanvas.getControllPoint1('y') }
  const p2 = { x: svgCanvas.getStart('x'), y: svgCanvas.getStart('y') }
  const p3 = { x: svgCanvas.getEnd('x'), y: svgCanvas.getEnd('y') }
  const S = 1.0 / 6.0
  const t2 = t * t
  const t3 = t2 * t

  const m = [
    [-1, 3, -3, 1],
    [3, -6, 3, 0],
    [-3, 0, 3, 0],
    [1, 4, 1, 0]
  ]

  spline.x = S * (
    (p0.x * m[0][0] + p1.x * m[0][1] + p2.x * m[0][2] + p3.x * m[0][3]) * t3 +
    (p0.x * m[1][0] + p1.x * m[1][1] + p2.x * m[1][2] + p3.x * m[1][3]) * t2 +
    (p0.x * m[2][0] + p1.x * m[2][1] + p2.x * m[2][2] + p3.x * m[2][3]) * t +
    (p0.x * m[3][0] + p1.x * m[3][1] + p2.x * m[3][2] + p3.x * m[3][3])
  )
  spline.y = S * (
    (p0.y * m[0][0] + p1.y * m[0][1] + p2.y * m[0][2] + p3.y * m[0][3]) * t3 +
    (p0.y * m[1][0] + p1.y * m[1][1] + p2.y * m[1][2] + p3.y * m[1][3]) * t2 +
    (p0.y * m[2][0] + p1.y * m[2][1] + p2.y * m[2][2] + p3.y * m[2][3]) * t +
    (p0.y * m[3][0] + p1.y * m[3][1] + p2.y * m[3][2] + p3.y * m[3][3])
  )

  return {
    x: spline.x,
    y: spline.y
  }
}

/**
 * Reentrant init: each SvgCanvas instance gets its own copy of these
 * handlers, closed over its own `svgCanvas`.
 */
export const init = (canvas: SvgCanvas): {
  down: (evt: MouseEvent, ctx: DownContext) => void
  move: (evt: MouseEvent, ctx: MoveContext) => void
  up: (evt: MouseEvent, ctx: UpContext) => UpContext
} => {
  const svgCanvas = canvas
  // Real-time jitter stabilization for the freehand pencil tool (EMA low-pass
  // filter on raw pointer coordinates, applied before the B-spline capture
  // below). Reset per-stroke in the fhpath mousedown case.
  let pencilStabX: number | null = null
  let pencilStabY: number | null = null
  // The end of the selected open path the current pencil stroke started on (it carries that path on).
  let pencilEnd: PenEnd | null = null
  // The Text tool press has been dragged into a box: it makes area text instead of point text.
  let textBoxDrag = false
  let textBoxEnd = { x: 0, y: 0 }

  const down = (evt: MouseEvent, ctx: DownContext): void => {
    const { x, y, curShape } = ctx
    let { realX, realY } = ctx
    switch (svgCanvas.getCurrentMode()) {
      case 'fhellipse':
      case 'fhrect':
      case 'fhpath':
        pencilStabX = null
        pencilStabY = null
        svgCanvas.pathActions.hover(null, null)
        pencilEnd = svgCanvas.getCurrentMode() === 'fhpath' && !evt.altKey ? svgCanvas.pencilEnd?.(realX, realY) ?? null : null
        // Starting on an end of the selected open path: the stroke begins exactly there.
        if (pencilEnd) ({ x: realX, y: realY } = pencilEnd.point)
        svgCanvas.setStart({ x: realX, y: realY })
        svgCanvas.setControllPoint1('x', 0)
        svgCanvas.setControllPoint1('y', 0)
        svgCanvas.setControllPoint2('x', 0)
        svgCanvas.setControllPoint2('y', 0)
        svgCanvas.setStarted(true)
        svgCanvas.setDAttr(realX + ',' + realY + ' ')
        // Commented out as doing nothing now:
        // strokeW = parseFloat(curShape.stroke_width) === 0 ? 1 : curShape.stroke_width;
        svgCanvas.addSVGElementsFromJson({
          element: 'polyline',
          curStyles: true,
          attr: {
            points: svgCanvas.getDAttr() as string,
            id: svgCanvas.getNextId('polyline'),
            fill: 'none',
            opacity: Number(curShape.opacity) / 2,
            'stroke-linecap': 'round',
            style: 'pointer-events:none'
          }
        })
        svgCanvas.setFreehand('minx', realX)
        svgCanvas.setFreehand('maxx', realX)
        svgCanvas.setFreehand('miny', realY)
        svgCanvas.setFreehand('maxy', realY)
        break
      case 'image': {
        svgCanvas.setStarted(true)
        const newImage = svgCanvas.addSVGElementsFromJson({
          element: 'image',
          attr: {
            x,
            y,
            width: 0,
            height: 0,
            id: svgCanvas.getNextId('image'),
            'data-se-ephemeral': '', // a preview until mouse-up hands it to the model (event.ts `commitDrawn`)
            opacity: Number(curShape.opacity) / 2,
            style: 'pointer-events:inherit'
          }
        })
        setHref(newImage, svgCanvas.getLastGoodImgUrl())
        preventClickDefault(newImage)
        break
      } case 'frame': {
        // A frame is a plain rect marked with data-frame, used to define an export
        // region. It is never part of an exported image (stripped in svg-exec.js).
        // Drawn with fixed presentation attrs (not curStyles) so it always looks
        // like a dashed outline regardless of the current shape style.
        svgCanvas.setStarted(true)
        svgCanvas.setStartX(x)
        svgCanvas.setStartY(y)
        const frameCount = svgCanvas.getSvgContent().querySelectorAll('[data-frame]').length
        const frameEl = svgCanvas.addSVGElementsFromJson({
          element: 'rect',
          curStyles: false,
          attr: {
            x,
            y,
            width: 0,
            height: 0,
            'data-se-ephemeral': '',
            id: svgCanvas.getNextId('rect'),
            'data-frame': '1',
            fill: 'transparent',
            stroke: '#3b82f6',
            'stroke-dasharray': '6 4',
            'stroke-width': 1.5
          }
        })
        const title = frameEl.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'title')
        title.textContent = `Frame ${frameCount + 1}`
        frameEl.appendChild(title)
        break
      } case 'square':
      // TODO: once we create the rect, we lose information that this was a square
      // (for resizing purposes this could be important)
      // Fallthrough
      case 'rect':
        svgCanvas.setStarted(true)
        svgCanvas.setStartX(x)
        svgCanvas.setStartY(y)
        svgCanvas.addSVGElementsFromJson({
          element: 'rect',
          curStyles: true,
          attr: {
            x,
            y,
            width: 0,
            height: 0,
            'data-se-ephemeral': '',
            id: svgCanvas.getNextId('rect'),
            opacity: Number(curShape.opacity) / 2
          }
        })
        break
      case 'line': {
        svgCanvas.setStarted(true)
        const strokeW = Number(curShape.stroke_width) === 0 ? 1 : curShape.stroke_width
        svgCanvas.addSVGElementsFromJson({
          element: 'line',
          curStyles: true,
          attr: {
            x1: x,
            y1: y,
            x2: x,
            y2: y,
            'data-se-ephemeral': '',
            id: svgCanvas.getNextId('line'),
            stroke: curShape.stroke,
            'stroke-width': strokeW,
            'stroke-dasharray': curShape.stroke_dasharray,
            'stroke-linejoin': curShape.stroke_linejoin,
            'stroke-linecap': curShape.stroke_linecap,
            'stroke-opacity': curShape.stroke_opacity,
            fill: 'none',
            opacity: Number(curShape.opacity) / 2,
            style: 'pointer-events:none'
          }
        })
        break
      } case 'circle':
        svgCanvas.setStarted(true)
        svgCanvas.addSVGElementsFromJson({
          element: 'circle',
          curStyles: true,
          attr: {
            cx: x,
            cy: y,
            r: 0,
            'data-se-ephemeral': '',
            id: svgCanvas.getNextId('circle'),
            opacity: Number(curShape.opacity) / 2
          }
        })
        break
      case 'ellipse':
        svgCanvas.setStarted(true)
        svgCanvas.addSVGElementsFromJson({
          element: 'ellipse',
          curStyles: true,
          attr: {
            cx: x,
            cy: y,
            rx: 0,
            ry: 0,
            'data-se-ephemeral': '',
            id: svgCanvas.getNextId('ellipse'),
            opacity: Number(curShape.opacity) / 2
          }
        })
        break
      case 'text':
        textBoxDrag = false
        svgCanvas.setStarted(true)
        /* const newText = */ svgCanvas.addSVGElementsFromJson({
          element: 'text',
          curStyles: true,
          attr: {
            x,
            y,
            id: svgCanvas.getNextId('text'),
            fill: svgCanvas.getCurText('fill') as string,
            'stroke-width': svgCanvas.getCurText('stroke_width') as string | number,
            'font-size': svgCanvas.getCurText('font_size') as string | number,
            'font-family': svgCanvas.getCurText('font_family') as string,
            'text-anchor': 'middle',
            'xml:space': 'preserve',
            opacity: curShape.opacity
          }
        })
        // newText.textContent = 'text';
        break
      default:
        // This could occur in an extension
        break
    }
  }

  const move = (evt: MouseEvent, ctx: MoveContext): void => {
    const { shape } = ctx
    let { x, y, realX, realY } = ctx
    let cx: number, cy: number, i: number
    switch (svgCanvas.getCurrentMode()) {
      case 'text': {
        // A click places point text where it was pressed; a drag draws the box of an area text.
        const sx = svgCanvas.getStartX()
        const sy = svgCanvas.getStartY()
        const zoom = svgCanvas.getZoom()
        if (!textBoxDrag && Math.hypot(x - sx, y - sy) * zoom < TEXT_DRAG_PX) { break }
        textBoxDrag = true
        textBoxEnd = { x, y }
        if (!svgCanvas.getRubberBox()) {
          svgCanvas.setRubberBox(svgCanvas.selectorManager.getRubberBandBox())
        }
        assignAttributes(svgCanvas.requireRubberBox(), {
          x: Math.min(sx, x) * zoom,
          y: Math.min(sy, y) * zoom,
          width: Math.abs(x - sx) * zoom,
          height: Math.abs(y - sy) * zoom,
          display: 'inline'
        }, 100)
        break
      }
      case 'line': {
        if (svgCanvas.getCurConfig().gridSnapping) {
          ({ x, y } = svgCanvas.snapPointToGrid(x, y))
        }

        let x2 = x
        let y2 = y

        if (evt.shiftKey) {
          const xya = snapToAngle(svgCanvas.getStartX(), svgCanvas.getStartY(), x2, y2)
          x2 = xya.x
          y2 = xya.y
        }

        shape.setAttribute('x2', String(x2))
        shape.setAttribute('y2', String(y2))
        break
      }
      case 'foreignObject': // fall through
      case 'frame':
      case 'square':
      case 'rect':
      case 'image': {
        // For images, we maintain aspect ratio by default and relax when shift pressed
        const maintainAspectRatio = (svgCanvas.getCurrentMode() === 'square') ||
          (svgCanvas.getCurrentMode() === 'image' && !evt.shiftKey) ||
          (svgCanvas.getCurrentMode() !== 'image' && evt.shiftKey)

        let
          w = Math.abs(x - svgCanvas.getStartX())
        let h = Math.abs(y - svgCanvas.getStartY())
        let newX, newY
        if (maintainAspectRatio) {
          w = h = Math.max(w, h)
          newX = svgCanvas.getStartX() < x ? svgCanvas.getStartX() : svgCanvas.getStartX() - w
          newY = svgCanvas.getStartY() < y ? svgCanvas.getStartY() : svgCanvas.getStartY() - h
        } else {
          newX = Math.min(svgCanvas.getStartX(), x)
          newY = Math.min(svgCanvas.getStartY(), y)
        }

        if (svgCanvas.getCurConfig().gridSnapping) {
          w = svgCanvas.snapToGrid(w)
          h = svgCanvas.snapToGrid(h)
          newX = svgCanvas.snapToGrid(newX)
          newY = svgCanvas.snapToGrid(newY)
        }

        assignAttributes(shape, {
          width: w,
          height: h,
          x: newX,
          y: newY
        }, 1000)

        break
      }
      case 'circle': {
        cx = Number(shape.getAttribute('cx'))
        cy = Number(shape.getAttribute('cy'))
        let rad = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy))
        if (svgCanvas.getCurConfig().gridSnapping) {
          rad = svgCanvas.snapToGrid(rad)
        }
        shape.setAttribute('r', String(rad))
        break
      }
      case 'ellipse': {
        cx = Number(shape.getAttribute('cx'))
        cy = Number(shape.getAttribute('cy'))
        if (svgCanvas.getCurConfig().gridSnapping) {
          ({ x, y } = svgCanvas.snapPointToGrid(x, y))
          ;({ x: cx, y: cy } = svgCanvas.snapPointToGrid(cx, cy))
        }
        shape.setAttribute('rx', String(Math.abs(x - cx)))
        const ry = Math.abs(evt.shiftKey ? (x - cx) : (y - cy))
        shape.setAttribute('ry', String(ry))
        break
      }
      case 'fhellipse':
      case 'fhrect': {
        svgCanvas.setFreehand('minx', Math.min(realX, svgCanvas.getFreehand('minx')))
        svgCanvas.setFreehand('maxx', Math.max(realX, svgCanvas.getFreehand('maxx')))
        svgCanvas.setFreehand('miny', Math.min(realY, svgCanvas.getFreehand('miny')))
        svgCanvas.setFreehand('maxy', Math.max(realY, svgCanvas.getFreehand('maxy')))
      }
      // Fallthrough
      case 'fhpath': {
        // dAttr += + realX + ',' + realY + ' ';
        // shape.setAttribute('points', dAttr);
        // Low-pass filter raw pointer coords to damp hand tremor before it
        // reaches the B-spline capture below (fhellipse/fhrect fall through to
        // this case too, but they track true min/max extent above and must not
        // be lagged, so this only applies in fhpath mode itself).
        if (svgCanvas.getMode() === 'fhpath') {
          const k = svgCanvas.getCurConfig().pencilStabilization ?? 0.3
          pencilStabX = pencilStabX === null ? realX : pencilStabX * k + realX * (1 - k)
          pencilStabY = pencilStabY === null ? realY : pencilStabY * k + realY * (1 - k)
          realX = pencilStabX
          realY = pencilStabY
        }
        svgCanvas.setEnd('x', realX)
        svgCanvas.setEnd('y', realY)
        if (svgCanvas.getControllPoint2('x') && svgCanvas.getControllPoint2('y')) {
          for (i = 0; i < svgCanvas.getStepCount() - 1; i++) {
            svgCanvas.setParameter(i / svgCanvas.getStepCount())
            svgCanvas.setNextParameter((i + 1) / svgCanvas.getStepCount())
            svgCanvas.setbSpline(getBsplinePoint(svgCanvas, svgCanvas.getNextParameter()))
            svgCanvas.setNextPos({ x: svgCanvas.getbSpline('x'), y: svgCanvas.getbSpline('y') })
            svgCanvas.setbSpline(getBsplinePoint(svgCanvas, svgCanvas.getParameter()))
            svgCanvas.setSumDistance(
              svgCanvas.getSumDistance() + Math.sqrt((svgCanvas.getNextPos('x') -
                svgCanvas.getbSpline('x')) * (svgCanvas.getNextPos('x') -
                  svgCanvas.getbSpline('x')) + (svgCanvas.getNextPos('y') -
                    svgCanvas.getbSpline('y')) * (svgCanvas.getNextPos('y') - svgCanvas.getbSpline('y')))
            )
            if (svgCanvas.getSumDistance() > svgCanvas.getThreSholdDist()) {
              svgCanvas.setSumDistance(svgCanvas.getSumDistance() - svgCanvas.getThreSholdDist())

              // Faster than completely re-writing the points attribute.
              const point = svgCanvas.getSvgContent().createSVGPoint()
              point.x = svgCanvas.getbSpline('x')
              point.y = svgCanvas.getbSpline('y')
              ;(shape as SVGPolylineElement).points.appendItem(point)
            }
          }
        }
        svgCanvas.setControllPoint2('x', svgCanvas.getControllPoint1('x'))
        svgCanvas.setControllPoint2('y', svgCanvas.getControllPoint1('y'))
        svgCanvas.setControllPoint1('x', svgCanvas.getStart('x'))
        svgCanvas.setControllPoint1('y', svgCanvas.getStart('y'))
        svgCanvas.setStart({ x: svgCanvas.getEnd('x'), y: svgCanvas.getEnd('y') })
        break
        // update path stretch line coordinates
      }
      default:
        // This could occur in an extension
        break
    }
  }

  const up = (_evt: MouseEvent, ctx: UpContext): UpContext => {
    let { element, keep } = ctx
    // the element the gesture drew (`element` is what we hand back, and may become another or null)
    const source = ctx.element as Element
    switch (svgCanvas.getCurrentMode()) {
      case 'fhpath': {
        // Check that the path contains at least 2 points; a degenerate one-point path
        // causes problems.
        // Webkit ignores how we set the points attribute with commas and uses space
        // to separate all coordinates, see https://bugs.webkit.org/show_bug.cgi?id=29870
        svgCanvas.setSumDistance(0)
        svgCanvas.setControllPoint2('x', 0)
        svgCanvas.setControllPoint2('y', 0)
        svgCanvas.setControllPoint1('x', 0)
        svgCanvas.setControllPoint1('y', 0)
        svgCanvas.setStart({ x: 0, y: 0 })
        svgCanvas.setEnd('x', 0)
        svgCanvas.setEnd('y', 0)
        const coords = source.getAttribute('points') as string
        const commaIndex = coords.indexOf(',')
        keep = commaIndex >= 0 ? coords.includes(',', commaIndex + 1) : coords.includes(' ', coords.indexOf(' ') + 1)
        if (keep) {
          // Fit smooth cubics through the raw points (sharp turns stay corners; see
          // core/path-fit.js) unless disabled; falls back to the legacy
          // every-3-points smoothing inside.
          // Fidelity is screen pixels: the same stroke fits the same way at any zoom.
          const fidelity = (svgCanvas.getCurConfig().pencilFidelity as number) / (svgCanvas.getZoom() || 1)
          if (pencilEnd) {
            // Added to the path the stroke started on; nothing new is inserted.
            svgCanvas.continueFreehand(source, pencilEnd, fidelity)
            element = null
          } else {
            element = svgCanvas.getCurConfig().pencilSimplify === false
              ? svgCanvas.pathActions.smoothPolylineIntoPath(source)
              : svgCanvas.simplifyFreehand(source, fidelity)
          }
        }
        pencilEnd = null
        break
      } case 'line': {
        const x1 = source.getAttribute('x1')
        const y1 = source.getAttribute('y1')
        const x2 = source.getAttribute('x2')
        const y2 = source.getAttribute('y2')
        keep = (x1 !== x2 || y1 !== y2)
      }
        break
      case 'foreignObject':
      case 'frame':
      case 'square':
      case 'rect':
      case 'image': {
        const width = source.getAttribute('width')
        const height = source.getAttribute('height')
        // Image should be kept regardless of size (use inherit dimensions later)
        const widthNum = Number(width)
        const heightNum = Number(height)
        keep = widthNum >= 1 || heightNum >= 1 || svgCanvas.getCurrentMode() === 'image'
      }
        break
      case 'circle':
        keep = (source.getAttribute('r') !== '0')
        break
      case 'ellipse': {
        const rx = Number(source.getAttribute('rx'))
        const ry = Number(source.getAttribute('ry'))
        keep = Boolean(rx || ry)
      }
        break
      case 'fhellipse':
        if ((svgCanvas.getFreehand('maxx') - svgCanvas.getFreehand('minx')) > 0 &&
          (svgCanvas.getFreehand('maxy') - svgCanvas.getFreehand('miny')) > 0) {
          element = svgCanvas.addSVGElementsFromJson({
            element: 'ellipse',
            curStyles: true,
            attr: {
              cx: (svgCanvas.getFreehand('minx') + svgCanvas.getFreehand('maxx')) / 2,
              cy: (svgCanvas.getFreehand('miny') + svgCanvas.getFreehand('maxy')) / 2,
              rx: (svgCanvas.getFreehand('maxx') - svgCanvas.getFreehand('minx')) / 2,
              ry: (svgCanvas.getFreehand('maxy') - svgCanvas.getFreehand('miny')) / 2,
              id: svgCanvas.getId()
            }
          })
          svgCanvas.call('changed', [element])
          keep = true
        }
        break
      case 'fhrect':
        if ((svgCanvas.getFreehand('maxx') - svgCanvas.getFreehand('minx')) > 0 &&
          (svgCanvas.getFreehand('maxy') - svgCanvas.getFreehand('miny')) > 0) {
          element = svgCanvas.addSVGElementsFromJson({
            element: 'rect',
            curStyles: true,
            attr: {
              x: svgCanvas.getFreehand('minx'),
              y: svgCanvas.getFreehand('miny'),
              width: (svgCanvas.getFreehand('maxx') - svgCanvas.getFreehand('minx')),
              height: (svgCanvas.getFreehand('maxy') - svgCanvas.getFreehand('miny')),
              id: svgCanvas.getId()
            }
          })
          svgCanvas.call('changed', [element])
          keep = true
        }
        break
      case 'text':
        keep = true
        if (textBoxDrag) {
          textBoxDrag = false
          svgCanvas.getRubberBox()?.setAttribute('display', 'none')
          const size = parseFloat(source.getAttribute('font-size') ?? '') || 16
          const sx = svgCanvas.getStartX()
          const sy = svgCanvas.getStartY()
          const end = textBoxEnd
          const dragged = Math.abs(end.y - sy)
          const box = {
            x: Math.min(sx, end.x),
            y: Math.min(sy, end.y),
            width: Math.max(Math.abs(end.x - sx), size),
            // A box shorter than a row grows with its text instead of fixing the height.
            height: dragged >= size * TEXT_LINE_HEIGHT ? dragged : 0
          }
          writeAreaAttrs(source, { ...areaAttrsForBox(box, 'start', size), 'text-anchor': 'start' })
        }
        // Mark this as a freshly-placed text so lock mode can re-arm the text tool
        svgCanvas.setTextFreshCreate(true)
        svgCanvas.selectOnly([source])
        svgCanvas.textActions.start(source as SVGTextElement)
        break
      default:
        // This could occur in an extension
        break
    }
    return { element, keep }
  }

  return { down, move, up }
}
