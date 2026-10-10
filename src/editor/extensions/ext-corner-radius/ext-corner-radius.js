/**
 * @file ext-corner-radius.js
 *
 * "Corners" section in the right-panel Design tab (Live Corners): cuts the
 * corners of the selected `<path>` / `<polygon>` / `<polyline>` / `<rect>` —
 * every anchor where two straight sides meet, even on a path that curves
 * elsewhere — with a radius and a kind (round, inverted round, chamfer).
 * Attribute-driven and re-editable — the geometry and choices live on the
 * element as `se:orig-d` / `se:corner-radius` and the math is in
 * `@svgedit/svgcanvas/core/corner-radius.js` (`svgCanvas.applyCornerRadius` /
 * `canRoundCorners` / `getCornerSettings`). The radius field and kind buttons
 * edit every corner; per-corner values written by other means (the attribute
 * accepts a list) are kept and shown.
 *
 * If the cut `d` is later rewritten by something other than this pipeline
 * (e.g. node editing in pathedit mode), the stored source no longer matches —
 * the attributes are then dropped so the user edits what they see (the shape
 * itself is untouched).
 *
 * @license Apache-2.0
 */

import {
  isCornerStateCurrent, CORNER_KINDS, CORNER_RADIUS_ATTR, CORNER_SOURCE_ATTR
} from '@svgedit/svgcanvas/core/corner-radius.js'

const name = 'corner-radius'
const KIND_ICONS = { r: 'round', i: 'inverted', c: 'chamfer' }

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

    // Last kind picked / seen; applied to corners when a radius is first set.
    let curKind = 'r'

    /**
     * Drop stale corner attributes when the element's `d` was rewritten
     * outside the corner pipeline (pathedit, …).
     * @param {Element} elem
     * @returns {boolean} true when the element still carries valid corners.
     */
    const reconcile = (elem) => {
      if (isCornerStateCurrent(elem)) return true
      elem.removeAttribute(CORNER_SOURCE_ATTR)
      elem.removeAttribute(CORNER_RADIUS_ATTR)
      return false
    }

    // The value the R field shows: a rect's own rounding until it is cut,
    // otherwise the first cut corner's radius.
    const shownRadius = (elem, cut) => {
      if (cut.length) return cut[0].radius
      return elem.tagName === 'rect' ? parseFloat(elem.getAttribute('rx')) || 0 : 0
    }

    const refresh = (elem) => {
      const cut = svgCanvas.getCornerSettings(elem).filter((c) => c.radius > 0)
      const kinds = new Set(cut.map((c) => c.kind))
      if (kinds.size === 1) curKind = [...kinds][0]
      $id('corner_radius_value').value = shownRadius(elem, cut)
      for (const k of CORNER_KINDS) {
        const btn = $id(`corner_kind_${k}`)
        if (btn) btn.pressed = kinds.size ? kinds.has(k) : k === curKind
      }
    }

    const showPanel = (on, elem) => {
      const panel = $id('corner_panel')
      if (!panel) return
      panel.style.display = on ? 'block' : 'none'
      if (on && elem) refresh(elem)
    }

    const update = (opts) => {
      const elems = opts.elems.filter(Boolean)
      const elem = elems[0]
      if (!elem || elems.length > 1 || svgCanvas.getMode() === 'pathedit') {
        showPanel(false)
        return
      }
      if (elem.tagName === 'path' && elem.hasAttribute(CORNER_SOURCE_ATTR)) {
        reconcile(elem)
      }
      showPanel(svgCanvas.canRoundCorners(elem), elem)
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        const panelTemplate = document.createElement('template')
        panelTemplate.innerHTML = `
          <div id="corner_panel" class="sidepanel_section" style="display:none">
            <div class="sidepanel_section_label">${svgEditor.i18next.t(`${name}:label`)}</div>
            <div class="sidepanel_btn_row">
              <se-spin-input id="corner_radius_value" label="${svgEditor.i18next.t(`${name}:radius`)}"
                min="0" max="500" step="1" value="0" title="${name}:label"></se-spin-input>
            </div>
            <div class="sidepanel_btn_row" id="corner_kind_row">
              ${CORNER_KINDS.map((k) => `<se-button id="corner_kind_${k}" command="corner_kind_${k}" title="${svgEditor.i18next.t(`${name}:kind_${k}`)}"
                src="corner_${KIND_ICONS[k]}.svg"></se-button>`).join('')}
            </div>
          </div>
        `
        // Inject into the Design tab right before the Object section (same
        // placement contract as ext-markers' panel).
        const designTab = $id('tab_design')
        const objectPanel = designTab?.querySelector('.selected_panel')
        if (designTab && objectPanel) {
          designTab.insertBefore(panelTemplate.content, objectPanel)
        } else {
          (designTab || $id('tools_top')).appendChild(panelTemplate.content)
        }
        $id('corner_radius_value').addEventListener('change', (e) => {
          const r = Math.max(0, parseFloat(e.target.value) || 0)
          const [elem] = svgCanvas.getSelectedElements().filter(Boolean)
          // Only impose the panel's kind when every cut corner already shares
          // it (or none is cut yet): a mixed set keeps its per-corner kinds.
          const cut = elem ? svgCanvas.getCornerSettings(elem).filter((c) => c.radius > 0) : []
          const uniform = new Set(cut.map((c) => c.kind)).size <= 1
          svgCanvas.applyCornerRadius(r, uniform ? { kind: curKind } : {})
        })
        for (const k of CORNER_KINDS) {
          svgEditor.commands.register({
            id: `corner_kind_${k}`,
            label: `${name}:kind_${k}`,
            group: 'Tools',
            pd: true,
            run: () => {
              curKind = k
              const [elem] = svgCanvas.getSelectedElements().filter(Boolean)
              const cut = elem ? svgCanvas.getCornerSettings(elem).filter((c) => c.radius > 0) : []
              if (cut.length) svgCanvas.applyCornerRadius(undefined, { kind: k })
              else if (elem) refresh(elem)
            }
          })
        }
      },
      selectedChanged (opts) {
        update(opts)
      },
      elementChanged (opts) {
        const elem = opts.elems.filter(Boolean)[0]
        const panel = $id('corner_panel')
        if (elem && panel && panel.style.display !== 'none') refresh(elem)
      }
    }
  }
}
