/**
 * @file ext-frame-labels.js
 *
 * Draws a small name label above every frame (`<rect data-frame>`) on the
 * canvas. Double-clicking a label renames the frame in place (Enter/blur
 * commits, Escape cancels); a single click selects the frame. The name is the
 * frame's `<title>` child, i.e. the same value the right panel's "Frame name"
 * field edits, so both stay in sync.
 *
 * Labels are an HTML overlay (`#frameLabels`) inside `#svgcanvas` — never saved
 * into the drawing. They are positioned from each frame's client rect, so zoom,
 * scroll and transforms are handled by the browser; a MutationObserver on the
 * SVG root (plus zoom/selection hooks) schedules a repaint.
 *
 * @license Apache-2.0
 */

const name = 'frame-labels'

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { $id } = svgCanvas
    const host = $id('svgcanvas')
    const svgroot = $id('svgroot')
    if (!host || !svgroot) return { name }

    const overlay = host.ownerDocument.createElement('div')
    overlay.id = 'frameLabels'
    host.appendChild(overlay)

    /** @type {Map<Element, HTMLElement>} frame rect -> its label */
    const labels = new Map()
    let editing = null // the frame whose label is currently an <input>
    let raf = 0

    const frameName = (frame, index) =>
      frame.querySelector(':scope > title')?.textContent?.trim() || `Frame ${index + 1}`

    const isHidden = (frame) => {
      const layer = frame.closest('g.layer')
      return !!layer && layer.style.display === 'none'
    }

    const paint = () => {
      raf = 0
      const frames = [...(svgCanvas.getSvgContent()?.querySelectorAll('[data-frame]') ?? [])]
        .filter((f) => f.tagName === 'rect' && !isHidden(f))
      const selected = new Set(svgCanvas.getSelectedElements())
      const origin = host.getBoundingClientRect()

      for (const [frame, label] of labels) {
        if (!frames.includes(frame)) {
          label.remove()
          labels.delete(frame)
          if (editing === frame) editing = null
        }
      }

      frames.forEach((frame, i) => {
        let label = labels.get(frame)
        if (!label) {
          label = host.ownerDocument.createElement('div')
          label.className = 'frame-label'
          labels.set(frame, label)
          overlay.appendChild(label)
          wire(label, frame)
        }
        const r = frame.getBoundingClientRect()
        label.style.left = `${r.left - origin.left}px`
        label.style.top = `${r.top - origin.top}px`
        label.style.maxWidth = `${Math.max(r.width, 60)}px`
        label.classList.toggle('selected', selected.has(frame))
        if (editing !== frame) label.textContent = frameName(frame, i)
      })
    }

    const schedule = () => { if (!raf) raf = requestAnimationFrame(paint) }

    const commit = (frame, value) => {
      svgCanvas.selectOnly([frame], true)
      svgCanvas.setGroupTitle(value.trim())
      const panelField = $id('frame_name')
      if (panelField) panelField.value = value.trim()
    }

    const startEdit = (frame, label) => {
      if (editing) return
      editing = frame
      const input = host.ownerDocument.createElement('input')
      input.type = 'text'
      input.className = 'frame-label-input'
      input.value = frame.querySelector(':scope > title')?.textContent?.trim() ?? label.textContent
      label.replaceChildren(input)
      input.focus()
      input.select()
      let done = false
      const finish = (save) => {
        if (done) return
        done = true
        editing = null
        if (save) commit(frame, input.value)
        schedule()
      }
      input.addEventListener('keydown', (e) => {
        e.stopPropagation() // keep editor hotkeys (Delete, shortcuts) out of the field
        if (e.key === 'Enter') finish(true)
        else if (e.key === 'Escape') finish(false)
      })
      input.addEventListener('blur', () => finish(true))
    }

    const wire = (label, frame) => {
      // Keep canvas-level handlers (rubber-band, panning) from seeing label events.
      for (const type of ['mousedown', 'mouseup', 'click', 'contextmenu']) {
        label.addEventListener(type, (e) => e.stopPropagation())
      }
      label.addEventListener('mousedown', () => {
        if (editing !== frame) svgCanvas.selectOnly([frame], true)
      })
      label.addEventListener('dblclick', (e) => {
        e.stopPropagation()
        if (svgCanvas.getMode() === 'select') startEdit(frame, label)
      })
    }

    // Labels only take pointer events in select mode, so they never get in the
    // way of drawing tools.
    const setInteractive = () => {
      overlay.classList.toggle('interactive', svgCanvas.getMode() === 'select')
    }
    host.ownerDocument.addEventListener('modeChange', () => { setInteractive(); schedule() },
      { signal: svgEditor.listenerAbort?.signal })
    setInteractive()

    new MutationObserver(schedule).observe(svgroot, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true
    })
    schedule()

    return {
      name,
      zoomChanged: schedule,
      selectedChanged: schedule
    }
  }
}
