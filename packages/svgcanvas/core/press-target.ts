/**
 * What a select-mode press is on, decided by one ranked list of rules (roadmap R10). The native hit test answers first; each
 * rule then gets the answer so far and may change it, in this order:
 *
 *  1. `prefer-selected`: a press over an element covering a selected one takes the selected one, so a drag moves the
 *     selection; the element pressed is what a click (no drag) selects (`clickSelect`). A press on one member of a
 *     multi-selection keeps the selection for a drag, and a click selects that member. Not with Shift (it adds), not on a grip.
 *  2. `stroke-near`: a fill-less shape (a line, an open path, a hollow shape) within `HIT_PX` of the press wins over the
 *     filled shape or empty canvas under it. Not on a grip.
 *  3. `area-text`: on empty canvas, the empty part of an area text's box is the text.
 *  4. `selection-box`: on empty canvas inside the selection's box, the selection (a move handle for fill-less shapes and the
 *     gaps beside them). Not with Shift, not for one open path alone (its box is mostly not the shape).
 *
 * None applies to a right-click (the context menu acts on what is selected) or outside select mode. The editing context (a
 * Ctrl/Cmd drill into a group, leaving the entered group) is not a choice of target: `event.ts` settles it first.
 *
 * The rules read the DOM only through `probes`, so they can be tested together (`tests/unit/press-target.test.js`); the
 * rule that made the final choice is in the debug log's `pointer-down` entry (`targetRule`).
 * @module press-target
 * @license MIT
 */

/** What the rules may ask of the DOM. */
export interface PressProbes {
  /** the elements under the press, topmost first (`document.elementsFromPoint`) */
  elementsAt(): Element[]
  /** a fill-less element within reach of the press, or null (`current` is the target so far) */
  strokeNear(current: Element): Element | null
  /** the area text whose box holds the press, as a press target, or null */
  areaTextAt(): Element | null
  /** the selection's union box holds the press */
  inSelectionBox(selected: Element[]): boolean
  /** `el` is an open line or path (no interior) */
  isOpenPath(el: Element): boolean
}

export interface PressContext {
  mode: string
  /** what the native hit test found (after the editing context is settled) */
  hit: Element
  /** empty canvas */
  root: Element
  /** the selection's grips */
  grips: Element
  /** the selection, without holes */
  selected: Element[]
  shift: boolean
  rightClick: boolean
  probes: PressProbes
}

export interface PressTarget {
  target: Element
  /** what the release selects if the press never became a drag (event-select.ts `MoveState.clickSelect`) */
  clickSelect: Element | null
  /** the rule that made the choice (`hit` when none did) */
  rule: string
}

interface Rule {
  name: string
  apply: (ctx: PressContext, cur: PressTarget) => Partial<PressTarget> | null
}

/** The rules in rank order: a later rule sees, and may change, what the earlier ones chose. */
export const PRESS_RULES: readonly Rule[] = Object.freeze([
  {
    name: 'prefer-selected',
    apply: (ctx, cur) => {
      if (ctx.shift || cur.target === ctx.grips || !ctx.selected.length) return null
      if (!ctx.selected.includes(cur.target)) {
        for (const node of ctx.probes.elementsAt()) {
          const hit = ctx.selected.find((s) => s === node || s.contains(node))
          if (hit) return { target: hit, clickSelect: cur.target !== ctx.root ? cur.target : null }
        }
        return null
      }
      return ctx.selected.length > 1 ? { clickSelect: cur.target } : null
    }
  },
  {
    name: 'stroke-near',
    apply: (ctx, cur) => {
      if (cur.target === ctx.grips) return null
      const near = ctx.probes.strokeNear(cur.target)
      return near ? { target: near, clickSelect: null } : null
    }
  },
  {
    name: 'area-text',
    apply: (ctx, cur) => {
      if (cur.target !== ctx.root) return null
      const text = ctx.probes.areaTextAt()
      return text && text !== ctx.root ? { target: text } : null
    }
  },
  {
    name: 'selection-box',
    apply: (ctx, cur) => {
      if (ctx.shift || cur.target !== ctx.root || !ctx.selected.length) return null
      if (ctx.selected.length === 1 && ctx.probes.isOpenPath(ctx.selected[0])) return null
      return ctx.probes.inSelectionBox(ctx.selected) ? { target: ctx.selected[0] } : null
    }
  }
])

/** The target of a press: the native hit, as the rules rank it. */
export const resolvePressTarget = (ctx: PressContext): PressTarget => {
  let cur: PressTarget = { target: ctx.hit, clickSelect: null, rule: 'hit' }
  if (ctx.mode !== 'select' || ctx.rightClick) return cur
  for (const rule of PRESS_RULES) {
    const out = rule.apply(ctx, cur)
    if (out) cur = { ...cur, ...out, rule: rule.name }
  }
  return cur
}
