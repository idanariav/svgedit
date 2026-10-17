/**
 * The undo stack as document-model snapshots, kept beside the command stack as an oracle (R1 step d, observer mode).
 *
 * Every command that lands on the stack records the model of the drawing after it (`readDom` of `#svgcontent`, ephemeral
 * overlays left out); every undo and redo then checks that the DOM the command left is the snapshot of that point. A
 * difference means the command's undo (or redo) does not restore the drawing exactly: the bug class R1 is meant to end
 * ("commands built before their mutation", side effects keyed on command type, defs purged from the live DOM…). When the
 * stack is clean over the e2e suite, undo can become `reconcile(dom, current, previous)` and the command classes can go.
 *
 * Off by default (a snapshot per command costs a DOM walk); `globalThis.__SE_SNAPSHOT_MIRROR = true` before the canvas is
 * built turns it on, and the e2e fixtures do. `problems` lists what it found.
 * @module snapshot-mirror
 * @license MIT
 */
import { readDom } from './model-render.ts'
import { EPHEMERAL_ATTR } from './history.js'
import type { ModelElement, ModelNode } from './model/node.ts'

/** Attributes of the content root that follow the view (scroll, zoom), not the drawing. */
const VIEW_ATTRS = new Set(['x', 'y', 'viewBox', 'width', 'height'])
/** Numbers are compared to two decimals: the editor rounds attribute values after a command has landed. */
const NUMBER = /-?\d+\.\d{3,}/g
const roundNumbers = (v: string): string => v.replace(NUMBER, (n) => String(Math.round(Number(n) * 100) / 100))
/** `pointer-events` follows the active tool (selectable or not), it is not part of the drawing. */
const dropPointerEvents = (v: string): string => v.split(';').filter((d) => d.trim() && !d.trim().startsWith('pointer-events')).join(';')

const cleanAttrs = (attrs: ModelElement['attrs'], isRoot: boolean): ModelElement['attrs'] =>
  attrs
    .filter((a) => !(isRoot && VIEW_ATTRS.has(a.name)))
    .map((a) => (a.name === 'style' ? { name: a.name, value: dropPointerEvents(a.value) } : { name: a.name, value: roundNumbers(a.value) }))
    .filter((a) => !(a.name === 'style' && a.value === ''))

const strip = (node: ModelNode, isRoot: boolean): ModelNode | null => {
  if (node.kind !== 'element') return node
  if (node.attrs.some((a) => a.name === EPHEMERAL_ATTR)) return null
  const children = node.children.map((c) => strip(c, false)).filter((c): c is ModelNode => c !== null)
  // <defs> is made when the first paint server needs it, outside the history
  if (node.name === 'defs' && !children.some((c) => c.kind === 'element')) return null
  // A layer's id is given on first use, outside the history
  const isLayer = node.name === 'g' && node.attrs.some((a) => a.name === 'class' && a.value.split(/\s+/).includes('layer'))
  const attrs = cleanAttrs(node.attrs, isRoot).filter((a) => !(isLayer && a.name === 'id'))
  return { ...node, attrs, children }
}

/** The model of the drawing as the undo history sees it. */
export const readContent = (content: Element): ModelElement => strip(readDom(content), true) as ModelElement

const describe = (n: ModelNode | undefined): string => {
  if (!n) return '(nothing)'
  if (n.kind !== 'element') return JSON.stringify(n.value).slice(0, 60)
  const id = n.attrs.find((a) => a.name === 'id')?.value
  return `<${n.name}${id ? ` id=${id}` : ''}>`
}

/** The first place two trees differ, as a readable path; null when they are equal. */
export const firstDifference = (a: ModelNode, b: ModelNode, at = ''): string | null => {
  if (a === b) return null
  if (a.kind !== b.kind || (a.kind === 'element' && b.kind === 'element' && a.name !== b.name)) return `${at || '/'}: ${describe(a)} vs ${describe(b)}`
  if (a.kind !== 'element' || b.kind !== 'element') return (a as { value: string }).value === (b as { value: string }).value ? null : `${at}: text ${describe(a)} vs ${describe(b)}`
  const here = `${at}/${a.name}${a.attrs.find((x) => x.name === 'id') ? '#' + a.attrs.find((x) => x.name === 'id')?.value : ''}`
  const names = new Set([...a.attrs, ...b.attrs].map((x) => x.name))
  for (const n of names) {
    const x = a.attrs.find((y) => y.name === n)?.value
    const y = b.attrs.find((z) => z.name === n)?.value
    if (x !== y) return `${here}@${n}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`
  }
  const len = Math.max(a.children.length, b.children.length)
  for (let i = 0; i < len; i++) {
    const d = a.children[i] && b.children[i] ? firstDifference(a.children[i], b.children[i], here) : `${here}/[${i}]: ${describe(a.children[i])} vs ${describe(b.children[i])}`
    if (d) return d
  }
  return null
}

export class SnapshotMirror {
  /** what went wrong, oldest first */
  readonly problems: string[] = []
  private states: ModelElement[] = []
  private pointer = 0

  private readonly read: () => ModelElement

  constructor (read: () => ModelElement) {
    this.read = read
  }

  /** The undo stack was cleared: the drawing as it is now is the new start. */
  reset (): void {
    this.states = [this.read()]
    this.pointer = 0
  }

  /** A command landed on the stack (the DOM shows its result). */
  pushed (): void {
    if (!this.states.length) this.reset()
    this.states.length = this.pointer + 1
    this.states.push(this.read())
    this.pointer++
  }

  /** `text` is the undone command's label. */
  undone (text: string): void {
    if (this.pointer === 0) return
    this.pointer--
    this.check(`undo of "${text}"`)
  }

  redone (text: string): void {
    if (this.pointer >= this.states.length - 1) return
    this.pointer++
    this.check(`redo of "${text}"`)
  }

  private check (what: string): void {
    const want = this.states[this.pointer]
    const diff = firstDifference(this.read(), want)
    if (diff) this.problems.push(`${what} did not restore the drawing: ${diff}`)
  }
}
