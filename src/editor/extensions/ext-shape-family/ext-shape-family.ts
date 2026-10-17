/**
 * @file ext-shape-family.ts
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
} from '@svgedit/svgcanvas/core/shape-family.ts'
import { positionContextMenu } from '../../dialogs/positionContextMenu.ts'
import { defineFeature, addFeatureLocale } from '../defineFeature.ts'

const name = 'shape-family'

export type Mode = 'spiral' | 'arc' | 'rectgrid' | 'polargrid'

/** what to draw, in the shape `addSVGElementsFromJson` takes (minus id and paint) */
export type FamilyDescription = { element: string, d?: string, children?: import('@svgedit/svgcanvas').SVGElementJSON[], closedFill?: boolean }

/** one input of the options popover */
export type Field = { key: string, type: 'number' | 'checkbox', min?: number, max?: number, step?: number, size?: boolean }

const MODES: Mode[] = ['spiral', 'arc', 'rectgrid', 'polargrid']
const UNDO_LABEL: Record<Mode, string> = { spiral: 'Draw spiral', arc: 'Draw arc', rectgrid: 'Draw rectangular grid', polargrid: 'Draw polar grid' }
const MODE_TITLE: Record<Mode, number> = { spiral: 0, arc: 1, rectgrid: 2, polargrid: 3 }
const BUTTON_ICON: Record<Mode, string> = { spiral: 'spiral.svg', arc: 'arc.svg', rectgrid: 'grid_rect.svg', polargrid: 'grid_polar.svg' }

