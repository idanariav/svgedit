/**
 * @file ext-eyedropper.js
 *
 * Toolbar eyedropper tool: click an element on canvas to sample its fill
 * color, then choose what to do with it from a small action menu (set as
 * fill/outline/background, or generate a matching OKLCH palette). This is
 * a single-shot pick-then-act flow — it does not stamp a whole style
 * (stroke/width/dasharray/opacity) the way the tool historically did.
 *
 * @license MIT
 *
 * @copyright 2010 Jeff Schiller
 * @copyright 2021 OptimistikSAS
 *
 */

import '../../components/eyedropper/EyedropperActionMenu.js'
import '../../components/palette/PaletteDialog.js'
import { closestRoot } from '../../domScope.js'
import { normalizeFillToHex } from '../../palette/oklchColor.js'

const name = 'eyedropper'

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
    await loadExtensionTranslation(svgEditor)
    const { $id, $click } = svgCanvas

    /**
     * Open the action menu at the click point, sampling the target's fill.
     * @param {MouseEvent} e
     * @param {Element} target
     * @returns {void}
     */
    const openActionMenu = (e, target) => {
      const hex = normalizeFillToHex(target.getAttribute('fill'))
      const root = closestRoot(svgEditor.workarea)
      const host = root.body ?? root

      host.querySelector('se-eyedropper-menu')?.remove()
      const menu = document.createElement('se-eyedropper-menu')
      menu.i18next = svgEditor.i18next
      host.appendChild(menu)

      const backToSelect = () => svgEditor.leftPanel.clickSelect()

      menu.open(e.clientX, e.clientY, {
        onFill: () => {
          backToSelect()
          svgCanvas.setColor('fill', hex)
        },
        onStroke: () => {
          backToSelect()
          svgCanvas.setColor('stroke', hex)
        },
        onBackground: () => {
          backToSelect()
          svgEditor.setBackground(hex, '', undefined, true)
        },
        onPalette: () => {
          backToSelect()
          host.querySelector('se-palette-dialog')?.remove()
          const dialog = document.createElement('se-palette-dialog')
          dialog.i18next = svgEditor.i18next
          dialog.backgroundHex = hex
          host.appendChild(dialog)
        }
      })
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        // Add the button and its handler(s)
        const title = `${name}:buttons.0.title`
        const key = 'ctrl+I'
        const buttonTemplate = `
        <se-button id="tool_eyedropper" title="${title}" src="eye_dropper.svg" shortcut=${key}></se-button>
        `
        svgCanvas.insertChildAtIndex($id('tools_left'), buttonTemplate, 12)
        $click($id('tool_eyedropper'), () => {
          if (this.leftPanel.updateLeftPanel('tool_eyedropper')) {
            svgCanvas.setMode(name)
          }
        })

        // Escape while the tool is active (and no menu is capturing it)
        // returns to the Select tool.
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && svgCanvas.getMode() === name) {
            svgEditor.leftPanel.clickSelect()
          }
        }, { signal: svgEditor.listenerAbort.signal })
      },
      mouseDown (opts) {
        if (svgCanvas.getMode() !== name) return
        const { target } = opts.event
        if (['svg', 'g', 'use'].includes(target.nodeName)) return
        openActionMenu(opts.event, target)
      }
    }
  }
}
