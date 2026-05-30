/**
 * @file ext-fonts.js
 *
 * Wires the <se-font-library> Google Fonts browser into the text panel:
 *   - points it at the bundled catalog,
 *   - applies a picked font (adds it to the font-family dropdown, selects it,
 *     and sets it on the current text),
 *   - restores previously downloaded fonts on startup so they work offline and
 *     appear in the dropdown.
 *
 * The download/cache/embed plumbing lives in fontStore.js (accessed through the
 * <se-font-library> element so it is bundled exactly once) and core/svg-exec.js.
 *
 * @license MIT
 */

const name = 'fonts'

export default {
  name,
  async init () {
    const svgEditor = this
    const canv = svgEditor.svgCanvas
    const { $id } = canv

    return {
      callback () {
        const fontLib = $id('tool_font_library')
        const fontSelect = $id('tool_font_family')
        if (!fontLib || !fontSelect) return

        const extPath = svgEditor.configObj.curConfig.extPath
        fontLib.setAttribute('catalog', `${extPath}/ext-fonts/google-fonts-catalog.json`)

        // Apply a picked font to the selected text and surface it in the dropdown
        fontLib.addEventListener('font-pick', (e) => {
          const { family } = e.detail
          fontSelect.addOption(family, family)
          fontSelect.value = family
          canv.setFontFamily(family)
        })

        // Re-register cached fonts (offline) and list them in the dropdown
        fontLib.restoreCachedFonts().then((families) => {
          families.forEach(f => fontSelect.addOption(f, f))
        })
      }
    }
  }
}