/** Which option an arrow key steps, per mode. `vertical` = ↑/↓, `horizontal` = ←/→. */
const ARROW_OPTION: Record<string, { vertical?: string, horizontal?: string }> = {
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
const FIELDS: Record<Mode, Field[]> = {
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

export default defineFeature({
  name,
  async init (svgEditor) {
    const { svgCanvas } = svgEditor
    const { $req } = svgCanvas
    addFeatureLocale(svgEditor, name, import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>)
    const t = (key: string) => svgEditor.i18next.t(`${name}:${key}`)

    /** Options remembered between uses (drag keys and the popover both write them). */
    const options: Record<Mode, Record<string, number | boolean>> = {
      spiral: { decay: 80, segments: 10, clockwise: true, radius: 50 },
      arc: { slope: 0, closed: false, width: 100, height: 100 },
      rectgrid: { rows: 5, columns: 5, frame: true, width: 100, height: 100 },
      polargrid: { concentric: 5, radial: 5, width: 100, height: 100 }
    }

    /** In-progress drag: `{ mode, start, end, last, mods, drawing }`; `drawing` turns true after the threshold (the preview is an overlay). */
    let drag: { mode: Mode, start: { x: number, y: number }, end: { x: number, y: number }, last: { x: number, y: number }, mods: { shift: boolean, alt: boolean }, drawing: boolean } | null = null
    let spaceHeld = false
    let popover: { el: HTMLFormElement, cleanup: () => void } | null = null

    const isFamilyMode = (mode: string) => MODES.includes((mode as Mode))

    // ---- geometry -------------------------------------------------------

    /**
     * What to draw for a mode from the dragged start / end points.
 * @returns Mode-specific geometry (see {@link describe}).
     */
    type SpiralGeom = { cx: number, cy: number, radius: number }
    type ArcGeom = { x1: number, y1: number, x2: number, y2: number }
    type BoxGeom = { x: number, y: number, width: number, height: number }
    type Geom = SpiralGeom | ArcGeom | BoxGeom
    const geometry = (mode: Mode, start: { x: number, y: number }, end: { x: number, y: number }, mods: { shift: boolean, alt: boolean }): Geom => {
      if (mode === 'spiral') return { cx: start.x, cy: start.y, radius: Math.hypot(end.x - start.x, end.y - start.y) }
      if (mode === 'arc') return arcDragEnds(start, end, mods)
      return dragRect(start, end, mods)
    }

    /**
     * The element description for a mode and geometry, in the shape
     * `addSVGElementsFromJson` takes (minus id and paint).
     */
    const describe = (mode: Mode, geom: Geom): FamilyDescription => {
      const opt = options[mode]
      const n = (key: string) => opt[key] as number
      const flag = (key: string) => opt[key] as boolean
      if (mode === 'spiral') {
        return { element: 'path', d: spiralD({ ...(geom as SpiralGeom), decay: n('decay'), segments: n('segments'), clockwise: flag('clockwise') }) }
      }
      if (mode === 'arc') {
        return { element: 'path', d: arcD({ ...(geom as ArcGeom), slope: n('slope') / 100, closed: flag('closed') }), closedFill: flag('closed') }
      }
      if (mode === 'rectgrid') {
        return { element: 'g', children: rectangularGridParts({ ...(geom as BoxGeom), rows: n('rows'), columns: n('columns'), frame: flag('frame') }) }
      }
      return { element: 'g', children: polarGridParts({ ...(geom as BoxGeom), concentric: n('concentric'), radial: n('radial') }) }
    }

    const isDegenerate = (geom: Geom) => {
      if ('radius' in geom) return !(geom.radius > 0)
      if ('x1' in geom) return geom.x1 === geom.x2 && geom.y1 === geom.y2
      return !(geom.width > 0) && !(geom.height > 0)
    }

    // ---- element creation -------------------------------------------------

    /** Paint attributes for a new shape; a stroke of `none` would make it invisible. */
    const paintFor = (desc: FamilyDescription) => {
      const attr: Record<string, string> = {}
      const stroke = svgCanvas.getColor('stroke')
      if (!stroke || stroke === 'none') attr.stroke = '#000000'
      // Open curves and grids are not filled; a closed pie slice takes the current fill.
      if (!desc.closedFill) attr.fill = 'none'
      return attr
    }

    /** The element a description stands for, as `addSVGElementsFromJson` takes it; `id` and the children's ids come with the final one. */
    const elementJson = (desc: FamilyDescription, final: boolean): import('@svgedit/svgcanvas').SVGElementJSON => ({
      element: desc.element,
      curStyles: true,
      attr: { ...(final ? { id: svgCanvas.getNextId() } : {}), ...paintFor(desc), ...(desc.d ? { d: desc.d } : {}) },
      // every element in a drawing has an id, a grid's children included
      ...(desc.children ? { children: final ? desc.children.map((c) => ({ ...c, attr: { id: svgCanvas.getNextId(), ...c.attr } })) : desc.children } : {})
    })

    /** Show the shape as it would be drawn: an overlay, nothing in the drawing until the gesture ends. */
    const preview = (ctx: import('@svgedit/svgcanvas').ToolContext) => {
      if (!drag) return
      const desc = describe(drag.mode, geometry(drag.mode, drag.start, drag.end, drag.mods))
      const el = svgCanvas.buildElementFromJson(elementJson(desc, false))
      ctx.clearOverlays()
      if (el) ctx.addOverlay(el)
      drag.drawing = true
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
 * @param desc what to draw, from {@link describe}
     */
    const insertCreated = (mode: Mode, desc: FamilyDescription): void => {
      const el = svgCanvas.insertElementFromJson(elementJson(desc, true))
      if (el) svgCanvas.finishCreatedElement(el)
    }

    const readField = (input: HTMLInputElement, field: Field) => {
      if (field.type === 'checkbox') return input.checked
      const n = Number(input.value)
      if (!Number.isFinite(n)) return undefined
      return Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, n))
    }

    /**
     * Create the shape from the popover's values: spirals are centred on the
     * click, the others have it as their top-left corner.
     */
    const createFromOptions = (mode: Mode, at: { x: number, y: number }, values: Record<string, unknown>): void => {
      Object.assign(options[mode], values)
      const o = options[mode]
      let geom
      if (mode === 'spiral') geom = { cx: at.x, cy: at.y, radius: o.radius as number }
      else if (mode === 'arc') geom = { x1: at.x, y1: at.y, x2: at.x + (o.width as number), y2: at.y + (o.height as number) }
      else geom = { x: at.x, y: at.y, width: o.width as number, height: o.height as number }
      insertCreated(mode, describe(mode, geom))
    }

    const openPopover = (mode: Mode, at: { x: number, y: number }, evt: MouseEvent | undefined) => {
      closePopover()
      const root = svgEditor.workarea?.closest?.('.svg_editor') || document.body
      const el = document.createElement('form')
      el.className = 'shape_family_popover'
      el.setAttribute('role', 'dialog')
      const title = document.createElement('div')
      title.className = 'shape_family_popover_title'
      title.textContent = t(`popoverTitle.${mode}`)
      el.append(title)

      const inputs: Record<string, { input: HTMLInputElement, field: Field }> = {}
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
          input.value = String(options[mode][field.key])
          if (field.min !== undefined) input.min = String(field.min)
          if (field.max !== undefined) input.max = String(field.max)
          input.step = String(field.step)
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
        const values: Record<string, unknown> = {}
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

      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          closePopover()
        }
      }
      const onOutside = (e: MouseEvent) => {
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
    const toolFor = (mode: Mode): import('@svgedit/svgcanvas').ToolDef => ({
      id: mode,
      undoLabel: UNDO_LABEL[mode],
      snap: true, // the start and the dragged corner snap to other objects

      pointerDown (ctx, ev) {
        closePopover()
        // Nothing stays selected while drawing: the arrow keys step the counts
        // below, and the editor's own arrow-key nudge would move the selection.
        svgCanvas.clearSelection()
        const start = { x: ev.x, y: ev.y }
        drag = { mode, start, end: start, last: start, mods: { shift: ev.mods.shift, alt: ev.mods.alt }, drawing: false }
        spaceHeld = false
      },

      pointerMove (ctx, ev) {
        if (!drag) return
        const p = { x: ev.x, y: ev.y }
        drag.mods = { shift: ev.mods.shift, alt: ev.mods.alt }
        if (!drag.drawing && ev.dragDistance < DRAG_THRESHOLD) {
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
        preview(ctx)
      },

      pointerUp (ctx, ev) {
        if (!drag) return undefined
        const { drawing, start } = drag
        const geom = drawing && geometry(mode, drag.start, drag.end, drag.mods)
        const desc = drawing ? describe(mode, geom as Geom) : null
        drag = null
        spaceHeld = false
        if (!desc) {
          // A click: ask for the options instead of drawing.
          openPopover(mode, start, ev.event)
          return undefined
        }
        if (isDegenerate(geom as Geom)) return 'cancel'
        return { create: elementJson(desc, true) }
      },

      keyDown (ctx, e) {
        if (!drag) return false
        if (e.code === 'Space') {
          spaceHeld = true
          return true
        }
        if (!drag.drawing) return false
        const arrow = ARROW_OPTION[drag.mode]
        const axes: Record<string, ['vertical' | 'horizontal', number]> = { ArrowUp: ['vertical', 1], ArrowDown: ['vertical', -1], ArrowRight: ['horizontal', 1], ArrowLeft: ['horizontal', -1] }
        const axis = axes[e.key]
        if (!axis) return false
        const key = arrow[axis[0]]
        if (!key) return true
        const o = options[drag.mode]
        o[key] = key === 'segments' ? clampSegments((o[key] as number) + axis[1]) : clampDividers((o[key] as number) + axis[1])
        drag.mods = { shift: e.shiftKey, alt: e.altKey }
        preview(ctx)
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
        $req('tools_shapes').append(template.content.cloneNode(true))
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
          if (popover && !isFamilyMode((e as CustomEvent).detail?.getMode?.())) closePopover()
        }, { signal: svgEditor.listenerAbort?.signal })
      }
    }
  }
})
