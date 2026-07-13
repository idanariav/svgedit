/**
 * pasteFallbackArmer.js — timing-coordinated fallback for Cmd/Ctrl+V paste.
 *
 * Some hosts (e.g. Electron/Obsidian) route the OS Cmd/Ctrl+V accelerator
 * through an edit-command that only targets a focused *editable* element, so
 * the browser's native `paste` DOM event never reaches `document` when the
 * workarea (not editable) has focus — silently breaking keyboard paste even
 * though the context menu's Paste (which reads the internal clipboard
 * snapshot directly) keeps working.
 *
 * `arm()` on the Cmd/Ctrl+V keydown, `disarm()` from the native `paste`
 * handler when it actually receives an event. If no native `paste` event
 * shows up within `delayMs`, `onFallback` runs — the caller (EditorStartup.js)
 * uses this to try `navigator.clipboard.readText()` so external content
 * (not just svgedit's own internal clipboard) can still be recovered, falling
 * back further to the internal-clipboard paste the context menu uses if that
 * read is blocked. Regular browsers dispatch `paste` well within the window,
 * so `disarm()` wins the race there and `onFallback` never fires.
 *
 * @module pasteFallbackArmer
 */

/**
 * @param {() => void} onFallback called once if never disarmed within `delayMs`
 * @param {number} [delayMs]
 * @returns {{arm: () => void, disarm: () => void}}
 */
export const createPasteFallbackArmer = (onFallback, delayMs = 80) => {
  let armed = false
  return {
    arm () {
      armed = true
      setTimeout(() => {
        if (armed) {
          armed = false
          onFallback()
        }
      }, delayMs)
    },
    disarm () {
      armed = false
    }
  }
}
