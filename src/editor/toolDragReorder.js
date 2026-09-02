/**
 * toolDragReorder.js — drag-to-reorder for the left panel's tools.
 *
 * Native HTML5 drag-and-drop (mouse-only — `#tools_left` is hidden entirely
 * in tablet mode, so there's no touch requirement). The browser's own drag
 * threshold already tells a click from a drag apart, so the existing
 * click/dblclick-to-lock handlers on the tool buttons need no changes.
 * The dragged element is only ever repositioned on `drop`, never removed
 * from the DOM mid-drag (only dimmed via a CSS class), so the drag doesn't
 * get cancelled by its own source element disappearing.
 *
 * Only *direct children* of `container`/`overflowHost` are made draggable —
 * a tool's own sub-variants (e.g. the shapes flyout's Rect/Ellipse/Star/
 * Polygon) are never individually draggable, so `closest('[draggable="true"]')`
 * always resolves up to the right top-level tool even when hovering inside
 * an open flyout's own popup.
 *
 * Also wires up a keyboard-operable equivalent (`#tools_left` becomes an
 * ARIA `toolbar` with a roving tabindex over its direct children, mirroring
 * the mouse drag mechanics above):
 *   - ArrowUp/ArrowDown moves focus between tools (and, while the overflow
 *     popover is open, into/through its slotted tools too).
 *   - Space "grabs" the focused tool; ArrowUp/ArrowDown then moves it —
 *     swapping with a neighbor, or, at the edge of the main row/overflow
 *     bucket, crossing into the other one (same drop zones the mouse path
 *     supports). Space again drops it in place; Escape cancels and restores
 *     the order from when it was grabbed.
 *   - Enter forwards to the focused tool's own `click()`, since these are
 *     plain custom elements with no native keyboard activation of their own.
 * A visually-hidden live region announces grabs/moves/drops for screen
 * readers, since the moves themselves are plain DOM reordering with no
 * visible focus change to narrate otherwise.
 */

const isBefore = (evt, targetEl) => {
  const rect = targetEl.getBoundingClientRect()
  return evt.clientY < rect.top + rect.height / 2
}

const clearIndicators = (root) => {
  root.querySelectorAll('.se-drop-before, .se-drop-after').forEach((el) => {
    el.classList.remove('se-drop-before', 'se-drop-after')
  })
}

let sharedLiveRegion = null
const announce = (message) => {
  if (!sharedLiveRegion || !document.body.contains(sharedLiveRegion)) {
    sharedLiveRegion = document.createElement('div')
    sharedLiveRegion.setAttribute('aria-live', 'polite')
    sharedLiveRegion.setAttribute('role', 'status')
    sharedLiveRegion.style.cssText =
      'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;'
    document.body.appendChild(sharedLiveRegion)
  }
  // Clearing first (rather than overwriting directly) ensures back-to-back
  // identical announcements still register as a change for screen readers.
  sharedLiveRegion.textContent = ''
  setTimeout(() => { sharedLiveRegion.textContent = message }, 0)
}

const toolLabel = (el) => el.getAttribute('title') || el.id

