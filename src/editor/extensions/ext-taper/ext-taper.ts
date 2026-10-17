/**
 * @file ext-taper.ts
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
import { defineFeature, addFeatureLocale } from '../defineFeature.ts'

const name = 'taper'

export default defineFeature({
  name,
  async init (svgEditor) {
    addFeatureLocale(svgEditor, name, import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>)
    const { svgCanvas } = svgEditor
    const { $id } = svgCanvas

    const updateVisibility = (elems: Element[] | undefined) => {
      const btn = $id('tool_taper')
      if (!btn) return
      const single = elems?.length === 1 ? elems[0] : null
      btn.style.display = single && svgCanvas.canTaperStroke?.(single) ? '' : 'none'
    }

    svgCanvas.bind('selectedChanged', (_win: Window, opts: { elems?: Element[] }) => {
      updateVisibility(opts.elems?.filter(Boolean))
    })

    svgCanvas.bind('elementChanged', (_win: Window) => {
      // A smooth/pathedit/etc. rewrite can change taperability in place.
      updateVisibility(svgCanvas.getSelectedElements().filter(Boolean))
    })

    return {
      name: svgEditor.i18next.t(`${name}:name`),
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
})
