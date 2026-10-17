/**
 * @file ext-segment.ts
 *
 * UI glue for the Segment tool (geometry + data model live in
 * `@svgedit/svgcanvas/core/segment.js`). Injects the `<se-segment-settings>`
 * popover button into the Design tab's Object section and shows it only
 * when the single selected element is path-convertible (or is/holds a
 * previous non-split segment result, so it can be re-edited).
 *
 * @license Apache-2.0
 */

import '../../components/seSegmentSettings.ts'
import { defineFeature, addFeatureLocale } from '../defineFeature.ts'

const name = 'segment'

export default defineFeature({
  name,
  async init (svgEditor) {
    addFeatureLocale(svgEditor, name, import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>)
    const { svgCanvas } = svgEditor
    const { $id } = svgCanvas

    const updateVisibility = (elems: Element[] | undefined) => {
      const btn = $id('tool_segment')
      if (!btn) return
      const single = elems?.length === 1 ? elems[0] : null
      btn.style.display = single && svgCanvas.canSegment?.(single) ? '' : 'none'
    }

    svgCanvas.bind('selectedChanged', (_win: Window, opts: { elems?: Element[] }) => {
      updateVisibility(opts.elems?.filter(Boolean))
    })

    svgCanvas.bind('elementChanged', (_win: Window) => {
      updateVisibility(svgCanvas.getSelectedElements().filter(Boolean))
    })

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        const title = svgEditor.i18next.t(`${name}:title`)
        const anchor = $id('tool_repeat') || $id('tool_path_offset')
        if (!anchor) return
        const btn = document.createElement('se-segment-settings')
        btn.id = 'tool_segment'
        btn.setAttribute('title', title)
        btn.setAttribute('src', 'segment.svg')
        btn.setAttribute('data-caption', svgEditor.i18next.t(`${name}:caption`))
        btn.style.display = 'none'
        anchor.after(btn)
      }
    }
  }
})
