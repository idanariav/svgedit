/**
 * toolAutoFold.js — fold the left column's last tools into "Additional tools" while the pane is too short
 * to show them all, and bring them back when it grows.
 *
 * The fold is *temporary*: a folded tool carries `data-auto-folded` and is never saved as an overflow tool
 * (`withoutFold` puts it back at the end of the main list before the order is persisted), so shrinking the
 * window and growing it again leaves the user's own order untouched.
 *
 * @module toolAutoFold
 */

const FOLDED = 'data-auto-folded'

/**
 * A saved order with the auto-folded tools counted as main tools again (they were the tail of the main list).
 * @param {{main: string[], overflow: string[]}} order as read from the DOM
 * @param {string[]} folded ids of the tools folded by `toolAutoFold`, in their main-row order
 * @returns {{main: string[], overflow: string[]}}
 */
export const withoutFold = ({ main, overflow }, folded) => ({
  main: [...main, ...folded],
  overflow: overflow.filter((id) => !folded.includes(id))
})

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container `#tools_left`
 * @param {HTMLElement} opts.overflowHost the `<se-tool-overflow>` inside it
 * @returns {{fit: () => void, folded: () => string[], destroy: () => void}}
 */
export const initToolAutoFold = ({ container, overflowHost }) => {
  const foldedEls = () => Array.from(overflowHost.children).filter((el) => el.hasAttribute(FOLDED))
  const overflows = () => container.scrollHeight > container.clientHeight + 1

  const unfoldAll = () => {
    foldedEls().forEach((el) => {
      el.removeAttribute(FOLDED)
      container.insertBefore(el, overflowHost)
    })
  }

  const fit = () => {
    // A tool the user dragged out of "Additional tools" is theirs again.
    Array.from(container.querySelectorAll(`[${FOLDED}]`))
      .filter((el) => el.parentElement !== overflowHost)
      .forEach((el) => el.removeAttribute(FOLDED))
    // The folded tools sit first in the overflow, so taking the first one back restores the main order.
    while (foldedEls().length) {
      const el = foldedEls()[0]
      el.removeAttribute(FOLDED)
      container.insertBefore(el, overflowHost)
      if (overflows()) {
        el.setAttribute(FOLDED, '')
        overflowHost.insertBefore(el, overflowHost.firstChild)
        break
      }
    }
    // Fold the last main tool until the column fits (or nothing is left to fold).
    while (overflows()) {
      const main = Array.from(container.children).filter((el) => el !== overflowHost && el.id)
      const el = /** @type {HTMLElement|undefined} */ (main[main.length - 1])
      if (!el) break
      if (el.tabIndex === 0) { el.tabIndex = -1; overflowHost.tabIndex = 0 }
      el.setAttribute(FOLDED, '')
      overflowHost.insertBefore(el, overflowHost.firstChild)
    }
  }

  let queued = 0
  const later = () => {
    if (queued) return
    queued = requestAnimationFrame(() => { queued = 0; fit() })
  }
  const observer = new ResizeObserver(later)
  observer.observe(container)
  later()

  return {
    fit,
    folded: () => foldedEls().map((el) => el.id),
    destroy () {
      observer.disconnect()
      if (queued) cancelAnimationFrame(queued)
      unfoldAll()
    }
  }
}
