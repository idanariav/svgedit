/**
 * Replacement for the deprecated `SVGPathSeg`/`SVGPathSegList` DOM API,
 * removed from browsers around 2016 and previously restored here via the
 * `pathseg` npm polyfill. That polyfill patched the browser's own path
 * parser back in; this module instead backs the same interface with the
 * `svgpath` package's `d`-string parser/serializer, so it works identically
 * regardless of what any given browser natively supports (native
 * `pathSegList` is gone everywhere, and native `getPathData`/`setPathData`
 * — the SVG2 replacement — isn't shipped in Chromium yet).
 *
 * Self-installing: importing this module for its side effect patches
 * `SVGPathElement.prototype` with `pathSegList` and the 19 `createSVGPathSeg*`
 * factories, and defines a `window.SVGPathSeg` constants object, matching
 * the exact surface `path-actions.js`, `path.js`, `path-method.js`,
 * `corner-radius.js`, `bbox-utils.js`, and `coords.js` already call.
 *
 * @module path-seg-shim
 * @license MIT
 */

import SvgPath from 'svgpath'

const TYPE_TO_CMD = {
  1: 'Z',
  2: 'M',
  3: 'm',
  4: 'L',
  5: 'l',
  6: 'C',
  7: 'c',
  8: 'Q',
  9: 'q',
  10: 'A',
  11: 'a',
  12: 'H',
  13: 'h',
  14: 'V',
  15: 'v',
  16: 'S',
  17: 's',
  18: 'T',
  19: 't'
}

const CMD_TO_TYPE = Object.fromEntries(
  Object.entries(TYPE_TO_CMD).map(([k, v]) => [v, Number(k)])
)

// Argument order for each `createSVGPathSeg*` factory, matching the
// `pathseg` polyfill's constructors (e.g. `createSVGPathSegArcAbs(x, y, r1,
// r2, angle, largeArcFlag, sweepFlag)`), keyed by numeric segment type.
const FACTORY_PROPS = {
  1: [],
  2: ['x', 'y'],
  3: ['x', 'y'],
  4: ['x', 'y'],
  5: ['x', 'y'],
  6: ['x', 'y', 'x1', 'y1', 'x2', 'y2'],
  7: ['x', 'y', 'x1', 'y1', 'x2', 'y2'],
  8: ['x', 'y', 'x1', 'y1'],
  9: ['x', 'y', 'x1', 'y1'],
  10: ['x', 'y', 'r1', 'r2', 'angle', 'largeArcFlag', 'sweepFlag'],
  11: ['x', 'y', 'r1', 'r2', 'angle', 'largeArcFlag', 'sweepFlag'],
  12: ['x'],
  13: ['x'],
  14: ['y'],
  15: ['y'],
  16: ['x', 'y', 'x2', 'y2'],
  17: ['x', 'y', 'x2', 'y2'],
  18: ['x', 'y'],
  19: ['x', 'y']
}

const TYPE_TO_SUFFIX = {
  1: 'ClosePath',
  2: 'MovetoAbs',
  3: 'MovetoRel',
  4: 'LinetoAbs',
  5: 'LinetoRel',
  6: 'CurvetoCubicAbs',
  7: 'CurvetoCubicRel',
  8: 'CurvetoQuadraticAbs',
  9: 'CurvetoQuadraticRel',
  10: 'ArcAbs',
  11: 'ArcRel',
  12: 'LinetoHorizontalAbs',
  13: 'LinetoHorizontalRel',
  14: 'LinetoVerticalAbs',
  15: 'LinetoVerticalRel',
  16: 'CurvetoCubicSmoothAbs',
  17: 'CurvetoCubicSmoothRel',
  18: 'CurvetoQuadraticSmoothAbs',
  19: 'CurvetoQuadraticSmoothRel'
}

class PathSegListShim {
  constructor (elem) {
    this.elem = elem
    this._cachedD = null
    this._cachedEntries = null
  }

  // Parses `d` via `svgpath` into `{type, values}` entries — the same shape
  // the native (Firefox-only, as of writing) `getPathData()` returns, which
  // is why `_entryToSeg`/`_segToEntry` below need no knowledge of `svgpath`.
  // Cached on the last-seen `d` string so a loop of `getItem()` calls (every
  // call site iterates the whole list) doesn't re-parse per item.
  _getData () {
    const d = this.elem.getAttribute('d') || ''
    if (d === this._cachedD && this._cachedEntries) {
      return this._cachedEntries
    }
    const { segments } = new SvgPath(d)
    const entries = (segments || []).map(([type, ...values]) => ({ type, values }))
    this._cachedD = d
    this._cachedEntries = entries
    return entries
  }

  _setData (entries) {
    const d = entries.map(({ type, values }) => [type, ...values].join(' ')).join(' ')
    this._cachedEntries = entries
    this._cachedD = d
    this.elem.setAttribute('d', d)
  }

