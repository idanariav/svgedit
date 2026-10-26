/**
 * Alignment boxes: a group (or link) can name one of its children as the box it is aligned by, so a figure with a
 * dangling cape or a desk grouped with its shadow lines up by the part that matters, not by everything it paints.
 *
 * The child carries `se:align-box="true"` (a mark on the child, not an id on the group, so copies, pastes and id
 * renumbering keep it right; at most one child per group). Align, distribute and smart snapping measure such a group
 * by that child's box, taken through the group's `transform` (a child that is itself a group with an alignment box is
 * measured by that one, and so on). The selection box, resizing and the X / Y fields keep the group's full painted box.
 * A viewer that ignores the mark sees the same picture. Ungroup drops the mark; a mark left on an element that is no
 * longer a group's child (moved out by another route) is ignored, and of two marks in one group the first counts.
 * @module align-box
 * @license MIT
 */

import type SvgCanvas from '../svgcanvas.ts'
import type { BBoxObject } from './bbox-utils.ts'
import Layer from './layer.ts'
import { NS } from './namespaces.ts'
import { getTransformList, transformBox, transformListToTransform } from './math.ts'
import { setAttrsById } from './model/edit.ts'
import type { ModelElement } from './model/node.ts'

const ATTR = 'align-box'
const QNAME = `se:${ATTR}`

const isGroup = (el: Element): boolean => (el.tagName === 'g' || el.tagName === 'a') && !Layer.isLayer(el)

/** Is `el` marked as its group's alignment box? */
export const isAlignBoxMark = (el: Element): boolean => el.getAttributeNS(NS.SE, ATTR) === 'true'

/** The child a group (or link) is aligned by, or null. */
export const alignBoxChild = (el: Element): Element | null => {
  if (!isGroup(el)) return null
  for (const child of el.children) {
    if (isAlignBoxMark(child)) return child
  }
  return null
}

/**
 * A model edit that drops the mark from the children of `group` (those with an id), e.g. before the group is dissolved, so
 * a later group does not pick it up.
 */
export const clearAlignBoxMarks = (group: Element) => (root: ModelElement): ModelElement =>
  [...group.children].filter((el) => el.id && el.hasAttributeNS(NS.SE, ATTR))
    .reduce((r, el) => setAttrsById(r, el.id, { [QNAME]: null }), root)

/** Can `el` be made its parent's alignment box? (Its parent is a group or link, not a layer.) */
export const canBeAlignBox = (el: Element): boolean => !!el.parentElement && isGroup(el.parentElement)

type Measure = Pick<SvgCanvas, 'getStrokedBBoxDefaultVisible'>

/**
 * The box `elem` is aligned and snapped by, in its parent's space: its painted box, or for a group with an alignment
 * box, that child's alignment box under the group's transform (the axis-aligned box of it when the group is turned).
 */
export const getAlignBox = (canvas: Measure, elem: Element): BBoxObject | null => {
  const child = alignBoxChild(elem)
  const inner = child && getAlignBox(canvas, child)
  if (!inner) return canvas.getStrokedBBoxDefaultVisible([elem]) || null
  const m = transformListToTransform(getTransformList(elem)).matrix
  return transformBox(inner.x, inner.y, inner.width, inner.height, m).aabox
}

/** The union of the alignment boxes of `elems` (their painted box when none of them has an alignment box). */
export const getAlignBoxOf = (canvas: Measure, elems: Element[]): BBoxObject | null => {
  if (!elems.some(alignBoxChild)) return canvas.getStrokedBBoxDefaultVisible(elems) || null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of elems) {
    const bb = getAlignBox(canvas, el)
    if (!bb) continue
    minX = Math.min(minX, bb.x)
    minY = Math.min(minY, bb.y)
    maxX = Math.max(maxX, bb.x + bb.width)
    maxY = Math.max(maxY, bb.y + bb.height)
  }
  return minX === Infinity ? null : { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

type Host = Measure & Pick<SvgCanvas, 'snapshotHistory' | 'selectorManager' | 'getSelectedElements'>

/** Setting and clearing alignment boxes on one canvas (`svgCanvas.alignBox`). */
export interface AlignBox {
  /** Make `child` (which needs an id) its group's alignment box, replacing the one it had. One undo step. */
  set (child: Element): void
  /** Clear the alignment box of a group. One undo step. */
  clear (group: Element): void
  /** The box `elem` is aligned by, in its parent's space (see `getAlignBox`). */
  get (elem: Element): BBoxObject | null
}

export const createAlignBox = (svgCanvas: Host): AlignBox => {
  /** Redraw the selection boxes, which show a group's alignment box. */
  const refresh = (): void => {
    for (const el of svgCanvas.getSelectedElements()) {
      if (el) svgCanvas.selectorManager.requestSelector(el).resize()
    }
  }
  return {
    set (child) {
      const group = child.parentElement
      if (!group || !child.id || !canBeAlignBox(child) || isAlignBoxMark(child)) return
      svgCanvas.snapshotHistory.edit('Use as alignment box', (root) =>
        setAttrsById(clearAlignBoxMarks(group)(root), child.id, { [QNAME]: 'true' }))
      refresh()
    },
    clear (group) {
      if (!alignBoxChild(group)) return
      svgCanvas.snapshotHistory.edit('Clear alignment box', clearAlignBoxMarks(group))
      refresh()
    },
    get: (elem) => getAlignBox(svgCanvas, elem)
  }
}
