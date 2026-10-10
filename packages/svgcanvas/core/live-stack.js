// @ts-check
/**
 * The live stack: how corner radius, live effects and a variable-width stroke combine on one element.
 *
 * Each of those features keeps the geometry it started from in an `se:` attribute (its *source*), writes its
 * result to `d`, and used to refuse to run when another one was present. They now form one ordered chain,
 * geometry first and the stroke last, as in VectorCraft and Illustrator:
 *
 *   corners (`se:orig-d`)  →  effects (`se:fx-d`)  →  width (`se:taper-d`)  →  `d`
 *
 * Rules (see `.claude/plans/live-stack.md`):
 *  - A stage is *active* when its source attribute is present. The earliest active stage is the **root**: its
 *    source is the only authoritative geometry.
 *  - Every later stage's source attribute is a **mirror**: the previous stage's output, written here. Mirrors keep
 *    everything that reads `se:taper-d` as "the centerline" (dash fit, the Width tool, …) working, and make an
 *    element with one stage exactly what it always was.
 *  - Only some combinations are supported (`ALLOWED`): corners + width and effects + width. Anything else stays
 *    exclusive, as does a stack whose stage cannot stack (`stackable`: Scribble paints its own stroke).
 *  - Features do not write `d` of a stacked element themselves: they ask `planStack` what every stage attribute and
 *    `d` should be after their change, check it is not null, and `commitPlan` it.
 *
 * A stage registers itself from its own module (`registerLiveStage`), so this module imports none of them.
 * @module live-stack
 * @license MIT
 */

import { parseAnchors, sameAnchorGeometry } from './anchor-path.js'
import { registerElementCheck } from './drawing-invariants.js'

/**
 * @typedef {object} AttrView read-only attribute access: an element, or an element with some attributes overridden
 * @property {(name: string) => ?string} getAttribute
 * @property {(name: string) => boolean} hasAttribute
 */

/**
 * @typedef {object} LiveStageDef
 * @property {string} id
 * @property {number} order position in the chain, lowest first
 * @property {string} srcAttr the attribute holding the stage's source geometry (its presence = active)
 * @property {string[]} attrs every attribute the stage owns (removed with it)
 * @property {(view: AttrView, inputD: string, canvas?: object) => ?string} run the stage's output for its input
 * @property {(view: AttrView) => boolean} [stackable] false when this stage cannot share an element with another
 */

/** @type {Map<string, LiveStageDef>} */
const stages = new Map()

/** The stage sets that may share an element (ids). A single stage, or none, is always fine. */
const ALLOWED = [['corners', 'width'], ['fx', 'width']]

/** Slack (units) when comparing a stored mirror or `d` with a regenerated one: the saver rounds to 2 decimals. */
const TOL = 0.1

/**
 * @param {LiveStageDef} def
 * @returns {void}
 */
export const registerLiveStage = (def) => {
  stages.set(def.id, def)
}

/**
 * @param {string} id
 * @returns {?LiveStageDef}
 */
export const getLiveStage = (id) => stages.get(id) ?? null

/**
 * `elem` with some attributes read as other values (`null` = absent): what the element would be after a change.
 * @param {Element|AttrView} elem
 * @param {Object<string, ?string>} [set]
 * @returns {AttrView}
 */
export const attrView = (elem, set = {}) => ({
  getAttribute: (name) => (name in set ? set[name] : elem.getAttribute(name)),
  hasAttribute: (name) => (name in set ? set[name] != null : elem.hasAttribute(name))
})

/**
 * The active stages of an element, in chain order.
 * @param {AttrView} view
 * @returns {LiveStageDef[]}
 */
export const activeStages = (view) =>
  [...stages.values()].filter((s) => view.hasAttribute(s.srcAttr)).sort((a, b) => a.order - b.order)

/**
 * Whether these stages may share an element.
 * @param {LiveStageDef[]} active
 * @param {AttrView} view
 * @returns {boolean}
 */
const validStack = (active, view) => {
  if (active.length <= 1) return true
  const ids = active.map((s) => s.id)
  return ALLOWED.some((set) => ids.length === set.length && ids.every((id) => set.includes(id))) &&
    active.every((s) => !s.stackable || s.stackable(view))
}

/**
 * Whether the element carries more than one stage.
 * @param {Element} elem
 * @returns {boolean}
 */
export const isStacked = (elem) => activeStages(elem).length > 1

/**
 * Whether stage `id` may be (or already is) on this element alongside what it has.
 * @param {Element} elem
 * @param {string} id
 * @returns {boolean}
 */
export const canAddStage = (elem, id) => {
  const def = stages.get(id)
  if (!def) return false
  const ids = new Set([...activeStages(elem).map((s) => s.id), id])
  const active = [...ids].map((i) => /** @type {LiveStageDef} */ (stages.get(i)))
    .sort((a, b) => a.order - b.order)
  if (active.length <= 1) return true
  return ALLOWED.some((set) => active.length === set.length && active.every((s) => set.includes(s.id))) &&
    active.every((s) => !s.stackable || s.stackable(elem))
}

/**
 * The geometry stage `id` would take as its source when it is put on an element that has other stages: the root
 * source when `id` comes first, else what the chain draws now (`d`). Null when the element has no stage.
 * @param {Element} elem
 * @param {string} id
 * @returns {?string}
 */
export const stackSource = (elem, id) => {
  const def = stages.get(id)
  const active = activeStages(elem)
  if (!def || !active.length) return null
  return def.order < active[0].order ? elem.getAttribute(active[0].srcAttr) : elem.getAttribute('d')
}

