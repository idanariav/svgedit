/**
 * Load/save-time repairs for specific corruption patterns found in saved
 * drawings (see .claude/techdebt.md, "data-corruption fixes must also repair
 * legacy drawings"). Each is deliberately narrow. Split out of svg-exec.js.
 * @module legacy-repairs
 * @license MIT
 */

import { NS } from './namespaces.js'

/**
 * One-time repair for a legacy bug: Element.append(x) silently coerces a
 * non-Node argument via ToString(), so an `undefined` value slipping into one
 * of the various `findDefs().append(...)` call sites (now guarded, see e.g.
 * blur-event.js, clip-mask.js, fx-filter.js) inserted a literal "undefined"
 * text node into <defs> instead of throwing — invisible in the rendered
 * drawing but bloating the document. Strips any leftover ones from `root`
 * (the live svgcontent), without touching legitimate (e.g. whitespace) text
 * content.
 *
 * Called from both setSvgString() (so a legacy-corrupted drawing self-heals
 * the moment it's opened, not just the next time it happens to be saved) and
 * svgCanvasToString() (so an in-memory drawing that somehow re-acquires the
 * corruption during a session — e.g. a future regression at some other call
 * site — still gets cleaned on save). See techdebt.md: "any fix for
 * corrupted-data bugs should include a load-time repair for legacy
 * drawings, not just prevent new corruption going forward."
 * @param {Element} root
 * @returns {void}
 */
export const sanitizeLegacyUndefinedDefs = (root) => {
  const defsList = root.getElementsByTagNameNS(NS.SVG, 'defs')
  Array.prototype.forEach.call(defsList, (defsEl) => {
    Array.from(defsEl.childNodes).forEach((node) => {
      if (node.nodeType === 3 && /^(?:undefined)+$/.test(node.nodeValue)) {
        node.remove()
      }
    })
  })
}

/**
 * One-time repair for a legacy bug: recalculateDimensions() intentionally
 * declines to bake a move into geometry for a group (it would push the
 * transform down onto the children) or for anything carrying a clip-path/
 * mask (the silhouette referenced from <defs> is static, so baking would
 * desync it) — it returns null and leaves the transform list untouched.
 * moveSelectedElements() (arrow-key nudge / programmatic move) used to have
 * no fallback for that case, unlike the mouse-drag path in event-select.js,
 * which already consolidates afterwards — so every nudge on such an element
 * permanently inserted one more raw translate() transform-list item, with
 * nothing to ever merge them back down (see the matching prevention fix in
 * moveSelectedElements()). A repeatedly nudged element in an already-saved
 * drawing can carry dozens of stacked translate() items; both svgedit's own
 * per-frame transform math and the renderer have to multiply through the
 * whole chain on every later interaction with it, so the practical symptom
 * is that one specific element gets steadily more sluggish to select/drag/
 * click near the more it's been nudged — and it persists after reload,
 * since the bloat is serialized straight into `transform`.
 *
 * Collapses any run of 2+ *consecutive* pure-translate transform-list items
 * into one equivalent translate — always lossless, since translate+translate
 * is commutative and associative. Deliberately narrow: a run that includes a
 * rotate/scale/matrix is left alone, since that may be an intentionally
 * preserved decomposition elsewhere in the codebase (e.g. recalculateDimensions()'s
 * own rotation-preservation handling).
 * @param {Element} root
 * @returns {void}
 */
export const sanitizeStackedTranslateTransforms = (root) => {
  const elements = root.querySelectorAll('[transform]')
  Array.prototype.forEach.call(elements, (el) => {
    const tlist = el.transform?.baseVal
    if (!tlist || tlist.numberOfItems < 2) return
    let i = 0
    while (i < tlist.numberOfItems) {
      if (tlist.getItem(i).type !== SVGTransform.SVG_TRANSFORM_TRANSLATE) {
        i++
        continue
      }
      let j = i + 1
      let tx = tlist.getItem(i).matrix.e
      let ty = tlist.getItem(i).matrix.f
      while (j < tlist.numberOfItems && tlist.getItem(j).type === SVGTransform.SVG_TRANSFORM_TRANSLATE) {
        tx += tlist.getItem(j).matrix.e
        ty += tlist.getItem(j).matrix.f
        j++
      }
      if (j - i > 1) {
        for (let k = j - 1; k >= i; k--) {
          tlist.removeItem(k)
        }
        const merged = root.createSVGTransform()
        merged.setTranslate(tx, ty)
        tlist.insertItemBefore(merged, i)
      }
      i++
    }
  })
}
