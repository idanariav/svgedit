/**
 * The editor's interaction state on the drawing, as CSS rather than attributes on its elements (roadmap R11): which layers
 * take presses, and the dimming of what lies outside the group being edited. One `<style>` per canvas, a child of the svg
 * root (outside `#svgcontent`, so it is never saved, never in an undo snapshot), its rules scoped to this canvas by a
 * `data-se-canvas` attribute on that root (several editors share a document, and a `<style>` in inline SVG applies to all of
 * it).
 *
 * A piece of state is a **mark**: a name, the elements it applies to (asked again on every refresh, so it follows a
 * re-render or a load) and its declarations. Rules select an element by its path of `:nth-child` steps from the content
 * root, so the drawing carries nothing; the sheet is rebuilt when the content's structure changes (a `MutationObserver`),
 * when a load replaces the content, and when `refresh()` is called for a change that moves no node (another current layer).
 * @module interaction-style
 * @license MIT
 */

/** What a mark applies to, asked on every refresh. */
export type MarkTargets = () => readonly Element[]

export interface InteractionStyle {
  /** Set (or replace) mark `name`: `declarations` on the elements `targets` returns. */
  mark(name: string, targets: MarkTargets, declarations: string): void
  /** Take mark `name` off the drawing until the returned function puts it back (idempotent). */
  suspend(name: string): () => void
  /** Rebuild the sheet now (the state changed but no node moved). */
  refresh(): void
  /** The rules as they stand (for tests and the debug snapshot). */
  text(): string
  /** Stop watching the content (the canvas is destroyed). */
  stop(): void
}

let canvases = 0

/** `el`'s path from `root` as `:nth-child` steps, or null when `el` is not under `root`. */
export const pathFrom = (root: Element, el: Element): string | null => {
  const steps: string[] = []
  let node: Element = el
  while (node !== root) {
    const parent = node.parentElement
    if (!parent) return null
    steps.unshift(`:nth-child(${Array.prototype.indexOf.call(parent.children, node) + 1})`)
    node = parent
  }
  return steps.length ? steps.join(' > ') : null
}

/**
 * Give the canvas whose svg root is `svgroot` its interaction sheet. `content` is the current content root (a load replaces
 * it). `signal` stops the watching.
 */
export const createInteractionStyle = (svgroot: Element, content: () => Element | null, signal?: AbortSignal): InteractionStyle => {
  const id = String(++canvases)
  svgroot.setAttribute('data-se-canvas', id)
  const sheet = svgroot.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style')
  sheet.setAttribute('data-se-interaction', '')
  svgroot.prepend(sheet)
  const scope = `[data-se-canvas="${id}"] > #svgcontent`

  const marks = new Map<string, { targets: MarkTargets, declarations: string }>()
  const suspended = new Map<string, number>()
  let watched: Element | null = null

  const observer = typeof MutationObserver === 'function' ? new MutationObserver(() => build()) : null

  const watch = (root: Element | null): void => {
    if (root === watched) return
    observer?.disconnect()
    watched = root
    if (root) observer?.observe(root, { childList: true, subtree: true })
  }

  const build = (): void => {
    const root = content()
    watch(root)
    const rules: string[] = []
    if (root) {
      for (const [name, { targets, declarations }] of marks) {
        if (suspended.get(name)) continue
        const selectors = targets().map((el) => pathFrom(root, el)).filter((p): p is string => p !== null).map((p) => `${scope} > ${p}`)
        if (selectors.length) rules.push(`/* ${name} */ ${selectors.join(', ')} { ${declarations} }`)
      }
    }
    const text = rules.join('\n')
    if (sheet.textContent !== text) sheet.textContent = text
  }

  signal?.addEventListener('abort', () => { observer?.disconnect(); watched = null })

  return {
    mark (name, targets, declarations) {
      marks.set(name, { targets, declarations })
      build()
    },
    suspend (name) {
      suspended.set(name, (suspended.get(name) ?? 0) + 1)
      build()
      let resumed = false
      return () => {
        if (resumed) return
        resumed = true
        const n = (suspended.get(name) ?? 1) - 1
        if (n > 0) suspended.set(name, n)
        else suspended.delete(name)
        build()
      }
    },
    refresh: build,
    text: () => sheet.textContent ?? '',
    stop () { observer?.disconnect(); watched = null }
  }
}
