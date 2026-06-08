/**
 * Position a `position: fixed` context menu at the given viewport coordinates,
 * keeping it inside the viewport.
 *
 * `position: fixed` is only resolved against the viewport when no ancestor
 * establishes a containing block. When svgedit is embedded somewhere that a
 * transformed/filtered/contained ancestor exists (e.g. the Obsidian plugin,
 * where the workspace leaf is positioned with a CSS transform), that ancestor
 * becomes the containing block, so `clientX`/`clientY` are no longer the
 * coordinates the menu is laid out in. We render the menu, measure the offset
 * between where it actually landed and where we asked, and correct for it —
 * which is a no-op in the plain-viewport case.
 *
 * @param {HTMLElement} dialog - the menu element (position: fixed)
 * @param {number} clientX - cursor viewport x
 * @param {number} clientY - cursor viewport y
 * @param {number} [offsetX] - horizontal shift applied to the cursor anchor
 * @returns {void}
 */
export const positionContextMenu = (dialog, clientX, clientY, offsetX = 0) => {
  // Render at the origin of the containing block so we can measure both the
  // menu's size and the containing block's offset from the viewport.
  dialog.style.left = '0px'
  dialog.style.top = '0px'
  dialog.style.display = 'block'
  const rect = dialog.getBoundingClientRect()
  const blockLeft = rect.left // viewport x when style.left === 0
  const blockTop = rect.top
  const vw = window.innerWidth
  const vh = window.innerHeight
  // Desired viewport position, clamped so the menu stays fully on screen.
  const vx = Math.max(0, Math.min(clientX + offsetX, vw - rect.width))
  const vy = Math.max(0, Math.min(clientY, vh - rect.height))
  // Convert the viewport target back into the containing block's coordinates.
  dialog.style.left = (vx - blockLeft) + 'px'
  dialog.style.top = (vy - blockTop) + 'px'
}
