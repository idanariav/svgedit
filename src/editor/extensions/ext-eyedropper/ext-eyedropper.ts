/**
 * @file ext-eyedropper.ts
 *
 * Toolbar eyedropper tool: click an element on canvas to sample its fill
 * color, then choose what to do with it from a small action menu (set as
 * fill/outline/background, generate a matching OKLCH palette, or copy the
 * whole style to / from the selection, see styleCopy.js). This is a
 * single-shot pick-then-act flow: a click never stamps a style by itself the
 * way the tool historically did.
 *
 * @license MIT
 *
 * @copyright 2010 Jeff Schiller
 * @copyright 2021 OptimistikSAS
 *
 */

import '../../components/eyedropper/EyedropperActionMenu.ts'
import '../../components/palette/PaletteDialog.ts'
import { closestRoot } from '../../domScope.ts'
import { normalizeFillToHex } from '../../palette/oklchColor.ts'
import { copyStyle } from '../../styleCopy.ts'

const name = 'eyedropper'

const loadExtensionTranslation = function (svgEditor: EditorInstance) {
  const lang = svgEditor.configObj.pref('lang')
  // Locale files are inlined into the bundle (statically resolved glob).
  const locales = import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: any }>
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

export default {
  name,
  async init () {
    const svgEditor = (this as unknown) as import('../../Editor.ts').default
    const { svgCanvas } = svgEditor
    await loadExtensionTranslation(svgEditor)
    const { $req } = svgCanvas

    /** Open the action menu at the click point, sampling the target's fill. */
    const openActionMenu = (e: MouseEvent, target: Element): void => {
      const hex = normalizeFillToHex(target.getAttribute('fill'))
      const root = closestRoot(svgEditor.workarea ?? null)
      const host = (root as Document).body ?? root

      host.querySelector('se-eyedropper-menu')?.remove()
      const menu = document.createElement('se-eyedropper-menu')
      menu.i18next = svgEditor.i18next
      host.appendChild(menu)

      const backToSelect = () => svgEditor.leftPanel.clickSelect()
      const selection = svgCanvas.getSelectedElements().filter(Boolean)
      const others = selection.filter((el) => el !== target)

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
        },
        // The clicked shape's whole look onto the selection, or the selection's onto the clicked shape.
        onStyleToSelection: () => {
          backToSelect()
          copyStyle(svgEditor, target, others)
        },
        onStyleFromSelection: () => {
          backToSelect()
          copyStyle(svgEditor, others[0], [target])
        }
      }, {
        disabled: others.length ? [] : ['styleToSelection', 'styleFromSelection']
      })
    }

    // Clicking a shape opens the sampling menu at the pointer; nothing is drawn.
    svgCanvas.registerTool({
      id: name,
      pointerDown (ctx, ev) {
        const target = ev.event.target as Element
        if (['svg', 'g', 'use'].includes(target.nodeName)) return false
        openActionMenu(ev.event, target)
      }
    })

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        // Add the button and its handler(s)
        const title = `${name}:buttons.0.title`
        const key = 'ctrl+I'
        const buttonTemplate = `
        <se-button id="tool_eyedropper" command="tool_eyedropper" title="${title}" src="eye_dropper.svg" shortcut=${key}></se-button>
        `
        svgCanvas.insertChildAtIndex($req('tools_left'), buttonTemplate, 12)
        svgEditor.leftPanel.addModeCommand('tool_eyedropper', name, { label: title })

        // Escape while the tool is active (and no menu is capturing it)
        // returns to the Select tool.
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && svgCanvas.getMode() === name) {
            svgEditor.leftPanel.clickSelect()
          }
        }, { signal: svgEditor.listenerAbort.signal })
      }
    }
  }
}
