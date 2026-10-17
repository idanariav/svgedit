// ext-panning.ts — Pan/hand tool
/**
 * @file ext-panning.ts
 *
 * @license MIT
 *
 * @copyright 2013 Luis Aguirre
 *
 */
/*
  This is a very basic SVG-Edit extension to let tablet/mobile devices pan without problem
*/

import { defineFeature, addFeatureLocale } from '../defineFeature.ts'

const name = 'panning'

export default defineFeature({
  name,
  async init (svgEditor) {
    addFeatureLocale(svgEditor, name, import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>)
    const {
      svgCanvas
    } = svgEditor
    const { $req } = svgCanvas
    const insertAfter = (referenceNode: HTMLElement, newNode: Node) => {
      referenceNode.parentNode?.insertBefore(newNode, referenceNode.nextSibling)
    }
    // The drag itself pans the workarea (editor.setPanning); nothing is drawn.
    svgCanvas.registerTool({
      id: 'ext-panning',
      pointerDown () { svgEditor.setPanning?.(true) },
      pointerUp () { svgEditor.setPanning?.(false) },
      cancel () { svgEditor.setPanning?.(false) }
    })

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        const btitle = `${svgEditor.i18next.t(`${name}:buttons.0.title`)} ${svgEditor.i18next.t(`${name}:buttons.0.key`)}`
        // Add the button and its handler(s)
        const buttonTemplate = document.createElement('template')
        buttonTemplate.innerHTML = `
        <se-button id="ext-panning" command="ext-panning" title="${btitle}" src="panning.svg"></se-button>
        `
        insertAfter($req('tool_select'), buttonTemplate.content.cloneNode(true))
        svgEditor.leftPanel.addModeCommand('ext-panning', 'ext-panning', { label: btitle })
      }
    }
  }
})
