/**
 * Document model → SVG DOM (R1 step b): the renderer that makes the DOM a view of the model.
 *
 * `renderNode` builds DOM for a model node; `reconcile(dom, prev, next)` patches the DOM that shows `prev` so it shows `next`,
 * touching only what differs: a subtree that is the same object in both (the model shares unchanged subtrees) is skipped
 * without a look, attributes are diffed by name, children are matched by `id` (so a reordered or moved object keeps its DOM
 * node, and whatever points at it: selectors, listeners) and otherwise by position. `readDom` is the inverse, a DOM → model
 * re-read for code that still edits the DOM; `readDom(renderNode(n))` equals `n` for every drawing (the oracle, tested on
 * the round-trip fixtures).
 *
 * Names stay qualified strings in the model; the namespace of a DOM node comes from the `xmlns` declarations in scope, with the
 * SVG, `se:` and `xlink:` defaults for the drawings that used the prefixes without declaring them.
 * @module model-render
 * @license MIT
 */
import { element, text, cdata, comment, pi } from './model/node.ts'
import type { ModelNode, ModelElement } from './model/node.ts'
import { NS } from './namespaces.ts'

const XMLNS_NS = 'http://www.w3.org/2000/xmlns/'
const DEFAULT_PREFIXES: Record<string, string> = { se: NS.SE, xlink: NS.XLINK, xml: NS.XML, xmlns: XMLNS_NS }

type Scope = Readonly<Record<string, string>>

/** The prefix → namespace map in scope inside `el` (`''` is the default namespace). */
const scopeOf = (el: ModelElement, outer: Scope): Scope => {
  let scope = outer
  for (const { name, value } of el.attrs) {
    if (name === 'xmlns') scope = { ...scope, '': value }
    else if (name.startsWith('xmlns:')) scope = { ...scope, [name.slice(6)]: value }
  }
  return scope
}

const prefixOf = (qname: string): string => (qname.includes(':') ? qname.slice(0, qname.indexOf(':')) : '')

/** Build the DOM for `node` (and its subtree) in `doc`. `scope` is the namespace map of its parent. */
export const renderNode = (doc: Document, node: ModelNode, scope: Scope = { '': NS.SVG }): Node => {
  switch (node.kind) {
    case 'text': return doc.createTextNode(node.value)
    // An HTML document cannot hold CDATA sections: the text is kept, the section marker is not
    case 'cdata': return doc.contentType.includes('xml') ? doc.createCDATASection(node.value) : doc.createTextNode(node.value)
    case 'comment': return doc.createComment(node.value)
    case 'pi': return doc.contentType.includes('xml') ? doc.createProcessingInstruction(node.target, node.value) : doc.createComment(`?${node.target} ${node.value}?`)
    case 'element': {
      const inner = scopeOf(node, scope)
      const prefix = prefixOf(node.name)
      const el = doc.createElementNS(inner[prefix] ?? DEFAULT_PREFIXES[prefix] ?? NS.SVG, node.name)
      for (const a of node.attrs) setAttribute(el, inner, a.name, a.value)
      for (const c of node.children) el.appendChild(renderNode(doc, c, inner))
      return el
    }
  }
}

const setAttribute = (el: Element, scope: Scope, name: string, value: string): void => {
  // The attribute the DOM already has under this name keeps its namespace (a drawing that used `se:` without declaring it
  // has it in none); a second one in the declared namespace would sit beside it and lose to it on every read
  const existing = el.getAttributeNode(name)
  if (existing) {
    existing.value = value
    return
  }
  const prefix = prefixOf(name)
  if (name === 'xmlns' || prefix === 'xmlns') el.setAttributeNS(XMLNS_NS, name, value)
  else if (prefix) el.setAttributeNS(scope[prefix] ?? DEFAULT_PREFIXES[prefix] ?? null, name, value)
  else el.setAttribute(name, value)
}

const removeAttribute = (el: Element, name: string): void => {
  if (el.hasAttribute(name)) el.removeAttribute(name)
}

const sameKind = (a: ModelNode, b: ModelNode): boolean =>
  a.kind === b.kind && (a.kind !== 'element' || a.name === (b as ModelElement).name)

const idOf = (n: ModelNode): string | undefined => (n.kind === 'element' ? n.attrs.find((a) => a.name === 'id')?.value : undefined)

const setData = (dom: Node, next: ModelNode): void => {
  if (next.kind === 'pi') (dom as ProcessingInstruction).data = next.value
  else if (next.kind !== 'element') (dom as CharacterData).data = next.value
}

/** Nodes taken out of the DOM, by id (with the model each showed, when `reconcile` took it out; otherwise it is read from the node): a later patch that needs an element with that id gets the same node back. */
export type NodePool = Map<string, { dom: Element, model?: ModelElement }>

export interface ReconcileOptions {
  /** Keeps removed elements (by id) so that undoing a removal brings back the same node, and with it whatever is attached to it. */
  pool?: NodePool
  /** Called for every element whose attributes changed, that was created or put back, and for the parent of a removed node. */
  touched?: (el: Element) => void
}

