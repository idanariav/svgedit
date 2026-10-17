/**
 * @file ext-shadow.ts
 *
 * @license Apache-2.0
 *
 * Adds a drop shadow to any selected shape via a composed SVG filter.
 * Controls: angle (direction), length (stretch), blur radius, opacity, color.
 *
 * Angle 0° = 12 o'clock (shadow points up), increases clockwise.
 * Internally the filter stores dx/dy on feDropShadow; angle/length are the UI
 * representation only — no SVG format change for saved files.
 *
 * The drop shadow shares a single per-element filter with the outline effect
 * via the {@link module:fx-filter} composer, so the two can coexist on one
 * element (an element's `filter` attribute references only one filter). This
 * extension only owns the shadow slice of the combined spec; shadow-only output
 * is identical to the legacy single-`<feDropShadow>` filter.
 *
 * Angle/length are this extension's UI representation only — they are converted
 * to/from the filter's dx/dy here; no SVG format change for saved files.
 */

import { createFxComposer } from '../fx-filter.ts'
import { defineFeature, addFeatureLocale } from '../defineFeature.ts'

const name = 'shadow'

export type ShadowParams = { angle?: number, length?: number, blur?: number, opacity?: number, color?: string, remove?: boolean }

export default defineFeature({
  name,
  async init (svgEditor) {
    const { svgCanvas } = svgEditor
    const { BatchCommand } = svgCanvas.history
    const { $id, $req } = svgCanvas
    addFeatureLocale(svgEditor, name, import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>)

    // Shared filter composer (one instance for all effect extensions, so they
    // agree on the per-element filter and the restore-on-removal bookkeeping).
    const fx = svgEditor.fxFilter || (svgEditor.fxFilter = createFxComposer(svgCanvas))

    // --- Polar/Cartesian helpers ---

    // Angle 0° = 12 o'clock (shadow points up), clockwise; SVG Y-axis is down.
    const toOffset = (angle: number, length: number) => {
      const r = angle * Math.PI / 180
      return { dx: length * Math.sin(r), dy: -length * Math.cos(r) }
    }

    // Inverse: dx/dy → { angle: 0–360, length }
    const toPolar = (dx: number, dy: number) => {
      const length = Math.sqrt(dx * dx + dy * dy)
      const angle = length > 0
        ? ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360
        : 150 // default to ~5 o'clock when length is zero
      return { angle, length }
    }

    /**
     * Read shadow params from an element's shared effect filter.
     * Returns null if no shadow is set.
     */
    const getShadowFromElement = (elem: Element | null) => {
      if (!elem) return null
      const { shadow } = fx.readEffects(elem)
      if (!shadow) return null
      const { angle, length } = toPolar(shadow.dx, shadow.dy)
      return {
        angle: Math.round(angle),
        length: Math.round(length * 10) / 10,
        blur: shadow.blur,
        opacity: shadow.opacity,
        color: shadow.color
      }
    }

    /**
     * Read current panel values.
     */
    const getShadowPanelValues = () => ({
      angle: Number($req('shadow_angle').value),
      length: Number($req('shadow_length').value),
      blur: Number($req('shadow_blur').value),
      // Panel shows opacity as 0–100 (same scale as the Design tab); the filter stores 0–1.
      opacity: Number($req('shadow_opacity').value) / 100,
      color: $req('shadow_color').value
    })

    /**
     * Apply, update, or remove the drop shadow on a specific element, recording
     * every change into the supplied batch command (no commit, no selection
     * assumptions). Reads the current combined spec, mutates only the shadow
     * slice, and writes it back via the shared composer — so any existing
     * outline on the element is preserved. Shared by the panel's setShadow and
     * the class library's apply path.
 * @param params - { angle, length, blur, opacity, color } or { remove: true }
     */
    const applyShadowToElement = (elem: Element, params: ShadowParams, batchCmd: InstanceType<typeof BatchCommand>) => {
      if (!elem) return
      const spec = fx.readEffects(elem)

      // Length is the on/off control: a zero-length shadow means "no shadow",
      // so clear the shadow slice. This keeps length 0 ⟺ no shadow unambiguous.
      if (params.remove || Number(params.length) === 0) {
        spec.shadow = null
      } else {
        const { angle, length, blur, opacity, color } = params as Required<ShadowParams>
        const { dx, dy } = toOffset(angle, length)
        spec.shadow = { dx, dy, blur, color, opacity }
      }
      fx.writeEffects(elem, spec, batchCmd)
    }

    /**
     * Apply/update/remove the shadow on the current selection, committing the
     * change as one undo step. Thin wrapper over {@link applyShadowToElement}.
 * @param params - { angle, length, blur, opacity, color } or { remove: true }
     */
    const setShadow = (params: ShadowParams) => {
      const elem = svgCanvas.getSelectedElements()[0]
      if (!elem) return
      const batchCmd = new BatchCommand('Set shadow')
      applyShadowToElement(elem, params, batchCmd)
      if (!batchCmd.isEmpty()) {
        svgCanvas.addCommandToHistory(batchCmd)
      }
    }

    // Expose a minimal shadow API so other subsystems (e.g. the class library)
    // can read an element's shadow parameters and stamp them onto other
    // elements without duplicating the filter-construction logic.
    svgEditor.shadowApi = {
      read: getShadowFromElement,
      apply: applyShadowToElement
    }

    /**
     * Show/hide the shadow panel and populate controls from the element.
     */
    const showPanel = (on: boolean, elem: Element | null = null) => {
      const panel = $id('shadow_panel')
      if (!panel) return
      panel.style.display = on ? '' : 'none'
      if (on && elem) {
        const p = getShadowFromElement(elem)
        $req('shadow_angle').value = p?.angle ?? 150
        // Default length 0 when the element has no shadow, so the panel clearly
        // reflects "no shadow" rather than showing phantom active values.
        $req('shadow_length').value = p?.length ?? 0
        $req('shadow_blur').value = p?.blur ?? 4
        $req('shadow_opacity').value = Math.round((p?.opacity ?? 0.5) * 100)
        $req('shadow_enabled').checked = !!p
        panel.toggleAttribute('data-off', !p)
        $req('shadow_color').value = p?.color ?? '#000000'
      }
    }

    // The effect filter region is an absolute box (see fx-filter setRegion), so it is re-derived after a move: a move bakes the
    // drag transform into the geometry without firing 'changed', and 'gestureEnded' comes after that bake.
    // elementChanged (below) covers attribute edits and (re)load.
    svgCanvas.bind('gestureEnded', () => {
      svgCanvas.getSelectedElements().filter(Boolean).forEach(el => fx.refreshRegion(el))
    })

    return {
      name: svgEditor.i18next.t(`${name}:name`),

      callback () {
        // Inject the shadow panel into the right side panel
        const panelTemplate = document.createElement('template')
        panelTemplate.innerHTML = `
          <div id="shadow_panel" class="sidepanel_section" style="display:none">
            <div class="shadow_panel_header">
              <div class="sidepanel_section_label">${svgEditor.i18next.t(`${name}:name`)}</div>
              <label class="shadow_toggle" title="${svgEditor.i18next.t(`${name}:contextTools.enable.title`)}">
                <input type="checkbox" id="shadow_enabled">
                <span>${svgEditor.i18next.t(`${name}:contextTools.enable.title`)}</span>
              </label>
            </div>
            <div class="sidepanel_section_grid">
              <se-spin-input id="shadow_angle"  label="Angle" min="0" max="359" step="5" value="150"
                title="${svgEditor.i18next.t(`${name}:contextTools.angle.title`)}"></se-spin-input>
              <se-spin-input id="shadow_length" label="Distance" min="0" max="500" step="1" value="0"
                title="${svgEditor.i18next.t(`${name}:contextTools.length.title`)}"></se-spin-input>
              <se-spin-input id="shadow_blur" label="Blur" min="0" max="50" step="1" value="4"
                title="${svgEditor.i18next.t(`${name}:contextTools.blur.title`)}"></se-spin-input>
              <se-spin-input id="shadow_opacity" label="Opacity" min="0" max="100" step="5" value="50"
                title="${svgEditor.i18next.t(`${name}:contextTools.opacity.title`)}"></se-spin-input>
            </div>
            <div class="shadow_panel_footer">
              <input type="color" id="shadow_color" value="#000000"
                title="${svgEditor.i18next.t(`${name}:contextTools.color.title`)}">
              <span class="shadow_panel_footer_label">${svgEditor.i18next.t(`${name}:contextTools.color.title`)}</span>
            </div>
          </div>
        `
        const host = $id('tab_effects') || $id('sidepanel_content') || $id('tools_top')
        ;(host as Element).appendChild(panelTemplate.content.cloneNode(true))

        // Wire event listeners
        const DEFAULT_LENGTH = 8
        const setEnabledUi = (on: boolean) => {
          $req('shadow_enabled').checked = on
          $req('shadow_panel').toggleAttribute('data-off', !on)
        }
        // Editing any field while the shadow is off switches it on (a zero
        // distance would mean "no shadow", so give it a visible default).
        const applyFromPanel = () => {
          if (!$req('shadow_enabled').checked || Number($req('shadow_length').value) === 0) {
            if (Number($req('shadow_length').value) === 0) $req('shadow_length').value = DEFAULT_LENGTH
            setEnabledUi(true)
          }
          setShadow(getShadowPanelValues())
        }
        ;['shadow_angle', 'shadow_length', 'shadow_blur', 'shadow_opacity', 'shadow_color'].forEach((id) => {
          $req(id).addEventListener('change', applyFromPanel)
        })
        $req('shadow_enabled').addEventListener('change', (e) => {
          if ((e.target as HTMLInputElement).checked) {
            applyFromPanel()
          } else {
            setEnabledUi(false)
            setShadow({ remove: true })
          }
        })
      },

      selectedChanged (opts: { selectedElement: Element | null, multiselected: boolean }) {
        if (opts.selectedElement) fx.refreshRegion(opts.selectedElement)
        if (!opts.selectedElement || opts.multiselected) {
          showPanel(false)
          return
        }
        const { tagName } = opts.selectedElement
        if (['svg', 'defs'].includes(tagName)) {
          showPanel(false)
          return
        }
        showPanel(true, opts.selectedElement)
      },

      elementChanged (opts: { elems: Element[] }) {
        ;(opts.elems || []).filter(Boolean).forEach(el => fx.refreshRegion(el))
      }
    }
  }
})
