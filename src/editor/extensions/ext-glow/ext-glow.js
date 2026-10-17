/**
 * @file ext-glow.js
 *
 * @license Apache-2.0
 *
 * Outer and inner glow, and feather, for any selected element, text included,
 * in the Effects tab. An outer glow is a blurred, coloured copy of the silhouette painted
 * under the shape; an inner glow is colour painted inside the shape, from the
 * edge inward or from the centre outward. Controls per glow: blur (0 = no
 * glow), opacity, colour; the inner glow also has its source. Feather (radius,
 * 0 = off) fades the object's own edges inward; the glows, outline and shadow
 * then follow the soft edge.
 *
 * Glow and feather share one per-element filter with the drop shadow and the
 * outline through the {@link module:fx-filter} composer (an element's `filter`
 * attribute references only one filter). This extension only owns the glow and
 * feather slices of the combined spec. Ported from VectorCraft's SVG export
 * (`crates/svg/src/export.rs`); glows composite normally, not "screen".
 */

import { createFxComposer } from '../fx-filter.js'

const name = 'glow'

/** @typedef {import('../fx-filter.js').OuterGlow} OuterGlow */
/** @typedef {import('../fx-filter.js').InnerGlow} InnerGlow */
/** @typedef {{outer?: OuterGlow|null, inner?: (OuterGlow & {source?: string})|null, feather?: {radius: number}|null, remove?: boolean}} GlowParams */
/** @typedef {'outer'|'inner'} GlowKind */

