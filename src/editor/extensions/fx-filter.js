/**
 * @file fx-filter.js
 *
 * @license Apache-2.0
 *
 * Shared per-element SVG filter composer for the editor's filter-based effects
 * (outline halo and drop shadow). An element's `filter` attribute can reference
 * only ONE filter, so outline and shadow cannot live in independent filters
 * without clobbering each other. This module owns a single per-element filter
 * and rebuilds its whole primitive chain from a combined spec:
 *
 *   { outline: { width, color, opacity } | null,
 *     shadow:  { dx, dy, blur, color, opacity } | null }
 *
 * Both ext-outline and ext-shadow funnel through it: each reads the current
 * combined spec, mutates only its own slice, and writes the whole spec back.
 * Effect blocks are identified by primitive type (no marker attribute needed),
 * so a shadow-only filter is byte-identical to what ext-shadow produced before
 * this module existed.
 *
 * Filter id is the element's currently-referenced filter when we own it
 * (so legacy `{id}_shadow` files keep their id and gain outline primitives in
 * place — no load-time migration), otherwise a fresh `{id}_fx`.
 *
 * The region uses absolute userSpaceOnUse units (not objectBoundingBox) so that
 * axis-aligned lines — whose bounding box is zero in one dimension — are not
 * clipped to invisibility; {@link createFxComposer}'s `refreshRegion` re-derives
 * it after a move.
 *
 * Composed chain when both effects are active:
 *   feMorphology(SourceAlpha, dilate, radius=width) → fx_dil
 *   feFlood(color, opacity)                          → fx_flood
 *   feComposite(in=fx_flood, in2=fx_dil, operator=in)→ fx_outline
 *   feMerge[ fx_outline, SourceGraphic ]             → fx_outlined
 *   feDropShadow(in=fx_outlined, ...)
 * Outline-only drops the shadow node; shadow-only drops the outline block and
 * the feDropShadow takes its default `in="SourceGraphic"`.
 *
 * NOTE on the outline technique: feMorphology `dilate` grows the source alpha by
 * a box kernel, so corners/ends are mildly squared-off at large widths. This is
 * intentional and visually negligible for thin lines/arrows — not a bug.
 */

/**
 * Build a shared filter composer bound to a canvas. A single instance must be
 * shared by every effect extension so they agree on the per-element filter and
 * on `prevFilterMap` (the restore-on-removal bookkeeping for a pre-existing,
 * foreign `filter`). Callers should store one instance on `svgEditor`.
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @returns {{ readEffects: Function, writeEffects: Function }}
 */
