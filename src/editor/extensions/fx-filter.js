/**
 * @file fx-filter.js
 *
 * @license Apache-2.0
 *
 * Shared per-element SVG filter composer for the editor's filter-based effects
 * (outline halo, outer/inner glow and drop shadow). An element's `filter` attribute can reference
 * only ONE filter, so outline and shadow cannot live in independent filters
 * without clobbering each other. This module owns a single per-element filter
 * and rebuilds its whole primitive chain from a combined spec:
 *
 *   { feather: { radius } | null,
 *     outline: { width, color, opacity } | null,
 *     glow:    { outer: { blur, color, opacity } | null,
 *                inner: { blur, color, opacity, source: 'edge' | 'centre' } | null },
 *     shadow:  { dx, dy, blur, color, opacity } | null }
 *
 * (`glow` and `feather` may be omitted by callers: they read as "off".) ext-outline,
 * ext-glow and ext-shadow all funnel through it: each reads the current
 * combined spec, mutates only its own slice, and writes the whole spec back.
 * Effect blocks are identified by primitive type / `result` name (no marker
 * attribute needed), so a shadow-only filter is byte-identical to what
 * ext-shadow produced before this module existed, and so is an outline-only one.
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
 * Composed chain when every effect is active:
 *   feather:    feGaussianBlur(SourceAlpha, σ=radius/2)  → fx_feather_soft
 *               feComposite(SourceGraphic in soft)       → fx_feather_mul
 *               feComposite(mul in SourceAlpha)          → fx_feathered
 *   (with a feather, `fx_feathered` stands in for SourceGraphic AND SourceAlpha
 *   in every block below, so the outline, glows and shadow follow the soft edge)
 *   feMorphology(SourceAlpha, dilate, radius=width) → fx_dil
 *   feFlood(color, opacity)                          → fx_flood
 *   feComposite(in=fx_flood, in2=fx_dil, operator=in)→ fx_outline
 *   feMerge[ fx_outline, SourceGraphic ]             → fx_outlined
 *   outer glow: feGaussianBlur(fx_outlined, σ=blur/2)→ fx_oglow_blur
 *               feFlood                              → fx_oglow_flood
 *               feComposite(flood in blur)           → fx_oglow
 *               feMerge[ fx_oglow, fx_outlined ]     → fx_oglowed   (under)
 *   inner glow: [feComponentTransfer(SourceAlpha, 1→0) → fx_iglow_inv  (edge only)]
 *               feGaussianBlur(inv | SourceAlpha, σ) → fx_iglow_blur
 *               feFlood                              → fx_iglow_flood
 *               feComposite(flood in blur)           → fx_iglow_col
 *               feComposite(col in SourceAlpha)      → fx_iglow
 *               feMerge[ <stack so far>, fx_iglow ]  → fx_iglowed   (over)
 *   feDropShadow(in=<last result>, ...)
 * Each block is dropped when its effect is off; with no outline or glow the
 * feDropShadow takes its default `in="SourceGraphic"`. Every glow primitive has
 * a distinct `result` so reading the filter back never confuses the glow's
 * flood/blur with the outline's. A filter with a glow or feather gets
 * `color-interpolation-filters="sRGB"` (it changes blur falloff, so existing
 * outline/shadow filters are left untouched). The shadow is cast by the whole
 * merged result, glow included. Glow follows VectorCraft's SVG export
 * (`crates/svg/src/export.rs`); the blend is normal, not screen, since a
 * filter cannot blend with what is behind the element.
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

  /**
   * True when the referenced filter is one we manage for this element.
   * Ownership is marked by the `data-fx` attribute stamped in {@link buildFilter}
   * so it survives a duplicate/paste that gives the filter a fresh id (an
   * id-suffix check alone breaks the moment the filter's id no longer matches
   * `${elem.id}_fx`, e.g. after cloning) — the `${elem.id}_...` suffix check is
   * kept only as a fallback for filters saved before this attribute existed,
   * until the next load-time pass (svg-exec's convertDropShadowFilters) stamps
   * them too.
   */
  const isOurFilter = (elem, filter) =>
    !!filter && (filter.hasAttribute('data-fx') || filter.id === `${elem.id}_fx` || filter.id === `${elem.id}_shadow`)

  const featherOf = (spec) => (spec.feather && spec.feather.radius > 0 ? spec.feather : null)

  const hasEffects = (spec) => {
    const { outer, inner } = glowOf(spec)
    return !!(spec.outline || spec.shadow || outer || inner || featherOf(spec))
  }

  /** A filter child by its `result` name. */
  const byResult = (filter, tag, result) =>
    [...filter.querySelectorAll(tag)].find((el) => el.getAttribute('result') === result) || null

  /** The outer / inner glow of a spec (callers may omit `glow`). */
  const glowOf = (spec) => ({ outer: spec.glow?.outer || null, inner: spec.glow?.inner || null })

  /**
   * Read the combined effect spec off an element's referenced filter.
   * @param {Element} elem
   * @returns {{ feather: object|null, outline: object|null, glow: { outer: object|null, inner: object|null }, shadow: object|null }}
   */
  const readEffects = (elem) => {
    const spec = { feather: null, outline: null, glow: { outer: null, inner: null }, shadow: null }
    if (!elem) return spec
    const filter = getRefFilter(elem)
    if (!filter) return spec
    const morph = filter.querySelector('feMorphology')
    // The outline's flood is `fx_flood`; never take "the first feFlood" — a
    // glow's flood may come first. (Older filters without result names fall
    // back to the first flood that is not a glow's.)
    const flood = byResult(filter, 'feFlood', 'fx_flood') ||
      [...filter.querySelectorAll('feFlood')].find((el) => !/^fx_[oi]glow/.test(el.getAttribute('result') || ''))
    const soft = byResult(filter, 'feGaussianBlur', 'fx_feather_soft')
    if (soft) spec.feather = { radius: (Number(soft.getAttribute('stdDeviation')) || 0) * 2 }
    const oFlood = byResult(filter, 'feFlood', 'fx_oglow_flood')
    const oBlur = byResult(filter, 'feGaussianBlur', 'fx_oglow_blur')
    if (oFlood && oBlur) {
      spec.glow.outer = {
        blur: (Number(oBlur.getAttribute('stdDeviation')) || 0) * 2,
        color: oFlood.getAttribute('flood-color') || '#ffff00',
        opacity: Number(oFlood.getAttribute('flood-opacity') ?? 1)
      }
    }
    const iFlood = byResult(filter, 'feFlood', 'fx_iglow_flood')
    const iBlur = byResult(filter, 'feGaussianBlur', 'fx_iglow_blur')
    if (iFlood && iBlur) {
      spec.glow.inner = {
        blur: (Number(iBlur.getAttribute('stdDeviation')) || 0) * 2,
        color: iFlood.getAttribute('flood-color') || '#ffffff',
        opacity: Number(iFlood.getAttribute('flood-opacity') ?? 1),
        source: byResult(filter, 'feComponentTransfer', 'fx_iglow_inv') ? 'edge' : 'centre'
      }
    }
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
    // A missing stroke-width means the SVG initial value of 1, not 0 —
    // cleanupElement strips the attribute at that value.
    const swAttr = elem.getAttribute('stroke-width')
    const sw = swAttr === null ? 1 : (Number(swAttr) || 0)
    const outlinePad = spec.outline ? Math.abs(spec.outline.width) : 0
    const shadowPad = spec.shadow
      ? Math.hypot(spec.shadow.dx, spec.shadow.dy) + spec.shadow.blur * 3
      : 0
    // Glow reaches 3σ = 1.5 × blur past what it is blurred from (the outlined
    // shape for an outer glow); an edge-sourced inner glow blurs the *inverted*
    // alpha, which needs that much room outside the shape too. The shadow is
    // cast by the shape plus its outer glow.
    const { outer, inner } = glowOf(spec)
    const outerPad = outer ? outer.blur * 1.5 : 0
    const innerPad = inner && inner.source === 'edge' ? inner.blur * 1.5 : 0
    const pad = sw / 2 + Math.max(outlinePad + outerPad, innerPad, shadowPad + outerPad)
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
    if (!hasEffects(spec)) return
    setRegion(filter, elem, spec)
  }

  /** Assemble a fresh <filter> (with children) from the spec. Detached. */
  const buildFilter = (elem, spec, filterId) => {
    const children = []
    const { outer, inner } = glowOf(spec)
    const feather = featherOf(spec)
    // The object's own image and alpha: the originals, or the feathered result.
    const graphic = feather ? 'fx_feathered' : 'SourceGraphic'
    const alpha = feather ? 'fx_feathered' : 'SourceAlpha'
    // Name of the newest merged image: the input of the next block (and of the
    // drop shadow). null = nothing yet, i.e. the plain SourceGraphic.
    let last = null
    if (feather) {
      // Fade the edge inward: the shape times its own blurred alpha, clipped to the shape.
      children.push(
        { element: 'feGaussianBlur', attr: { in: 'SourceAlpha', stdDeviation: String(feather.radius / 2), result: 'fx_feather_soft' } },
        { element: 'feComposite', attr: { in: 'SourceGraphic', in2: 'fx_feather_soft', operator: 'in', result: 'fx_feather_mul' } },
        { element: 'feComposite', attr: { in: 'fx_feather_mul', in2: 'SourceAlpha', operator: 'in', result: 'fx_feathered' } }
      )
      last = 'fx_feathered'
    }
    if (spec.outline) {
      const { width, color, opacity } = spec.outline
      children.push(
        { element: 'feMorphology', attr: { in: alpha, operator: 'dilate', radius: String(width), result: 'fx_dil' } },
        { element: 'feFlood', attr: { 'flood-color': color, 'flood-opacity': String(opacity), result: 'fx_flood' } },
        { element: 'feComposite', attr: { in: 'fx_flood', in2: 'fx_dil', operator: 'in', result: 'fx_outline' } },
        {
          element: 'feMerge',
          attr: { result: 'fx_outlined' },
          children: [
            { element: 'feMergeNode', attr: { in: 'fx_outline' } },
            { element: 'feMergeNode', attr: { in: graphic } }
          ]
        }
      )
      last = 'fx_outlined'
    }
    if (outer) {
      // Blurred, coloured silhouette painted under what is there so far.
      children.push(
        { element: 'feGaussianBlur', attr: { in: last || alpha, stdDeviation: String(outer.blur / 2), result: 'fx_oglow_blur' } },
        { element: 'feFlood', attr: { 'flood-color': outer.color, 'flood-opacity': String(outer.opacity), result: 'fx_oglow_flood' } },
        { element: 'feComposite', attr: { in: 'fx_oglow_flood', in2: 'fx_oglow_blur', operator: 'in', result: 'fx_oglow' } },
        {
          element: 'feMerge',
          attr: { result: 'fx_oglowed' },
          children: [
            { element: 'feMergeNode', attr: { in: 'fx_oglow' } },
            { element: 'feMergeNode', attr: { in: last || graphic } }
          ]
        }
      )
      last = 'fx_oglowed'
    }
    if (inner) {
      // Colour inside the shape: blurred inverted alpha (strongest at the edge)
      // or blurred alpha (strongest at the centre), clipped to the shape.
      const edge = inner.source === 'edge'
      if (edge) {
        children.push({
          element: 'feComponentTransfer',
          attr: { in: alpha, result: 'fx_iglow_inv' },
          children: [{ element: 'feFuncA', attr: { type: 'table', tableValues: '1 0' } }]
        })
      }
      children.push(
        { element: 'feGaussianBlur', attr: { in: edge ? 'fx_iglow_inv' : alpha, stdDeviation: String(inner.blur / 2), result: 'fx_iglow_blur' } },
        { element: 'feFlood', attr: { 'flood-color': inner.color, 'flood-opacity': String(inner.opacity), result: 'fx_iglow_flood' } },
        { element: 'feComposite', attr: { in: 'fx_iglow_flood', in2: 'fx_iglow_blur', operator: 'in', result: 'fx_iglow_col' } },
        { element: 'feComposite', attr: { in: 'fx_iglow_col', in2: alpha, operator: 'in', result: 'fx_iglow' } },
        {
          element: 'feMerge',
          attr: { result: 'fx_iglowed' },
          children: [
            { element: 'feMergeNode', attr: { in: last || graphic } },
            { element: 'feMergeNode', attr: { in: 'fx_iglow' } }
          ]
        }
      )
      last = 'fx_iglowed'
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
      if (last) attr.in = last
      children.push({ element: 'feDropShadow', attr })
    }
    const filterAttr = { id: filterId, 'data-fx': '1' }
    if (outer || inner || feather) filterAttr['color-interpolation-filters'] = 'sRGB'
    const filter = svgCanvas.addSVGElementsFromJson({
      element: 'filter',
      attr: filterAttr,
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
   * @param {{ feather?: object|null, outline: object|null, glow?: object, shadow: object|null }} spec
   * @param {BatchCommand} batchCmd
   */
  const writeEffects = (elem, spec, batchCmd) => {
    if (!elem) return
    const elemId = elem.id
    const existing = getRefFilter(elem)
    const ours = isOurFilter(elem, existing)
    const hasAny = hasEffects(spec)
    const oldFilterAttr = elem.getAttribute('filter')

    // --- Removal: no effects left ---
    if (!hasAny) {
      if (ours) {
        batchCmd.addSubCommand(new RemoveElementCommand(existing, existing.nextSibling, existing.parentNode))
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
      batchCmd.addSubCommand(new RemoveElementCommand(existing, existing.nextSibling, existing.parentNode))
      existing.remove()
    }
    const filter = buildFilter(elem, spec, filterId)
    // buildFilter() bottoms out in addSVGElementsFromJson(), which can return
    // null (e.g. no live document yet). Appending that into <defs> wouldn't
    // throw -- Element.append() silently coerces it into a literal
    // "undefined" text node instead -- so bail explicitly rather than corrupt
    // <defs> with an incomplete effect.
    if (!filter) return
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
