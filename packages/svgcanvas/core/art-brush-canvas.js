/**
 * Art and pattern brushes on the canvas: the elements, the brush library and the canvas API.
 * The geometry (artwork bent along a path) is in `art-brush.js`.
 *
 * A brushed path is a group, so it renders the same anywhere:
 *
 *   <g id="…" se:art-brush="art(scale=stretch,width=100,…)">      or  pattern(scale=100,spacing=0,fit=stretch,…)
 *     <g se:art-src display="none"> <path/>…                 the artwork, in its own coordinates
 *     <g se:art-out> <path/>…                                the generated art, along the spine
 *     <path se:art-spine d="…" opacity="0"/>                 the path itself: invisible but still there to edit
 *   </g>
 *
 * The artwork is copied into each brushed group (copy / paste / another document keep working); the brush
 * **library** is the drawing's `<defs>`: `<g se:brush="art|pattern" se:brush-name="…">` holding the artwork paths.
 * Choosing a brush copies its artwork into the path's group; editing the library later does not change strokes
 * already brushed (see roadmap.md).
 *
 * The generated art is a pure function of the spine, the options and the artwork, so it is not recorded in
 * history when the spine is edited with the node editor: `refreshArtBrush` (run on every change of the spine)
 * regenerates it, and an undo of the spine edit does the same (the ext-mirror / ext-connector precedent).
 * Applying a brush, changing its options, expanding and releasing are undoable steps (`transact`).
 *
 * @module art-brush-canvas
 * @license MIT
 */

import { NS } from './namespaces.js'
import { getPathDFromElement } from './path-utils.js'
import { getTransformList, transformListToTransform, matrixMultiply } from './math.js'
import { parseAnchors, anchorsToD, sameAnchorGeometry } from './anchor-path.js'
import { registerAttrValidator } from './drawing-invariants.js'
import { LIVE_ATTRS } from './path-join.js'
import { ART_DEFAULTS, PATTERN_DEFAULTS, artAlongPath, patternAlongPath } from './art-brush.js'

export const BRUSH_ATTR = 'se:art-brush'
export const SPINE_ATTR = 'se:art-spine'
export const SRC_ATTR = 'se:art-src'
export const OUT_ATTR = 'se:art-out'
export const LIB_ATTR = 'se:brush'
export const LIB_NAME_ATTR = 'se:brush-name'
/** The spine's own opacity, kept while it is hidden (restored by release). */
const SPINE_OPACITY_ATTR = 'se:art-opacity'

/** Presentation attributes the artwork keeps. */
const STYLE_ATTRS = [
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'opacity'
]
/** Shapes that can be a spine or artwork (they have a path form). */
const SHAPES = new Set(['path', 'line', 'polyline', 'polygon', 'rect', 'ellipse', 'circle'])
/** Geometry attributes dropped when a shape becomes a path. */
const GEOMETRY_ATTRS = ['d', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'points', 'id']

const DIRS = ['ltr', 'rtl', 'ttb', 'btt']
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const flag = (v) => (v === true || v === 1 || v === '1')

/** @typedef {import('./art-brush.js').ArtPath} ArtPath */

// ---------------------------------------------------------------------------
// The `se:art-brush` attribute: `art(key=value,…)` / `pattern(key=value,…)`
// ---------------------------------------------------------------------------

/**
 * @param {?string} str
 * @returns {?{type: 'art'|'pattern', opts: Object<string, any>}} null when it is not a brush
 */
