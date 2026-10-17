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

const name = 'panning'

const loadExtensionTranslation = function (svgEditor: EditorInstance) {
  const lang = svgEditor.configObj.pref('lang')
  // Locale files are inlined into the bundle (statically resolved glob).
  const locales = import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: object }>
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

export default {
  name,
  async init () {
    const svgEditor = (this as unknown) as import('../../Editor.ts').default
    await loadExtensionTranslation(svgEditor)
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
}
