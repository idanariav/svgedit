/**
 * @file ext-layout-ops.js
 *
 * Two dialogs that rework the selection as a whole: **Transform Each** (scale / move / rotate / reflect every
 * selected object about its own reference point, optionally random, optionally on copies) and **Split Into
 * Grid** (replace one shape with rows × columns of rectangles). The maths lives in
 * `@svgedit/svgcanvas/core/transform-each.js` and `core/split-grid.js`; `se-params-dialog` is only a form.
 *
 * Every edit in a dialog previews the result inside an undo transaction (the previous preview is rolled back
 * first); OK commits it as one undo step, Cancel or Escape rolls it back.
 *
 * @license Apache-2.0
 */
import '../../dialogs/seParamsDialog.js'
import { splitIntoGrid as splitGrid, canSplitIntoGrid } from '@svgedit/svgcanvas/core/split-grid.ts'
import { transformEach as transformEachOf } from '@svgedit/svgcanvas/core/transform-each.ts'

const name = 'layout-ops'

/** @param {EditorInstance} svgEditor */
const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  const locales = /** @type {Record<string, {default: object}>} */ (import.meta.glob('./locale/*.js', { eager: true }))
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

/** A small seeded random source, so the amounts of a Random preview do not change with every keystroke. */
const seeded = (/** @type {number} */ seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export default {
  name,
  async init () {
    const svgEditor = /** @type {import('../../Editor.js').default} */ (/** @type {unknown} */ (this))
    const { svgCanvas } = svgEditor
    const { $id } = svgCanvas
    await loadExtensionTranslation(svgEditor)
    const tr = (/** @type {string} */ key) => svgEditor.i18next.t(`${name}:${key}`)

    const selection = () => svgCanvas.getSelectedElements().filter(Boolean)
    const sole = () => (selection().length === 1 ? selection()[0] : null)

    /**
* @type {string | Node | null}
*/
    let dialog = null
    const dialogElement = () => {
      if (!dialog) {
        dialog = document.createElement('se-params-dialog')
        dialog.setAttribute('id', 'se-params-dialog')
        svgEditor.$container.append(dialog)
      }
      return dialog
    }

    /**
     * Open the form and keep one preview transaction in step with it.
     * @param {string} kind `each` | `grid`
     * @param {object[]} fields
     * @param {(values: object) => void} apply runs the operation (inside the preview transaction)
     */
    const openForm = (kind, fields, apply) => {
      let tx = null
      const rollBack = () => {
        tx?.cancel()
        tx = null
      }
      const label = (/** @type {string} */ key) => tr(`${kind}.dialog.${key}`)
      dialogElement().open({
        title: label('title'),
        okLabel: label('ok'),
        cancelLabel: label('cancel'),
        fields: fields.map((f) => ({ ...f, label: label(f.id) })),
        /**
* @param {object} values
*/
        onChange (values) {
          rollBack()
          tx = svgCanvas.beginTransaction(tr(`${kind}.undo`))
          apply(values)
        },
        onOk () {
          tx?.commit()
          tx = null
        },
        onCancel: rollBack
      })
    }

    const transformEach = () => {
      if (!selection().length) return
      const seed = Math.floor(Math.random() * 2 ** 31)
      const num = (/** @type {string} */ id, /** @type {number} */ value, extra = {}) => ({ id, type: 'number', value, step: 1, ...extra })
      openForm('each', [
        num('scaleH', 100, { min: 0 }),
        num('scaleV', 100, { min: 0 }),
        num('moveH', 0),
        num('moveV', 0),
        num('rotate', 0, { min: -360, max: 360 }),
        { id: 'origin', type: 'origin', value: 'c' },
        { id: 'reflectX', type: 'checkbox', value: false },
        { id: 'reflectY', type: 'checkbox', value: false },
        { id: 'random', type: 'checkbox', value: false },
        { id: 'copy', type: 'checkbox', value: false }
      ], (values) => transformEachOf(svgCanvas, values, seeded(seed)))
    }

    const splitIntoGrid = () => {
      if (!canSplitIntoGrid(sole())) return
      const num = (/** @type {string} */ id, /** @type {number} */ value, /** @type {number} */ min) => ({ id, type: 'number', value, min, step: 1 })
      openForm('grid', [
        num('rows', 2, 1),
        num('cols', 2, 1),
        num('gutter', 0, 0)
      ], (values) => splitGrid(svgCanvas, { rows: values.rows, cols: values.cols, gutter: values.gutter }))
    }

    const updateVisibility = () => {
      const panel = $id('layout_ops_panel')
      if (panel) panel.style.display = selection().length ? '' : 'none'
    }

    return {
      name: tr('name'),
      selectedChanged: updateVisibility,
      elementChanged: updateVisibility,

      callback () {
        svgEditor.commands.register({
          id: 'tool_transform_each',
          label: `${name}:each.button`,
          group: 'Transform',
          pd: true,
          interactive: true,
          enabled: () => (selection().length ? true : tr('each.selectFirst')),
          run: transformEach
        })
        svgEditor.commands.register({
          id: 'tool_split_grid',
          label: `${name}:grid.button`,
          group: 'Tools',
          pd: true,
          interactive: true,
          enabled: () => (canSplitIntoGrid(sole()) ? true : tr('grid.selectFirst')),
          run: splitIntoGrid
        })

        const sidepanel = $id('tab_design')
        if (!sidepanel) return
        const tpl = document.createElement('template')
        tpl.innerHTML = `
          <div id="layout_ops_panel" class="sidepanel_section" style="display:none">
            <div class="sidepanel_section_label">${tr('panelTitle')}</div>
            <div class="sidepanel_btn_row">
              <se-button id="tool_transform_each" command="tool_transform_each" size="small" title="${tr('each.button')}"
                src="transform_each.svg"></se-button>
              <se-button id="tool_split_grid" command="tool_split_grid" size="small" title="${tr('grid.button')}"
                src="split_grid.svg"></se-button>
            </div>
          </div>`
        sidepanel.appendChild(tpl.content.cloneNode(true))
      }
    }
  }
}
