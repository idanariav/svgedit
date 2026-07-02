/**
 * @file ext-text-path.js
 *
 * UI glue for text on path (logic in `@svgedit/svgcanvas/core/text-path.js`).
 *
 *  - Combine section: `tool_text_on_path` button, shown only when exactly one
 *    `<text>` and one path-convertible shape are selected —
 *    `svgCanvas.attachTextToPath()`.
 *  - Text tab: a "Text path" section (`#textpath_panel`) shown for a selected
 *    text that flows on a path — `textpath_offset` spin input (startOffset %)
 *    and `tool_text_path_release` to detach back to plain text.
 *
 * @license Apache-2.0
 */

const name = 'text-path'

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
    const { $id, $click } = svgCanvas

    const t = (key) => svgEditor.i18next.t(`${name}:${key}`)

    const updateVisibility = () => {
      const attach = $id('tool_text_on_path')
      if (attach) {
        attach.style.display = svgCanvas.canTextOnPath?.() ? '' : 'none'
      }
      const panel = $id('textpath_panel')
      if (panel) {
        const [elem] = svgCanvas.getSelectedElements().filter(Boolean)
        const onPath = elem?.tagName === 'text' && elem.querySelector('textPath')
        panel.style.display = onPath ? 'block' : 'none'
        if (onPath) {
          $id('textpath_offset').value = svgCanvas.textPathOffset() ?? 0
        }
      }
    }

    return {
      name: t('name'),
      selectedChanged () {
        updateVisibility()
      },
      elementChanged () {
        updateVisibility()
      },
      callback () {
        // Attach button — Combine section (multi-selection tray).
        const combine = $id('tool_bool_union')?.parentElement
        if (combine) {
          const btn = document.createElement('se-button')
          btn.id = 'tool_text_on_path'
          btn.setAttribute('size', 'small')
          btn.setAttribute('title', t('attach'))
          btn.setAttribute('src', 'text_on_path.svg')
          btn.style.display = 'none'
          combine.append(btn)
          $click(btn, () => svgCanvas.attachTextToPath())
        }

        // "Text path" section — Text tab, after the Text Style section.
        const tab = $id('tab_text')
        if (tab) {
          const section = document.createElement('div')
          section.id = 'textpath_panel'
          section.className = 'sidepanel_section'
          section.style.display = 'none'
          section.innerHTML = `
            <div class="sidepanel_section_label">${t('panel')}</div>
            <div class="sidepanel_btn_row">
              <se-spin-input id="textpath_offset" label="${t('offset')}" min="0" max="100" step="1" value="0"></se-spin-input>
              <se-button id="tool_text_path_release" size="small" title="${t('release')}" src="text_on_path_release.svg"></se-button>
            </div>
          `
          const anchor = tab.querySelector('.text_panel')
          if (anchor) anchor.after(section)
          else tab.append(section)
          $id('textpath_offset').addEventListener('change', (e) => {
            svgCanvas.textPathOffset(parseFloat(e.target.value) || 0)
          })
          $click($id('tool_text_path_release'), () => svgCanvas.detachTextFromPath())
        }
      }
    }
  }
}
