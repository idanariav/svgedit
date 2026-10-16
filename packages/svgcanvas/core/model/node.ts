/**
 * Document model, layer 1: a persistent (immutable, structurally shared) XML tree.
 *
 * R1 of the re-architecture (`.claude/roadmap/rearchitecture.md`): the model is meant to become the source of truth
 * for a drawing, with the SVG DOM a view of it. This layer is the lossless base: every node of an SVG file (elements,
 * attributes in source order, text, CDATA, comments, processing instructions, the XML declaration and doctype) is a
 * frozen plain object, so an edit copies only the nodes on the path from the root and the previous root is the undo
 * snapshot (VectorCraft `crates/doc/src/lib.rs`: `Arc<Node>` children, `Document::node_mut`).
 *
 * Names are qualified strings (`se:corner-radius`), never resolved against namespace declarations: saved drawings
 * have used `se:` without declaring it, and a file must round-trip whatever it declares. `xmlns*` declarations are
 * ordinary attributes. Typed views of drawing features (layers, shapes, `se:` fields) are built on top of this tree.
 *
 * No DOM and no `window` here: this runs in Node (the headless engine) as well as in the browser.
 * @module model/node
 * @license MIT
 */

export interface Attr { readonly name: string, readonly value: string }
export interface ModelElement {
  readonly kind: 'element'
  readonly name: string
  readonly attrs: readonly Attr[]
  readonly children: readonly ModelNode[]
}
export interface ModelText { readonly kind: 'text', readonly value: string }
export interface ModelCData { readonly kind: 'cdata', readonly value: string }
export interface ModelComment { readonly kind: 'comment', readonly value: string }
export interface ModelPI { readonly kind: 'pi', readonly target: string, readonly value: string }
export interface ModelDoctype { readonly kind: 'doctype', readonly value: string }
export interface ModelDecl {
  readonly kind: 'decl'
  readonly version: string
  readonly encoding?: string
  readonly standalone?: string
}
export type ModelNode = ModelElement | ModelText | ModelCData | ModelComment | ModelPI
/** Nodes allowed outside the root element. */
export type ModelMisc = ModelDecl | ModelDoctype | ModelComment | ModelPI
export interface ModelDocument {
  /** XML declaration, doctype, comments and PIs before the root */
  readonly prolog: readonly ModelMisc[]
  readonly root: ModelElement
  /** comments and PIs after the root */
  readonly epilog: readonly (ModelComment | ModelPI)[]
}
/** Child indexes from a node down to a descendant; `[]` is the node itself. */
export type NodePath = readonly number[]

/** `name` is a qualified name. */
export const element = (name: string, attrs: readonly Attr[] = [], children: readonly ModelNode[] = []): ModelElement =>
  Object.freeze({ kind: 'element', name, attrs: Object.freeze(attrs.slice()), children: Object.freeze(children.slice()) })

export const text = (value: string): ModelText => Object.freeze({ kind: 'text', value })
export const cdata = (value: string): ModelCData => Object.freeze({ kind: 'cdata', value })
export const comment = (value: string): ModelComment => Object.freeze({ kind: 'comment', value })
export const pi = (target: string, value: string): ModelPI => Object.freeze({ kind: 'pi', target, value })
export const doctype = (value: string): ModelDoctype => Object.freeze({ kind: 'doctype', value })
export const decl = (version: string, encoding?: string, standalone?: string): ModelDecl =>
  Object.freeze({ kind: 'decl', version, ...(encoding === undefined ? {} : { encoding }), ...(standalone === undefined ? {} : { standalone }) })

export const getAttr = (el: ModelElement, name: string): string | undefined => el.attrs.find((a) => a.name === name)?.value

/**
 * A copy of `el` with the attribute set (kept in place if present, appended otherwise) or, for `null`, removed.
 * Returns `el` itself when nothing changes, so unchanged subtrees stay shared.
 */
export const setAttr = (el: ModelElement, name: string, value: string | null): ModelElement => {
  const at = el.attrs.findIndex((a) => a.name === name)
  if (value === null) {
    return at < 0 ? el : element(el.name, el.attrs.filter((_, i) => i !== at), el.children)
  }
  if (at < 0) return element(el.name, [...el.attrs, Object.freeze({ name, value })], el.children)
  if (el.attrs[at].value === value) return el
  return element(el.name, el.attrs.map((a, i) => (i === at ? Object.freeze({ name, value }) : a)), el.children)
}

/** The node at `path`, or undefined when the path leaves the tree. */
export const getAt = (node: ModelNode, path: NodePath): ModelNode | undefined => {
  let cur: ModelNode | undefined = node
  for (const i of path) {
    if (cur?.kind !== 'element') return undefined
    cur = cur.children[i]
  }
  return cur
}

/**
 * Replace the node at `path` with `fn(node)`, copying only the ancestors on the way down; every other node of the
 * result is the same object as in `root`. Returning the node unchanged returns `root` itself.
 */
export const updateAt = (root: ModelElement, path: NodePath, fn: (node: ModelNode) => ModelNode): ModelElement => {
  const go = (node: ModelNode, depth: number): ModelNode => {
    if (depth === path.length) return fn(node)
    if (node.kind !== 'element') throw new RangeError(`path [${path.join(',')}] leaves the tree at depth ${depth}`)
    const i = path[depth]
    const child = node.children[i]
    if (!child) throw new RangeError(`path [${path.join(',')}] has no child ${i} at depth ${depth}`)
    const next = go(child, depth + 1)
    if (next === child) return node
    return element(node.name, node.attrs, node.children.map((c, k) => (k === i ? next : c)))
  }
  const out = go(root, 0)
  if (out.kind !== 'element') throw new TypeError('the root must stay an element')
  return out
}

/** Depth-first walk (document order). Return `false` from `visit` to skip a node's children. */
export const walk = (node: ModelNode, visit: (node: ModelNode, path: NodePath) => boolean | void, path: number[] = []): void => {
  if (visit(node, path) === false || node.kind !== 'element') return
  node.children.forEach((c, i) => walk(c, visit, [...path, i]))
}