const swapAdjacent = (list, el, dir) => {
  const otherIdx = list.indexOf(el) + dir
  if (otherIdx < 0 || otherIdx >= list.length) return false
  const other = list[otherIdx]
  const parent = el.parentElement
  if (dir < 0) parent.insertBefore(el, other)
  else parent.insertBefore(other, el)
  return true
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container `#tools_left`
 * @param {HTMLElement} opts.overflowHost the `<se-tool-overflow>` element
 * @param {(order: {main: string[], overflow: string[]}) => void} opts.onChange
 * @returns {void}
 */
export const initToolDragReorder = ({ container, overflowHost, onChange }) => {
  let dragged = null
  let grabbed = null
  let grabSnapshot = null

  const mainItems = () => Array.from(container.children)
    .filter((el) => el !== overflowHost)
  const overflowItems = () => Array.from(overflowHost.children)
  const overflowOpen = () => overflowHost.hasAttribute('opened')

  const currentOrder = () => ({
    main: mainItems().map((el) => el.id),
    overflow: overflowItems().map((el) => el.id)
  })

  const applyDraggable = () => {
    Array.from(container.children).forEach((el) => {
      el.draggable = el !== overflowHost
    })
    Array.from(overflowHost.children).forEach((el) => {
      el.draggable = true
    })
  }

  // --- Keyboard reorder -----------------------------------------------
  // Every tool this bucket manages gets a "button" role and, while grabbed,
  // an `aria-grabbed` flag — the flat set the roving tabindex/arrow-key nav
  // cycles through, extended with the overflow's own children only while its
  // popover is actually open (matching what a keyboard user can see).
  const focusable = () => [
    ...mainItems(),
    overflowHost,
    ...(overflowOpen() ? overflowItems() : [])
  ]

  const applyRoles = () => {
    focusable().forEach((el) => {
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button')
    })
    if (!overflowHost.hasAttribute('aria-haspopup')) overflowHost.setAttribute('aria-haspopup', 'true')
    overflowHost.setAttribute('aria-expanded', String(overflowOpen()))
    mainItems().forEach((el) => {
      if (el.tagName === 'SE-FLYINGBUTTON' && !el.hasAttribute('aria-haspopup')) {
        el.setAttribute('aria-haspopup', 'true')
      }
    })
  }

  const applyRoving = (preferred) => {
    const flat = focusable()
    if (!flat.length) return
    let target = preferred && flat.includes(preferred) ? preferred : null
    if (!target && flat.includes(document.activeElement)) target = document.activeElement
    if (!target) target = flat.find((el) => el.tabIndex === 0) || flat[0]
    flat.forEach((el) => { el.tabIndex = el === target ? 0 : -1 })
  }

  const setGrabbed = (el) => {
    grabbed = el
    grabSnapshot = { main: mainItems(), overflow: overflowItems() }
    el.classList.add('se-grabbed')
    el.setAttribute('aria-grabbed', 'true')
    announce(`${toolLabel(el)} grabbed. Use arrow keys to move, Space to drop, Escape to cancel.`)
  }

  const clearGrabbed = () => {
    grabbed?.classList.remove('se-grabbed')
    grabbed?.removeAttribute('aria-grabbed')
    grabbed = null
    grabSnapshot = null
  }

  const dropGrabbed = () => {
    const el = grabbed
    clearGrabbed()
    applyRoving(el)
    el.focus()
    announce(`${toolLabel(el)} placed.`)
  }

  const cancelGrabbed = () => {
    const el = grabbed
    const snapshot = grabSnapshot
    clearGrabbed()
    snapshot.main.forEach((item) => container.insertBefore(item, overflowHost))
    snapshot.overflow.forEach((item) => overflowHost.appendChild(item))
    applyDraggable()
    applyRoles()
    applyRoving(el)
    el.focus()
    onChange(currentOrder())
    announce('Move canceled.')
  }

  const settleMove = (focusTarget, message) => {
    applyDraggable()
    applyRoles()
    applyRoving(focusTarget)
    focusTarget.focus()
    onChange(currentOrder())
    announce(message)
  }

  const moveGrabbed = (el, dir) => {
    const inOverflow = el.parentElement === overflowHost
    const list = inOverflow ? overflowItems() : mainItems()
    const idx = list.indexOf(el)

    // Crossing out of the overflow bucket, back into the main row.
    if (inOverflow && dir < 0 && idx === 0) {
      container.insertBefore(el, overflowHost)
      clearGrabbed()
      settleMove(el, `${toolLabel(el)} moved out of Additional tools.`)
      return
    }
    // Crossing from the main row's last slot into the overflow bucket.
    if (!inOverflow && dir > 0 && idx === list.length - 1) {
      overflowHost.insertBefore(el, overflowHost.firstChild)
      clearGrabbed()
      settleMove(overflowHost, `${toolLabel(el)} moved to Additional tools.`)
      return
    }
    if (!swapAdjacent(list, el, dir)) return // at an outer edge — nothing to do
    const updated = inOverflow ? overflowItems() : mainItems()
    settleMove(el, `${toolLabel(el)} moved to position ${updated.indexOf(el) + 1} of ${updated.length}.`)
  }

  const onKeyDown = (evt) => {
    const el = evt.target
    if (!(el instanceof Element) || !focusable().includes(el)) return

    if (grabbed === el) {
      if (evt.key === 'Escape') {
        evt.preventDefault()
        cancelGrabbed()
      } else if (evt.key === ' ' || evt.key === 'Spacebar') {
        evt.preventDefault()
        dropGrabbed()
      } else if (evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
        evt.preventDefault()
        moveGrabbed(el, evt.key === 'ArrowUp' ? -1 : 1)
      }
      return
    }

    if (evt.key === ' ' || evt.key === 'Spacebar') {
      evt.preventDefault()
      setGrabbed(el)
    } else if (evt.key === 'Enter') {
      evt.preventDefault()
      el.click()
    } else if (evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
      evt.preventDefault()
      const flat = focusable()
      const next = flat[flat.indexOf(el) + (evt.key === 'ArrowUp' ? -1 : 1)]
      if (next) {
        applyRoving(next)
        next.focus()
      }
    }
  }

  // Reparenting the focused element mid-move (swapAdjacent/insertBefore below)
  // makes the browser fire a spurious synchronous focusout on it — even
  // though it's about to be refocused right where it landed — so checking
  // `evt.relatedTarget` here would misfire mid-move. Defer the check instead:
  // by the next tick our own refocus (settleMove/dropGrabbed/cancelGrabbed)
  // will already have run if this was one of our own moves, so only a
  // genuine focus loss (e.g. Tab out of the toolbar) still looks unresolved.
  const onFocusOut = (evt) => {
    const wasGrabbed = grabbed
    if (!wasGrabbed || evt.target !== wasGrabbed) return
    setTimeout(() => {
      if (grabbed === wasGrabbed && document.activeElement !== wasGrabbed) {
        cancelGrabbed()
      }
    }, 0)
  }

  // --- Mouse drag-and-drop (unchanged mechanics) ------------------------

  const onDragStart = (evt) => {
    const el = evt.target.closest?.('[draggable="true"]')
    if (!el) return
    dragged = el
    evt.dataTransfer.effectAllowed = 'move'
    evt.dataTransfer.setData('text/plain', el.id)
    el.classList.add('se-dragging')
  }

  const onDragEnd = () => {
    if (dragged) dragged.classList.remove('se-dragging')
    clearIndicators(container)
    clearIndicators(overflowHost)
    dragged = null
  }

  const onDragOverTool = (evt) => {
    if (!dragged) return
    const el = evt.target.closest?.('[draggable="true"]')
    if (!el || el === dragged) return
    evt.preventDefault()
    evt.dataTransfer.dropEffect = 'move'
    clearIndicators(container)
    clearIndicators(overflowHost)
    el.classList.add(isBefore(evt, el) ? 'se-drop-before' : 'se-drop-after')
  }

  const onDropTool = (evt) => {
    if (!dragged) return
    const el = evt.target.closest?.('[draggable="true"]')
    if (!el || el === dragged) return
    evt.preventDefault()
    const parent = el.parentElement
    parent.insertBefore(dragged, isBefore(evt, el) ? el : el.nextSibling)
    clearIndicators(container)
    clearIndicators(overflowHost)
    applyDraggable()
    applyRoles()
    applyRoving(dragged)
    onChange(currentOrder())
  }

  container.addEventListener('dragstart', onDragStart)
  container.addEventListener('dragend', onDragEnd)
  overflowHost.addEventListener('dragstart', onDragStart)
  overflowHost.addEventListener('dragend', onDragEnd)

  // Reordering against another tool button, whether it's in the main row or
  // currently sitting inside the overflow popover.
  container.addEventListener('dragover', (evt) => {
    if (evt.target === overflowHost || overflowHost.contains(evt.target)) return
    onDragOverTool(evt)
  })
  container.addEventListener('drop', (evt) => {
    if (evt.target === overflowHost || overflowHost.contains(evt.target)) return
    onDropTool(evt)
  })

  // The overflow trigger itself (not a slotted tool inside its open popover)
  // is a coarser, unambiguous drop zone: always "append to overflow".
  overflowHost.addEventListener('dragover', (evt) => {
    if (!dragged) return
    if (evt.target === overflowHost) {
      evt.preventDefault()
      evt.dataTransfer.dropEffect = 'move'
    } else {
      onDragOverTool(evt)
    }
  })
  overflowHost.addEventListener('drop', (evt) => {
    if (!dragged) return
    if (evt.target === overflowHost) {
      evt.preventDefault()
      overflowHost.appendChild(dragged)
      clearIndicators(container)
      clearIndicators(overflowHost)
      applyDraggable()
      applyRoles()
      applyRoving(dragged)
      onChange(currentOrder())
    } else {
      onDropTool(evt)
    }
  })

  container.addEventListener('keydown', onKeyDown)
  container.addEventListener('focusout', onFocusOut)
  new MutationObserver(() => {
    applyRoles()
    applyRoving()
  }).observe(overflowHost, { attributes: true, attributeFilter: ['opened'] })

  container.setAttribute('role', 'toolbar')
  container.setAttribute('aria-orientation', 'vertical')
  applyDraggable()
  applyRoles()
  applyRoving()
}
