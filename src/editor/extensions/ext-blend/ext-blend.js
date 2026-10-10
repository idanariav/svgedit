/**
 * @file ext-blend.js
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
 * Not in v1: a spine (the steps follow the straight line between the keys), blending groups, text or gradients,
 * choosing the start anchor, live preview while a key is dragged — see `roadmap.md`.
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft), `crates/tools/src/meshblend.rs` and
 * `crates/doc/src/blend.rs`, MIT OR Apache-2.0.
 *
 * @license MIT
 */

const name = 'blend'
const P = 'ext-blend'
const INK = '#2b7fff'

const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
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
    await loadExtensionTranslation(svgEditor)
    const { svgCanvas } = svgEditor
    const { $id } = svgCanvas
    const tr = (key) => svgEditor.i18next.t(`${name}:${key}`)

    const selected = () => svgCanvas.getSelectedElements().filter(Boolean)
    const blendedSelection = () => (selected().length ? svgCanvas.getBlendGroup(selected()[0]) : null)

    /** The spacing the options bar shows: the selected blend's, else what new blends start with. */
    const current = () => svgCanvas.getBlend(blendedSelection()) ?? svgCanvas.getBlendDefaults()

    const modeChoices = () => [
      { value: 'steps', label: tr('modeSteps') },
      { value: 'distance', label: tr('modeDistance') },
      { value: 'smooth', label: tr('modeSmooth') }
    ]

    /** A change of the spacing: remembered for new blends, and applied to the selected blend. */
    const setSpacing = (changes) => {
      svgCanvas.setBlendDefaults(changes)
      svgCanvas.setBlendOptions(changes)
    }

    // --- the tool -------------------------------------------------------

    /** The shape (or blend) the Blend tool picked first, and the one under the press. */
    let first = null
    let pending = null
    let marker = null

    const pick = (ev) => {
      const target = svgCanvas.getMouseTarget(ev.event)
      return svgCanvas.getBlendGroup(target) ?? (svgCanvas.isBlendKeyCandidate(target) ? target : null)
    }

    const mark = (ctx) => {
      if (!first) return
      if (!marker) {
        marker = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        marker.setAttribute('fill', 'none')
        marker.setAttribute('stroke', INK)
        marker.setAttribute('stroke-width', '1.5')
        marker.setAttribute('stroke-dasharray', '5 3')
        marker.setAttribute('vector-effect', 'non-scaling-stroke')
        marker.setAttribute('pointer-events', 'none')
      }
      const box = first.getBBox()
      marker.setAttribute('x', box.x)
      marker.setAttribute('y', box.y)
      marker.setAttribute('width', box.width)
      marker.setAttribute('height', box.height)
      // The overlay is in document units: carry the shape's own transforms over.
      const to = first.getCTM(); const root = svgCanvas.getSvgContent().getCTM()
      if (to && root) {
        const m = root.inverse().multiply(to)
        marker.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`)
      }
      // The overlay is emptied when a gesture ends: put the marker back.
      if (!marker.isConnected) ctx.addOverlay(marker)
    }

    const reset = (ctx) => {
      first = null
      pending = null
      ctx?.clearOverlays()
      marker = null
    }

    svgCanvas.registerTool({
      id: 'blend',
      undoLabel: 'Blend',
      wantsHover: true,

      activate (ctx) { reset(ctx) },
      deactivate (ctx) { reset(ctx) },

      pointerDown (ctx, ev) {
        pending = pick(ev)
      },

      pointerMove (ctx) {
        mark(ctx)
      },

      pointerUp (ctx) {
        const hit = pending
        pending = null
        if (!hit) {
          reset(ctx)
          return
        }
        if (!first) {
          first = hit
          mark(ctx)
          return
        }
        if (hit === first) return
        if (svgCanvas.makeBlend([first, hit])) reset(ctx)
        else {
          // Not a blend (different groups, or two blends): start over from the one just clicked.
          first = hit
          mark(ctx)
        }
      },

      cancel (ctx) { reset(ctx) },

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
      panel.style.display = (group || svgCanvas.canBlend()) && svgCanvas.getMode() !== 'pathedit' ? '' : 'none'
      $id(`${P}-blended`).style.display = group ? '' : 'none'
      if (!group) return
      const o = current()
      $id(`${P}-mode`).value = o.mode
      $id(`${P}-steps`).value = o.steps
      $id(`${P}-distance`).value = o.distance
      $id(`${P}-row-steps`).style.display = o.mode === 'steps' ? '' : 'none'
      $id(`${P}-row-distance`).style.display = o.mode === 'distance' ? '' : 'none'
    }

    const needBlend = () => (blendedSelection() ? true : tr('needBlend'))

    return {
      name: tr('name'),
      callback () {
        const title = `${name}:toolTitle`
        // Beside the other stroke tools: after the Width tool.
        svgCanvas.insertChildAtIndex(
          $id('tools_left'),
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
        else (designTab || $id('tools_top')).appendChild(template.content)

        for (const c of modeChoices()) $id(`${P}-mode`).addOption(c.value, c.label)
        const onChange = (id, read) => $id(`${P}-${id}`).addEventListener('change', (e) => {
          setSpacing(read(e.target))
          refresh()
        })
        onChange('mode', (t) => ({ mode: t.value }))
        onChange('steps', (t) => ({ steps: parseFloat(t.value) || 1 }))
        onChange('distance', (t) => ({ distance: parseFloat(t.value) || 1 }))

        const run = (id) => svgEditor.commands.run(id)
        $id(`${P}-make`).addEventListener('click', () => run('blend_make'))
        $id(`${P}-expand`).addEventListener('click', () => run('blend_expand'))
        $id(`${P}-release`).addEventListener('click', () => run('blend_release'))

        const reg = (id, label, spec) => svgEditor.commands.register({ id, label: `${name}:${label}`, group: 'Tools', pd: true, ...spec })
        reg('blend_make', 'make', {
          enabled: () => (svgCanvas.canBlend() ? true : tr('needShapes')),
          run: () => { svgCanvas.makeBlend(); refresh() }
        })
        reg('blend_expand', 'expand', { enabled: needBlend, run: () => { svgCanvas.expandBlend(); refresh() } })
        reg('blend_release', 'release', { enabled: needBlend, run: () => { svgCanvas.releaseBlend(); refresh() } })
      },
      selectedChanged () {
        for (const el of selected()) svgCanvas.refreshBlend(el)
        refresh()
      },
      modeChange () {
        refresh()
      },
      elementChanged (opts) {
        // The steps follow their keys (also after an undo of a key edit).
        let changed = false
        for (const el of opts.elems.filter(Boolean)) changed = svgCanvas.refreshBlend(el) || changed
        if (changed || blendedSelection()) refresh()
      }
    }
  }
}