/**
 * @typedef {object} StackPlan
 * @property {Object<string, ?string>} attrs every attribute to set (`null` = remove): the requested ones and the mirrors
 * @property {?string} d the element's `d`; null when no stage is left (the caller keeps or restores its geometry)
 */

/**
 * What an element's stage attributes and `d` become when `set` is applied: the chain run from its root.
 * Nothing is written. Null when the combination is not supported or a stage cannot produce its output.
 * @param {Element|AttrView} elem
 * @param {Object<string, ?string>} [set] attribute changes (`null` = remove); include a new root's source
 * @param {object} [canvas] passed to the stages that need it
 * @returns {?StackPlan}
 */
export const planStack = (elem, set = {}, canvas) => {
  const view = attrView(elem, set)
  const active = activeStages(view)
  if (!validStack(active, view)) return null
  /** @type {Object<string, ?string>} */
  const attrs = { ...set }
  if (!active.length) return { attrs, d: null }
  let d = /** @type {string} */ (view.getAttribute(active[0].srcAttr))
  for (let i = 0; i < active.length; i++) {
    if (i > 0) attrs[active[i].srcAttr] = d
    const out = active[i].run(view, d, canvas)
    if (!out) return null
    d = out
  }
  return { attrs, d }
}

/**
 * The attribute changes that take stage `id` off an element: its attributes go, and when it was the root the next
 * stage takes its source (the chain then starts from the sharp geometry again).
 * @param {Element} elem
 * @param {string} id
 * @returns {Object<string, ?string>}
 */
export const removalSet = (elem, id) => {
  const def = stages.get(id)
  if (!def) return {}
  const active = activeStages(elem)
  /** @type {Object<string, ?string>} */
  const set = {}
  for (const a of def.attrs) set[a] = null
  if (active[0]?.id === id && active[1]) set[active[1].srcAttr] = elem.getAttribute(def.srcAttr)
  return set
}

/**
 * Write a plan to the element: the attribute changes and `d` (when the plan has one).
 * @param {Element} elem
 * @param {StackPlan} plan
 * @returns {void}
 */
export const commitPlan = (elem, plan) => {
  for (const [name, value] of Object.entries(plan.attrs)) {
    if (value == null) elem.removeAttribute(name)
    else elem.setAttribute(name, value)
  }
  if (plan.d != null) elem.setAttribute('d', plan.d)
}

/**
 * Whether two path data strings are the same shape (within the saver's rounding). The saver writes relative
 * commands rounded to 2 decimals, so the error adds up along a long path (a dense outline drifts by about
 * 0.003 per point, as a random walk): the tolerance grows with the square root of the anchor count.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
const sameShape = (a, b) => {
  const pa = parseAnchors(a, TOL)
  const count = pa.reduce((n, sp) => n + sp.anchors.length, 0)
  const tol = TOL + 0.01 * Math.sqrt(count)
  return sameAnchorGeometry(pa, parseAnchors(b, TOL), tol)
}

/**
 * Whether the element's `d` is still what its chain produces. True for an element without a stage.
 * @param {Element} elem
 * @param {object} [canvas]
 * @returns {boolean}
 */
export const isStackCurrent = (elem, canvas) => {
  const plan = planStack(elem, {}, canvas)
  return !!plan && (plan.d == null || sameShape(plan.d, elem.getAttribute('d') || ''))
}

/**
 * For a stacked element whose `d` was rewritten outside the chain (node editing, …): drop every stage's attributes
 * and keep the shape. A single-stage element is left to its own feature's reconcile.
 * @param {Element} elem
 * @param {object} [canvas]
 * @returns {?boolean} null when the element is not stacked; else whether it still carries a valid stack
 */
export const reconcileStack = (elem, canvas) => {
  if (!isStacked(elem)) return null
  if (isStackCurrent(elem, canvas)) return true
  for (const def of stages.values()) for (const a of def.attrs) elem.removeAttribute(a)
  return false
}

/**
 * The mirrors that no longer match the chain, as `checkDrawing` findings' messages.
 * @param {Element} elem
 * @returns {string[]}
 */
export const stackProblems = (elem) => {
  const active = activeStages(elem)
  if (active.length < 2) return []
  if (!validStack(active, elem)) return [`stages ${active.map((s) => s.id).join(' + ')} cannot be stacked`]
  const plan = planStack(elem)
  if (!plan) return ['the stack cannot be rebuilt from its root']
  return active.slice(1)
    .filter((s) => !sameShape(plan.attrs[s.srcAttr] ?? '', elem.getAttribute(s.srcAttr) ?? ''))
    .map((s) => `${s.srcAttr} is not the output of the stage before it`)
}

/**
 * Run after the per-feature remap hooks of a transform bake: they scaled each stage's size parameters and mapped
 * every source attribute, now the mirrors are regenerated from the root.
 * @param {Element} elem
 * @param {object} [canvas]
 * @returns {void}
 */
export const rebuildAfterRemap = (elem, canvas) => {
  if (!isStacked(elem)) return
  const plan = planStack(elem, {}, canvas)
  if (plan) commitPlan(elem, plan)
}

export const init = (canvas) => {
  registerElementCheck('se-stack', stackProblems)
  Object.assign(canvas, {
    /** @see module:live-stack.reconcileStack */
    reconcileLiveStack: (elem) => reconcileStack(elem, canvas),
    isLiveStacked: isStacked
  })
}
