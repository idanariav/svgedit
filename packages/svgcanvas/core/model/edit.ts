/**
 * Document model, layer 4: edits. Each function takes a model root and returns a new one; whatever it did not touch is the
 * same object (see `node.ts`), and a function that finds nothing to do returns the root it was given, so "did anything change"
 * is an identity check.
 *
 * Elements are addressed by `id` (every object in a drawing has one; `checkDrawing` reports a duplicate), then by the child
 * indexes the lookup finds. No DOM here: these run in Node, and the renderer (`core/model-render.ts`) is what makes the DOM
 * show the result.
 * @module model/edit
 * @license MIT
 */
import { element, getAt, setAttr, updateAt } from './node.ts'
import type { ModelElement, ModelNode, NodePath } from './node.ts'

const idOf = (n: ModelNode): string | undefined => (n.kind === 'element' ? n.attrs.find((a) => a.name === 'id')?.value : undefined)

/** The path to the first element with this id (document order), or undefined. */
export const pathOfId = (root: ModelElement, id: string): NodePath | undefined => {
  const go = (node: ModelElement, path: number[]): NodePath | undefined => {
    for (let i = 0; i < node.children.length; i++) {
      const c = node.children[i]
      if (c.kind !== 'element') continue
      if (idOf(c) === id) return [...path, i]
      const deeper = go(c, [...path, i])
      if (deeper) return deeper
    }
    return undefined
  }
  return idOf(root) === id ? [] : go(root, [])
}

/** The element with this id, or undefined. */
export const findById = (root: ModelElement, id: string): ModelElement | undefined => {
  const path = pathOfId(root, id)
  const node = path && getAt(root, path)
  return node?.kind === 'element' ? node : undefined
}

const sameList = (a: readonly ModelNode[], b: readonly ModelNode[]): boolean => a.length === b.length && a.every((n, i) => n === b[i])

/**
 * Replace the children of the element at `path` with `fn(children)`. Returns `root` when the list is the same.
 * Only the ancestors on the way down are copied.
 */
export const withChildren = (root: ModelElement, path: NodePath, fn: (children: readonly ModelNode[]) => readonly ModelNode[]): ModelElement => {
  const go = (node: ModelElement, depth: number): ModelElement => {
    if (depth === path.length) {
      const next = fn(node.children)
      return sameList(next, node.children) ? node : element(node.name, node.attrs, next)
    }
    const i = path[depth]
    const child = node.children[i]
    if (!child || child.kind !== 'element') throw new RangeError(`path [${path.join(',')}] leaves the tree at depth ${depth}`)
    const next = go(child, depth + 1)
    return next === child ? node : element(node.name, node.attrs, node.children.map((c, k) => (k === i ? next : c)))
  }
  return go(root, 0)
}

/** The ids' elements grouped by parent path, each group in document order. Ids that are not in the tree are skipped. */
const byParent = (root: ModelElement, ids: readonly string[]): Array<{ parent: NodePath, selected: ModelNode[] }> => {
  const groups = new Map<string, { parent: NodePath, selected: ModelNode[] }>()
  const wanted = new Set(ids)
  const walk = (node: ModelElement, path: number[]): void => {
    node.children.forEach((c, i) => {
      if (c.kind !== 'element') return
      if (wanted.has(idOf(c) ?? '\0')) {
        const key = path.join(',')
        const g = groups.get(key) ?? { parent: path.slice(), selected: [] }
        g.selected.push(c)
        groups.set(key, g)
      }
      walk(c, [...path, i])
    })
  }
  walk(root, [])
  // deepest parents first: editing a child list moves only what is below that parent, so the paths of the others stay right
  return [...groups.values()].sort((a, b) => b.parent.length - a.parent.length)
}

/** Move these elements to the end of their parents (the top of the stack), keeping their order among themselves. */
export const moveToEnd = (root: ModelElement, ids: readonly string[]): ModelElement => {
  let out = root
  for (const { parent, selected } of byParent(root, ids)) {
    const chosen = new Set(selected.map(idOf))
    out = withChildren(out, parent, (kids) => [...kids.filter((k) => !chosen.has(idOf(k))), ...kids.filter((k) => chosen.has(idOf(k)))])
  }
  return out
}

/**
 * Move these elements to the start of their parents (the bottom of the stack), after the leading `<title>` and `<defs>`, keeping
 * their order among themselves. A parent with nothing else in it is left alone.
 */
