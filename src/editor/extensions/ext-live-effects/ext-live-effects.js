/**
 * @file ext-live-effects.js
 *
 * UI glue for live (re-editable) path effects — the engine, `se:fx` format and
 * effect registry live in `@svgedit/svgcanvas/core/live-effects.js`. Injects a
 * "Distort" section into the right panel's Effects tab: the current effect
 * stack as rows (name, edit, remove), an "Add effect" select, an "Expand"
 * button, and an inline parameter editor with live preview (preview without an
 * undo step, one undo step on Apply, nothing on Cancel).
 *
 * The section is hidden while no effect is registered, or when the selection
 * can't take effects (text, groups, taper/corner-radius paths, …). Parameter
 * forms are generated from each effect's `defaults` (+ optional `choices` /
 * `ranges`), so registering an effect is all a new effect needs.
 *
 * @license Apache-2.0
 */

const name = 'live-effects'
const P = 'ext-live-effects'

const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  const locales = import.meta.glob('./locale/*.js', { eager: true })
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

/** `roughenSize` → `Roughen size`. */
const humanize = (key) => {
  const s = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default {
  name,
  async init () {
    const svgEditor = this
    await loadExtensionTranslation(svgEditor)
    const { svgCanvas } = svgEditor
    const { $id } = svgCanvas
    const tr = (key) => svgEditor.i18next.t(`${name}:${key}`)

    /** @type {?{index: number, stack: Array<{name: string, params: Object}>}} */
    let editing = null

    const effectDef = (effectName) => svgCanvas.listLiveEffects().find((e) => e.name === effectName)

    const selectedElem = () => {
      const elems = svgCanvas.getSelectedElements().filter(Boolean)
      return elems.length === 1 ? elems[0] : null
    }

    const closeEditor = () => {
      editing = null
      $id(`${P}-editor`).replaceChildren()
      $id(`${P}-editor`).style.display = 'none'
    }

    const cancelEdit = () => {
      svgCanvas.cancelLiveEffectsPreview()
      closeEditor()
    }

    const renderRows = () => {
      const rows = $id(`${P}-rows`)
      const stack = svgCanvas.getLiveEffects()
      rows.replaceChildren(...stack.map((entry, index) => {
        const row = document.createElement('div')
        row.className = `${P}-row`
        const label = document.createElement('span')
        label.className = `${P}-row-label`
        label.textContent = effectDef(entry.name)?.label ?? entry.name
        const edit = document.createElement('button')
        edit.type = 'button'
        edit.className = `${P}-icon-btn`
        edit.title = tr('edit')
        edit.textContent = '✎'
        edit.addEventListener('click', () => openEditor(index, stack))
        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = `${P}-icon-btn`
        remove.title = tr('remove')
        remove.textContent = '✕'
        remove.addEventListener('click', () => {
          cancelEdit()
          svgCanvas.applyLiveEffects(stack.filter((_, i) => i !== index))
          refresh()
        })
        row.append(label, edit, remove)
        return row
      }))
      $id(`${P}-expand`).style.display = stack.length ? '' : 'none'
    }

    // --- parameter editor -------------------------------------------------
    const buildField = (def, key, entry) => {
      const dflt = def.defaults[key]
      const onValue = (value) => {
        entry.params[key] = value
        svgCanvas.previewLiveEffects(editing.stack)
      }
      if (typeof dflt === 'boolean') {
        const label = document.createElement('label')
        label.className = `${P}-check`
        const input = document.createElement('input')
        input.type = 'checkbox'
        input.checked = !!entry.params[key]
        input.addEventListener('change', () => onValue(input.checked))
        label.append(input, document.createTextNode(humanize(key)))
        return label
      }
      if (typeof dflt === 'number') {
        const range = def.ranges?.[key] ?? {}
        const field = document.createElement('se-spin-input')
        field.setAttribute('label', humanize(key))
        field.setAttribute('min', range.min ?? -10000)
        field.setAttribute('max', range.max ?? 10000)
        field.setAttribute('step', range.step ?? (Number.isInteger(dflt) ? 1 : 0.1))
        field.setAttribute('value', entry.params[key])
        field.addEventListener('change', () => {
          const v = Number(field.value)
          if (Number.isFinite(v)) onValue(v)
        })
        return field
      }
      const choices = def.choices?.[key]
      if (choices) {
        const field = document.createElement('se-select')
        field.setAttribute('label', humanize(key))
        choices.forEach((c) => field.addOption(c, humanize(c)))
        field.value = entry.params[key]
        field.addEventListener('change', () => onValue(field.value))
        return field
      }
      const input = document.createElement('input')
      input.type = 'text'
      input.value = entry.params[key]
      input.addEventListener('change', () => onValue(input.value))
      return input
    }

    const openEditor = (index, stack) => {
      const entry = stack[index]
      const def = entry && effectDef(entry.name)
      if (!def) return
      svgCanvas.cancelLiveEffectsPreview()
      // Work on a copy so Cancel leaves the element untouched.
      editing = { index, stack: stack.map((e) => ({ name: e.name, params: { ...e.params } })) }
      const working = editing.stack[index]
      const host = $id(`${P}-editor`)
      const title = document.createElement('div')
      title.className = `${P}-editor-title`
      title.textContent = def.label
      const grid = document.createElement('div')
      grid.className = 'sidepanel_section_grid'
      for (const key of Object.keys(def.defaults)) grid.append(buildField(def, key, working))
      const footer = document.createElement('div')
      footer.className = `${P}-editor-footer`
      const apply = document.createElement('button')
      apply.type = 'button'
      apply.className = `${P}-btn ${P}-btn-primary`
      apply.textContent = tr('apply')
      apply.addEventListener('click', () => {
        const stackToApply = editing.stack
        closeEditor()
        svgCanvas.applyLiveEffects(stackToApply)
        refresh()
      })
      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.className = `${P}-btn`
      cancel.textContent = tr('cancel')
      cancel.addEventListener('click', cancelEdit)
      footer.append(apply, cancel)
      host.replaceChildren(title, grid, footer)
      host.style.display = ''
      svgCanvas.previewLiveEffects(editing.stack)
    }

    const refillAddSelect = () => {
      const select = $id(`${P}-add`)
      select.addOption('', tr('addPlaceholder'))
      svgCanvas.listLiveEffects().forEach((e) => select.addOption(e.name, e.label))
      select.value = ''
    }

    const showPanel = (on) => {
      $id(`${P}-panel`).style.display = on ? '' : 'none'
    }

    /** Re-evaluate visibility and rows for the current selection. */
    function refresh () {
      const elem = selectedElem()
      if (elem?.hasAttribute('se:fx-d')) svgCanvas.reconcileLiveEffects(elem)
      const available = svgCanvas.listLiveEffects().length > 0
      const usable = !!elem && svgCanvas.getMode() !== 'pathedit' &&
        (svgCanvas.canApplyLiveEffect(elem) || elem.hasAttribute('se:fx-d'))
      showPanel(available && usable)
      if (!editing) renderRows()
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),

      callback () {
        const panelTemplate = document.createElement('template')
        panelTemplate.innerHTML = `
          <div id="${P}-panel" class="sidepanel_section" style="display:none">
            <div class="sidepanel_section_label">${tr('label')}</div>
            <div id="${P}-rows"></div>
            <div id="${P}-editor" style="display:none"></div>
            <div class="${P}-actions">
              <se-select id="${P}-add" title="${tr('add')}"></se-select>
              <button type="button" id="${P}-expand" class="${P}-btn" style="display:none"
                title="${tr('expandTitle')}">${tr('expand')}</button>
            </div>
          </div>
        `
        const host = $id('tab_effects') || $id('sidepanel_content') || $id('tools_top')
        host.appendChild(panelTemplate.content)
        refillAddSelect()

        $id(`${P}-add`).addEventListener('change', (e) => {
          const effectName = e.target.value
          if (!effectName) return
          const def = effectDef(effectName)
          // se-select assigns its own value after dispatching 'change'; reset
          // to the placeholder once that has happened.
          setTimeout(() => { const add = $id(`${P}-add`); if (add) add.value = '' }, 0)
          if (!def) return
          const stack = svgCanvas.getLiveEffects()
          stack.push({ name: effectName, params: { ...def.defaults } })
          openEditor(stack.length - 1, stack)
        })
        $id(`${P}-expand`).addEventListener('click', () => {
          cancelEdit()
          svgCanvas.expandLiveEffects()
          refresh()
        })
      },

      selectedChanged () {
        // Effects registered after startup (late extensions) show up here.
        refillAddSelect()
        if (editing) cancelEdit()
        refresh()
      },

      elementChanged () {
        // Undo/redo and canvas-side rewrites change the stack in place.
        if (!editing) refresh()
      }
    }
  }
}
