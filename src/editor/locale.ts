/**
 * Localizing script for SVG-edit UI.
 * @module locale
 * @license MIT
 *
 * @copyright 2010 Narendra Sisodya
 * @copyright 2010 Alexis Deveria
 *
 */

import i18next from 'i18next'

/** strings, or nested objects / arrays of them */
export type LocaleStrings = Record<string, unknown>
/**
 * The string keys of the object are two-letter language codes.
 * @tutorial LocaleDocs
 */
// keyed to an array of objects with "id" and "title" or "textContent" properties
export type LocaleSelectorValue = Record<string, string>

let langParam: string = ''

export interface AddLangExtensionLocaleData {
  /** See {@tutorial LocaleDocs} */
  data: LocaleStrings[]
}
/**
* The "data" property is generally set to an an array of objects with
*   "id" and "title" or "textContent" properties.
 */

/**
* @interface module:locale.LocaleEditorInit
*/
/**
 * @function module:locale.LocaleEditorInit#addLangData
 * @param {string} langParam
 * @returns {AddLangExtensionLocaleData}
*/
export interface LangAndData {
  langParam: string
  langData: LocaleStrings
}

/**
 * @function module:locale.putLocale
 * @fires module:svgcanvas.SvgCanvas#event:ext_addLangData
 * @fires module:svgcanvas.SvgCanvas#event:ext_langReady
 * @returns The language in use and the i18next instance loaded with it
 */

export const putLocale = async function (givenParam: string, goodLangs: string[]): Promise<{ langParam: string, i18next: import('i18next').i18n }> {
  if (givenParam) {
    langParam = givenParam
  } else if ((navigator as Navigator & { userLanguage?: string }).userLanguage) { // Explorer
    langParam = ((navigator as Navigator & { userLanguage?: string }).userLanguage as string)
  } else if (navigator.language) { // FF, Opera, ...
    langParam = navigator.language
  }

  // Set to English if language is not in list of good langs
  if (!goodLangs.includes(langParam) && langParam !== 'test') {
    langParam = 'en'
  }
  // UI translations are inlined into the bundle (statically resolved glob) so
  // the editor needs no runtime locale/ folder. Falls back to English.
  const locales = import.meta.glob('./locale/lang.*.js', { eager: true }) as Record<string, { default: object }>
  const module = locales[`./locale/lang.${langParam}.js`] || locales['./locale/lang.en.js']
  i18next.init({
    lng: langParam,
    debug: false,
    resources: {
      [langParam]: {
        translation: module.default
      }
    }
  })
  return { langParam, i18next }
}

export const t = function (key: string) {
  return i18next.t(key)
}
