/**
 * Framed effect targets: the shape or group a box-handled effect tool (Distort, 3D Rotate) edits, and how its effect entry
 * is read and written. A shape is edited through its own entry (no shared frame: the box is its source box). A group is
 * edited through one entry on each of its members (the shapes inside it, at any depth, that can take effects), all with
 * the same params plus the member's shared frame (`core/distort.ts`): the map from its own coordinates to the group's
 * box, so the group bends as one piece. The group's box and params are read back from its first framed member, so a
 * group needs no attribute of its own. Text, images and other elements that cannot take effects are left as they are.
 * @module framedTarget
 */
import { FRAME_KEYS, distortFrame, frameFromParams, paramsFromFrame } from '@svgedit/svgcanvas/core/distort.ts'
import { applyMatrix, invert, multiply } from '@svgedit/svgcanvas/core/gradient-edit.ts'
import type { Matrix } from '@svgedit/svgcanvas/core/gradient-edit.ts'
import type { ToolSpace } from './toolSpace.ts'

type Params = Record<string, number | boolean | string>
type Entry = { name: string, params: Params }

export interface FramedTarget {
  /** the shape, or the group */
  el: Element
  group: boolean
  /** the elements carrying an entry: the shape itself, or the group's members; `toGroup` is a member's map into the group */
  members: Array<{ el: Element, toGroup: Matrix }>
  /** the box the effect refers to, in the shape's own (or the group's inner) coordinates */
  frame: { x: number, y: number, w: number, h: number }
  /** those coordinates to document units, and back */
  matrix: Matrix
  inverse: Matrix
  /** the entry being edited (a group's: its first framed member's), null before the first edit */
  entry: Entry | null
}

