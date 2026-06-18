/**
 * fieldAutoBlur.js — release keyboard focus held by panel input fields.
 *
 * The document-level hotkey dispatcher only acts when `e.target` is BODY
 * (see Hotkeys.js). A focused panel field (stroke width, dimensions, …) keeps
 * focus indefinitely after an edit, so tool shortcuts and Delete get swallowed
 * by the input instead of reaching the canvas. These helpers give focus back:
 *   - `attachIdleBlur` blurs a field after a short idle period,
 *   - `blurActiveField` is called on deselection so a field never outlives its
 *     element's selection.
 *
 * @module fieldAutoBlur
 */

// Idle time before a focused field releases focus on its own.
export const FIELD_IDLE_BLUR_MS = 3000

/**
 * Blur whatever input currently holds focus, descending through shadow roots to
 * reach the real focused node (panel fields live several shadow roots deep).
 * No-op when focus is already on the body.
 * @returns {void}
 */
export const blurActiveField = () => {
  let el = document.activeElement
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
  if (el && el !== document.body && typeof el.blur === 'function') el.blur()
}

/**
 * Attach an idle-blur timer to a custom input element. Every interaction
 * (focus, typing, value change) rearms the timer; once `FIELD_IDLE_BLUR_MS`
 * elapses with no interaction the field blurs itself.
 * @param {HTMLElement} host the se-* custom element whose shadow tree holds the input
 * @returns {void}
 */
export const attachIdleBlur = (host) => {
  let timer = null
  const arm = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      // `document.activeElement` resolves to the outermost shadow host that
      // contains the focus, so this is true while the field is still focused.
      if (document.activeElement === host) blurActiveField()
    }, FIELD_IDLE_BLUR_MS)
  }
  // `focusin`/`input`/`keyup` are composed and bubble out of the inner shadow
  // roots, so listening on the host catches interaction with the native input.
  host.addEventListener('focusin', arm)
  host.addEventListener('input', arm)
  host.addEventListener('keyup', arm)
}
