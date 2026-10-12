/**
 * Tool shortcut badges: the key that activates a tool, drawn at the bottom right of its icon in the left
 * panel (a `data-shortcut` attribute that `svgedit.css` paints with `::after`, so the icon artwork stays the same
 * whatever the binding is). A tool without a key gets nothing. The text follows the hotkey manager's *effective*
 * keys, so a rebinding in the Hotkey Manager shows at once.
 *
 * A flyout (the Shapes button) has no key of its own by default; its face activates the tool last picked from
 * it, so it shows that tool's key until it is bound itself.
 * @module toolShortcutBadges
 */
import { formatBadgeKey } from './Hotkeys.js'

const TOOL_SELECTOR = 'se-button[id], se-flyingbutton[id], se-shape-library[id]'

/**
 * @param {import('./Hotkeys.js').default} hotkeys
 * @param {Element} el a tool button
 * @returns {string} the badge text, '' for none
 */
export const badgeFor = (hotkeys, el) => {
  const own = hotkeys.effectiveKeys(el.id)[0]
  if (own) return formatBadgeKey(own)
  const slot = /** @type {any} */ (el).activeSlot
  return slot?.id ? formatBadgeKey(hotkeys.effectiveKeys(slot.id)[0]) : ''
}

/**
 * Keep the badges of `panel`'s tools in step with the hotkeys.
 * @param {Element} panel the left tool column
 * @param {import('./Hotkeys.js').default} hotkeys
 * @returns {{refresh: () => void, destroy: () => void}}
 */
export const initToolShortcutBadges = (panel, hotkeys) => {
  const refresh = () => {
    for (const el of panel.querySelectorAll(TOOL_SELECTOR)) {
      const text = badgeFor(hotkeys, el)
      if (text) el.setAttribute('data-shortcut', text)
      else el.removeAttribute('data-shortcut')
    }
  }
  let queued = false
  // Tools arrive late (extensions) and a flyout's face changes when another tool is picked: look again once
  // the burst of changes is over.
  const later = () => {
    if (queued) return
    queued = true
    queueMicrotask(() => { queued = false; refresh() })
  }
  const unsubscribe = hotkeys.onChange(later)
  const observer = new MutationObserver((records) => {
    if (records.length) later()
  })
  observer.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['id', 'pressed'] })
  panel.addEventListener('click', later)
  refresh()
  return {
    refresh,
    destroy () {
      unsubscribe()
      observer.disconnect()
      panel.removeEventListener('click', later)
    }
  }
}
