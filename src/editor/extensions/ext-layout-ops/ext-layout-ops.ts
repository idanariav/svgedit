/**
 * @file ext-layout-ops.ts
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
import '../../dialogs/seParamsDialog.ts'
import { splitIntoGrid as splitGrid, canSplitIntoGrid } from '@svgedit/svgcanvas/core/split-grid.ts'
import { transformEach as transformEachOf } from '@svgedit/svgcanvas/core/transform-each.ts'
import { defineFeature, addFeatureLocale } from '../defineFeature.ts'

const name = 'layout-ops'

/** A small seeded random source, so the amounts of a Random preview do not change with every keystroke. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6D2B79F5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export default defineFeature({
  name,
  async init (svgEditor) {
    const { svgCanvas } = svgEditor
    const { $id } = svgCanvas
    addFeatureLocale(svgEditor, name, import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>)
    const tr = (key: string) => svgEditor.i18next.t(`${name}:${key}`)

    const selection = () => svgCanvas.getSelectedElements().filter(Boolean)
    const sole = () => (selection().length === 1 ? selection()[0] : null)

    let dialog: HTMLElementTagNameMap['se-params-dialog'] | null = null
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
 * @param kind `each` | `grid`
 * @param apply runs the operation (inside the preview transaction)
     */
    const openForm = (kind: string, fields: Array<Omit<import('../../dialogs/seParamsDialog.ts').ParamField, 'label'>>, apply: (values: Record<string, unknown>) => void) => {
      let tx: { commit(): unknown, cancel(): void } | null = null
      const rollBack = () => {
        tx?.cancel()
        tx = null
      }
      const label = (key: string) => tr(`${kind}.dialog.${key}`)
      dialogElement().open({
        title: label('title'),
        okLabel: label('ok'),
        cancelLabel: label('cancel'),
        fields: fields.map((f) => ({ ...f, label: label(f.id) })),
        onChange (values: Record<string, unknown>) {
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
      const num = (id: string, value: number, extra = {}) => ({ id, type: ('number' as 'number'), value, step: 1, ...extra })
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
      const num = (id: string, value: number, min: number) => ({ id, type: ('number' as 'number'), value, min, step: 1 })
      openForm('grid', [
        num('rows', 2, 1),
        num('cols', 2, 1),
        num('gutter', 0, 0)
      ], (values) => splitGrid(svgCanvas, { rows: values.rows as number, cols: values.cols as number, gutter: values.gutter as number }))
    }

    const updateVisibility = () => {
      const panel = $id('layout_ops_panel')
      if (panel) panel.style.display = selection().length ? '' : 'none'
    }

    svgCanvas.bind('selectedChanged', () => updateVisibility())

    svgCanvas.bind('elementChanged', () => updateVisibility())

    return {
      name: tr('name'),

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
})
