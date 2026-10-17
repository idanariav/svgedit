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

import type SvgCanvas from '../svgcanvas.ts'
import { parseAnchors, sameAnchorGeometry } from './anchor-path.ts'
import { registerElementCheck } from './drawing-invariants.ts'

/** Read-only attribute access: an element, or an element with some attributes overridden. */
export interface AttrView {
  getAttribute: (name: string) => string | null
  hasAttribute: (name: string) => boolean
}

export interface LiveStageDef {
  id: string
  /** position in the chain, lowest first */
  order: number
  /** the attribute holding the stage's source geometry (its presence = active) */
  srcAttr: string
  /** every attribute the stage owns (removed with it) */
  attrs: string[]
  /** the stage's output for its input */
  run: (view: AttrView, inputD: string, canvas?: object) => string | null
  /** false when this stage cannot share an element with another */
  stackable?: (view: AttrView) => boolean
}

const stages = new Map<string, LiveStageDef>()

/** The stage sets that may share an element (ids). A single stage, or none, is always fine. */
const ALLOWED = [['corners', 'width'], ['fx', 'width']]

/** Slack (units) when comparing a stored mirror or `d` with a regenerated one: the saver rounds to 2 decimals. */
const TOL = 0.1

export const registerLiveStage = (def: LiveStageDef): void => {
  stages.set(def.id, def)
}

export const getLiveStage = (id: string): LiveStageDef | null => stages.get(id) ?? null

/**
 * `elem` with some attributes read as other values (`null` = absent): what the element would be after a change.
 */
export const attrView = (elem: AttrView, set: Record<string, string | null> = {}): AttrView => ({
  getAttribute: (name: string) => (name in set ? set[name] : elem.getAttribute(name)),
  hasAttribute: (name: string) => (name in set ? set[name] != null : elem.hasAttribute(name))
})

/** The active stages of an element, in chain order. */
export const activeStages = (view: AttrView): LiveStageDef[] =>
  [...stages.values()].filter((s) => view.hasAttribute(s.srcAttr)).sort((a, b) => a.order - b.order)

/** Whether these stages may share an element. */
const validStack = (active: LiveStageDef[], view: AttrView): boolean => {
  if (active.length <= 1) return true
  const ids = active.map((s) => s.id)
  return ALLOWED.some((set) => ids.length === set.length && ids.every((id) => set.includes(id))) &&
    active.every((s) => !s.stackable || s.stackable(view))
}

/** Whether the element carries more than one stage. */
export const isStacked = (elem: AttrView): boolean => activeStages(elem).length > 1

/** Whether stage `id` may be (or already is) on this element alongside what it has. */
export const canAddStage = (elem: AttrView, id: string): boolean => {
  const def = stages.get(id)
  if (!def) return false
  const ids = new Set([...activeStages(elem).map((s) => s.id), id])
  const active = [...ids].map((i) => stages.get(i) as LiveStageDef)
    .sort((a, b) => a.order - b.order)
  if (active.length <= 1) return true
  return ALLOWED.some((set) => active.length === set.length && active.every((s) => set.includes(s.id))) &&
    active.every((s) => !s.stackable || s.stackable(elem))
}

/**
 * The geometry stage `id` would take as its source when it is put on an element that has other stages: the root
 * source when `id` comes first, else what the chain draws now (`d`). Null when the element has no stage.
 */
export const stackSource = (elem: AttrView, id: string): string | null => {
  const def = stages.get(id)
  const active = activeStages(elem)
  if (!def || !active.length) return null
  return def.order < active[0].order ? elem.getAttribute(active[0].srcAttr) : elem.getAttribute('d')
}

export interface StackPlan {
  /** every attribute to set (`null` = remove): the requested ones and the mirrors */
  attrs: Record<string, string | null>
  /** the element's `d`; null when no stage is left (the caller keeps or restores its geometry) */
  d: string | null
}

/**
 * What an element's stage attributes and `d` become when `set` is applied: the chain run from its root.
 * Nothing is written. Null when the combination is not supported or a stage cannot produce its output.
 * @param set attribute changes (`null` = remove); include a new root's source
 * @param canvas passed to the stages that need it
 */
export const planStack = (elem: AttrView, set: Record<string, string | null> = {}, canvas?: object): StackPlan | null => {
  const view = attrView(elem, set)
  const active = activeStages(view)
  if (!validStack(active, view)) return null
  const attrs: Record<string, string | null> = { ...set }
  if (!active.length) return { attrs, d: null }
  let d = view.getAttribute(active[0].srcAttr) as string
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
 */
export const removalSet = (elem: AttrView, id: string): Record<string, string | null> => {
  const def = stages.get(id)
  if (!def) return {}
  const active = activeStages(elem)
  const set: Record<string, string | null> = {}
  for (const a of def.attrs) set[a] = null
  if (active[0]?.id === id && active[1]) set[active[1].srcAttr] = elem.getAttribute(def.srcAttr)
  return set
}

/**
 * Write a plan to the element: the attribute changes and `d` (when the plan has one).
 */
export const commitPlan = (elem: Element, plan: StackPlan): void => {
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
 */
const sameShape = (a: string, b: string): boolean => {
  const pa = parseAnchors(a, TOL)
  const count = pa.reduce((n, sp) => n + sp.anchors.length, 0)
  const tol = TOL + 0.01 * Math.sqrt(count)
  return sameAnchorGeometry(pa, parseAnchors(b, TOL), tol)
}

/**
 * Whether the element's `d` is still what its chain produces. True for an element without a stage.
 */
export const isStackCurrent = (elem: Element, canvas?: object): boolean => {
  const plan = planStack(elem, {}, canvas)
  return !!plan && (plan.d == null || sameShape(plan.d, elem.getAttribute('d') || ''))
}

/**
 * For a stacked element whose `d` was rewritten outside the chain (node editing, …): drop every stage's attributes
 * and keep the shape. A single-stage element is left to its own feature's reconcile.
 * @returns null when the element is not stacked; else whether it still carries a valid stack
 */
export const reconcileStack = (elem: Element, canvas?: object): boolean | null => {
  if (!isStacked(elem)) return null
  if (isStackCurrent(elem, canvas)) return true
  for (const def of stages.values()) for (const a of def.attrs) elem.removeAttribute(a)
  return false
}

/**
 * The mirrors that no longer match the chain, as `checkDrawing` findings' messages.
 */
export const stackProblems = (elem: Element): string[] => {
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
 */
export const rebuildAfterRemap = (elem: Element, canvas?: object): void => {
  if (!isStacked(elem)) return
  const plan = planStack(elem, {}, canvas)
  if (plan) commitPlan(elem, plan)
}

/** The members `live-stack.ts` gives its canvas. */
export interface LiveStackApi {
  /** Live stack (`core/live-stack.js`): null when the element is not stacked, else whether its stack is still current (stale stacks are dropped). */
  reconcileLiveStack(elem: Element): boolean | null
  isLiveStacked(elem: Element): boolean
}

export const createLiveStack = (canvas: SvgCanvas): LiveStackApi => {
  registerElementCheck('se-stack', stackProblems)
  return {
    /** @see module:live-stack.reconcileStack */
    reconcileLiveStack: (elem: Element) => reconcileStack(elem, canvas),
    isLiveStacked: isStacked
  }
}
