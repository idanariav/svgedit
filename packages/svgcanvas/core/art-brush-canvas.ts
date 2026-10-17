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

import { NS } from './namespaces.ts'
import { getPathDFromElement } from './path-utils.ts'
import { getTransformList, transformListToTransform, matrixMultiply } from './math.ts'
import { parseAnchors, anchorsToD, sameAnchorGeometry } from './anchor-path.ts'
import { registerAttrValidator } from './drawing-invariants.ts'
import { LIVE_ATTRS } from './path-join.ts'
import { ART_DEFAULTS, PATTERN_DEFAULTS, artAlongPath, patternAlongPath } from './art-brush.ts'
import type { ArtPath } from './art-brush.ts'
import type { Pt } from './anchor-path.ts'
import type SvgCanvas from '../svgcanvas.ts'

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

const DIRS = ['ltr', 'rtl', 'ttb', 'btt'] as const
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
/** `v` when it is one of `list`, else `def`. */
const pick = <T extends string>(list: readonly T[], v: unknown, def: T): T => (list.includes(v as T) ? v as T : def)
const flag = (v: unknown): boolean => (v === true || v === 1 || v === '1')

type BrushType = 'art' | 'pattern'
export type BrushOptions = Record<string, unknown>
export interface BrushParts { group: Element, spine: Element, src: Element, out: Element }
interface Matrix { a: number, b: number, c: number, d: number, e: number, f: number }

// ---------------------------------------------------------------------------
// The `se:art-brush` attribute: `art(key=value,…)` / `pattern(key=value,…)`
// ---------------------------------------------------------------------------

