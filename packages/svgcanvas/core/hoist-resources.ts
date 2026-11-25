/**
 * Takes the resources of an imported document out of the group it became, into the drawing's `<defs>`.
 *
 * Converting an imported `<use>` to a group (`group-ops.ts` `convertToGroup`) copies every child of its `<symbol>`, which is
 * the whole imported file: next to the shapes it holds the file's `<defs>`, `<style>`, `<mask>`s, `<metadata>` and comments
 * (an Excalidraw export has all of them). Left in the group, an ungroup puts them in the layer as if they were shapes, and
 * selects the `<defs>`. A resource a shape can refer to (it has an id) or that applies by itself (a `<style>` with rules)
 * moves to the drawing's `<defs>`; what nothing can use (an id-less mask, an empty style, metadata, comments) is dropped.
 * Only the group's own children are looked at: a resource inside a nested group stays with it, as valid SVG.
 * @module hoist-resources
 * @license MIT
 */

/** Elements that are only ever used by reference. */
const REFERENCED = new Set([
  'mask', 'clipPath', 'filter', 'linearGradient', 'radialGradient', 'pattern', 'marker', 'symbol', 'font', 'font-face', 'cursor'
])
/** Elements that are never rendered, and that are dropped from an imported group. */
const DROPPED = new Set(['metadata'])

/** What becomes of one child of the group: moved to the drawing's defs, dropped, or kept (a shape). */
const fate = (node: ChildNode): 'move' | 'drop' | 'keep' => {
  if (node.nodeType === 8) return 'drop'
  if (node.nodeType !== 1) return 'keep'
  const el = node as Element
  const tag = el.localName
  if (DROPPED.has(tag)) return 'drop'
  if (tag === 'style') return /\S/.test(el.textContent ?? '') ? 'move' : 'drop'
  if (REFERENCED.has(tag)) return el.id ? 'move' : 'drop'
  return 'keep'
}

/**
 * Move the resources among `group`'s children into `defs` (a `<defs>` child is emptied the same way, then removed), and
 * remove what nothing could use.
 * @returns the elements now in `defs`, in document order
 */
export const hoistResources = (group: Element, defs: Element): Element[] => {
  const moved: Element[] = []
  const move = (el: Element): void => { defs.append(el); moved.push(el) }
  for (const node of Array.from(group.childNodes)) {
    if (node.nodeType === 1 && (node as Element).localName === 'defs') {
      // what a <defs> holds is a resource whatever its tag (a <g> to be <use>d): it moves when it has an id (or is a style
      // with rules), the rest goes with the <defs>
      for (const el of Array.from((node as Element).children)) {
        const what = fate(el)
        if (what === 'move' || (what === 'keep' && el.id)) move(el)
      }
      node.remove()
      continue
    }
    const what = fate(node)
    if (what === 'move') move(node as Element)
    else if (what === 'drop') node.remove()
  }
  return moved
}
