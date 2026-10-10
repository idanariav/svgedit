/**
 * @file ext-shape-family.js
 *
 * @license Apache-2.0
 *
 * Four drag tools in the shapes flyout, after Illustrator's Line Segment
 * family and ported from VectorCraft: Spiral, Arc, Rectangular Grid and Polar
 * Grid. While dragging: Shift = equal axes, Alt = from the centre (arc and
 * grids), Space held moves the shape being drawn, ↑/↓ change the spiral's
 * segments / the grids' horizontal (or concentric) dividers, ←/→ the grids'
 * vertical (or radial) dividers. A click without a drag opens an options
 * popover (size and counts) instead.
 *
 * Spirals and arcs are plain `<path>`s. A grid is a `<g>` of line paths /
 * ellipses / a frame rect, inserted as one undo step so it moves as one; the
 * paint lives on the group (fill none) and the children inherit it. The
 * geometry is in {@link module:shape-family}.
 *
 * The four tools are registered with `svgCanvas.registerTool` (core/tool-registry.js),
 * the pilot for that contract: pointer events arrive in document units, the
 * whole press-to-release gesture is one undo step, and Escape / switching tools
 * mid-drag roll the drawing back, so none of that is hand-written here.
 */

import {
  spiralD, arcD, dragRect, arcDragEnds, rectangularGridParts, polarGridParts,
  clampDividers, clampSegments, MAX_DIVIDERS, MAX_SEGMENTS, MIN_SEGMENTS
} from '@svgedit/svgcanvas/core/shape-family.js'
import { positionContextMenu } from '../../dialogs/positionContextMenu.js'

const name = 'shape-family'

const MODES = ['spiral', 'arc', 'rectgrid', 'polargrid']
const UNDO_LABEL = { spiral: 'Draw spiral', arc: 'Draw arc', rectgrid: 'Draw rectangular grid', polargrid: 'Draw polar grid' }
const MODE_TITLE = { spiral: 0, arc: 1, rectgrid: 2, polargrid: 3 }
const BUTTON_ICON = { spiral: 'spiral.svg', arc: 'arc.svg', rectgrid: 'grid_rect.svg', polargrid: 'grid_polar.svg' }

/** Which option an arrow key steps, per mode. `vertical` = ↑/↓, `horizontal` = ←/→. */
const ARROW_OPTION = {
  spiral: { vertical: 'segments' },
  rectgrid: { vertical: 'rows', horizontal: 'columns' },
  polargrid: { vertical: 'concentric', horizontal: 'radial' }
}

/** Drag distance (screen px) before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 3

/**
 * Popover fields per mode. `size` fields are geometry (not remembered between
 * uses beyond the popover's own defaults); the rest are tool options.
 */
const FIELDS = {
  spiral: [
    { key: 'radius', type: 'number', min: 1, step: 1, size: true },
    { key: 'decay', type: 'number', min: 5, max: 150, step: 1 },
    { key: 'segments', type: 'number', min: MIN_SEGMENTS, max: MAX_SEGMENTS, step: 1 },
    { key: 'clockwise', type: 'checkbox' }
  ],
  arc: [
    { key: 'width', type: 'number', min: 1, step: 1, size: true },
    { key: 'height', type: 'number', min: 1, step: 1, size: true },
    { key: 'slope', type: 'number', min: -100, max: 100, step: 5 },
    { key: 'closed', type: 'checkbox' }
  ],
  rectgrid: [
    { key: 'width', type: 'number', min: 1, step: 1, size: true },
    { key: 'height', type: 'number', min: 1, step: 1, size: true },
    { key: 'rows', type: 'number', min: 0, max: MAX_DIVIDERS, step: 1 },
    { key: 'columns', type: 'number', min: 0, max: MAX_DIVIDERS, step: 1 },
    { key: 'frame', type: 'checkbox' }
  ],
  polargrid: [
    { key: 'width', type: 'number', min: 1, step: 1, size: true },
    { key: 'height', type: 'number', min: 1, step: 1, size: true },
    { key: 'concentric', type: 'number', min: 0, max: MAX_DIVIDERS, step: 1 },
    { key: 'radial', type: 'number', min: 0, max: MAX_DIVIDERS, step: 1 }
  ]
}

