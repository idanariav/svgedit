/**
 * @file ext-blend.ts
 *
 * Blend: steps that morph shape, colour, stroke width and opacity between two (or more) key shapes. The Blend tool
 * works like Illustrator's: click a shape, then another, and they become a blend; each further click adds a key.
 * "Make blend" does the same for the selection. The steps follow the keys: edit a key (inside the group) and they
 * regenerate. The geometry and paint interpolation are `@svgedit/svgcanvas/core/blend.js`, the elements and the
 * canvas API (`makeBlend`, `setBlendOptions`, …) `blend-canvas.js`.
 *
 * It is the first tool with an options bar: `options()` / `setOption()` on the tool (see core/tool-registry.js)
 * give the spacing (a number of steps, a distance, or smooth colour). With a blend selected the bar shows and
 * changes that blend's; the values are also what new blends start with. The same fields are in the Design tab.
 *
 * Spine: the steps follow the straight line between the keys until a path is made the spine (select the blend and the
 * path, "Replace spine"): the keys move onto it, evenly spread by length, and the steps ride it. "Reverse spine" runs
 * the keys the other way, "Detach spine" gives the path back, "Align to path" turns the shapes to the spine's direction
 * (the first key is the reference). Not yet: keeping the spine pinned to a key that is dragged away, blending groups, text or gradients, choosing the
 * start anchor, live preview while a key is dragged — see `roadmap.md`.
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft), `crates/tools/src/meshblend.rs` and
 * `crates/doc/src/blend.rs`, MIT OR Apache-2.0.
 *
 * @license MIT
 */

import { defineFeature, addFeatureLocale } from '../defineFeature.ts'
import type { ToolContext } from '@svgedit/svgcanvas'
import { createToolHint } from '../../toolHint.ts'
import type { DocumentChangedDetail } from '@svgedit/svgcanvas/core/document-changes.ts'

const name = 'blend'
const P = 'ext-blend'
const INK = '#2b7fff'
const INK_FILL = 'rgba(43, 127, 255, 0.14)'