  _entryToSeg (entry) {
    const { type, values = [] } = entry
    const cmd = CMD_TO_TYPE[type] || CMD_TO_TYPE[type?.toUpperCase?.()]
    const seg = { pathSegType: cmd, pathSegTypeAsLetter: TYPE_TO_CMD[cmd] || type }
    const U = String(type).toUpperCase()
    switch (U) {
      case 'H':
        [seg.x] = values
        break
      case 'V':
        [seg.y] = values
        break
      case 'M':
      case 'L':
      case 'T':
        [seg.x, seg.y] = values
        break
      case 'S':
        [seg.x2, seg.y2, seg.x, seg.y] = values
        break
      case 'C':
        [seg.x1, seg.y1, seg.x2, seg.y2, seg.x, seg.y] = values
        break
      case 'Q':
        [seg.x1, seg.y1, seg.x, seg.y] = values
        break
      case 'A':
        [
          seg.r1,
          seg.r2,
          seg.angle,
          seg.largeArcFlag,
          seg.sweepFlag,
          seg.x,
          seg.y
        ] = values
        break
      default:
        break
    }
    return seg
  }

  _segToEntry (seg) {
    const type = TYPE_TO_CMD[seg.pathSegType] || seg.type
    if (!type) {
      return { type: 'Z', values: [] }
    }
    const U = String(type).toUpperCase()
    let values = []
    switch (U) {
      case 'H':
        values = [seg.x]
        break
      case 'V':
        values = [seg.y]
        break
      case 'M':
      case 'L':
      case 'T':
        values = [seg.x, seg.y]
        break
      case 'S':
        values = [seg.x2, seg.y2, seg.x, seg.y]
        break
      case 'C':
        values = [seg.x1, seg.y1, seg.x2, seg.y2, seg.x, seg.y]
        break
      case 'Q':
        values = [seg.x1, seg.y1, seg.x, seg.y]
        break
      case 'A':
        values = [
          seg.r1,
          seg.r2,
          seg.angle,
          Number(seg.largeArcFlag),
          Number(seg.sweepFlag),
          seg.x,
          seg.y
        ]
        break
      default:
        values = []
    }
    return { type, values }
  }

  get numberOfItems () {
    return this._getData().length
  }

  getItem (index) {
    const entry = this._getData()[index]
    return entry ? this._entryToSeg(entry) : null
  }

  replaceItem (seg, index) {
    const data = this._getData()
    data[index] = this._segToEntry(seg)
    this._setData(data)
    return seg
  }

  insertItemBefore (seg, index) {
    const data = this._getData()
    data.splice(index, 0, this._segToEntry(seg))
    this._setData(data)
    return seg
  }

  appendItem (seg) {
    const data = this._getData()
    data.push(this._segToEntry(seg))
    this._setData(data)
    return seg
  }

  removeItem (index) {
    const data = this._getData()
    data.splice(index, 1)
    this._setData(data)
  }

  clear () {
    this._setData([])
  }
}

if (
  typeof window !== 'undefined' &&
  typeof SVGPathElement !== 'undefined' &&
  !('pathSegList' in SVGPathElement.prototype)
) {
  if (!('SVGPathSeg' in window)) {
    window.SVGPathSeg = {
      PATHSEG_UNKNOWN: 0,
      PATHSEG_CLOSEPATH: 1,
      PATHSEG_MOVETO_ABS: 2,
      PATHSEG_MOVETO_REL: 3,
      PATHSEG_LINETO_ABS: 4,
      PATHSEG_LINETO_REL: 5,
      PATHSEG_CURVETO_CUBIC_ABS: 6,
      PATHSEG_CURVETO_CUBIC_REL: 7,
      PATHSEG_CURVETO_QUADRATIC_ABS: 8,
      PATHSEG_CURVETO_QUADRATIC_REL: 9,
      PATHSEG_ARC_ABS: 10,
      PATHSEG_ARC_REL: 11,
      PATHSEG_LINETO_HORIZONTAL_ABS: 12,
      PATHSEG_LINETO_HORIZONTAL_REL: 13,
      PATHSEG_LINETO_VERTICAL_ABS: 14,
      PATHSEG_LINETO_VERTICAL_REL: 15,
      PATHSEG_CURVETO_CUBIC_SMOOTH_ABS: 16,
      PATHSEG_CURVETO_CUBIC_SMOOTH_REL: 17,
      PATHSEG_CURVETO_QUADRATIC_SMOOTH_ABS: 18,
      PATHSEG_CURVETO_QUADRATIC_SMOOTH_REL: 19
    }
  }

  Object.defineProperty(SVGPathElement.prototype, 'pathSegList', {
    get () {
      if (!this._pathSegListShim) {
        this._pathSegListShim = new PathSegListShim(this)
      }
      return this._pathSegListShim
    }
  })

  Object.entries(TYPE_TO_SUFFIX).forEach(([typeStr, suffix]) => {
    const type = Number(typeStr)
    const props = FACTORY_PROPS[type]
    const letter = TYPE_TO_CMD[type]
    SVGPathElement.prototype['createSVGPathSeg' + suffix] = function (...args) {
      const seg = { pathSegType: type, pathSegTypeAsLetter: letter }
      props.forEach((prop, i) => { seg[prop] = args[i] })
      return seg
    }
  })
}
