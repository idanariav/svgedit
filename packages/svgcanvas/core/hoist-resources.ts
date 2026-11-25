/**
 * Takes the resources of an imported document out of the group it became, into the drawing's `<defs>` (a model edit).
 *
 * Converting an imported `<use>` to a group (`group-ops.ts` `convertToGroup`) copies every child of its `<symbol>`, which is
 * the whole imported file: next to the shapes it holds the file's `<defs>`, `<style>`, `<mask>`s, `<metadata>` and comments
 * (an Excalidraw export has all of them). Left in the group, an ungroup puts them in the layer as if they were shapes, and
 * selects the `<defs>`. A resource a shape can refer to (it has an id) or that applies by itself (a `<style>` with rules)
 * moves to the drawing's `<defs>`; what nothing can use (an id-less mask, an empty style, metadata, comments) is dropped.
 * Only the group's own children are looked at: a resource inside a nested group stays with it, as valid SVG.
 *
 * DOM-free: it maps the model of the drawing to the one it should become (`snapshotHistory.edit`).
 * @module hoist-resources
 * @license MIT
 */
import { getAttr } from './model/node.ts'
import type { ModelElement, ModelNode } from './model/node.ts'
import { addDefinition, findById, pathOfId, withChildren } from './model/edit.ts'

/** Elements that are only ever used by reference. */
const REFERENCED = new Set([
  'mask', 'clipPath', 'filter', 'linearGradient', 'radialGradient', 'pattern', 'marker', 'symbol', 'font', 'font-face', 'cursor'
])

const hasText = (el: ModelElement): boolean =>
  el.children.some((c) => (c.kind === 'text' || c.kind === 'cdata') && /\S/.test(c.value))

/** What becomes of one child of the group: moved to the drawing's defs, dropped, or kept (a shape). */
const fate = (node: ModelNode): 'move' | 'drop' | 'keep' => {
  if (node.kind === 'comment') return 'drop'
  if (node.kind !== 'element') return 'keep'
  if (node.name === 'metadata') return 'drop'
  if (node.name === 'style') return hasText(node) ? 'move' : 'drop'
  if (REFERENCED.has(node.name)) return getAttr(node, 'id') ? 'move' : 'drop'
  return 'keep'
}

/**
 * The drawing `root` with the resources among the children of the group `groupId` moved into the drawing's `<defs>` (a
 * `<defs>` child gives up what it holds the same way: an element with an id, or a style with rules, and is dropped), and what
 * nothing could use removed. Returns `root` when the group is not there or holds no such child.
 */
export const hoistResources = (root: ModelElement, groupId: string): ModelElement => {
  const group = findById(root, groupId)
  const at = pathOfId(root, groupId)
  if (!group || !at) return root
  const moved: ModelElement[] = []
  const kept: ModelNode[] = []
  for (const node of group.children) {
    if (node.kind === 'element' && node.name === 'defs') {
      for (const inner of node.children) {
        if (inner.kind !== 'element') continue
        const what = fate(inner)
        if (what === 'move' || (what === 'keep' && getAttr(inner, 'id'))) moved.push(inner)
      }
      continue
    }
    const what = fate(node)
    if (what === 'move') moved.push(node as ModelElement)
    else if (what === 'keep') kept.push(node)
  }
  if (kept.length === group.children.length) return root
  let out = withChildren(root, at, () => kept)
  for (const node of moved) out = addDefinition(out, node)
  return out
}