/** @returns null when it is not a brush */
export const parseBrush = (str: string | null): { type: BrushType, opts: BrushOptions } | null => {
  const m = /^\s*(art|pattern)\s*\(([^()]*)\)\s*$/.exec(str ?? '')
  if (!m) return null
  const raw: Record<string, string> = {}
  for (const pair of m[2].split(',')) {
    const eq = pair.indexOf('=')
    if (eq > 0) raw[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
  }
  const type = m[1] as BrushType
  return { type, opts: sanitizeOptions(type, raw) }
}

/** The options of a brush type with every value checked against its range and its default. */
export const sanitizeOptions = (type: BrushType, raw: BrushOptions = {}): BrushOptions => {
  const num = (v: unknown, def: number, lo: number, hi: number): number => (Number.isFinite(Number(v)) && v !== '' && v != null ? clamp(Number(v), lo, hi) : def)
  if (type === 'art') {
    const d = ART_DEFAULTS
    return {
      scale: raw.scale === 'proportional' ? 'proportional' : 'stretch',
      width: num(raw.width, d.width, 1, 1000),
      flipAlong: flag(raw.flipAlong),
      flipAcross: flag(raw.flipAcross),
      dir: pick(DIRS, raw.dir, d.dir as (typeof DIRS)[number])
    }
  }
  const d = PATTERN_DEFAULTS
  return {
    scale: num(raw.scale, d.scale, 5, 1000),
    spacing: num(raw.spacing, d.spacing, 0, 1000),
    fit: pick(['stretch', 'addSpace', 'approximate'] as const, raw.fit, d.fit),
    flipAlong: flag(raw.flipAlong),
    flipAcross: flag(raw.flipAcross)
  }
}

export const formatBrush = (type: BrushType, opts: BrushOptions = {}): string => {
  const o = sanitizeOptions(type, opts)
  const body = Object.entries(o).map(([k, v]) => `${k}=${typeof v === 'boolean' ? (v ? 1 : 0) : v}`).join(',')
  return `${type}(${body})`
}

// ---------------------------------------------------------------------------
// Artwork
// ---------------------------------------------------------------------------

export const localMatrix = (el: Element): SVGMatrix | null => {
  const list = getTransformList(el)
  return list && list.numberOfItems ? transformListToTransform(list).matrix : null
}

/**
 * The matrix taking `el`'s own coordinates to the drawing's (its own transform and every ancestor's).
 */
const matrixToContent = (el: Element): SVGMatrix | null => {
  let m: SVGMatrix | null = null
  for (let n: Element | null = el; n && n.id !== 'svgcontent' && n.tagName !== 'svg'; n = n.parentElement) {
    const local = localMatrix(n)
    if (local) m = m ? matrixMultiply(local, m) : local
  }
  return m
}

export const applyMatrix = (d: string, m: Matrix | null): string => {
  if (!m) return d
  const map = (pt: Pt): Pt => ({ x: m.a * pt.x + m.c * pt.y + m.e, y: m.b * pt.x + m.d * pt.y + m.f })
  return anchorsToD(parseAnchors(d, 0.1).map((sp) => ({
    closed: sp.closed,
    anchors: sp.anchors.map((a) => ({ p: map(a.p), hIn: map(a.hIn), hOut: map(a.hOut) }))
  })))
}

const pickStyle = (el: Element): Record<string, string> => {
  const attrs: Record<string, string> = {}
  for (const name of STYLE_ATTRS) if (el.hasAttribute(name)) attrs[name] = el.getAttribute(name) as string
  return attrs
}

/**
 * The paths of some elements (groups are searched; text and images are skipped), in the drawing's coordinates,
 * with the presentation attributes to paint them.
 */
export const artPathsFromElements = (elems: Element[]): ArtPath[] => {
  const out: ArtPath[] = []
  const visit = (el: Element): void => {
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

const svgNS = (doc: Document, tag: string): Element => doc.createElementNS(NS.SVG, tag)

/** The `<path>` children of an artwork container. */
const readArtPaths = (container: Element): ArtPath[] => [...container.children]
  .filter((c) => c.tagName === 'path')
  .map((c) => ({ d: c.getAttribute('d') ?? '', attrs: pickStyle(c) }))

/**
 * Fill an artwork container with paths. With `newId`, each path keeps the id of the one that stood at its place
 * before (so regenerating the same art writes the same document), and new places get a fresh id.
 */
const writeArtPaths = (doc: Document, container: Element, paths: ArtPath[], newId: (() => string) | null): void => {
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
const sameArt = (container: Element, paths: ArtPath[]): boolean => {
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

/** @returns null when it is not a complete brushed group */
export const brushParts = (group: Element | null): BrushParts | null => {
  if (!group || group.tagName !== 'g' || !group.hasAttribute(BRUSH_ATTR)) return null
  const kids = [...group.children]
  const spine = kids.find((c) => c.tagName === 'path' && c.hasAttribute(SPINE_ATTR))
  const src = kids.find((c) => c.tagName === 'g' && c.hasAttribute(SRC_ATTR))
  const out = kids.find((c) => c.tagName === 'g' && c.hasAttribute(OUT_ATTR))
  return spine && src && out ? { group, spine, src, out } : null
}

/**
 * The brushed group `elem` is, or the spine of.
 */
export const brushGroupOf = (elem: Element | null | undefined): Element | null => {
  if (!elem) return null
  const group = (elem.hasAttribute?.(SPINE_ATTR) ? elem.parentNode : elem) as Element
  return brushParts(group) ? group : null
}

/**
 * What the generated art for a group is made from: the spine, the options and the artwork.
 */
const signature = (p: Pick<BrushParts, 'group' | 'spine' | 'src'>): string => `${p.spine.getAttribute('d')}|${p.group.getAttribute(BRUSH_ATTR)}|${p.src.innerHTML}`

/**
 * What a generated path was made from (the group's signature). Kept on the paths, not the group, so that paths an
 * undo put back still say what they belong to.
 */
const madeFrom = new WeakMap<Element, string>()
/**
 * The art a group had for the spines it had before, so that going back to one (an undo, a redo) puts the very same
 * paths back instead of rewriting them.
 */
const earlier = new WeakMap<Element, Map<string, Element[]>>()
const KEEP_EARLIER = 4

/** The art for a group's spine. */
const artFor = (p: Pick<BrushParts, 'group' | 'spine' | 'src'>): ArtPath[] => {
  const brush = parseBrush(p.group.getAttribute(BRUSH_ATTR))
  if (!brush) return []
  const art = readArtPaths(p.src)
  const d = p.spine.getAttribute('d') ?? ''
  return brush.type === 'art' ? artAlongPath(d, art, brush.opts) : patternAlongPath(d, art, brush.opts)
}

export const init = (canvas: SvgCanvas): void => {
  const svgCanvas = canvas

  registerAttrValidator(BRUSH_ATTR, (value) => (parseBrush(value) ? true : 'is not art(…) or pattern(…)'))
  registerAttrValidator(LIB_ATTR, (value) => (value === 'art' || value === 'pattern' ? true : 'is not art or pattern'))

  const getSelected = (): Element[] => svgCanvas.getSelectedElements().filter(Boolean)
  /** The brushed groups among the selection. */
  const selectedBrushGroups = (): Element[] => getSelected().map(brushGroupOf).filter(Boolean) as Element[]
  const newId = (): string => svgCanvas.getNextId()

  /**
   * Regenerate the art of a brushed group from its spine. No history.
   * @param force regenerate even when nothing it is made from changed
   * @returns whether the art was rewritten
   */
  const regenerate = (group: Element, force = false): boolean => {
    const p = brushParts(group)
    if (!p) return false
    const sig = signature(p)
    const kids = [...p.out.children]
    const was = kids.length ? madeFrom.get(kids[0]) : undefined
    if (!force && was === sig) return false
    const mark = (nodes: Element[]): void => nodes.forEach((n) => madeFrom.set(n, sig))
    const kept = earlier.get(group) ?? new Map<string, Element[]>()
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
      if (kept.size > KEEP_EARLIER) kept.delete(kept.keys().next().value as string)
    }
    writeArtPaths(group.ownerDocument, p.out, art, newId)
    mark([...p.out.children])
    return true
  }

  /**
   * Keep the art of a brushed group in step with its spine: call it when an element changed (it does nothing for
   * anything but a spine or a brushed group). Not undoable by itself; the change that caused it is.
   */
  const refreshArtBrush = (elem: Element | null): boolean => {
    const group = brushGroupOf(elem)
    return group ? regenerate(group) : false
  }

  // --- the library -------------------------------------------------------

  const libraryDefs = (): Element[] => [...svgCanvas.findDefs().children].filter((c) => c.tagName === 'g' && c.hasAttribute(LIB_ATTR))

  /** The brushes of the drawing. */
  const getArtBrushLibrary = (): Array<{ id: string, name: string, type: BrushType }> => libraryDefs().map((g) => ({
    id: g.id,
    name: g.getAttribute(LIB_NAME_ATTR) || g.id,
    type: g.getAttribute(LIB_ATTR) === 'pattern' ? 'pattern' as const : 'art' as const
  }))

  /**
   * Whether the selection holds artwork for a brush: at least one shape or group of shapes.
   */
  const canMakeArtBrush = (): boolean => artPathsFromElements(getSelected().filter((e) => !brushGroupOf(e))).length > 0

  /**
   * Add the selected artwork to the library as a brush (one undo step).
   * @returns the new brush's id, or null when the selection has no artwork
   */
  const makeArtBrush = (type: BrushType, name?: string): string | null => {
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
   */
  const deleteArtBrush = (id: string): boolean => {
    const def = libraryDefs().find((g) => g.id === id)
    if (!def) return false
    svgCanvas.transact('Delete brush', () => def.remove())
    return true
  }

  // --- applying -----------------------------------------------------------

  /**
   * Whether a brush can be put on this element: a path or a basic shape without live geometry, or a brushed group
   * (which takes another brush).
   */
  const canApplyArtBrush = (elem: Element | null): boolean => {
    if (!elem) return false
    if (brushGroupOf(elem)) return true
    return SHAPES.has(elem.tagName) && !LIVE_ATTRS.some((a) => elem.hasAttribute(a)) && !elem.hasAttribute(SPINE_ATTR) &&
      !!getPathDFromElement(elem)
  }

  /**
   * The element as the spine path of a new brushed group: a copy that is a `<path>`, hidden.
   */
  const makeSpine = (elem: Element, doc: Document): Element => {
    const spine = svgNS(doc, 'path')
    for (const attr of elem.attributes) if (!GEOMETRY_ATTRS.includes(attr.name) && attr.name !== 'transform') spine.setAttribute(attr.name, attr.value)
    spine.setAttribute('d', getPathDFromElement(elem) as string)
    spine.setAttribute('id', newId())
    spine.setAttribute(SPINE_ATTR, '1') // not empty: the saver drops empty attributes
    if (spine.hasAttribute('opacity')) spine.setAttribute(SPINE_OPACITY_ATTR, spine.getAttribute('opacity') as string)
    spine.setAttribute('opacity', '0')
    return spine
  }

  const buildGroup = (elem: Element, def: Element, type: BrushType): Element => {
    const doc = elem.ownerDocument
    const g = svgNS(doc, 'g')
    g.setAttribute('id', elem.id)
    if (elem.hasAttribute('transform')) g.setAttribute('transform', elem.getAttribute('transform') as string)
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
   * @returns the brushed groups
   */
  const applyArtBrush = (brushId: string): Element[] => {
    const def = libraryDefs().find((g) => g.id === brushId)
    const targets = getSelected().filter(canApplyArtBrush)
    if (!def || !targets.length) return []
    const type = def.getAttribute(LIB_ATTR) === 'pattern' ? 'pattern' : 'art'
    const done: Element[] = []
    svgCanvas.transact('Apply brush', () => {
      for (const elem of targets) {
        const existing = brushGroupOf(elem)
        if (existing) {
          const p = brushParts(existing) as BrushParts
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
   */
  const getArtBrush = (elem: Element = getSelected()[0]): { type: BrushType, opts: BrushOptions } | null => {
    const group = brushGroupOf(elem)
    return group ? parseBrush(group.getAttribute(BRUSH_ATTR)) : null
  }

  /**
   * Change options of the selected brushed groups (one undo step); the art is regenerated.
   * @param changes e.g. `{width: 150}`
   */
  const setArtBrushOptions = (changes: BrushOptions): Element[] => {
    const groups = selectedBrushGroups()
    if (!groups.length) return []
    svgCanvas.transact('Brush options', () => {
      for (const g of groups) {
        const b = parseBrush(g.getAttribute(BRUSH_ATTR))
        if (!b) continue
        g.setAttribute(BRUSH_ATTR, formatBrush(b.type, { ...b.opts, ...changes }))
        regenerate(g, true)
      }
    })
    svgCanvas.call('changed', groups)
    return groups
  }

  /**
   * Turn the selected brushed groups into plain groups of paths (one undo step): the art stays, the brush goes.
   */
  const expandArtBrush = (): Element[] => {
    const groups = selectedBrushGroups()
    if (!groups.length) return []
    svgCanvas.transact('Expand brush', () => {
      for (const g of groups) {
        const p = brushParts(g) as BrushParts
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
   */
  const releaseArtBrush = (): Element[] => {
    const groups = selectedBrushGroups()
    if (!groups.length) return []
    const paths: Element[] = []
    svgCanvas.transact('Release brush', () => {
      for (const g of groups) {
        const { spine } = brushParts(g) as BrushParts
        spine.removeAttribute(SPINE_ATTR)
        if (spine.hasAttribute(SPINE_OPACITY_ATTR)) {
          spine.setAttribute('opacity', spine.getAttribute(SPINE_OPACITY_ATTR) as string)
          spine.removeAttribute(SPINE_OPACITY_ATTR)
        } else {
          spine.removeAttribute('opacity')
        }
        spine.setAttribute('id', g.id)
        if (g.hasAttribute('transform')) spine.setAttribute('transform', g.getAttribute('transform') as string)
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
