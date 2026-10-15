// @ts-check
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

/** @typedef {{readonly name: string, readonly value: string}} Attr */
/** @typedef {{readonly kind: 'element', readonly name: string, readonly attrs: readonly Attr[], readonly children: readonly ModelNode[]}} ModelElement */
/** @typedef {{readonly kind: 'text', readonly value: string}} ModelText */
/** @typedef {{readonly kind: 'cdata', readonly value: string}} ModelCData */
/** @typedef {{readonly kind: 'comment', readonly value: string}} ModelComment */
/** @typedef {{readonly kind: 'pi', readonly target: string, readonly value: string}} ModelPI */
/** @typedef {{readonly kind: 'doctype', readonly value: string}} ModelDoctype */
/** @typedef {{readonly kind: 'decl', readonly version: string, readonly encoding?: string, readonly standalone?: string}} ModelDecl */
/** @typedef {ModelElement | ModelText | ModelCData | ModelComment | ModelPI} ModelNode */
/** @typedef {ModelDecl | ModelDoctype | ModelComment | ModelPI} ModelMisc Nodes allowed outside the root element. */
/**
 * @typedef {object} ModelDocument
 * @property {readonly ModelMisc[]} prolog XML declaration, doctype, comments and PIs before the root
 * @property {ModelElement} root
 * @property {readonly (ModelComment | ModelPI)[]} epilog comments and PIs after the root
 */
/** Child indexes from a node down to a descendant; `[]` is the node itself. @typedef {readonly number[]} NodePath */

/**
 * @param {string} name qualified name
 * @param {readonly Attr[]} [attrs]
 * @param {readonly ModelNode[]} [children]
 * @returns {ModelElement}
 */
export const element = (name, attrs = [], children = []) =>
  Object.freeze({ kind: 'element', name, attrs: Object.freeze(attrs.slice()), children: Object.freeze(children.slice()) })

/** @param {string} value @returns {ModelText} */
export const text = (value) => Object.freeze({ kind: 'text', value })
/** @param {string} value @returns {ModelCData} */
export const cdata = (value) => Object.freeze({ kind: 'cdata', value })
/** @param {string} value @returns {ModelComment} */
export const comment = (value) => Object.freeze({ kind: 'comment', value })
/** @param {string} target @param {string} value @returns {ModelPI} */
export const pi = (target, value) => Object.freeze({ kind: 'pi', target, value })
/** @param {string} value @returns {ModelDoctype} */
export const doctype = (value) => Object.freeze({ kind: 'doctype', value })
/**
 * @param {string} version
 * @param {string} [encoding]
 * @param {string} [standalone]
 * @returns {ModelDecl}
 */
export const decl = (version, encoding, standalone) =>
  Object.freeze({ kind: 'decl', version, ...(encoding === undefined ? {} : { encoding }), ...(standalone === undefined ? {} : { standalone }) })

/**
 * @param {ModelElement} el
 * @param {string} name
 * @returns {string | undefined}
 */
export const getAttr = (el, name) => el.attrs.find((a) => a.name === name)?.value

/**
 * A copy of `el` with the attribute set (kept in place if present, appended otherwise) or, for `null`, removed.
 * Returns `el` itself when nothing changes, so unchanged subtrees stay shared.
 * @param {ModelElement} el
 * @param {string} name
 * @param {string | null} value
 * @returns {ModelElement}
 */
export const setAttr = (el, name, value) => {
  const at = el.attrs.findIndex((a) => a.name === name)
  if (value === null) {
    return at < 0 ? el : element(el.name, el.attrs.filter((_, i) => i !== at), el.children)
  }
  if (at < 0) return element(el.name, [...el.attrs, Object.freeze({ name, value })], el.children)
  if (el.attrs[at].value === value) return el
  return element(el.name, el.attrs.map((a, i) => (i === at ? Object.freeze({ name, value }) : a)), el.children)
}

/**
 * @param {ModelNode | ModelElement} node
 * @param {NodePath} path
 * @returns {ModelNode | undefined} the node at `path`, or undefined when the path leaves the tree
 */
export const getAt = (node, path) => {
  /** @type {ModelNode | undefined} */
  let cur = node
  for (const i of path) {
    if (cur?.kind !== 'element') return undefined
    cur = cur.children[i]
  }
  return cur
}

/**
 * Replace the node at `path` with `fn(node)`, copying only the ancestors on the way down; every other node of the
 * result is the same object as in `root`. Returning the node unchanged returns `root` itself.
 * @param {ModelElement} root
 * @param {NodePath} path
 * @param {(node: ModelNode) => ModelNode} fn
 * @returns {ModelElement}
 */
export const updateAt = (root, path, fn) => {
  /**
   * @param {ModelNode} node
   * @param {number} depth
   * @returns {ModelNode}
   */
  const go = (node, depth) => {
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

/**
 * Depth-first walk (document order). Return `false` from `visit` to skip a node's children.
 * @param {ModelNode} node
 * @param {(node: ModelNode, path: NodePath) => boolean | void} visit
 * @param {number[]} [path]
 * @returns {void}
 */
export const walk = (node, visit, path = []) => {
  if (visit(node, path) === false || node.kind !== 'element') return
  node.children.forEach((c, i) => walk(c, visit, [...path, i]))
}
