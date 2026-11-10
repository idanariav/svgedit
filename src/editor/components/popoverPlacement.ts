// popoverPlacement.ts — Places a toolbar popover (a flyout or the Additional tools drawer) beside its button, inside the editor's own box.

const MARGIN = 8

/**
 * Put a `position: fixed` menu level with its anchor, moved up when it would run past the bottom.
 * The limits are the window narrowed to the editor's box: a host pane (Obsidian's) is often shorter than the window.
 * A transformed or contained host ancestor makes `fixed` relative to itself rather than the window, so its offset is
 * measured and taken back out.
 * @param menu the popover, already displayed
 * @param anchor the button it opens from
 * @param bounds the editor's box (the `.svg_editor` root), or null for the window
 * @param capHeight cap the menu to the available height (it must scroll then)
 */
export const placeBeside = (menu: HTMLElement, anchor: Element, bounds: Element | null, capHeight = false): void => {
  const vh = window.innerHeight
  const box = bounds?.getBoundingClientRect()
  const minTop = Math.max(0, box?.top ?? 0) + MARGIN
  const maxBottom = Math.min(vh, box?.bottom ?? vh) - MARGIN
  if (capHeight) menu.style.maxHeight = `${Math.max(0, maxBottom - minTop)}px`
  menu.style.top = '0px'
  const { top: offset, height } = menu.getBoundingClientRect()
  const at = anchor.getBoundingClientRect().top
  const top = at + height > maxBottom ? Math.max(minTop, maxBottom - height) : at
  menu.style.top = `${top - offset}px`
}
