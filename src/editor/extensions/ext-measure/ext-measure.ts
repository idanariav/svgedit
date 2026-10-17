/**
 * @file ext-measure.ts
 *
 * Measure tool: drag between two points to read the distance, angle and horizontal / vertical offsets. The
 * readout stays on show until the next drag or until the tool is left; the drawing is never changed, so the
 * gesture records no undo step. The maths is `@svgedit/svgcanvas/core/measure.js`.
 *
 * The end points snap like the drawing tools' (`snap: true`: other objects' anchors, boxes, the page, guides,
 * the grid). Shift constrains the line to 45° steps from the first point. Lengths are shown in the editor's
 * base unit (Editor Options).
 *
 * @license Apache-2.0
 */
import { measureSegment, constrainAngle, readoutLines } from '@svgedit/svgcanvas/core/measure.ts'

const name = 'measure'
const SVG = 'http://www.w3.org/2000/svg'
/** The line's ink; the overlay is never saved or exported. */
const INK = '#00a6c8'

const loadExtensionTranslation = function (svgEditor: EditorInstance) {
  const lang = svgEditor.configObj.pref('lang')
  const locales = import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: any }>
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

const el = (tag: string, attrs: Record<string, any>) => {
  const node = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}

export default {
  name,
  async init () {
    const svgEditor = (this as unknown) as import('../../Editor.js').default
    const { svgCanvas } = svgEditor
    const { $id, $req } = svgCanvas
    await loadExtensionTranslation(svgEditor)

    /** The line being measured, or the last one (it stays until the next press). */
    let line: { a: { x: number, y: number }, b: { x: number, y: number } } | null = null
    /** The "45° steps" option: Shift held for good, for a screen with no Shift key. In memory until reload. */
    let angleSnap = false
    const stepped = (ev: import('@svgedit/svgcanvas').ToolEvent) => ev.mods.shift || angleSnap
    /** The tool context of the last gesture, to redraw the readout when the zoom changes. */
    let toolCtx: import('@svgedit/svgcanvas').ToolContext | null = null

    /** px → the base unit (the number only), and the unit's name. */
    const unit = () => svgEditor.configObj.curConfig.baseUnit || 'px'
    const toUnit = (px: number) => (unit() === 'px' ? px : Number(svgCanvas.convertUnit(px, unit())))

    /** Draw the line and its readout into the tool overlay, at the current zoom. */
    const draw = (ctx: import('@svgedit/svgcanvas').ToolContext) => {
      ctx.clearOverlays()
      if (!line) return
      const { a, b } = line
      const m = measureSegment(a, b)
      if (m.distance === 0) return
      const px = 1 / ctx.zoom // one screen pixel in document units
      const stroke = { stroke: INK, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }
      ctx.addOverlay(el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...stroke }))
      for (const p of [a, b]) ctx.addOverlay(el('circle', { cx: p.x, cy: p.y, r: 3 * px, fill: INK }))
      const lines = readoutLines(m, toUnit, unit())
      const size = 12 * px
      const width = Math.max(...lines.map((l) => l.length)) * size * 0.62 + 12 * px
      const height = lines.length * size * 1.3 + 8 * px
      const x = b.x + 12 * px
      const y = b.y + 12 * px
      const label = el('g', { id: 'measure_readout' })
      label.append(el('rect', { x, y, width, height, rx: 4 * px, fill: '#ffffff', 'fill-opacity': 0.92, stroke: INK, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }))
      lines.forEach((text, i) => {
        const t = el('text', { x: x + 6 * px, y: y + 4 * px + (i + 1) * size * 1.3 - size * 0.25, 'font-size': size, 'font-family': 'ui-monospace, Menlo, monospace', fill: '#1B1F24' })
        t.textContent = text
        label.append(t)
      })
      ctx.addOverlay(label)
    }

    svgCanvas.registerTool({
      id: name,
      undoLabel: 'Measure',
      cursor: 'crosshair',
      keepOverlays: true,
      snap: true,

      deactivate (ctx) {
        line = null
        ctx.clearOverlays()
      },

      pointerDown (ctx, ev) {
        toolCtx = ctx
        line = { a: { x: ev.x, y: ev.y }, b: { x: ev.x, y: ev.y } }
        draw(ctx)
      },

      pointerMove (ctx, ev) {
        if (!line) return
        line.b = stepped(ev) ? constrainAngle(line.a, { x: ev.rawX, y: ev.rawY }) : { x: ev.x, y: ev.y }
        draw(ctx)
      },

      pointerUp (ctx, ev) {
        if (!line) return 'cancel'
        line.b = stepped(ev) ? constrainAngle(line.a, { x: ev.rawX, y: ev.rawY }) : { x: ev.x, y: ev.y }
        draw(ctx)
        // Nothing in the document changed: the registry commits an empty transaction (no undo step).
        return undefined
      },

      cancel (ctx) {
        line = null
        ctx.clearOverlays()
      },

      options: () => [{
        id: 'angleSnap',
        type: 'checkbox',
        label: svgEditor.i18next.t(`${name}:angleSnap`),
        title: svgEditor.i18next.t(`${name}:angleSnapTitle`),
        value: angleSnap
      }],
      setOption: (id, value) => {
        if (id === 'angleSnap') angleSnap = Boolean(value)
      }
    })

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      // The label and dots are sized in screen pixels, so they are redrawn at the new zoom.
      zoomChanged () {
        if (line && toolCtx && svgCanvas.getMode() === name) draw(toolCtx)
      },
      callback () {
        const title = `${name}:buttons.0.title`
        const button = `<se-button id="tool_measure" command="tool_measure" title="${title}" src="measure.svg"></se-button>`
        const anchor = $id('tool_eyedropper')
        if (anchor) anchor.insertAdjacentHTML('afterend', button)
        else svgCanvas.insertChildAtIndex($req('tools_left'), button, 13)
        svgEditor.leftPanel.addModeCommand('tool_measure', name, { label: title })
      }
    }
  }
}