export const moveToStart = (root: ModelElement, ids: readonly string[]): ModelElement => {
  let out = root
  for (const { parent, selected } of byParent(root, ids)) {
    const chosen = new Set(selected.map(idOf))
    out = withChildren(out, parent, (kids) => {
      const isHead = (k: ModelNode): boolean => k.kind !== 'element' || k.name === 'title' || k.name === 'defs'
      if (kids.every(isHead)) return kids
      const rest = kids.filter((k) => !chosen.has(idOf(k)))
      let at = 0
      while (at < rest.length && isHead(rest[at])) at++
      return [...rest.slice(0, at), ...kids.filter((k) => chosen.has(idOf(k))), ...rest.slice(at)]
    })
  }
  return out
}

/** Put the element `id` right before or after the element `refId` (which may be in another parent). */
export const moveNextTo = (root: ModelElement, id: string, refId: string, where: 'before' | 'after'): ModelElement => {
  const from = pathOfId(root, id)
  const to = pathOfId(root, refId)
  if (!from || !to || id === refId) return root
  const moved = getAt(root, from) as ModelNode
  // the reference must not be inside the moved element
  if (to.length > from.length && from.every((v, i) => to[i] === v)) return root
  const removed = withChildren(root, from.slice(0, -1), (kids) => kids.filter((k) => k !== moved))
  const refPath = pathOfId(removed, refId) as NodePath
  const ref = getAt(removed, refPath) as ModelNode
  return withChildren(removed, refPath.slice(0, -1), (kids) => {
    const i = kids.indexOf(ref)
    return [...kids.slice(0, where === 'before' ? i : i + 1), moved, ...kids.slice(where === 'before' ? i : i + 1)]
  })
}

/** Swap two sibling elements. Elements that are not siblings are left alone. */
export const swapSiblings = (root: ModelElement, idA: string, idB: string): ModelElement => {
  const pa = pathOfId(root, idA)
  const pb = pathOfId(root, idB)
  if (!pa || !pb || pa.length !== pb.length || pa.slice(0, -1).some((v, i) => v !== pb[i])) return root
  const a = getAt(root, pa) as ModelNode
  const b = getAt(root, pb) as ModelNode
  return withChildren(root, pa.slice(0, -1), (kids) => kids.map((k) => (k === a ? b : k === b ? a : k)))
}

/** Remove the elements with these ids (and what is inside them). */
export const removeIds = (root: ModelElement, ids: readonly string[]): ModelElement => {
  let out = root
  for (const id of ids) {
    const path = pathOfId(out, id)
    if (!path || !path.length) continue
    const node = getAt(out, path) as ModelNode
    out = withChildren(out, path.slice(0, -1), (kids) => kids.filter((k) => k !== node))
  }
  return out
}

/**
 * Set attributes on the element with this id: a string sets (keeping the attribute where it is, appending a new one), `null`
 * removes. Returns `root` when the element is not there or already has these values.
 */
export const setAttrsById = (root: ModelElement, id: string, attrs: Readonly<Record<string, string | null>>): ModelElement => {
  const path = pathOfId(root, id)
  if (!path) return root
  return updateAt(root, path, (n) => {
    if (n.kind !== 'element') return n
    let out: ModelElement = n
    for (const [name, value] of Object.entries(attrs)) out = setAttr(out, name, value)
    return out
  })
}

/**
 * Wrap the elements with these ids in `group`, which becomes the last child of the element `containerId` names. The group's
 * children are the wrapped elements in the order given (each keeps what is inside it). Returns `root` when nothing was found
 * to wrap or the container is not there.
 */
export const wrapIds = (root: ModelElement, containerId: string, group: ModelElement, ids: readonly string[]): ModelElement => {
  // One at a time, each looked up after the last was taken out: when a selection holds a group and something inside it, the
  // inner one is not wrapped twice.
  const nodes: ModelElement[] = []
  let stripped = root
  for (const id of ids) {
    const node = findById(stripped, id)
    if (!node) continue
    nodes.push(node)
    stripped = removeIds(stripped, [id])
  }
  if (!nodes.length) return root
  const at = pathOfId(stripped, containerId)
  if (!at) return root
  const wrapped = element(group.name, group.attrs, [...group.children, ...nodes])
  return withChildren(stripped, at, (kids) => [...kids, wrapped])
}
