/**
 * @file ext-taper.js
 *
 * UI glue for tapered strokes (geometry + data model live in
 * `@svgedit/svgcanvas/core/taper-stroke.js`). Injects the
 * `<se-taper-settings>` popover button into the Design tab's Object section
 * and shows it only when the single selected element is taperable — an open
 * stroked line/polyline/path without a fill, or an already tapered path
 * (which can be re-edited or restored).
 *
 * @license Apache-2.0
 */

import '../../components/seTaperSettings.ts'

const name = 'taper'

/** @param {EditorInstance} svgEditor */
const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
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
    await loadExtensionTranslation(svgEditor)
    const { svgCanvas } = svgEditor
    const { $id } = svgCanvas

    const updateVisibility = (/** @type {Element[]|undefined} */ elems) => {
      const btn = $id('tool_taper')
      if (!btn) return
      const single = elems?.length === 1 ? elems[0] : null
      btn.style.display = single && svgCanvas.canTaperStroke?.(single) ? '' : 'none'
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      selectedChanged (/** @type {{elems?: Element[]}} */ opts) {
        updateVisibility(opts.elems?.filter(Boolean))
      },
      elementChanged () {
        // A smooth/pathedit/etc. rewrite can change taperability in place.
        updateVisibility(svgCanvas.getSelectedElements().filter(Boolean))
      },
      callback () {
        const title = svgEditor.i18next.t(`${name}:title`)
        const anchor = $id('tool_stroke_to_path') || $id('tool_path_offset')
        if (!anchor) return
        const btn = document.createElement('se-taper-settings')
        btn.id = 'tool_taper'
        btn.setAttribute('title', title)
        btn.setAttribute('src', 'taper.svg')
        btn.setAttribute('data-caption', svgEditor.i18next.t(`${name}:caption`))
        btn.style.display = 'none'
        anchor.after(btn)
      }
    }
  }
}
