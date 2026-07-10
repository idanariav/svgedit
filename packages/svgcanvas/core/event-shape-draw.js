/**
 * Shape-creation mode mouse handlers, extracted from the
 * rect/square/frame/foreignObject/image/circle/ellipse/line/text/
 * fhellipse/fhrect/fhpath cases of `event.js`'s mouseDown/mouseMove/mouseUp
 * switches. Each handler runs its own internal switch reproducing the
 * original grouped case labels (and fallthrough) verbatim.
 * @module event-shape-draw
 * @license MIT
 */
import { assignAttributes, snapToGrid, snapPointToGrid, preventClickDefault, setHref } from './dom-utils.js'
import { snapToAngle } from './math.js'

/**
 * Cubic B-spline point used to smooth the freehand pencil stroke as it's
 * drawn (fhpath mouseMove).
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @param {Float} t
 * @returns {{x: Float, y: Float}}
 */
const getBsplinePoint = (svgCanvas, t) => {
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
 * @function module:event-shape-draw.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {{down: Function, move: Function, up: Function}}
 */
export const init = (canvas) => {
  const svgCanvas = canvas
  // Real-time jitter stabilization for the freehand pencil tool (EMA low-pass
  // filter on raw pointer coordinates, applied before the B-spline capture
  // below). Reset per-stroke in the fhpath mousedown case.
  let pencilStabX = null
  let pencilStabY = null

  const down = (evt, ctx) => {
    const { x, y, realX, realY, curShape } = ctx
    switch (svgCanvas.getCurrentMode()) {
      case 'fhellipse':
      case 'fhrect':
      case 'fhpath':
        pencilStabX = null
        pencilStabY = null
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
            points: svgCanvas.getDAttr(),
            id: svgCanvas.getNextId('polyline'),
            fill: 'none',
            opacity: curShape.opacity / 2,
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
            opacity: curShape.opacity / 2,
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
            id: svgCanvas.getNextId('rect'),
            opacity: curShape.opacity / 2
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
            id: svgCanvas.getNextId('line'),
            stroke: curShape.stroke,
            'stroke-width': strokeW,
            'stroke-dasharray': curShape.stroke_dasharray,
            'stroke-linejoin': curShape.stroke_linejoin,
            'stroke-linecap': curShape.stroke_linecap,
            'stroke-opacity': curShape.stroke_opacity,
            fill: 'none',
            opacity: curShape.opacity / 2,
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
            id: svgCanvas.getNextId('circle'),
            opacity: curShape.opacity / 2
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
            id: svgCanvas.getNextId('ellipse'),
            opacity: curShape.opacity / 2
          }
        })
        break
      case 'text':
        svgCanvas.setStarted(true)
        /* const newText = */ svgCanvas.addSVGElementsFromJson({
          element: 'text',
          curStyles: true,
          attr: {
            x,
            y,
            id: svgCanvas.getNextId('text'),
            fill: svgCanvas.getCurText('fill'),
            'stroke-width': svgCanvas.getCurText('stroke_width'),
            'font-size': svgCanvas.getCurText('font_size'),
            'font-family': svgCanvas.getCurText('font_family'),
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

  const move = (evt, ctx) => {
    const { shape } = ctx
    let { x, y, realX, realY } = ctx
    let cx, cy, i
    switch (svgCanvas.getCurrentMode()) {
      case 'text': {
        assignAttributes(shape, {
          x,
          y
        }, 1000)
        break
      }
      case 'line': {
        if (svgCanvas.getCurConfig().gridSnapping) {
          ({ x, y } = snapPointToGrid(x, y))
        }

        let x2 = x
        let y2 = y

        if (evt.shiftKey) {
          const xya = snapToAngle(svgCanvas.getStartX(), svgCanvas.getStartY(), x2, y2)
          x2 = xya.x
          y2 = xya.y
        }

        shape.setAttribute('x2', x2)
        shape.setAttribute('y2', y2)
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
          w = snapToGrid(w)
          h = snapToGrid(h)
          newX = snapToGrid(newX)
          newY = snapToGrid(newY)
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
          rad = snapToGrid(rad)
        }
        shape.setAttribute('r', rad)
        break
      }
      case 'ellipse': {
        cx = Number(shape.getAttribute('cx'))
        cy = Number(shape.getAttribute('cy'))
        if (svgCanvas.getCurConfig().gridSnapping) {
          ({ x, y } = snapPointToGrid(x, y))
          ;({ x: cx, y: cy } = snapPointToGrid(cx, cy))
        }
        shape.setAttribute('rx', Math.abs(x - cx))
        const ry = Math.abs(evt.shiftKey ? (x - cx) : (y - cy))
        shape.setAttribute('ry', ry)
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
              shape.points.appendItem(point)
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

  const up = (evt, ctx) => {
    let { element, keep } = ctx
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
        const coords = element.getAttribute('points')
        const commaIndex = coords.indexOf(',')
        keep = commaIndex >= 0 ? coords.includes(',', commaIndex + 1) : coords.includes(' ', coords.indexOf(' ') + 1)
        if (keep) {
          // Fit smooth cubics through the raw points (paper.js simplify) unless
          // disabled; falls back to the legacy every-3-points smoothing inside.
          element = svgCanvas.getCurConfig().pencilSimplify === false
            ? svgCanvas.pathActions.smoothPolylineIntoPath(element)
            : svgCanvas.simplifyFreehand(element, svgCanvas.getCurConfig().pencilSimplifyTolerance)
        }
        break
      } case 'line': {
        const x1 = element.getAttribute('x1')
        const y1 = element.getAttribute('y1')
        const x2 = element.getAttribute('x2')
        const y2 = element.getAttribute('y2')
        keep = (x1 !== x2 || y1 !== y2)
      }
        break
      case 'foreignObject':
      case 'frame':
      case 'square':
      case 'rect':
      case 'image': {
        const width = element.getAttribute('width')
        const height = element.getAttribute('height')
        // Image should be kept regardless of size (use inherit dimensions later)
        const widthNum = Number(width)
        const heightNum = Number(height)
        keep = widthNum >= 1 || heightNum >= 1 || svgCanvas.getCurrentMode() === 'image'
      }
        break
      case 'circle':
        keep = (element.getAttribute('r') !== '0')
        break
      case 'ellipse': {
        const rx = Number(element.getAttribute('rx'))
        const ry = Number(element.getAttribute('ry'))
        keep = (rx || ry)
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
        // Mark this as a freshly-placed text so lock mode can re-arm the text tool
        svgCanvas.setTextFreshCreate(true)
        svgCanvas.selectOnly([element])
        svgCanvas.textActions.start(element)
        break
      default:
        // This could occur in an extension
        break
    }
    return { element, keep }
  }

  return { down, move, up }
}
