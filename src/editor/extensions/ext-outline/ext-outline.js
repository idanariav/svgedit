/**
 * @file ext-outline.js
 *
 * @license Apache-2.0
 *
 * Adds a second outline (halo / casing) color around a line's own stroke — e.g.
 * a white line with a thin black outline so it stays readable on any background,
 * analogous to a text outline. Implemented as an SVG filter that dilates the
 * source alpha and floods the grown ring with the chosen color, then draws the
 * original stroke back on top.
 *
 * Controls: width (halo thickness, 0 = no outline), opacity, color.
 *
 * The outline shares one per-element filter with the drop shadow through the
 * {@link module:fx-filter} composer, so a line can carry both at once (an
 * element's `filter` attribute references only one filter). This extension only
 * owns the outline slice of the combined spec.
 *
 * Shown for line-family elements only (line, polyline, path, polygon) — the same
 * set the markers/arrowheads control targets.
 */

import { createFxComposer } from '../fx-filter.js'

const name = 'outline'

// Elements that may carry an outline (mirrors ext-markers' marker scope).
const outlineElems = ['line', 'polyline', 'path', 'polygon']

const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  // Locale files are inlined into the bundle (statically resolved glob).
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
    const { svgCanvas } = svgEditor
    const { BatchCommand } = svgCanvas.history
    const { $id } = svgCanvas
    await loadExtensionTranslation(svgEditor)

    // Shared filter composer (one instance for all effect extensions).
    const fx = svgEditor.fxFilter || (svgEditor.fxFilter = createFxComposer(svgCanvas))

    /**
     * Read outline params from an element's shared effect filter.
     * Returns null if no outline is set.
     */
    const getOutlineFromElement = (elem) => {
      if (!elem) return null
      return fx.readEffects(elem).outline
    }

    /** Read current panel values. */
    const getOutlinePanelValues = () => ({
      width: Number($id('outline_width').value),
      opacity: Number($id('outline_opacity').value),
      color: $id('outline_color').value
    })

    /**
     * Apply, update, or remove the outline on a specific element, recording every
     * change into the supplied batch command. Reads the current combined spec,
     * mutates only the outline slice, and writes it back via the shared composer
     * — so any existing drop shadow on the element is preserved. Shared by the
     * panel's setOutline and the class library's apply path.
     * @param {Element} elem
     * @param {object} params - { width, opacity, color } or { remove: true }
     * @param {BatchCommand} batchCmd
     */
    const applyOutlineToElement = (elem, params, batchCmd) => {
      if (!elem) return
      const spec = fx.readEffects(elem)

      // Width is the on/off control: 0 means "no outline".
      if (params.remove || Number(params.width) === 0) {
        spec.outline = null
      } else {
        const { width, opacity, color } = params
        spec.outline = { width, color, opacity }
      }
      fx.writeEffects(elem, spec, batchCmd)
    }

    /**
     * Apply/update/remove the outline on the current selection, committing the
     * change as one undo step. Thin wrapper over {@link applyOutlineToElement}.
     */
    const setOutline = (params) => {
      const elem = svgCanvas.getSelectedElements()[0]
      if (!elem) return
      const batchCmd = new BatchCommand('Set outline')
      applyOutlineToElement(elem, params, batchCmd)
      if (!batchCmd.isEmpty()) {
        svgCanvas.addCommandToHistory(batchCmd)
      }
    }

    // Expose a minimal outline API so other subsystems (e.g. the class library)
    // can read an element's outline params and stamp them onto other elements
    // without duplicating the filter-construction logic.
    svgEditor.outlineApi = {
      read: getOutlineFromElement,
      apply: applyOutlineToElement
    }

    /** Show/hide the outline panel and populate controls from the element. */
    const showPanel = (on, elem) => {
      const panel = $id('outline_panel')
      if (!panel) return
      panel.style.display = on ? '' : 'none'
      if (on && elem) {
        const p = getOutlineFromElement(elem)
        // Default width 0 when the element has no outline, so the panel clearly
        // reflects "no outline" rather than showing phantom active values.
        $id('outline_width').value = p?.width ?? 0
        $id('outline_opacity').value = p?.opacity ?? 1
        $id('outline_color').value = p?.color ?? '#000000'
      }
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),

      callback () {
        // Inject the outline panel into the Effects tab, after the shadow panel.
        const panelTemplate = document.createElement('template')
        panelTemplate.innerHTML = `
          <div id="outline_panel" class="sidepanel_section" style="display:none">
            <div class="sidepanel_section_label">${svgEditor.i18next.t(`${name}:name`)}</div>
            <div class="sidepanel_section_grid">
              <se-spin-input id="outline_width" label="O" min="0" max="50" step="1" value="0"
                title="${svgEditor.i18next.t(`${name}:contextTools.width.title`)}"></se-spin-input>
              <se-spin-input id="outline_opacity" label="%" min="0" max="1" step="0.05" value="1"
                title="${svgEditor.i18next.t(`${name}:contextTools.opacity.title`)}"></se-spin-input>
            </div>
            <div class="shadow_panel_footer">
              <input type="color" id="outline_color" value="#000000"
                title="${svgEditor.i18next.t(`${name}:contextTools.color.title`)}">
              <se-button id="outline_remove" src="delete.svg"
                title="${svgEditor.i18next.t(`${name}:contextTools.remove.title`)}"></se-button>
            </div>
          </div>
        `
        const node = panelTemplate.content.cloneNode(true)
        const shadowPanel = $id('shadow_panel')
        if (shadowPanel) {
          shadowPanel.after(node)
        } else {
          const host = $id('tab_effects') || $id('sidepanel_content') || $id('tools_top')
          host.appendChild(node)
        }

        // Wire event listeners
        ;['outline_width', 'outline_opacity'].forEach((id) => {
          $id(id).addEventListener('change', () => setOutline(getOutlinePanelValues()))
        })
        $id('outline_color').addEventListener('change', () => setOutline(getOutlinePanelValues()))
        $id('outline_remove').addEventListener('click', () => setOutline({ remove: true }))
      },

      selectedChanged (opts) {
        if (opts.selectedElement) fx.refreshRegion(opts.selectedElement)
        if (!opts.selectedElement || opts.multiselected) {
          showPanel(false)
          return
        }
        const show = outlineElems.includes(opts.selectedElement.tagName)
        showPanel(show, show ? opts.selectedElement : null)
      },

      // The effect filter region is an absolute box (see fx-filter setRegion),
      // so it must be re-derived after the element moves. A move bakes the drag
      // transform into the geometry without firing 'changed', but the mouseUp
      // extension hook runs after that bake — refresh every selected element's
      // region here. elementChanged covers attribute edits and (re)load.
      mouseUp () {
        svgCanvas.getSelectedElements().filter(Boolean).forEach(el => fx.refreshRegion(el))
      },

      elementChanged (opts) {
        (opts.elems || []).filter(Boolean).forEach(el => fx.refreshRegion(el))
      }
    }
  }
}
