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

/**
 * The string keys of the object are two-letter language codes.
 * @tutorial LocaleDocs
 * @typedef {Object<string, *>} LocaleStrings strings, or nested objects / arrays of them
 */
// keyed to an array of objects with "id" and "title" or "textContent" properties
/**
 * @typedef {Object<string, string>} LocaleSelectorValue
 */

/** @type {string} */
let langParam = ''

/**
* The "data" property is generally set to an an array of objects with
*   "id" and "title" or "textContent" properties.
* @typedef {object} AddLangExtensionLocaleData
* @property {LocaleStrings[]} data See {@tutorial LocaleDocs}
*/

/**
* @interface module:locale.LocaleEditorInit
*/
/**
 * @function module:locale.LocaleEditorInit#addLangData
 * @param {string} langParam
 * @returns {AddLangExtensionLocaleData}
*/
/**
* @typedef {object} LangAndData
* @property {string} langParam
* @property {LocaleStrings} langData
*/

/**
 *
 * @function module:locale.putLocale
 * @param {string} givenParam
 * @param {string[]} goodLangs
 * @fires module:svgcanvas.SvgCanvas#event:ext_addLangData
 * @fires module:svgcanvas.SvgCanvas#event:ext_langReady
 * @returns {Promise<{langParam: string, i18next: import('i18next').i18n}>} The language in use and the i18next instance loaded with it
*/

export const putLocale = async function (givenParam, goodLangs) {
  if (givenParam) {
    langParam = givenParam
  } else if (/** @type {Navigator & {userLanguage?: string}} */ (navigator).userLanguage) { // Explorer
    langParam = /** @type {string} */ (/** @type {Navigator & {userLanguage?: string}} */ (navigator).userLanguage)
  } else if (navigator.language) { // FF, Opera, ...
    langParam = navigator.language
  }

  // Set to English if language is not in list of good langs
  if (!goodLangs.includes(langParam) && langParam !== 'test') {
    langParam = 'en'
  }
  // UI translations are inlined into the bundle (statically resolved glob) so
  // the editor needs no runtime locale/ folder. Falls back to English.
  const locales = /** @type {Record<string, {default: object}>} */ (import.meta.glob('./locale/lang.*.js', { eager: true }))
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

export const t = function (/** @type {string} */ key) {
  return i18next.t(key)
}
