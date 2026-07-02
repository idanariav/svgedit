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

import '../../components/seTaperSettings.js'

const name = 'taper'

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

    const updateVisibility = (elems) => {
      const btn = $id('tool_taper')
      if (!btn) return
      const single = elems?.length === 1 ? elems[0] : null
      btn.style.display = single && svgCanvas.canTaperStroke?.(single) ? '' : 'none'
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      selectedChanged (opts) {
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
        btn.style.display = 'none'
        anchor.after(btn)
      }
    }
  }
}
