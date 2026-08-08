/**
 * @file ext-segment.js
 *
 * UI glue for the Segment tool (geometry + data model live in
 * `@svgedit/svgcanvas/core/segment.js`). Injects the `<se-segment-settings>`
 * popover button into the Design tab's Object section and shows it only
 * when the single selected element is path-convertible (or is/holds a
 * previous non-split segment result, so it can be re-edited).
 *
 * @license Apache-2.0
 */

import '../../components/seSegmentSettings.js'

const name = 'segment'

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
      const btn = $id('tool_segment')
      if (!btn) return
      const single = elems?.length === 1 ? elems[0] : null
      btn.style.display = single && svgCanvas.canSegment?.(single) ? '' : 'none'
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      selectedChanged (opts) {
        updateVisibility(opts.elems?.filter(Boolean))
      },
      elementChanged () {
        updateVisibility(svgCanvas.getSelectedElements().filter(Boolean))
      },
      callback () {
        const title = svgEditor.i18next.t(`${name}:title`)
        const anchor = $id('tool_repeat') || $id('tool_path_offset')
        if (!anchor) return
        const btn = document.createElement('se-segment-settings')
        btn.id = 'tool_segment'
        btn.setAttribute('title', title)
        btn.setAttribute('src', 'segment.svg')
        btn.style.display = 'none'
        anchor.after(btn)
      }
    }
  }
}