const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  // Locale files are inlined into the bundle (statically resolved glob).
  const locales = import.meta.glob('./locale/*.js', { eager: true })
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { $id } = svgCanvas
    await loadExtensionTranslation(svgEditor)
    const t = (key) => svgEditor.i18next.t(`${name}:${key}`)

    /** Options remembered between uses (drag keys and the popover both write them). */
    const options = {
      spiral: { decay: 80, segments: 10, clockwise: true, radius: 50 },
      arc: { slope: 0, closed: false, width: 100, height: 100 },
      rectgrid: { rows: 5, columns: 5, frame: true, width: 100, height: 100 },
      polargrid: { concentric: 5, radial: 5, width: 100, height: 100 }
    }

    /** In-progress drag: `{ mode, start, end, last, mods, el }`; `el` appears after the threshold. */
    let drag = null
    let spaceHeld = false
    let popover = null

    const isFamilyMode = (mode) => MODES.includes(mode)

    // ---- geometry -------------------------------------------------------

    /**
     * What to draw for a mode from the dragged start / end points.
     * @param {string} mode
     * @param {{x: number, y: number}} start
     * @param {{x: number, y: number}} end
     * @param {{shift: boolean, alt: boolean}} mods
     * @returns {object} Mode-specific geometry (see {@link describe}).
     */
    const geometry = (mode, start, end, mods) => {
      if (mode === 'spiral') return { cx: start.x, cy: start.y, radius: Math.hypot(end.x - start.x, end.y - start.y) }
      if (mode === 'arc') return arcDragEnds(start, end, mods)
      return dragRect(start, end, mods)
    }

    /**
     * The element description for a mode and geometry, in the shape
     * `addSVGElementsFromJson` takes (minus id and paint).
     * @param {string} mode
     * @param {object} geom
     * @returns {{element: string, d?: string, children?: object[], closedFill?: boolean}}
     */
    const describe = (mode, geom) => {
      const o = options[mode]
      if (mode === 'spiral') {
        return { element: 'path', d: spiralD({ ...geom, decay: o.decay, segments: o.segments, clockwise: o.clockwise }) }
      }
      if (mode === 'arc') {
        return { element: 'path', d: arcD({ ...geom, slope: o.slope / 100, closed: o.closed }), closedFill: o.closed }
      }
      if (mode === 'rectgrid') {
        return { element: 'g', children: rectangularGridParts({ ...geom, rows: o.rows, columns: o.columns, frame: o.frame }) }
      }
      return { element: 'g', children: polarGridParts({ ...geom, concentric: o.concentric, radial: o.radial }) }
    }

    const isDegenerate = (geom) => {
      if ('radius' in geom) return !(geom.radius > 0)
      if ('x1' in geom) return geom.x1 === geom.x2 && geom.y1 === geom.y2
      return !(geom.width > 0) && !(geom.height > 0)
    }

    // ---- element creation -------------------------------------------------

    /** Paint attributes for a new shape; a stroke of `none` would make it invisible. */
    const paintFor = (desc) => {
      const attr = {}
      const stroke = svgCanvas.getColor('stroke')
      if (!stroke || stroke === 'none') attr.stroke = '#000000'
      // Open curves and grids are not filled; a closed pie slice takes the current fill.
      if (!desc.closedFill) attr.fill = 'none'
      return attr
    }

    const createElement = (desc) => svgCanvas.addSVGElementsFromJson({
      element: desc.element,
      curStyles: true,
      attr: { id: svgCanvas.getNextId(), ...paintFor(desc), ...(desc.d ? { d: desc.d } : {}) },
      ...(desc.children ? { children: desc.children } : {})
    })

    const updateElement = (el, desc) => {
      if (desc.d !== undefined) {
        el.setAttribute('d', desc.d)
        return
      }
      el.replaceChildren(...desc.children.map((child) => svgCanvas.addSVGElementsFromJson(child)))
    }

    /** Give a freshly built grid's children ids, as every element in a drawing has one. */
    const assignChildIds = (el) => {
      el.querySelectorAll(':scope > *').forEach((child) => {
        if (!child.id) child.setAttribute('id', svgCanvas.getNextId())
      })
    }

    const render = () => {
      const geom = geometry(drag.mode, drag.start, drag.end, drag.mods)
      const desc = describe(drag.mode, geom)
      if (!drag.el) drag.el = createElement(desc)
      else updateElement(drag.el, desc)
    }

    // ---- options popover (click without a drag) ----------------------------

    const closePopover = () => {
      if (!popover) return
      popover.cleanup()
      popover.el.remove()
      popover = null
    }

    /**
     * Add a shape created outside a drag (the popover) as one undo step and
     * finish it like a drawn one.
     * @param {string} mode
     * @param {object} desc what to draw, from {@link describe}
     * @returns {void}
     */
    const insertCreated = (mode, desc) => {
      const el = svgCanvas.transact(UNDO_LABEL[mode], () => {
        const created = createElement(desc)
        if (created.tagName === 'g') assignChildIds(created)
        return created
      })
      svgCanvas.finishCreatedElement(el)
    }

    const readField = (input, field) => {
      if (field.type === 'checkbox') return input.checked
      const n = Number(input.value)
      if (!Number.isFinite(n)) return undefined
      return Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, n))
    }

    /**
     * Create the shape from the popover's values: spirals are centred on the
     * click, the others have it as their top-left corner.
     * @param {string} mode
     * @param {{x: number, y: number}} at
     * @param {object} values
     * @returns {void}
     */
    const createFromOptions = (mode, at, values) => {
      Object.assign(options[mode], values)
      const o = options[mode]
      let geom
      if (mode === 'spiral') geom = { cx: at.x, cy: at.y, radius: o.radius }
      else if (mode === 'arc') geom = { x1: at.x, y1: at.y, x2: at.x + o.width, y2: at.y + o.height }
      else geom = { x: at.x, y: at.y, width: o.width, height: o.height }
      insertCreated(mode, describe(mode, geom))
    }

    const openPopover = (mode, at, evt) => {
      closePopover()
      const root = svgEditor.workarea?.closest?.('.svg_editor') || document.body
      const el = document.createElement('form')
      el.className = 'shape_family_popover'
      el.setAttribute('role', 'dialog')
      const title = document.createElement('div')
      title.className = 'shape_family_popover_title'
      title.textContent = t(`popoverTitle.${mode}`)
      el.append(title)

      const inputs = {}
      for (const field of FIELDS[mode]) {
        const label = document.createElement('label')
        const text = document.createElement('span')
        text.textContent = t(`fields.${field.key}`)
        const input = document.createElement('input')
        input.type = field.type
        input.name = field.key
        if (field.type === 'checkbox') {
          input.checked = !!options[mode][field.key]
        } else {
          input.value = options[mode][field.key]
          if (field.min !== undefined) input.min = field.min
          if (field.max !== undefined) input.max = field.max
          input.step = field.step
        }
        inputs[field.key] = { input, field }
        label.append(text, input)
        el.append(label)
      }
      const actions = document.createElement('div')
      actions.className = 'shape_family_popover_actions'
      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.textContent = t('cancel')
      cancel.addEventListener('click', closePopover)
      const ok = document.createElement('button')
      ok.type = 'submit'
      ok.textContent = t('create')
      actions.append(cancel, ok)
      el.append(actions)

      el.addEventListener('submit', (e) => {
        e.preventDefault()
        const values = {}
        for (const { input, field } of Object.values(inputs)) {
          const v = readField(input, field)
          if (v !== undefined) values[field.key] = v
        }
        if ('segments' in values) values.segments = clampSegments(values.segments)
        for (const k of ['rows', 'columns', 'concentric', 'radial']) {
          if (k in values) values[k] = clampDividers(values[k])
        }
        closePopover()
        createFromOptions(mode, at, values)
      })

      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          closePopover()
        }
      }
      const onOutside = (e) => {
        if (!e.composedPath().includes(el)) closePopover()
      }
      // Deferred so the click that opened the popover does not close it at once.
      const timer = setTimeout(() => document.addEventListener('mousedown', onOutside), 0)
      document.addEventListener('keydown', onKey)

      root.append(el)
      positionContextMenu(el, evt?.clientX ?? 0, evt?.clientY ?? 0)
      popover = {
        el,
        cleanup () {
          clearTimeout(timer)
          document.removeEventListener('mousedown', onOutside)
          document.removeEventListener('keydown', onKey)
        }
      }
      ;(Object.values(inputs)[0]?.input)?.focus()
    }

    // ---- tools ----------------------------------------------------------------

    /** The tool for one mode; the four share their handlers and differ only in id and undo label. */
    const toolFor = (mode) => ({
      id: mode,
      undoLabel: UNDO_LABEL[mode],

      pointerDown (ctx, ev) {
        closePopover()
        // Nothing stays selected while drawing: the arrow keys step the counts
        // below, and the editor's own arrow-key nudge would move the selection.
        svgCanvas.clearSelection()
        const start = { x: ev.x, y: ev.y }
        drag = { mode, start, end: start, last: start, mods: { shift: ev.mods.shift, alt: ev.mods.alt }, el: null }
        spaceHeld = false
      },

      pointerMove (ctx, ev) {
        if (!drag) return
        const p = { x: ev.x, y: ev.y }
        drag.mods = { shift: ev.mods.shift, alt: ev.mods.alt }
        if (!drag.el && ev.dragDistance < DRAG_THRESHOLD) {
          drag.last = p
          return
        }
        if (spaceHeld) {
          // Move the shape at its current size instead of resizing it.
          const dx = p.x - drag.last.x
          const dy = p.y - drag.last.y
          drag.start = { x: drag.start.x + dx, y: drag.start.y + dy }
          drag.end = { x: drag.end.x + dx, y: drag.end.y + dy }
        } else {
          drag.end = p
        }
        drag.last = p
        render()
      },

      pointerUp (ctx, ev) {
        if (!drag) return undefined
        const { el, start } = drag
        const geom = el && geometry(mode, drag.start, drag.end, drag.mods)
        drag = null
        spaceHeld = false
        if (!el) {
          // A click: ask for the options instead of drawing.
          openPopover(mode, start, ev.event)
          return undefined
        }
        if (isDegenerate(geom)) {
          svgCanvas.getCurrentDrawing().releaseId(el.id)
          return 'cancel'
        }
        if (el.tagName === 'g') assignChildIds(el)
        return { created: el }
      },

      keyDown (ctx, e) {
        if (!drag) return false
        if (e.code === 'Space') {
          spaceHeld = true
          return true
        }
        if (!drag.el) return false
        const arrow = ARROW_OPTION[drag.mode]
        const axis = { ArrowUp: ['vertical', 1], ArrowDown: ['vertical', -1], ArrowRight: ['horizontal', 1], ArrowLeft: ['horizontal', -1] }[e.key]
        if (!axis) return false
        const key = arrow[axis[0]]
        if (!key) return true
        const o = options[drag.mode]
        o[key] = key === 'segments' ? clampSegments(o[key] + axis[1]) : clampDividers(o[key] + axis[1])
        drag.mods = { shift: e.shiftKey, alt: e.altKey }
        render()
        return true
      },

      // Escape, a tool switch or an error rolled the drawing back; forget the drag.
      cancel () {
        drag = null
        spaceHeld = false
      }
    })

    for (const mode of MODES) svgCanvas.registerTool(toolFor(mode))

    return {
      name: t('name'),

      callback () {
        const template = document.createElement('template')
        template.innerHTML = MODES.map((mode) =>
          `<se-button id="tool_${mode}" command="tool_${mode}" title="${name}:buttons.${MODE_TITLE[mode]}.title" src="${BUTTON_ICON[mode]}"></se-button>`
        ).join('')
        $id('tools_shapes').append(template.content.cloneNode(true))
        for (const mode of MODES) {
          svgEditor.leftPanel.addModeCommand(`tool_${mode}`, mode, { label: `${name}:buttons.${MODE_TITLE[mode]}.title` })
        }
        // Space is read here, not from keyDown's payload alone: the editor's own
        // keyup handler only knows about its pan mode.
        document.addEventListener('keyup', (e) => {
          if (e.code === 'Space') spaceHeld = false
        }, { signal: svgEditor.listenerAbort?.signal })
        // Leaving the tool drops a popover that was never confirmed.
        document.addEventListener('modeChange', (e) => {
          if (popover && !isFamilyMode(e.detail?.getMode?.())) closePopover()
        }, { signal: svgEditor.listenerAbort?.signal })
      }
    }
  }
}
