/**
 * @file ext-art-brush.js
 *
 * "Brush" section in the right-panel Design tab: art brushes (one copy of some artwork stretched along a path)
 * and pattern brushes (a tile repeated along it). The geometry is `@svgedit/svgcanvas/core/art-brush.js`, the
 * elements and the canvas API (`makeArtBrush`, `applyArtBrush`, `setArtBrushOptions`, …) are in
 * `art-brush-canvas.js`.
 *
 * Workflow: select some artwork → New art / pattern brush (it joins the drawing's brush library, the picker) →
 * select a path → choose the brush. The path becomes a group that keeps the path itself (invisible, editable
 * with Edit path) and the generated art; the fit, width, spacing… options appear while it is selected.
 *
 * The generated art follows the path: when the path is edited (or an edit is undone) `elementChanged` asks
 * `refreshArtBrush` to regenerate it. That regeneration is not an undo step of its own (the edit that caused it
 * is), as ext-mirror's twins.
 *
 * @license Apache-2.0
 */

const name = 'art-brush'
const P = 'ext-art-brush'

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
    const brushedSelection = () => {
      const [elem] = selected()
      return selected().length === 1 ? svgCanvas.getArtBrushGroup(elem) : null
    }
    const pickedBrush = () => $id(`${P}-pick`)?.value || ''

    /** Fill the picker from the drawing's library, keeping the choice when it still exists. */
    const refillPicker = () => {
      const pick = $id(`${P}-pick`)
      if (!pick) return
      const keep = pick.value
      pick.$select.replaceChildren()
      pick.addOption('', tr('pick'))
      for (const b of svgCanvas.getArtBrushLibrary()) pick.addOption(b.id, `${b.type === 'art' ? '◢' : '▦'} ${b.name}`)
      pick.value = svgCanvas.getArtBrushLibrary().some((b) => b.id === keep) ? keep : ''
    }

    const optionRow = (id, label, control) => `<div class="sidepanel_btn_row" id="${P}-row-${id}">${control(label)}</div>`
    const spin = (id, min, max, step, value = 100) => (label) =>
      `<se-spin-input id="${P}-${id}" label="${label}" min="${min}" max="${max}" step="${step}" value="${value}"></se-spin-input>`
    const check = (id) => (label) =>
      `<label class="ext-live-effects-check"><input type="checkbox" id="${P}-${id}"> ${label}</label>`
    const select = (id) => (label) => `<se-select id="${P}-${id}" label="${label}"></se-select>`

    const refresh = () => {
      const panel = $id(`${P}-panel`)
      if (!panel) return
      const elems = selected()
      const group = brushedSelection()
      const single = elems.length === 1 ? elems[0] : null
      const show = !!(group || (single && svgCanvas.canApplyArtBrush(single)) || svgCanvas.canMakeArtBrush() ||
        svgCanvas.getArtBrushLibrary().length)
      panel.style.display = show && svgCanvas.getMode() !== 'pathedit' ? '' : 'none'
      refillPicker()
      const brush = group ? svgCanvas.getArtBrush(group) : null
      $id(`${P}-brushed`).style.display = brush ? '' : 'none'
      for (const type of ['art', 'pattern']) $id(`${P}-${type}-opts`).style.display = brush?.type === type ? '' : 'none'
      if (!brush) return
      const o = brush.opts
      if (brush.type === 'art') {
        $id(`${P}-scale`).value = o.scale
        $id(`${P}-width`).value = o.width
        $id(`${P}-dir`).value = o.dir
        $id(`${P}-flipAlong`).checked = o.flipAlong
        $id(`${P}-flipAcross`).checked = o.flipAcross
      } else {
        $id(`${P}-tileScale`).value = o.scale
        $id(`${P}-spacing`).value = o.spacing
        $id(`${P}-fit`).value = o.fit
        $id(`${P}-pflipAlong`).checked = o.flipAlong
        $id(`${P}-pflipAcross`).checked = o.flipAcross
      }
    }

    const set = (changes) => {
      svgCanvas.setArtBrushOptions(changes)
      refresh()
    }

    const needBrushed = () => (brushedSelection() ? true : tr('needBrushed'))

    return {
      name: tr('name'),
      callback () {
        const template = document.createElement('template')
        template.innerHTML = `
          <div id="${P}-panel" class="sidepanel_section" style="display:none">
            <div class="sidepanel_section_label">${tr('label')}</div>
            <div class="sidepanel_btn_row"><se-select id="${P}-pick" title="${tr('pick')}"></se-select></div>
            <div class="${P}-actions ext-live-effects-actions">
              <button type="button" id="${P}-new-art" class="ext-live-effects-btn" title="${tr('newArtTitle')}">${tr('newArt')}</button>
              <button type="button" id="${P}-new-pattern" class="ext-live-effects-btn" title="${tr('newPatternTitle')}">${tr('newPattern')}</button>
              <button type="button" id="${P}-delete" class="ext-live-effects-btn" title="${tr('removeTitle')}">${tr('remove')}</button>
            </div>
            <div id="${P}-brushed" style="display:none">
              <div id="${P}-art-opts" style="display:none">
                ${optionRow('scale', tr('scale'), select('scale'))}
                ${optionRow('width', tr('width'), spin('width', 1, 1000, 5))}
                ${optionRow('dir', tr('direction'), select('dir'))}
                ${optionRow('flipAlong', tr('flipAlong'), check('flipAlong'))}
                ${optionRow('flipAcross', tr('flipAcross'), check('flipAcross'))}
              </div>
              <div id="${P}-pattern-opts" style="display:none">
                ${optionRow('tileScale', tr('tileScale'), spin('tileScale', 5, 1000, 5))}
                ${optionRow('spacing', tr('spacing'), spin('spacing', 0, 1000, 5, 0))}
                ${optionRow('fit', tr('fit'), select('fit'))}
                ${optionRow('pflipAlong', tr('flipAlong'), check('pflipAlong'))}
                ${optionRow('pflipAcross', tr('flipAcross'), check('pflipAcross'))}
              </div>
              <div class="${P}-actions ext-live-effects-actions">
                <button type="button" id="${P}-edit" class="ext-live-effects-btn" title="${tr('editPathTitle')}">${tr('editPath')}</button>
                <button type="button" id="${P}-expand" class="ext-live-effects-btn" title="${tr('expandTitle')}">${tr('expand')}</button>
                <button type="button" id="${P}-release" class="ext-live-effects-btn" title="${tr('releaseTitle')}">${tr('release')}</button>
              </div>
            </div>
          </div>
        `
        const designTab = $id('tab_design')
        const objectPanel = designTab?.querySelector('.selected_panel')
        if (designTab && objectPanel) designTab.insertBefore(template.content, objectPanel)
        else (designTab || $id('tools_top')).appendChild(template.content)

        // se-select options go in after the elements are in the document (they are upgraded on insertion).
        const fill = (id, pairs) => pairs.forEach(([v, key]) => $id(`${P}-${id}`).addOption(v, tr(key)))
        fill('scale', [['stretch', 'scaleStretch'], ['proportional', 'scaleProportional']])
        fill('dir', [['ltr', 'dirLtr'], ['rtl', 'dirRtl'], ['ttb', 'dirTtb'], ['btt', 'dirBtt']])
        fill('fit', [['stretch', 'fitStretch'], ['addSpace', 'fitAddSpace'], ['approximate', 'fitApproximate']])
        refillPicker()

        const onChange = (id, read) => $id(`${P}-${id}`).addEventListener('change', (e) => set(read(e.target)))
        onChange('scale', (t) => ({ scale: t.value }))
        onChange('width', (t) => ({ width: parseFloat(t.value) || 100 }))
        onChange('dir', (t) => ({ dir: t.value }))
        onChange('flipAlong', (t) => ({ flipAlong: t.checked }))
        onChange('flipAcross', (t) => ({ flipAcross: t.checked }))
        onChange('tileScale', (t) => ({ scale: parseFloat(t.value) || 100 }))
        onChange('spacing', (t) => ({ spacing: parseFloat(t.value) || 0 }))
        onChange('fit', (t) => ({ fit: t.value }))
        onChange('pflipAlong', (t) => ({ flipAlong: t.checked }))
        onChange('pflipAcross', (t) => ({ flipAcross: t.checked }))

        // Choosing a brush puts it on the selected path(s); with nothing to put it on it only becomes the choice.
        $id(`${P}-pick`).addEventListener('change', (e) => {
          const id = e.target.value
          if (id && selected().some(svgCanvas.canApplyArtBrush)) {
            svgCanvas.applyArtBrush(id)
            refresh()
          }
        })

        const run = (id) => svgEditor.commands.run(id)
        $id(`${P}-new-art`).addEventListener('click', () => run('brush_new_art'))
        $id(`${P}-new-pattern`).addEventListener('click', () => run('brush_new_pattern'))
        $id(`${P}-delete`).addEventListener('click', () => run('brush_delete'))
        $id(`${P}-edit`).addEventListener('click', () => run('brush_edit_path'))
        $id(`${P}-expand`).addEventListener('click', () => run('brush_expand'))
        $id(`${P}-release`).addEventListener('click', () => run('brush_release'))

        const needArt = () => (svgCanvas.canMakeArtBrush() ? true : tr('needArt'))
        const make = (type) => {
          const id = svgCanvas.makeArtBrush(type)
          refillPicker()
          if (id) $id(`${P}-pick`).value = id
          refresh()
        }
        const reg = (id, label, spec) => svgEditor.commands.register({ id, label: `${name}:${label}`, group: 'Tools', pd: true, ...spec })
        reg('brush_new_art', 'newArt', { enabled: needArt, run: () => make('art') })
        reg('brush_new_pattern', 'newPattern', { enabled: needArt, run: () => make('pattern') })
        reg('brush_delete', 'remove', {
          enabled: () => (pickedBrush() ? true : tr('needBrush')),
          run: () => {
            svgCanvas.deleteArtBrush(pickedBrush())
            refillPicker()
          }
        })
        reg('brush_edit_path', 'editPath', {
          enabled: needBrushed,
          run: () => {
            const group = brushedSelection()
            const spine = [...group.children].find((c) => c.hasAttribute('se:art-spine'))
            svgCanvas.selectOnly([spine], true)
            svgCanvas.pathActions.toEditMode(spine)
          }
        })
        reg('brush_expand', 'expand', { enabled: needBrushed, run: () => { svgCanvas.expandArtBrush(); refresh() } })
        reg('brush_release', 'release', { enabled: needBrushed, run: () => { svgCanvas.releaseArtBrush(); refresh() } })
      },
      selectedChanged () {
        // Note what the selected brushed paths' art was made from, so an undo of an edit can put it back as it was.
        for (const el of selected()) svgCanvas.refreshArtBrush(el)
        refresh()
      },
      modeChange () {
        refresh()
      },
      elementChanged (opts) {
        // The art follows its path (also after an undo of a path edit).
        let changed = false
        for (const el of opts.elems.filter(Boolean)) changed = svgCanvas.refreshArtBrush(el) || changed
        if (changed || brushedSelection()) refresh()
      }
    }
  }
}
