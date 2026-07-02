/**
 * @file ext-corner-radius.js
 *
 * "Corners" section in the right-panel Design tab: rounds the corners of the
 * selected straight-segment `<path>` / `<polygon>` / `<polyline>` with a
 * circular-arc fillet. Attribute-driven and re-editable — the geometry and
 * radius live on the element as `se:orig-d` / `se:corner-radius` and the
 * math is in `@svgedit/svgcanvas/core/corner-radius.js`
 * (`svgCanvas.applyCornerRadius` / `canRoundCorners`).
 *
 * If the rounded `d` is later rewritten by something other than the rounding
 * pipeline (e.g. node editing in pathedit mode), the stored source no longer
 * matches — the rounding attributes are then dropped so the user edits what
 * they see (the shape itself is untouched).
 *
 * @license Apache-2.0
 */

import {
  parseStraightSubpaths, roundedPathD, subpathsToD,
  CORNER_RADIUS_ATTR, CORNER_SOURCE_ATTR
} from '@svgedit/svgcanvas/core/corner-radius.js'

const name = 'corner-radius'

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

    /**
     * Drop stale rounding attributes when the element's `d` was rewritten
     * outside the rounding pipeline (pathedit, reorient, …).
     * @param {Element} elem
     * @returns {boolean} true when the element still carries valid rounding.
     */
    const reconcile = (elem) => {
      const src = elem.getAttribute(CORNER_SOURCE_ATTR)
      if (!src) return false
      const radius = parseFloat(elem.getAttribute(CORNER_RADIUS_ATTR)) || 0
      const subpaths = parseStraightSubpaths(src, elem.ownerDocument)
      const expected = subpaths
        ? (radius > 0 ? roundedPathD(subpaths, radius) : subpathsToD(subpaths))
        : null
      if (expected !== elem.getAttribute('d')) {
        elem.removeAttribute(CORNER_SOURCE_ATTR)
        elem.removeAttribute(CORNER_RADIUS_ATTR)
        return false
      }
      return true
    }

    const showPanel = (on, elem) => {
      const panel = $id('corner_panel')
      if (!panel) return
      panel.style.display = on ? 'block' : 'none'
      if (on && elem) {
        $id('corner_radius_value').value =
          parseFloat(elem.getAttribute(CORNER_RADIUS_ATTR)) || 0
      }
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
          svgCanvas.applyCornerRadius(r)
        })
      },
      selectedChanged (opts) {
        update(opts)
      },
      elementChanged (opts) {
        const elem = opts.elems.filter(Boolean)[0]
        const panel = $id('corner_panel')
        if (elem && panel && panel.style.display !== 'none') {
          $id('corner_radius_value').value =
            parseFloat(elem.getAttribute(CORNER_RADIUS_ATTR)) || 0
        }
      }
    }
  }
}
