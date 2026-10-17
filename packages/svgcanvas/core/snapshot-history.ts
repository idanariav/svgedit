/**
 * Undo and redo as model snapshots (R1 step d): the drawing after every command, and a step is `reconcile(dom, now, snapshot)`.
 *
 * Every command that lands on the stack records the model of `#svgcontent` after it; undoing to `n` commands, or redoing, makes
 * the DOM show snapshot `n`. The command objects stay on the stack for their labels and counts (and still build up everywhere
 * they are built); what they do when (un)applied is replaced by the snapshot, so an undo restores exactly what the drawing was,
 * not what the command remembered to put back.
 *
 * The content root's view attributes (`x`, `y`, `width`, `height`: scroll and zoom) are not part of a snapshot and are never
 * touched; `viewBox` is the document size and is. Ephemeral overlays are parked while the DOM is patched. Removed elements are
 * kept in a pool by id, so undoing a removal brings back the same node, and with it what is attached to it (data storage,
 * listeners, selectors).
 *
 * @module snapshot-history
 * @license MIT
 */
import { readDom, reconcile } from './model-render.ts'
import type { NodePool } from './model-render.ts'
import { EPHEMERAL_ATTR } from './history.js'
import type { ModelElement, ModelNode } from './model/node.ts'

/** Content-root attributes that follow the view (scroll, zoom), not the drawing. */
const VIEW_ATTRS = new Set(['x', 'y', 'width', 'height'])

const strip = (node: ModelNode, isRoot: boolean): ModelNode | null => {
  if (node.kind !== 'element') return node
  if (node.attrs.some((a) => a.name === EPHEMERAL_ATTR)) return null
  const children = node.children.map((c) => strip(c, false)).filter((c): c is ModelNode => c !== null)
  return { ...node, attrs: isRoot ? node.attrs.filter((a) => !VIEW_ATTRS.has(a.name)) : node.attrs, children }
}

/** The drawing as a snapshot holds it. */
export const readSnapshot = (content: Element): ModelElement => strip(readDom(content), true) as ModelElement

const sameValue = (a: ModelNode, b: ModelNode): boolean =>
  a.kind === b.kind && (a as { value?: string }).value === (b as { value?: string }).value && (a as { target?: string }).target === (b as { target?: string }).target

/**
 * `next`, with every subtree that equals the one at the same place in `prev` replaced by that one. Snapshots then share what
 * an edit did not touch, so a long history costs the changed paths, not a copy of the drawing per step, and `reconcile` skips
 * the shared subtrees by identity. Children are matched by id, then by position.
 */
export const share = (prev: ModelNode | undefined, next: ModelNode): ModelNode => {
  if (!prev || prev === next || prev.kind !== next.kind) return next
  if (next.kind !== 'element') return sameValue(prev, next) ? prev : next
  const p = prev as ModelElement
  if (p.name !== next.name) return next
  const byId = new Map<string, ModelNode>()
  for (const c of p.children) if (c.kind === 'element') { const id = c.attrs.find((a) => a.name === 'id')?.value; if (id !== undefined) byId.set(id, c) }
  const children = next.children.map((c, i) => {
    const id = c.kind === 'element' ? c.attrs.find((a) => a.name === 'id')?.value : undefined
    return share(id !== undefined ? byId.get(id) : p.children[i], c)
  })
  const sameAttrs = p.attrs.length === next.attrs.length && p.attrs.every((a, i) => a.name === next.attrs[i].name && a.value === next.attrs[i].value)
  if (sameAttrs && children.length === p.children.length && children.every((c, i) => c === p.children[i])) return p
  return { kind: 'element', name: next.name, attrs: sameAttrs ? p.attrs : next.attrs, children }
}

export interface SnapshotTarget {
  /** push an entry for a step that landed (`edit`) */
  record: (label: string) => void
  /** aborted when the canvas is destroyed */
  signal: () => AbortSignal
  /** a transaction is open: it owns the drawing until it commits (its start is the baseline, not each change inside it) */
  held: () => boolean
  /** how many commands are applied now */
  count: () => number
  /** the content root (`#svgcontent`); loading a document replaces it, so it is asked for each time */
  content: () => Element
  /** called before the DOM is patched (drop the selection: its grips point at nodes that are about to change) */
  before: () => void
  /** called with the elements the step changed, after the DOM shows the snapshot */
  patched: (touched: Element[]) => void
}

export class SnapshotHistory {
  private states: ModelElement[] = []
  private readonly pool: NodePool = new Map()
  private readonly target: SnapshotTarget
  private observer: MutationObserver | null = null
  /** the content root the observer is attached to (loading a document replaces the root) */
  private watched: Element | null = null
  private listening = false
  /** a snapshot already taken for the command about to land (a transaction's commit) */
  private staged: ModelElement | null = null
  /** the DOM changed since the current snapshot was taken */
  private dirty = false
  /** the snapshot the DOM is showing: how many commands are applied */
  private at = 0

  constructor (target: SnapshotTarget) {
    this.target = target
  }

  /** Any user input starts an action: the drawing as it is then is where the action starts from. Gone with the canvas. */
  private listen (): void {
    if (this.listening) return
    this.listening = true
    const signal = this.target.signal()
    for (const type of ['pointerdown', 'mousedown', 'keydown', 'click', 'input', 'change']) {
      globalThis.document?.addEventListener(type, () => this.baseline(), { capture: true, signal })
    }
    signal.addEventListener('abort', () => this.observer?.disconnect())
  }

