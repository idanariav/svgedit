/**
 * @file ext-recolor.js
 *
 * Recolor Artwork: a "Recolor" button in the Effects tab (command `tool_recolor`) opens `se-recolor-dialog`, which
 * lists the distinct colours of the selection (fills, strokes, gradient stops, filter flood colours) as rows
 * "current → new". The dialog is only a view; this extension runs the colour maths from
 * `packages/svgcanvas/core/recolor.js`.
 *
 * Every edit in the dialog previews the result on the canvas: the previous preview is rolled back and the new
 * plan applied inside an undo transaction. OK commits it (one undo step), Cancel or Escape rolls it back.
 *
 * @license Apache-2.0
 */
import { collectColors, applyColors } from '@svgedit/svgcanvas/core/recolor.ts'

const name = 'recolor'
const DIALOG_LABELS = [
  'title', 'method', 'harmony', 'harmonyNone', 'reduce', 'hue', 'keepWhite', 'keepBlack', 'keepGrays', 'newColor',
  'empty', 'cancel', 'ok'
]

/** @param {EditorInstance} svgEditor */
const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  // Locale files are inlined into the bundle (statically resolved glob).
  const locales = /** @type {Record<string, {default: object}>} */ (import.meta.glob('./locale/*.js', { eager: true }))
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
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

    /**
* @type {?(HTMLElement & {open: Function})}
*/
    let dialog = null
    const dialogElement = () => {
      if (!dialog) {
        dialog = document.createElement('se-recolor-dialog')
        dialog.setAttribute('id', 'se-recolor-dialog')
        svgEditor.$container?.append(dialog)
      }
      return dialog
    }

    const open = () => {
      const els = selection()
      if (!els.length) return
      const scope = svgCanvas.getSvgContent()
      const uses = collectColors(scope, els)
      /** @type {?{cancel: () => void, commit: () => void}} */
      let tx = null
      const rollBack = () => {
        tx?.cancel()
        tx = null
      }
      const labels = Object.fromEntries(DIALOG_LABELS.map((key) => [key, tr(`dialog.${key}`)]))
      dialogElement().open({
        uses,
        labels,
        /**
* @param {Map<string, string>} plan
*/
        onChange (plan) {
          rollBack()
          if (!plan.size) return
          tx = svgCanvas.beginTransaction(tr('undo'))
          applyColors(scope, els, plan, () => svgCanvas.getNextId())
        },
        onOk () {
          tx?.commit()
          tx = null
        },
        onCancel: rollBack
      })
    }

    return {
      name: tr('name'),

      callback () {
        svgEditor.commands.register({
          id: 'tool_recolor',
          label: `${name}:button.title`,
          group: 'Edit',
          pd: true,
          interactive: true,
          enabled: () => (selection().length ? true : tr('selectFirst')),
          run: open
        })

        // The Effects tab, next to the colour shift; fall back to the panel root.
        const sidepanel = $id('tab_effects') || $id('sidepanel_content')
        if (!sidepanel) return
        const tpl = document.createElement('template')
        tpl.innerHTML = `
          <div id="recolor_panel" class="sidepanel_section">
            <div class="sidepanel_section_label">${tr('panelTitle')}</div>
            <div class="sidepanel_btn_row">
              <se-button id="tool_recolor" command="tool_recolor" size="small" title="${tr('button.title')}"
                src="recolor-tool.svg"></se-button>
            </div>
          </div>`
        sidepanel.appendChild(tpl.content.cloneNode(true))
      }
    }
  }
}
