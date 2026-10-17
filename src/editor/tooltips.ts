// @ts-check
/**
 * Hover tooltips for the editor chrome: a short-delay replacement for the browser's native `title` tooltip, which waits
 * about a second (longer on some platforms) and sometimes never shows. Components keep authoring a plain `title`
 * attribute; while the pointer rests on an element that has one, the text is held back (so the native tooltip cannot
 * also appear) and drawn in a single bubble that comes up after `DELAY` ms, or at once while moving between neighbouring
 * tools. The `title` is put back when the pointer leaves.
 * @module tooltips
 */

const DELAY = 350
const WARM_DELAY = 40
/** After a bubble closed, moving to a neighbour shows its bubble at the short delay for this long (ms). */
const WARM_WINDOW = 600
const GAP = 8
const MARGIN = 6

/**
 * The element under the pointer (shadow DOM included) that carries a tooltip, innermost first.
 * @param root where to stop looking
 */
const tooltipOwner = (e: Event, root: Element): Element | null => {
  for (const node of e.composedPath()) {
    if (node === root) break
    if (node instanceof Element && node.getAttribute('title')) return node
  }
  return null
}

/**
 * Show the editor's tooltips.
 * @param root the editor container whose descendants (shadow roots included) are covered
 * @param host where the bubble is mounted; it must sit inside the themed `.svg_editor` so the tokens resolve
 * @param signal aborting it removes the listeners and the bubble
 */
export const initTooltips = (root: Element, host: Element, signal?: AbortSignal): { destroy: () => void } => {
  const tip = document.createElement('div') as HTMLDivElement & { showPopover?: () => void, hidePopover?: () => void }
  tip.className = 'se-tooltip'
  tip.setAttribute('role', 'tooltip')
  const hasPopover = typeof tip.showPopover === 'function'
  if (hasPopover) tip.setAttribute('popover', 'manual')
  else tip.hidden = true
  host.append(tip)

  let anchor: Element | null = null
  /** the text taken from the anchor's `title` */ let text: string = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  let shown = false
  let lastClosed = 0

  const place = () => {
    if (!anchor) return
    const a = anchor.getBoundingClientRect()
    const t = tip.getBoundingClientRect()
    let left = a.left + a.width / 2 - t.width / 2
    left = Math.min(Math.max(MARGIN, left), window.innerWidth - t.width - MARGIN)
    let top = a.bottom + GAP
    if (top + t.height > window.innerHeight - MARGIN) top = Math.max(MARGIN, a.top - GAP - t.height)
    tip.style.left = `${left}px`
    tip.style.top = `${top}px`
  }

  const show = () => {
    timer = undefined
    if (!anchor || !anchor.isConnected) return
    tip.textContent = text
    if (hasPopover) tip.showPopover?.()
    else tip.hidden = false
    shown = true
    tip.dataset.open = ''
    place()
  }

  /** Close the bubble and give the anchor its `title` back (unless the component set a newer one meanwhile). */
  const release = () => {
    clearTimeout(timer)
    timer = undefined
    if (shown) {
      if (hasPopover) tip.hidePopover?.()
      else tip.hidden = true
      shown = false
      delete tip.dataset.open
      lastClosed = Date.now()
    }
    if (anchor && !anchor.getAttribute('title')) anchor.setAttribute('title', text)
    anchor = null
    text = ''
  }

  const onOver = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    const owner = tooltipOwner(e, root)
    if (owner === anchor) return
    const wasShown = shown
    release()
    if (!owner) return
    anchor = owner
    text = owner.getAttribute('title') ?? ''
    owner.removeAttribute('title')
    const warm = wasShown || Date.now() - lastClosed < WARM_WINDOW
    timer = setTimeout(show, warm ? WARM_DELAY : DELAY)
  }

  const opts = { capture: true, signal }
  root.addEventListener('pointerover', (onOver as EventListener), opts)
  // not captured: `pointerleave` of the root only (the pointer left the editor), not of each element inside it
  root.addEventListener('pointerleave', release, { signal })
  root.addEventListener('pointerdown', release, opts)
  root.addEventListener('wheel', release, { ...opts, passive: true })
  root.addEventListener('keydown', release, opts)

  const destroy = () => {
    release()
    tip.remove()
  }
  signal?.addEventListener('abort', destroy, { once: true })
  return { destroy }
}