const DEFAULT_BLUR = 5
const DEFAULTS = {
  outer: { color: '#ffff00', opacity: 0.75 },
  inner: { color: '#ffffff', opacity: 0.75, source: 'edge' }
}

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
    const { BatchCommand } = svgCanvas.history
    const { $id, $req } = svgCanvas
    /** A panel field by id (the glow panel's ids are built per kind, so they are not in the typed id map). */
    const field = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($req(id))
    await loadExtensionTranslation(svgEditor)
    const t = (/** @type {string} */ key) => svgEditor.i18next.t(`${name}:${key}`)

    // Shared filter composer (one instance for all effect extensions).
    const fx = svgEditor.fxFilter || (svgEditor.fxFilter = createFxComposer(svgCanvas))

    /**
     * An element's glow and feather as `{ outer, inner, feather }` (each may
     * be null), or null when it has none — the shape the class library stores.
     * @param {Element} elem
     * @returns {?{outer: ?OuterGlow, inner: ?InnerGlow, feather: ?{radius: number}}}
     */
    const getGlowFromElement = (elem) => {
      if (!elem) return null
      const { glow, feather } = fx.readEffects(elem)
      return glow.outer || glow.inner || feather ? { ...glow, feather } : null
    }

    /** Current panel values for one glow; null when its blur is 0 (off). */
    const readPanel = (/** @type {GlowKind} */ kind) => {
      const blur = Number(field(`glow_${kind}_blur`).value)
      if (!(blur > 0)) return null
      /** @type {OuterGlow & {source?: string}} */
      const glow = {
        blur,
        color: field(`glow_${kind}_color`).value,
        opacity: Math.min(1, Math.max(0, Number(field(`glow_${kind}_opacity`).value) / 100))
      }
      if (kind === 'inner') glow.source = field('glow_inner_source').value === 'centre' ? 'centre' : 'edge'
      return glow
    }

    /** Current panel value of the feather; null when its radius is 0 (off). */
    const readFeather = () => {
      const radius = Number(field('glow_feather_radius').value)
      return radius > 0 ? { radius } : null
    }

    /**
     * Apply, update or remove the glow and feather on a specific element,
     * recording every change into the supplied batch. Reads the combined spec,
     * replaces only those slices and writes it back, so a shadow / outline on
     * the element is preserved. Shared by the panel and the class library's
     * apply path.
     * @param {Element} elem
     * @param {GlowParams} params - `{ outer, inner, feather }` (each a glow / feather or null) or `{ remove: true }`
     * @param {InstanceType<typeof BatchCommand>} batchCmd
     */
    const applyGlowToElement = (elem, params, batchCmd) => {
      if (!elem) return
      const spec = fx.readEffects(elem)
      const keep = (/** @type {*} */ g) => (g && Number(g.blur) > 0 ? g : null)
      spec.glow = params.remove
        ? { outer: null, inner: null }
        : { outer: keep(params.outer), inner: keep(params.inner) }
      spec.feather = !params.remove && params.feather && params.feather.radius > 0 ? params.feather : null
      fx.writeEffects(elem, spec, batchCmd)
    }

    /** Apply the panel's values to the selection as one undo step. */
    const setGlow = (/** @type {GlowParams} */ params) => {
      const elem = svgCanvas.getSelectedElements()[0]
      if (!elem) return
      const batchCmd = new BatchCommand('Set glow')
      applyGlowToElement(elem, params, batchCmd)
      if (!batchCmd.isEmpty()) svgCanvas.addCommandToHistory(batchCmd)
      showPanel(true, elem)
      svgEditor.commands.refreshEnablement() // Remove follows whether a glow is left
    }

    // Minimal API so other subsystems (the class library) can read an
    // element's glow and stamp it onto others without knowing the filter chain.
    svgEditor.glowApi = {
      read: getGlowFromElement,
      apply: applyGlowToElement
    }

    // Shows/hides the panel and fills the controls from the element.
    /**
* @param {boolean} on
* @param {Element | undefined} [elem]
*/
    function showPanel (on, elem) {
      const panel = $id('glow_panel')
      if (!panel) return
      panel.style.display = on ? '' : 'none'
      if (!on || !elem) return
      const glow = getGlowFromElement(elem) || { outer: null, inner: null }
      for (const kind of /** @type {GlowKind[]} */ (['outer', 'inner'])) {
        const g = glow[kind]
        // Blur 0 when off, so the panel reads "no glow" rather than showing
        // phantom active values.
        field(`glow_${kind}_blur`).value = String(g?.blur ?? 0)
        field(`glow_${kind}_opacity`).value = String(Math.round((g?.opacity ?? DEFAULTS[kind].opacity) * 100))
        field(`glow_${kind}_color`).value = g?.color ?? DEFAULTS[kind].color
        ;/** @type {Element} */ (panel.querySelector(`[data-glow="${kind}"]`)).toggleAttribute('data-off', !g)
      }
      field('glow_inner_source').value = glow.inner?.source ?? DEFAULTS.inner.source
      const { feather } = fx.readEffects(elem)
      field('glow_feather_radius').value = String(feather?.radius ?? 0)
      ;/** @type {Element} */ (panel.querySelector('[data-glow="feather"]')).toggleAttribute('data-off', !feather)
    }

    return {
      name: t('name'),

      callback () {
        const group = (/** @type {GlowKind} */ kind) => `
          <div class="glow_group" data-glow="${kind}" data-off>
            <div class="glow_group_label">${t(kind)}</div>
            <div class="sidepanel_section_grid">
              <se-spin-input id="glow_${kind}_blur" label="Blur" min="0" max="100" step="1" value="0"
                title="${t('contextTools.blur.title')}"></se-spin-input>
              <se-spin-input id="glow_${kind}_opacity" label="Opacity" min="0" max="100" step="5"
                value="${Math.round(DEFAULTS[kind].opacity * 100)}"
                title="${t('contextTools.opacity.title')}"></se-spin-input>
            </div>
            <div class="shadow_panel_footer">
              <input type="color" id="glow_${kind}_color" value="${DEFAULTS[kind].color}"
                title="${t('contextTools.color.title')}">
              <span class="shadow_panel_footer_label">${t('contextTools.color.title')}</span>
              ${kind === 'inner' ? `<se-select id="glow_inner_source" title="${t('contextTools.source.title')}"></se-select>` : ''}
            </div>
          </div>`
        const panelTemplate = document.createElement('template')
        panelTemplate.innerHTML = `
          <div id="glow_panel" class="sidepanel_section" style="display:none">
            <div class="shadow_panel_header">
              <div class="sidepanel_section_label">${t('name')}</div>
              <se-button id="glow_remove" command="glow_remove" src="delete.svg" title="${t('contextTools.remove.title')}"></se-button>
            </div>
            ${group('outer')}
            ${group('inner')}
            <div class="glow_group" data-glow="feather" data-off>
              <div class="glow_group_label">${t('feather')}</div>
              <div class="sidepanel_section_grid">
                <se-spin-input id="glow_feather_radius" label="Radius" min="0" max="100" step="1" value="0"
                  title="${t('contextTools.feather.title')}"></se-spin-input>
              </div>
            </div>
          </div>
        `
        const node = panelTemplate.content.cloneNode(true)
        const anchor = $id('outline_panel') || $id('shadow_panel')
        if (anchor) {
          anchor.after(node)
        } else {
          const host = $id('tab_effects') || $id('sidepanel_content') || $id('tools_top')
          ;/** @type {Element} */ (host).appendChild(node)
        }

        const source = /** @type {HTMLElementTagNameMap['se-select']} */ ($req('glow_inner_source'))
        source.addOption('edge', t('contextTools.edge'))
        source.addOption('centre', t('contextTools.centre'))
        source.value = DEFAULTS.inner.source

        const commit = () => setGlow({ outer: readPanel('outer'), inner: readPanel('inner'), feather: readFeather() })
        for (const kind of /** @type {GlowKind[]} */ (['outer', 'inner'])) {
          // Editing opacity / colour of a glow that is off switches it on at a
          // visible default blur (a zero blur would mean "no glow").
          const switchOn = () => {
            if (!(Number(field(`glow_${kind}_blur`).value) > 0)) field(`glow_${kind}_blur`).value = String(DEFAULT_BLUR)
          }
          field(`glow_${kind}_blur`).addEventListener('change', commit)
          for (const part of ['opacity', 'color']) {
            field(`glow_${kind}_${part}`).addEventListener('change', () => {
              switchOn()
              commit()
            })
          }
        }
        source.addEventListener('change', () => {
          const blur = /** @type {HTMLInputElement} */ ($id('glow_inner_' + 'blur'))
          if (!(Number(blur.value) > 0)) blur.value = String(DEFAULT_BLUR)
          commit()
        })
        $req('glow_feather_radius').addEventListener('change', commit)
        svgEditor.commands.register({
          id: 'glow_remove',
          label: t('contextTools.remove.title'),
          group: 'Tools',
          pd: true,
          enabled: () => getGlowFromElement(svgCanvas.getSelectedElements()[0]) ? true : 'The selection has no glow',
          run: () => setGlow({ remove: true })
        })
      },

      selectedChanged (/** @type {{selectedElement: Element|null, multiselected: boolean}} */ opts) {
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

      // The effect filter region is an absolute box (see fx-filter setRegion),
      // so it is re-derived after the element moves.
      mouseUp () {
        svgCanvas.getSelectedElements().filter(Boolean).forEach(el => fx.refreshRegion(el))
      },

      elementChanged (/** @type {{elems: Element[]}} */ opts) {
        ;(opts.elems || []).filter(Boolean).forEach(el => fx.refreshRegion(el))
      }
    }
  }
}
