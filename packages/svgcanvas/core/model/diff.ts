/**
 * Which elements differ between two models of a drawing: the paths, in `next`, of every element whose attributes or text
 * changed, that was added, or that lost or reordered a child (roadmap R8: `documentChanged` says what changed, not only
 * that something did).
 *
 * Snapshots share every subtree an edit did not touch (`share` in `snapshot-history.ts`), so the walk stops at the first
 * shared node and costs the changed paths, not the drawing. Children are paired as `reconcile` (`model-render.ts`) pairs
 * them: by id, then by position among the children without one. A changed text node reports the element that holds it.
 *
 * No DOM here: the caller resolves the paths against what the DOM shows.
 * @module model/diff
 * @license MIT
 */
import type { ModelElement, ModelNode, NodePath } from './node.ts'

const idOf = (n: ModelNode): string | undefined => (n.kind === 'element' ? n.attrs.find((a) => a.name === 'id')?.value : undefined)

/**
 * The two elements carry the same attributes. Their order is not compared: it means nothing in SVG, and code that sets an
 * attribute again to the value it had (selecting a live-effect shape does) moves it to the end.
 */
export const sameAttrs = (a: ModelElement, b: ModelElement): boolean => {
  if (a.attrs.length !== b.attrs.length) return false
  if (a.attrs.every((x, i) => x.name === b.attrs[i].name && x.value === b.attrs[i].value)) return true
  const values = new Map(b.attrs.map((x) => [x.name, x.value]))
  return a.attrs.every((x) => values.get(x.name) === x.value)
}

/** The paths (in `next`) of the elements that differ from `prev`, outermost first; `[]` is the root itself. */
export const changedPaths = (prev: ModelElement, next: ModelElement): NodePath[] => {
  const out: NodePath[] = []
  const walk = (p: ModelElement, n: ModelElement, path: number[]): void => {
    if (p === n) return
    let self = !sameAttrs(p, n)
    const byId = new Map<string, number>()
    p.children.forEach((c, i) => { const id = idOf(c); if (id !== undefined && !byId.has(id)) byId.set(id, i) })
    const used = new Set<number>()
    let last = -1
    const inner: Array<() => void> = []
    n.children.forEach((c, i) => {
      const id = idOf(c)
      let from = id !== undefined ? byId.get(id) : undefined
      if (from === undefined && id === undefined && i < p.children.length && idOf(p.children[i]) === undefined) from = i
      const before = from !== undefined && !used.has(from) ? p.children[from] : undefined
      if (from !== undefined && before) {
        used.add(from)
        if (from < last) self = true // the children were reordered (z-order): a change of this element
        last = from
      }
      if (before === c) return
      if (!before || before.kind !== c.kind || (c.kind === 'element' && (before as ModelElement).name !== c.name)) {
        // added (or replaced by a node of another kind): an element is reported itself, other nodes by their parent
        if (c.kind === 'element') inner.push(() => out.push([...path, i]))
        else self = true
        return
      }
      if (c.kind === 'element') inner.push(() => walk(before as ModelElement, c, [...path, i]))
      else self = true // text, CDATA, a comment: changed content of this element
    })
    if (used.size < p.children.length) self = true // a child went
    if (self) out.push(path)
    for (const f of inner) f()
  }
  walk(prev, next, [])
  return out
}