export default defineFeature({
  name,
  async init (svgEditor) {
    addFeatureLocale(svgEditor, name, import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>)
    const { svgCanvas } = svgEditor
    const { $id, $req, assignAttributes } = svgCanvas
    const tr = (key: string) => svgEditor.i18next.t(`${name}:${key}`)

    const selected = () => svgCanvas.getSelectedElements().filter(Boolean)
    const blendedSelection = () => (selected().length ? svgCanvas.getBlendGroup(selected()[0]) : null) ?? undefined

    /** The spacing the options bar shows: the selected blend's, else what new blends start with. */
    const current = () => svgCanvas.getBlend(blendedSelection()) ?? svgCanvas.getBlendDefaults()

    const modeChoices = () => [
      { value: 'steps', label: tr('modeSteps') },
      { value: 'distance', label: tr('modeDistance') },
      { value: 'smooth', label: tr('modeSmooth') }
    ]

    /** A change of the spacing: remembered for new blends, and applied to the selected blend. */
    const setSpacing = (changes: Record<string, unknown>) => {
      svgCanvas.setBlendDefaults(changes)
      svgCanvas.setBlendOptions(changes)
    }

    // --- the tool -------------------------------------------------------

    /** The shape (or blend) the Blend tool picked first, and the one under the press. */
    let first: Element | null = null
    let pending: Element | null = null
    /** Their markers: the picked one filled and solid, the one a click would pick next dashed. */
    let picked: SVGRectElement | null = null
    let hovered: SVGRectElement | null = null
    const hint = createToolHint(svgEditor, 'blend_hint')

    const pick = (ev: import('@svgedit/svgcanvas').ToolEvent) => {
      const target = svgCanvas.getMouseTarget(ev.event)
      return svgCanvas.getBlendGroup(target) ?? (svgCanvas.isBlendKeyCandidate(target) ? target : null)
    }

    const marker = (solid: boolean) => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      assignAttributes(rect, {
        fill: solid ? INK_FILL : 'none',
        stroke: INK,
        'stroke-width': solid ? '2.5' : '1.5',
        'stroke-dasharray': solid ? 'none' : '5 3',
        'vector-effect': 'non-scaling-stroke',
        'pointer-events': 'none'
      })
      return rect
    }

    /** Fit a marker to the element's box, or take it away when there is no element. */
    const place = (ctx: ToolContext, rect: SVGRectElement, el: Element | null) => {
      if (!el) { rect.remove(); return }
      const box = (el as SVGGraphicsElement).getBBox()
      // a few screen pixels clear of the shape, so the marker never hides in its outline
      const pad = 4 / svgCanvas.getZoom()
      assignAttributes(rect, { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad, rx: pad })
      // The overlay is in document units: carry the shape's own transforms over.
      const to = (el as SVGGraphicsElement).getCTM(); const root = svgCanvas.getSvgContent().getCTM()
      if (to && root) {
        const m = root.inverse().multiply(to)
        rect.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`)
      }
      // A cancelled gesture empties the overlay: put the marker back.
      if (!rect.isConnected) ctx.addOverlay(rect)
    }

    const mark = (ctx: ToolContext, under: Element | null = null) => {
      place(ctx, picked ??= marker(true), first)
      place(ctx, hovered ??= marker(false), under === first ? null : under)
    }

    const showHint = () => hint.show(tr(first ? 'hintNext' : 'hintStart'), first ? tr('hintPicked') : '')

    const reset = (ctx: ToolContext) => {
      first = null
      pending = null
      ctx?.clearOverlays()
      picked = hovered = null
    }

    svgCanvas.registerTool({
      id: 'blend',
      undoLabel: 'Blend',
      wantsHover: true,
      // the picked shape's marker stays on show between clicks (reset() clears it)
      keepOverlays: true,

      activate (ctx) { reset(ctx); showHint() },
      deactivate (ctx) { reset(ctx); hint.hide() },

      pointerDown (ctx, ev) {
        pending = pick(ev)
      },

      pointerMove (ctx, ev) {
        const under = pick(ev)
        mark(ctx, under)
        svgCanvas.setCursorHint(under ? 'pointer' : null) // a click picks this shape or blend
      },

      pointerUp (ctx) {
        const hit = pending
        pending = null
        if (!hit) {
          reset(ctx)
          showHint()
          return
        }
        if (!first) {
          first = hit
          mark(ctx)
          showHint()
          return
        }
        if (hit === first) return
        if (svgCanvas.makeBlend([first, hit])) reset(ctx)
        else {
          // Not a blend (different groups, or two blends): start over from the one just clicked.
          first = hit
          mark(ctx)
        }
        showHint()
      },

      cancel (ctx) { reset(ctx); showHint() },

      options: () => {
        const cur = current()
        return [
          { id: 'mode', type: 'select', label: tr('spacing'), value: cur.mode, choices: modeChoices() },
          { id: 'steps', type: 'number', label: tr('steps'), value: cur.steps, min: 1, max: 200, step: 1, hidden: cur.mode !== 'steps' },
          { id: 'distance', type: 'number', label: tr('distance'), value: cur.distance, min: 1, max: 10000, step: 5, hidden: cur.mode !== 'distance' }
        ]
      },
      setOption: (id, value) => setSpacing({ [id]: value })
    })

    // --- the Design tab ---------------------------------------------------

    const refresh = () => {
      const panel = $id(`${P}-panel`)
      if (!panel) return
      const group = blendedSelection()
      panel.style.display = (group || svgCanvas.canBlend() || svgCanvas.canReplaceBlendSpine()) && svgCanvas.getMode() !== 'pathedit' ? '' : 'none'
      // The spine buttons show for a blend; Replace needs a path selected with it (a disabled button says so in its command).
      $req(`${P}-spine-actions`).style.display = group || svgCanvas.canReplaceBlendSpine() ? '' : 'none'
      for (const [id, ok] of [['replace-spine', svgCanvas.canReplaceBlendSpine()], ['reverse-spine', !!group && !!svgCanvas.getBlendSpine()], ['detach-spine', !!group && !!svgCanvas.getBlendSpine()]]) {
        ;($req(`${P}-${id}`) as HTMLButtonElement).disabled = !ok
      }
      const aligned = group ? svgCanvas.getBlendAlign(group) : null
      $req(`${P}-align-row`).style.display = aligned === null ? 'none' : ''
      $req(`${P}-align`).checked = !!aligned
      $req(`${P}-blended`).style.display = group ? '' : 'none'
      if (!group) return
      const o = current()
      $req(`${P}-mode`).value = o.mode
      $req(`${P}-steps`).value = o.steps
      $req(`${P}-distance`).value = o.distance
      $req(`${P}-row-steps`).style.display = o.mode === 'steps' ? '' : 'none'
      $req(`${P}-row-distance`).style.display = o.mode === 'distance' ? '' : 'none'
    }

    const needBlend = () => (blendedSelection() ? true : tr('needBlend'))
    const needSpine = () => (blendedSelection() && svgCanvas.getBlendSpine() ? true : tr('needSpine'))

    svgCanvas.bind('selectedChanged', (_win: Window) => {
      for (const el of selected()) svgCanvas.refreshBlend(el)
      refresh()
    })

    // The panel hides in path edit. (There is no `modeChange` extension hook: it is a document event.)
    document.addEventListener('modeChange', refresh, { signal: svgEditor.listenerAbort.signal })

    svgCanvas.bind('elementChanged', () => {
      if (blendedSelection()) refresh()
    })
    // The steps follow their keys; an undo or redo brings the steps back with the keys.
    svgCanvas.bind('documentChanged', (_win: Window, opts: DocumentChangedDetail) => {
      if (opts.cause === 'history') { refresh(); return }
      let changed = false
      for (const el of opts.elems) changed = svgCanvas.refreshBlend(el) || changed
      if (changed) refresh()
    })

    return {
      name: tr('name'),
      callback () {
        const title = `${name}:toolTitle`
        // Beside the other stroke tools: after the Width tool.
        svgCanvas.insertChildAtIndex(
          $req('tools_left'),
          `<se-button id="tool_blend" command="tool_blend" title="${title}" src="blend-tool.svg"></se-button>`,
          5
        )
        svgEditor.leftPanel.addModeCommand('tool_blend', 'blend', { label: title })

        const template = document.createElement('template')
        template.innerHTML = `
          <div id="${P}-panel" class="sidepanel_section" style="display:none">
            <div class="sidepanel_section_label">${tr('label')}</div>
            <div class="${P}-actions ext-live-effects-actions">
              <button type="button" id="${P}-make" class="ext-live-effects-btn" title="${tr('makeTitle')}">${tr('make')}</button>
              <button type="button" id="${P}-expand" class="ext-live-effects-btn" title="${tr('expandTitle')}">${tr('expand')}</button>
              <button type="button" id="${P}-release" class="ext-live-effects-btn" title="${tr('releaseTitle')}">${tr('release')}</button>
            </div>
            <div class="${P}-actions ext-live-effects-actions" id="${P}-spine-actions" style="display:none">
              <button type="button" id="${P}-replace-spine" class="ext-live-effects-btn" title="${tr('replaceSpineTitle')}">${tr('replaceSpine')}</button>
              <button type="button" id="${P}-reverse-spine" class="ext-live-effects-btn" title="${tr('reverseSpineTitle')}">${tr('reverseSpine')}</button>
              <button type="button" id="${P}-detach-spine" class="ext-live-effects-btn" title="${tr('detachSpineTitle')}">${tr('detachSpine')}</button>
            </div>
            <div id="${P}-align-row" style="display:none; margin: 6px 0">
              <label class="ext-live-effects-check" title="${tr('alignPathTitle')}"><input type="checkbox" id="${P}-align"> ${tr('alignPath')}</label>
            </div>
            <div id="${P}-blended" style="display:none">
              <div class="sidepanel_btn_row"><se-select id="${P}-mode" label="${tr('spacing')}"></se-select></div>
              <div class="sidepanel_btn_row" id="${P}-row-steps"><se-spin-input id="${P}-steps" label="${tr('steps')}" min="1" max="200" step="1" value="5"></se-spin-input></div>
              <div class="sidepanel_btn_row" id="${P}-row-distance"><se-spin-input id="${P}-distance" label="${tr('distance')}" min="1" max="10000" step="5" value="20"></se-spin-input></div>
            </div>
          </div>
        `
        const designTab = $id('tab_design')
        const objectPanel = designTab?.querySelector('.selected_panel')
        if (designTab && objectPanel) designTab.insertBefore(template.content, objectPanel)
        else (designTab || $req('tools_top')).appendChild(template.content)

        for (const c of modeChoices()) $req(`${P}-mode`).addOption(c.value, c.label)
        const onChange = (id: string, read: (field: HTMLInputElement) => Record<string, unknown>) => $req(`${P}-${id}`).addEventListener('change', (e) => {
          setSpacing(read((e.target as HTMLInputElement)))
          refresh()
        })
        onChange('mode', (t) => ({ mode: t.value }))
        onChange('steps', (t) => ({ steps: parseFloat(t.value) || 1 }))
        onChange('distance', (t) => ({ distance: parseFloat(t.value) || 1 }))

        const run = (id: string) => svgEditor.commands.run(id)
        $req(`${P}-make`).addEventListener('click', () => run('blend_make'))
        $req(`${P}-expand`).addEventListener('click', () => run('blend_expand'))
        $req(`${P}-release`).addEventListener('click', () => run('blend_release'))
        $req(`${P}-replace-spine`).addEventListener('click', () => run('blend_replace_spine'))
        $req(`${P}-reverse-spine`).addEventListener('click', () => run('blend_reverse_spine'))
        $req(`${P}-detach-spine`).addEventListener('click', () => run('blend_detach_spine'))
        $req(`${P}-align`).addEventListener('change', (e) => {
          svgCanvas.alignBlendToPath((e.target as HTMLInputElement).checked)
          refresh()
        })

        const reg = (id: string, label: string, spec: Omit<import('../../commands.ts').CommandSpec, 'id' | 'label'>) => svgEditor.commands.register({ id, label: `${name}:${label}`, group: 'Tools', pd: true, ...spec })
        reg('blend_make', 'make', {
          enabled: () => (svgCanvas.canBlend() ? true : tr('needShapes')),
          run: () => { svgCanvas.makeBlend(); refresh() }
        })
        reg('blend_expand', 'expand', { enabled: needBlend, run: () => { svgCanvas.expandBlend(); refresh() } })
        reg('blend_release', 'release', { enabled: needBlend, run: () => { svgCanvas.releaseBlend(); refresh() } })
        reg('blend_replace_spine', 'replaceSpine', {
          enabled: () => (svgCanvas.canReplaceBlendSpine() ? true : tr('needBlendAndPath')),
          run: () => { svgCanvas.replaceBlendSpine(); refresh() }
        })
        reg('blend_reverse_spine', 'reverseSpine', { enabled: needSpine, run: () => { svgCanvas.reverseBlendSpine(); refresh() } })
        reg('blend_align_path', 'alignPath', {
          enabled: needSpine,
          run: () => { svgCanvas.alignBlendToPath(!svgCanvas.getBlendAlign(blendedSelection())); refresh() }
        })
        reg('blend_detach_spine', 'detachSpine', { enabled: needSpine, run: () => { svgCanvas.detachBlendSpine(); refresh() } })
      },
    }
  }
})