export const parseBrush = (str) => {
  const m = /^\s*(art|pattern)\s*\(([^()]*)\)\s*$/.exec(str ?? '')
  if (!m) return null
  const raw = {}
  for (const pair of m[2].split(',')) {
    const eq = pair.indexOf('=')
    if (eq > 0) raw[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
  }
  const type = /** @type {'art'|'pattern'} */ (m[1])
  return { type, opts: sanitizeOptions(type, raw) }
}

/**
 * The options of a brush type with every value checked against its range and its default.
 * @param {'art'|'pattern'} type
 * @param {Object<string, any>} [raw]
 * @returns {Object<string, any>}
 */
export const sanitizeOptions = (type, raw = {}) => {
  const num = (v, def, lo, hi) => (Number.isFinite(Number(v)) && v !== '' && v != null ? clamp(Number(v), lo, hi) : def)
  if (type === 'art') {
    const d = ART_DEFAULTS
    return {
      scale: raw.scale === 'proportional' ? 'proportional' : 'stretch',
      width: num(raw.width, d.width, 1, 1000),
      flipAlong: flag(raw.flipAlong),
      flipAcross: flag(raw.flipAcross),
      dir: DIRS.includes(raw.dir) ? raw.dir : d.dir
    }
  }
  const d = PATTERN_DEFAULTS
  return {
    scale: num(raw.scale, d.scale, 5, 1000),
    spacing: num(raw.spacing, d.spacing, 0, 1000),
    fit: ['stretch', 'addSpace', 'approximate'].includes(raw.fit) ? raw.fit : d.fit,
    flipAlong: flag(raw.flipAlong),
    flipAcross: flag(raw.flipAcross)
  }
}

/**
 * @param {'art'|'pattern'} type
 * @param {Object<string, any>} [opts]
 * @returns {string}
 */
export const formatBrush = (type, opts = {}) => {
  const o = sanitizeOptions(type, opts)
  const body = Object.entries(o).map(([k, v]) => `${k}=${typeof v === 'boolean' ? (v ? 1 : 0) : v}`).join(',')
  return `${type}(${body})`
}

// ---------------------------------------------------------------------------
// Artwork
// ---------------------------------------------------------------------------

const localMatrix = (el) => {
  const list = getTransformList(el)
  return list && list.numberOfItems ? transformListToTransform(list).matrix : null
}

/** The matrix taking `el`'s own coordinates to the drawing's (its own transform and every ancestor's). */
const matrixToContent = (el) => {
  let m = null
  for (let n = el; n && n.id !== 'svgcontent' && n.tagName !== 'svg'; n = n.parentNode) {
    const local = localMatrix(n)
    if (local) m = m ? matrixMultiply(local, m) : local
  }
  return m
}

const applyMatrix = (d, m) => {
  if (!m) return d
  const map = (pt) => ({ x: m.a * pt.x + m.c * pt.y + m.e, y: m.b * pt.x + m.d * pt.y + m.f })
  return anchorsToD(parseAnchors(d, 0.1).map((sp) => ({
    closed: sp.closed,
    anchors: sp.anchors.map((a) => ({ p: map(a.p), hIn: map(a.hIn), hOut: map(a.hOut) }))
  })))
}

const pickStyle = (el) => {
  /** @type {Object<string, string>} */
  const attrs = {}
  for (const name of STYLE_ATTRS) if (el.hasAttribute(name)) attrs[name] = el.getAttribute(name)
  return attrs
}

/**
 * The paths of some elements (groups are searched; text and images are skipped), in the drawing's coordinates,
 * with the presentation attributes to paint them.
 * @param {Element[]} elems
 * @returns {ArtPath[]}
 */
export const artPathsFromElements = (elems) => {
  /** @type {ArtPath[]} */
  const out = []
  const visit = (el) => {
    if (el.getAttribute?.('display') === 'none') return
    if (el.tagName === 'g' || el.tagName === 'a') {
      for (const child of el.children) visit(child)
    } else if (SHAPES.has(el.tagName)) {
      const d = getPathDFromElement(el)
      if (d) out.push({ d: applyMatrix(d, matrixToContent(el)), attrs: pickStyle(el) })
    }
  }
  for (const el of elems) visit(el)
  return out
}

const svgNS = (doc, tag) => doc.createElementNS(NS.SVG, tag)

/** @returns {ArtPath[]} the `<path>` children of an artwork container */
const readArtPaths = (container) => [...container.children]
  .filter((c) => c.tagName === 'path')
  .map((c) => ({ d: c.getAttribute('d') ?? '', attrs: pickStyle(c) }))

/**
 * Fill an artwork container with paths. With `newId`, each path keeps the id of the one that stood at its place
 * before (so regenerating the same art writes the same document), and new places get a fresh id.
 */
const writeArtPaths = (doc, container, paths, newId) => {
  const ids = [...container.children].map((c) => c.getAttribute('id'))
  container.replaceChildren()
  paths.forEach((p, i) => {
    const el = svgNS(doc, 'path')
    if (newId) el.setAttribute('id', ids[i] || newId())
    el.setAttribute('d', p.d)
    for (const [k, v] of Object.entries(p.attrs ?? {})) el.setAttribute(k, v)
    container.append(el)
  })
}

/**
 * Whether the paths in `container` are these paths (within the saver's rounding, which adds up along a long path).
 */
const sameArt = (container, paths) => {
  const kids = [...container.children]
  if (kids.length !== paths.length) return false
  return kids.every((el, i) => {
    const have = parseAnchors(el.getAttribute('d') ?? '', 0.1)
    const want = parseAnchors(paths[i].d, 0.1)
    const count = want.reduce((n, sp) => n + sp.anchors.length, 0)
    return sameAnchorGeometry(have, want, 0.1 + 0.01 * Math.sqrt(count))
  })
}

// ---------------------------------------------------------------------------
// A brushed group
// ---------------------------------------------------------------------------

/**
 * @param {?Element} group
 * @returns {?{group: Element, spine: Element, src: Element, out: Element}} null when it is not a complete brushed group
 */
export const brushParts = (group) => {
  if (!group || group.tagName !== 'g' || !group.hasAttribute(BRUSH_ATTR)) return null
  const kids = [...group.children]
  const spine = kids.find((c) => c.tagName === 'path' && c.hasAttribute(SPINE_ATTR))
  const src = kids.find((c) => c.tagName === 'g' && c.hasAttribute(SRC_ATTR))
  const out = kids.find((c) => c.tagName === 'g' && c.hasAttribute(OUT_ATTR))
  return spine && src && out ? { group, spine, src, out } : null
}

/**
 * The brushed group `elem` is, or the spine of.
 * @param {?Element} elem
 * @returns {?Element}
 */
export const brushGroupOf = (elem) => {
  if (!elem) return null
  const group = elem.hasAttribute?.(SPINE_ATTR) ? elem.parentNode : elem
  return brushParts(/** @type {Element} */ (group)) ? /** @type {Element} */ (group) : null
}

/** What the generated art for a group is made from: the spine, the options and the artwork. */
const signature = (p) => `${p.spine.getAttribute('d')}|${p.group.getAttribute(BRUSH_ATTR)}|${p.src.innerHTML}`

/**
 * @type {WeakMap<Element, string>} what a generated path was made from (the group's signature). Kept on the paths,
 * not the group, so that paths an undo put back still say what they belong to.
 */
const madeFrom = new WeakMap()
/**
 * @type {WeakMap<Element, Map<string, Element[]>>} the art a group had for the spines it had before, so that going
 * back to one (an undo, a redo) puts the very same paths back instead of rewriting them
 */
const earlier = new WeakMap()
const KEEP_EARLIER = 4

/**
 * The art for a group's spine.
 * @param {{group: Element, spine: Element, src: Element}} p
 * @returns {ArtPath[]}
 */
const artFor = (p) => {
  const brush = parseBrush(p.group.getAttribute(BRUSH_ATTR))
  if (!brush) return []
  const art = readArtPaths(p.src)
  const d = p.spine.getAttribute('d') ?? ''
  return brush.type === 'art' ? artAlongPath(d, art, brush.opts) : patternAlongPath(d, art, brush.opts)
}

export const init = (canvas) => {
  const svgCanvas = canvas

  registerAttrValidator(BRUSH_ATTR, (value) => (parseBrush(value) ? true : 'is not art(…) or pattern(…)'))
  registerAttrValidator(LIB_ATTR, (value) => (value === 'art' || value === 'pattern' ? true : 'is not art or pattern'))

  const getSelected = () => svgCanvas.getSelectedElements().filter(Boolean)
  const newId = () => svgCanvas.getNextId()

  /**
   * Regenerate the art of a brushed group from its spine. No history.
   * @param {Element} group
   * @param {boolean} [force] regenerate even when nothing it is made from changed
   * @returns {boolean} whether the art was rewritten
   */
  const regenerate = (group, force = false) => {
    const p = brushParts(group)
    if (!p) return false
    const sig = signature(p)
    const kids = [...p.out.children]
    const was = kids.length ? madeFrom.get(kids[0]) : undefined
    if (!force && was === sig) return false
    const mark = (nodes) => nodes.forEach((n) => madeFrom.set(n, sig))
    const kept = earlier.get(group) ?? new Map()
    earlier.set(group, kept)
    const back = !force && kept.get(sig)
    if (back) {
      if (was !== undefined) kept.set(was, kids)
      kept.delete(sig)
      p.out.replaceChildren(...back)
      return true
    }
    const art = artFor(p)
    // A drawing just loaded has no record of what its art was made from: when it is what the spine gives, leave it be.
    if (!force && was === undefined && sameArt(p.out, art)) {
      mark(kids)
      return false
    }
    if (was !== undefined) {
      kept.delete(was)
      kept.set(was, kids)
      if (kept.size > KEEP_EARLIER) kept.delete(/** @type {string} */ (kept.keys().next().value))
    }
    writeArtPaths(group.ownerDocument, p.out, art, newId)
    mark([...p.out.children])
    return true
  }

  /**
   * Keep the art of a brushed group in step with its spine: call it when an element changed (it does nothing for
   * anything but a spine or a brushed group). Not undoable by itself; the change that caused it is.
   * @param {?Element} elem
   * @returns {boolean}
   */
  const refreshArtBrush = (elem) => {
    const group = brushGroupOf(elem)
    return group ? regenerate(group) : false
  }

  // --- the library -------------------------------------------------------

  const libraryDefs = () => [...svgCanvas.findDefs().children].filter((c) => c.tagName === 'g' && c.hasAttribute(LIB_ATTR))

  /**
   * The brushes of the drawing.
   * @returns {Array<{id: string, name: string, type: 'art'|'pattern'}>}
   */
  const getArtBrushLibrary = () => libraryDefs().map((g) => ({
    id: g.id,
    name: g.getAttribute(LIB_NAME_ATTR) || g.id,
    type: g.getAttribute(LIB_ATTR) === 'pattern' ? 'pattern' : 'art'
  }))

  /**
   * Whether the selection holds artwork for a brush: at least one shape or group of shapes.
   * @returns {boolean}
   */
  const canMakeArtBrush = () => artPathsFromElements(getSelected().filter((e) => !brushGroupOf(e))).length > 0

  /**
   * Add the selected artwork to the library as a brush (one undo step).
   * @param {'art'|'pattern'} type
   * @param {string} [name]
   * @returns {?string} the new brush's id, or null when the selection has no artwork
   */
  const makeArtBrush = (type, name) => {
    const art = artPathsFromElements(getSelected().filter((e) => !brushGroupOf(e)))
    if (!art.length) return null
    const defs = svgCanvas.findDefs()
    const label = name || `${type === 'art' ? 'Art' : 'Pattern'} brush ${libraryDefs().filter((g) => g.getAttribute(LIB_ATTR) === type).length + 1}`
    return svgCanvas.transact('New brush', () => {
      const g = svgNS(defs.ownerDocument, 'g')
      g.setAttribute('id', newId())
      g.setAttribute(LIB_ATTR, type)
      g.setAttribute(LIB_NAME_ATTR, label)
      writeArtPaths(defs.ownerDocument, g, art, null)
      defs.append(g)
      return g.id
    })
  }

  /**
   * Remove a brush from the library (strokes already brushed keep their copy of the artwork).
   * @param {string} id
   * @returns {boolean}
   */
  const deleteArtBrush = (id) => {
    const def = libraryDefs().find((g) => g.id === id)
    if (!def) return false
    svgCanvas.transact('Delete brush', () => def.remove())
    return true
  }

  // --- applying -----------------------------------------------------------

  /**
   * Whether a brush can be put on this element: a path or a basic shape without live geometry, or a brushed group
   * (which takes another brush).
   * @param {?Element} elem
   * @returns {boolean}
   */
  const canApplyArtBrush = (elem) => {
    if (!elem) return false
    if (brushGroupOf(elem)) return true
    return SHAPES.has(elem.tagName) && !LIVE_ATTRS.some((a) => elem.hasAttribute(a)) && !elem.hasAttribute(SPINE_ATTR) &&
      !!getPathDFromElement(elem)
  }

  /** The element as the spine path of a new brushed group: a copy that is a `<path>`, hidden. */
  const makeSpine = (elem, doc) => {
    const spine = svgNS(doc, 'path')
    for (const attr of elem.attributes) if (!GEOMETRY_ATTRS.includes(attr.name) && attr.name !== 'transform') spine.setAttribute(attr.name, attr.value)
    spine.setAttribute('d', getPathDFromElement(elem))
    spine.setAttribute('id', newId())
    spine.setAttribute(SPINE_ATTR, '1') // not empty: the saver drops empty attributes
    if (spine.hasAttribute('opacity')) spine.setAttribute(SPINE_OPACITY_ATTR, spine.getAttribute('opacity'))
    spine.setAttribute('opacity', '0')
    return spine
  }

  const buildGroup = (elem, def, type) => {
    const doc = elem.ownerDocument
    const g = svgNS(doc, 'g')
    g.setAttribute('id', elem.id)
    if (elem.hasAttribute('transform')) g.setAttribute('transform', elem.getAttribute('transform'))
    g.setAttribute(BRUSH_ATTR, formatBrush(type))
    const src = svgNS(doc, 'g')
    src.setAttribute(SRC_ATTR, '1')
    src.setAttribute('display', 'none')
    writeArtPaths(doc, src, readArtPaths(def), null)
    const out = svgNS(doc, 'g')
    out.setAttribute(OUT_ATTR, '1')
    g.append(src, out, makeSpine(elem, doc))
    return g
  }

  /**
   * Put a library brush on the selected paths (one undo step); a brushed group takes the new artwork and keeps
   * its spine. The art's size follows the path: see the brush options.
   * @param {string} brushId
   * @returns {Element[]} the brushed groups
   */
  const applyArtBrush = (brushId) => {
    const def = libraryDefs().find((g) => g.id === brushId)
    const targets = getSelected().filter(canApplyArtBrush)
    if (!def || !targets.length) return []
    const type = def.getAttribute(LIB_ATTR) === 'pattern' ? 'pattern' : 'art'
    const done = []
    svgCanvas.transact('Apply brush', () => {
      for (const elem of targets) {
        const existing = brushGroupOf(elem)
        if (existing) {
          const p = brushParts(existing)
          writeArtPaths(existing.ownerDocument, p.src, readArtPaths(def), null)
          const was = parseBrush(existing.getAttribute(BRUSH_ATTR))
          existing.setAttribute(BRUSH_ATTR, formatBrush(type, was?.type === type ? was.opts : {}))
          regenerate(existing, true)
          done.push(existing)
          continue
        }
        const group = buildGroup(elem, def, type)
        elem.before(group)
        elem.remove()
        regenerate(group, true)
        done.push(group)
      }
    })
    if (done.length) {
      svgCanvas.selectOnly(done, true)
      svgCanvas.call('changed', done)
    }
    return done
  }

  /**
   * The brush of an element (the selection's by default): its type and options, or null.
   * @param {Element} [elem]
   * @returns {?{type: 'art'|'pattern', opts: Object<string, any>}}
   */
  const getArtBrush = (elem = getSelected()[0]) => {
    const group = brushGroupOf(elem)
    return group ? parseBrush(group.getAttribute(BRUSH_ATTR)) : null
  }

  /**
   * Change options of the selected brushed groups (one undo step); the art is regenerated.
   * @param {Object<string, any>} changes e.g. `{width: 150}`
   * @returns {Element[]}
   */
  const setArtBrushOptions = (changes) => {
    const groups = getSelected().map(brushGroupOf).filter(Boolean)
    if (!groups.length) return []
    svgCanvas.transact('Brush options', () => {
      for (const g of groups) {
        const b = parseBrush(g.getAttribute(BRUSH_ATTR))
        g.setAttribute(BRUSH_ATTR, formatBrush(b.type, { ...b.opts, ...changes }))
        regenerate(g, true)
      }
    })
    svgCanvas.call('changed', groups)
    return groups
  }

  /**
   * Turn the selected brushed groups into plain groups of paths (one undo step): the art stays, the brush goes.
   * @returns {Element[]}
   */
  const expandArtBrush = () => {
    const groups = getSelected().map(brushGroupOf).filter(Boolean)
    if (!groups.length) return []
    svgCanvas.transact('Expand brush', () => {
      for (const g of groups) {
        const p = brushParts(g)
        regenerate(g)
        g.append(...p.out.children)
        p.spine.remove()
        p.src.remove()
        p.out.remove()
        g.removeAttribute(BRUSH_ATTR)
      }
    })
    svgCanvas.selectOnly(groups, true)
    svgCanvas.call('changed', groups)
    return groups
  }

  /**
   * Turn the selected brushed groups back into their plain path (one undo step).
   * @returns {Element[]}
   */
  const releaseArtBrush = () => {
    const groups = getSelected().map(brushGroupOf).filter(Boolean)
    if (!groups.length) return []
    const paths = []
    svgCanvas.transact('Release brush', () => {
      for (const g of groups) {
        const { spine } = brushParts(g)
        spine.removeAttribute(SPINE_ATTR)
        if (spine.hasAttribute(SPINE_OPACITY_ATTR)) {
          spine.setAttribute('opacity', spine.getAttribute(SPINE_OPACITY_ATTR))
          spine.removeAttribute(SPINE_OPACITY_ATTR)
        } else {
          spine.removeAttribute('opacity')
        }
        spine.setAttribute('id', g.id)
        if (g.hasAttribute('transform')) spine.setAttribute('transform', g.getAttribute('transform'))
        g.before(spine)
        g.remove()
        paths.push(spine)
      }
    })
    svgCanvas.selectOnly(paths, true)
    svgCanvas.call('changed', paths)
    return paths
  }

  Object.assign(svgCanvas, {
    getArtBrushLibrary,
    canMakeArtBrush,
    makeArtBrush,
    deleteArtBrush,
    canApplyArtBrush,
    applyArtBrush,
    getArtBrush,
    setArtBrushOptions,
    expandArtBrush,
    releaseArtBrush,
    refreshArtBrush,
    getArtBrushGroup: brushGroupOf
  })
}