/** What the module needs of the canvas. */
interface Canvas {
  canApplyLiveEffect: (el: Element) => boolean
  getLiveEffectsBox: (el: Element) => { x: number, y: number, width: number, height: number } | null
  getLiveEffects: (el: Element) => Entry[]
  applyLiveEffectsTo: (el: Element, stack: Entry[]) => Element | null
  removeLiveEffectsFrom: (el: Element) => boolean
  getSvgContent: () => Element
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

// Content that is not drawn where it stands: a shape in there is not a member.
const NOT_DRAWN = 'defs, clipPath, mask, pattern, marker, symbol'

/** The params without the shared frame. */
const withoutFrame = (params: Params): Params => Object.fromEntries(Object.entries(params).filter(([k]) => !FRAME_KEYS.includes(k)))

export const framedTargets = (canvas: Canvas, space: ToolSpace) => {
  /** Where an entry named one of `names` is in `stack`: a framed one for a group member, an unframed one for a shape. */
  const entryIndex = (stack: Entry[], names: string[], framed: boolean) =>
    stack.findIndex((e) => names.includes(e.name) && (frameFromParams(e.params) !== null) === framed)

  const shapeTarget = (el: Element, names: string[]): FramedTarget | null => {
    if (!canvas.canApplyLiveEffect(el)) return null
    const box = canvas.getLiveEffectsBox(el)
    const m = space.localToDoc(el)
    if (!box || !m) return null
    const stack = canvas.getLiveEffects(el)
    const i = entryIndex(stack, names, false)
    return { el, group: false, members: [{ el, toGroup: IDENTITY }], frame: distortFrame(box), matrix: m, inverse: invert(m) ?? IDENTITY, entry: i >= 0 ? stack[i] : null }
  }

  const groupTarget = (g: Element, names: string[]): FramedTarget | null => {
    const m = space.localToDoc(g)
    const inv = m && invert(m)
    if (!m || !inv) return null
    const members: FramedTarget['members'] = []
    for (const el of g.querySelectorAll('*')) {
      if (el.closest(NOT_DRAWN) || !canvas.canApplyLiveEffect(el)) continue
      const own = space.localToDoc(el)
      if (own) members.push({ el, toGroup: multiply(inv, own) })
    }
    if (!members.length) return null
    // An edited group: the box is where the first framed member's frame puts it.
    for (const mem of members) {
      const stack = canvas.getLiveEffects(mem.el)
      const i = entryIndex(stack, names, true)
      const frame = i >= 0 ? frameFromParams(stack[i].params) : null
      const fromBox = frame && invert(frame.m)
      if (!frame || !fromBox) continue
      const origin = applyMatrix(multiply(mem.toGroup, fromBox), { x: 0, y: 0 })
      return { el: g, group: true, members, frame: { ...origin, w: frame.w, h: frame.h }, matrix: m, inverse: inv, entry: { name: stack[i].name, params: withoutFrame(stack[i].params) } }
    }
    // A new one: the members' source boxes, in the group's coordinates.
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const mem of members) {
      const b = canvas.getLiveEffectsBox(mem.el)
      if (!b) continue
      for (const p of [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y }, { x: b.x, y: b.y + b.height }, { x: b.x + b.width, y: b.y + b.height }]) {
        const q = applyMatrix(mem.toGroup, p)
        x0 = Math.min(x0, q.x)
        y0 = Math.min(y0, q.y)
        x1 = Math.max(x1, q.x)
        y1 = Math.max(y1, q.y)
      }
    }
    if (!Number.isFinite(x0)) return null
    return { el: g, group: true, members, frame: distortFrame({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }), matrix: m, inverse: inv, entry: null }
  }

  /** The target `el` is, for an effect named one of `names`: a shape that can take effects, or a group with such shapes in it. */
  const targetFor = (el: Element | null | undefined, names: string[]): FramedTarget | null => {
    // Drawing content below the layers only: not a layer, a selection grip or the canvas itself.
    const content = canvas.getSvgContent()
    if (!el || !content.contains(el) || el.parentNode === content) return null
    return el.tagName === 'g' ? groupTarget(el, names) : shapeTarget(el, names)
  }

  /**
   * Write the entry `{ name, params }` (for one of `names`) into every member, inside the caller's transaction. A member
   * that was a primitive is a path afterwards (`target.members` and, for a shape, `target.el` follow). False when a
   * member could not take it.
   */
  const write = (t: FramedTarget, names: string[], name: string, params: Params): boolean => {
    const { x, y, w, h } = t.frame
    let ok = true
    for (const mem of t.members) {
      const stack = canvas.getLiveEffects(mem.el).map((e) => ({ name: e.name, params: { ...e.params } }))
      const own = t.group ? paramsFromFrame({ m: multiply({ a: 1, b: 0, c: 0, d: 1, e: -x, f: -y }, mem.toGroup), w, h }) : {}
      const entry = { name, params: { ...withoutFrame(params), ...own } }
      const i = entryIndex(stack, names, t.group)
      if (i >= 0) stack[i] = entry
      else stack.push(entry)
      const el = canvas.applyLiveEffectsTo(mem.el, stack)
      if (!el) {
        ok = false
        continue
      }
      if (t.el === mem.el) t.el = el
      mem.el = el
    }
    t.entry = { name, params: withoutFrame(params) }
    return ok
  }

  /** Take the entry out of every member, inside the caller's transaction. */
  const remove = (t: FramedTarget, names: string[]): void => {
    for (const mem of t.members) {
      const stack = canvas.getLiveEffects(mem.el)
      const i = entryIndex(stack, names, t.group)
      if (i < 0) continue
      const rest = stack.filter((_, j) => j !== i)
      if (rest.length) {
        const el = canvas.applyLiveEffectsTo(mem.el, rest)
        if (el) mem.el = el
      } else {
        canvas.removeLiveEffectsFrom(mem.el)
      }
    }
    t.entry = null
  }

  return { targetFor, write, remove }
}

/** The box's corners (top left, top right, bottom right, bottom left) in document units. */
export const frameCorners = (t: FramedTarget) => {
  const { x, y, w, h } = t.frame
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }].map((p) => applyMatrix(t.matrix, p))
}