  /** The drawing as it is now, sharing what it has in common with `like`. */
  private read (like: ModelElement | undefined): ModelElement {
    return share(like, readSnapshot(this.target.content())) as ModelElement
  }

  /** The stack was cleared: the drawing as it is now is the new start. */
  reset (): void {
    const content = this.target.content()
    this.states = [readSnapshot(content)]
    this.pool.clear()
    this.watch(content)
    this.listen()
    this.dirty = false
    this.at = 0
  }

  /** Watches for changes made outside any command (a layer given its id, rounding, a lazily made <defs>, a step regenerated after its command landed). */
  private watch (content: Element): void {
    if (this.watched === content) return
    this.observer?.disconnect()
    this.observer = new MutationObserver((records) => { this.dirty = true; this.keepRemoved(records) })
    this.observer.observe(content, { attributes: true, childList: true, subtree: true, characterData: true })
    this.watched = content
  }

  /** Elements taken out of the DOM by the commands themselves are kept (by id), so undoing their removal brings the same node back. */
  private keepRemoved (records: MutationRecord[]): void {
    for (const r of records) {
      for (const n of r.removedNodes) {
        if (n.nodeType !== 1) continue
        const id = (n as Element).getAttribute('id')
        if (id && !(n as Element).isConnected) this.pool.set(id, { dom: n as Element })
      }
    }
  }

  /** Pending mutation records, taken (and their removals kept); how many there were. */
  private take (): number {
    const records = this.observer?.takeRecords() ?? []
    this.keepRemoved(records)
    return records.length
  }

  /** The state being shown takes in what changed since it was recorded (a command may touch the drawing after it landed). */
  private refresh (): void {
    if (!this.states.length) return
    const content = this.target.content()
    if (this.watched !== content) { this.watch(content); this.dirty = true }
    if (!this.dirty && !this.take()) return
    this.take()
    this.states[this.at] = this.read(this.states[this.at])
    this.dirty = false
  }

  /**
   * A user action is about to start (a press, a command, a transaction): whatever changed the drawing since the last
   * command, outside the history, belongs to the state this action will start from. Without this an undo would take such
   * a change back along with the action.
   */
  baseline (): void {
    if (this.target.held()) return
    this.refresh()
  }

  /** A command landed on the stack; `count` is how many commands are applied now. */
  pushed (count: number): void {
    if (!this.states.length) this.reset()
    this.watch(this.target.content())
    this.states.length = count
    this.states.push(this.staged ?? this.read(this.states[count - 1]))
    this.staged = null
    this.at = count
    // what the command itself changed is not drift
    this.take()
    this.dirty = false
  }

  /** The drawing as the DOM shows it now, sharing what it has in common with the state being shown; nothing is recorded. */
  current (): ModelElement {
    return this.read(this.states[this.at])
  }

  /** The next command to land is the one that produced `model` (a snapshot `current()` gave), so it need not be read again. */
  stage (model: ModelElement): void {
    this.staged = model
  }

  /** Make the DOM show the drawing as it was after `count` commands. */
  step (count: number): void {
    this.refresh()
    const want = this.states[count]
    if (!want) return
    const leaving = this.states[this.at]
    this.at = count
    this.show(leaving, want)
  }

  /**
   * Make the DOM show `want`, which differs from `shown` (the model of what the DOM shows now), and nothing else: no selection
   * is dropped and nothing is announced. Nothing is recorded either.
   * @returns the elements that were created or changed
   */
  render (shown: ModelElement, want: ModelElement): Element[] {
    const content = this.target.content()
    // Overlays are not part of the drawing: lift them out while the DOM is patched, and put them back
    const parked = Array.from(content.querySelectorAll(`[${EPHEMERAL_ATTR}]`))
      .filter((el) => !el.parentElement?.closest(`[${EPHEMERAL_ATTR}]`))
      .map((el) => ({ el, parent: el.parentNode as Node, next: el.nextSibling }))
    parked.forEach((p) => p.el.remove())
    const touched = new Set<Element>()
    reconcile(content, shown, want, { '': 'http://www.w3.org/2000/svg' }, { pool: this.pool, touched: (el) => touched.add(el) })
    for (const { el, parent, next } of parked) parent.insertBefore(el, next && next.parentNode === parent ? next : null)
    this.take()
    this.dirty = false
    return [...touched]
  }

  /** Make the DOM show `want`, which differs from `shown`: drop the selection first, announce the step after. Nothing is recorded. */
  show (shown: ModelElement, want: ModelElement): void {
    this.target.before()
    this.target.patched(this.render(shown, want))
  }

  /**
   * Change the drawing through the model: `fn` gets the model of the drawing as it is and returns the one it should become (a
   * function of `model/edit.ts`, say). The DOM is made to show the result by the renderer, and the step is recorded as `label`;
   * inside a transaction the step is the transaction's. Returns false when `fn` changed nothing (and so nothing is recorded).
   *
   * This is the write path R1 is moving every command onto: the model is what is edited, the DOM is what shows it.
   */
  edit (label: string, fn: (root: ModelElement) => ModelElement): boolean {
    this.baseline()
    const shown = this.current()
    const next = fn(shown)
    if (next === shown) return false
    this.render(shown, next)
    if (!this.target.held()) this.stage(next) // a transaction stages its own, at commit
    this.target.record(label)
    return true
  }
}
