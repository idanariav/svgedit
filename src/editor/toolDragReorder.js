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

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container `#tools_left`
 * @param {HTMLElement} opts.overflowHost the `<se-tool-overflow>` element
 * @param {(order: {main: string[], overflow: string[]}) => void} opts.onChange
 * @returns {void}
 */
export const initToolDragReorder = ({ container, overflowHost, onChange }) => {
  let dragged = null

  const currentOrder = () => ({
    main: Array.from(container.children)
      .filter((el) => el !== overflowHost)
      .map((el) => el.id),
    overflow: Array.from(overflowHost.children).map((el) => el.id)
  })

  const applyDraggable = () => {
    Array.from(container.children).forEach((el) => {
      el.draggable = el !== overflowHost
    })
    Array.from(overflowHost.children).forEach((el) => {
      el.draggable = true
    })
  }

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
      onChange(currentOrder())
    } else {
      onDropTool(evt)
    }
  })

  applyDraggable()
}