export const createFxComposer = (svgCanvas) => {
  const {
    InsertElementCommand, RemoveElementCommand, ChangeElementCommand
  } = svgCanvas.history

  // elemId → previous (foreign) filter url, restored when all effects removed.
  const prevFilterMap = {}

  /** Resolve the <filter> element an element currently references, or null. */
  const getRefFilter = (elem) => {
    const attr = elem.getAttribute('filter')
    if (!attr) return null
    const m = /url\(["']?#([^"')]+)["']?\)/.exec(attr)
    if (!m) return null
    return svgCanvas.getElement(m[1])
  }

  /** True when the referenced filter is one we manage for this element. */
  const isOurFilter = (elem, filter) =>
    !!filter && (filter.id === `${elem.id}_fx` || filter.id === `${elem.id}_shadow`)

  /**
   * Read the combined effect spec off an element's referenced filter.
   * @param {Element} elem
   * @returns {{ outline: object|null, shadow: object|null }}
   */
  const readEffects = (elem) => {
    const spec = { outline: null, shadow: null }
    if (!elem) return spec
    const filter = getRefFilter(elem)
    if (!filter) return spec
    const morph = filter.querySelector('feMorphology')
    const flood = filter.querySelector('feFlood')
    if (morph && flood) {
      spec.outline = {
        width: Number(morph.getAttribute('radius')) || 0,
        color: flood.getAttribute('flood-color') || '#000000',
        opacity: Number(flood.getAttribute('flood-opacity') ?? 1)
      }
    }
    const ds = filter.querySelector('feDropShadow')
    if (ds) {
      spec.shadow = {
        dx: Number(ds.getAttribute('dx') ?? 0),
        dy: Number(ds.getAttribute('dy') ?? 0),
        blur: Number(ds.getAttribute('stdDeviation') ?? 4),
        color: ds.getAttribute('flood-color') ?? '#000000',
        opacity: Number(ds.getAttribute('flood-opacity') ?? 0.5)
      }
    }
    return spec
  }

  /**
   * Set the filter region in absolute userSpaceOnUse units, padded for whichever
   * effect reaches furthest plus half the stroke width. objectBoundingBox can't
   * be used here: an axis-aligned line has a zero-width or zero-height bounding
   * box, which collapses a bbox-relative region to nothing and renders the
   * filtered line invisible — and lines are this feature's whole point. The
   * tradeoff is that an absolute region does not follow the element on its own;
   * {@link refreshRegion} re-derives it on move (see the extensions' mouseUp /
   * elementChanged hooks). Must be called after the element has layout.
   */
  const setRegion = (filter, elem, spec) => {
    const bbox = elem.getBBox()
    const sw = Number(elem.getAttribute('stroke-width')) || 0
    const outlinePad = spec.outline ? Math.abs(spec.outline.width) : 0
    const shadowPad = spec.shadow
      ? Math.hypot(spec.shadow.dx, spec.shadow.dy) + spec.shadow.blur * 3
      : 0
    const pad = sw / 2 + Math.max(outlinePad, shadowPad)
    filter.setAttribute('filterUnits', 'userSpaceOnUse')
    filter.setAttribute('x', String(bbox.x - pad))
    filter.setAttribute('y', String(bbox.y - pad))
    filter.setAttribute('width', String(bbox.width + pad * 2))
    filter.setAttribute('height', String(bbox.height + pad * 2))
  }

  /**
   * Re-derive the absolute filter region from the element's current geometry.
   * No-op unless the element wears one of our effect filters. Not recorded in
   * undo — the region is derived state, refreshed after a move so the filter
   * does not clip the relocated element. Safe to call repeatedly.
   * @param {Element} elem
   */
  const refreshRegion = (elem) => {
    if (!elem) return
    const filter = getRefFilter(elem)
    if (!isOurFilter(elem, filter)) return
    const spec = readEffects(elem)
    if (!spec.outline && !spec.shadow) return
    setRegion(filter, elem, spec)
  }

  /** Assemble a fresh <filter> (with children) from the spec. Detached. */
  const buildFilter = (elem, spec, filterId) => {
    const children = []
    const hasOutline = !!spec.outline
    if (hasOutline) {
      const { width, color, opacity } = spec.outline
      children.push(
        { element: 'feMorphology', attr: { in: 'SourceAlpha', operator: 'dilate', radius: String(width), result: 'fx_dil' } },
        { element: 'feFlood', attr: { 'flood-color': color, 'flood-opacity': String(opacity), result: 'fx_flood' } },
        { element: 'feComposite', attr: { in: 'fx_flood', in2: 'fx_dil', operator: 'in', result: 'fx_outline' } },
        {
          element: 'feMerge',
          attr: { result: 'fx_outlined' },
          children: [
            { element: 'feMergeNode', attr: { in: 'fx_outline' } },
            { element: 'feMergeNode', attr: { in: 'SourceGraphic' } }
          ]
        }
      )
    }
    if (spec.shadow) {
      const { dx, dy, blur, color, opacity } = spec.shadow
      const attr = {
        dx: String(dx),
        dy: String(dy),
        stdDeviation: String(blur),
        'flood-color': color,
        'flood-opacity': String(opacity)
      }
      if (hasOutline) attr.in = 'fx_outlined'
      children.push({ element: 'feDropShadow', attr })
    }
    const filter = svgCanvas.addSVGElementsFromJson({
      element: 'filter',
      attr: { id: filterId },
      children
    })
    setRegion(filter, elem, spec)
    return filter
  }

  /**
   * Apply a combined effect spec to an element, recording every change into the
   * supplied batch command (no commit, no selection assumptions). Rebuilds the
   * whole per-element filter wholesale (Remove old + Insert new) so undo is a
   * pair of element commands rather than per-primitive bookkeeping.
   * @param {Element} elem
   * @param {{ outline: object|null, shadow: object|null }} spec
   * @param {BatchCommand} batchCmd
   */
  const writeEffects = (elem, spec, batchCmd) => {
    if (!elem) return
    const elemId = elem.id
    const existing = getRefFilter(elem)
    const ours = isOurFilter(elem, existing)
    const hasAny = !!(spec.outline || spec.shadow)
    const oldFilterAttr = elem.getAttribute('filter')

    // --- Removal: no effects left ---
    if (!hasAny) {
      if (ours) {
        batchCmd.addSubCommand(new RemoveElementCommand(existing, existing.parentNode))
        existing.remove()
      }
      if (oldFilterAttr) {
        batchCmd.addSubCommand(new ChangeElementCommand(elem, { filter: oldFilterAttr }))
        const saved = prevFilterMap[elemId]
        if (saved) {
          elem.setAttribute('filter', saved)
          delete prevFilterMap[elemId]
        } else {
          elem.removeAttribute('filter')
        }
      }
      return
    }

    // --- Build / replace ---
    const filterId = ours ? existing.id : `${elemId}_fx`
    // Preserve any pre-existing foreign filter to restore on full removal.
    if (!ours && oldFilterAttr) prevFilterMap[elemId] = oldFilterAttr
    // Replace our previous filter wholesale.
    if (ours) {
      batchCmd.addSubCommand(new RemoveElementCommand(existing, existing.parentNode))
      existing.remove()
    }
    const filter = buildFilter(elem, spec, filterId)
    svgCanvas.findDefs().append(filter)
    batchCmd.addSubCommand(new InsertElementCommand(filter))
    const newFilterAttr = `url(#${filterId})`
    if (oldFilterAttr !== newFilterAttr) {
      batchCmd.addSubCommand(new ChangeElementCommand(elem, { filter: oldFilterAttr ?? '' }))
      elem.setAttribute('filter', newFilterAttr)
    }
  }

  return { readEffects, writeEffects, refreshRegion }
}