/**
 * Patch `dom` (which shows `prev`) so it shows `next`. Returns the DOM node that shows `next`: `dom` itself, or a replacement
 * when the node's kind or tag changed (it is swapped in place).
 */
export const reconcile = (dom: Node, prev: ModelNode, next: ModelNode, scope: Scope = { '': NS.SVG }, options: ReconcileOptions = {}): Node => {
  if (prev === next) return dom
  if (!sameKind(prev, next)) {
    const fresh = build(dom.ownerDocument as Document, next, scope, options)
    dom.parentNode?.replaceChild(fresh, dom)
    return fresh
  }
  if (next.kind !== 'element') {
    setData(dom, next)
    return dom
  }
  const el = dom as Element
  const before = prev as ModelElement
  const inner = scopeOf(next, scope)
  const nextByName = new Map(next.attrs.map((a) => [a.name, a.value]))
  const prevByName = new Map(before.attrs.map((a) => [a.name, a.value]))
  let changed = false
  for (const a of before.attrs) if (!nextByName.has(a.name)) { removeAttribute(el, a.name); changed = true }
  for (const a of next.attrs) if (prevByName.get(a.name) !== a.value) { setAttribute(el, inner, a.name, a.value); changed = true }
  if (changed) options.touched?.(el)
  reconcileChildren(el, before.children, next.children, inner, options)
  return dom
}

/** `renderNode`, but an element the pool still holds comes back as that node, patched to `next`. */
const build = (doc: Document, next: ModelNode, scope: Scope, options: ReconcileOptions): Node => {
  const id = idOf(next)
  const kept = id !== undefined ? options.pool?.get(id) : undefined
  if (kept && next.kind === 'element' && kept.dom.nodeName === next.name) {
    options.pool?.delete(id as string)
    reconcile(kept.dom, kept.model ?? (readDom(kept.dom) as ModelElement), next, scope, options)
    options.touched?.(kept.dom)
    return kept.dom
  }
  const fresh = renderNode(doc, next, scope)
  if (fresh.nodeType === 1) options.touched?.(fresh as Element)
  return fresh
}

const reconcileChildren = (el: Element, prev: readonly ModelNode[], next: readonly ModelNode[], scope: Scope, options: ReconcileOptions): void => {
  const domKids = Array.from(el.childNodes)
  // DOM child i shows prev child i; ids find a child that moved, position finds the rest
  const byId = new Map<string, number>()
  prev.forEach((p, i) => { const id = idOf(p); if (id !== undefined && !byId.has(id)) byId.set(id, i) })
  const used = new Set<number>()
  const out: Node[] = next.map((n, i) => {
    const id = idOf(n)
    let from = id !== undefined ? byId.get(id) : undefined
    if (from === undefined && id === undefined && i < prev.length && idOf(prev[i]) === undefined && !used.has(i)) from = i
    if (from !== undefined && !used.has(from) && domKids[from] && sameKind(prev[from], n)) {
      used.add(from)
      return reconcile(domKids[from], prev[from], n, scope, options)
    }
    return build(el.ownerDocument as Document, n, scope, options)
  })
  const keep = new Set(out)
  let removed = false
  domKids.forEach((k, i) => {
    if (k.parentNode !== el || keep.has(k)) return
    const id = idOf(prev[i])
    if (id !== undefined && k.nodeType === 1 && options.pool) options.pool.set(id, { dom: k as Element, model: prev[i] as ModelElement })
    el.removeChild(k)
    removed = true
  })
  if (removed) options.touched?.(el)
  // Put the children in order moving as few as possible: the ones that are already in the right order relative to each other
  // (the longest increasing run of old positions) stay, the others are inserted before their next sibling, last to first.
  const oldAt = new Map<Node, number>(domKids.map((k, i) => [k, i]))
  const stay = longestRun(out.map((k) => oldAt.get(k) ?? -1))
  for (let i = out.length - 1; i >= 0; i--) {
    if (stay.has(i)) continue
    el.insertBefore(out[i], out[i + 1] ?? null)
  }
}

/**
 * The indexes of a longest strictly increasing subsequence of `values` (negative values, nodes that are new, never belong to it).
 */
const longestRun = (values: readonly number[]): Set<number> => {
  const tails: number[] = [] // index into values of the smallest tail of a run of each length
  const prev: number[] = new Array(values.length).fill(-1)
  values.forEach((v, i) => {
    if (v < 0) return
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (values[tails[mid]] < v) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) prev[i] = tails[lo - 1]
    tails[lo] = i
  })
  const keep = new Set<number>()
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) keep.add(i)
  return keep
}

/** The model of a DOM subtree (the inverse of `renderNode`): names as the DOM has them, attributes in DOM order. */
export const readDom = (node: Node): ModelNode => {
  switch (node.nodeType) {
    case 3: return text((node as Text).data)
    case 4: return cdata((node as CDATASection).data)
    case 8: return comment((node as Comment).data)
    case 7: return pi((node as ProcessingInstruction).target, (node as ProcessingInstruction).data)
    default: {
      const el = node as Element
      return element(
        el.nodeName,
        Array.from(el.attributes, (a) => ({ name: a.name, value: a.value })),
        Array.from(el.childNodes, readDom)
      )
    }
  }
}
