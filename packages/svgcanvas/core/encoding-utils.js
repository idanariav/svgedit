/**
 * String/XML/base64 encoding utilities.
 * @module encoding-utils
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

/**
 * Used to prevent the [Billion laughs attack]{@link https://en.wikipedia.org/wiki/Billion_laughs_attack}.
 * @function module:encoding-utils.dropXMLInternalSubset
 * @param {string} str String to be processed
 * @returns {string} The string with entity declarations in the internal subset removed
 * @todo This might be needed in other places `parseFromString` is used even without LGTM flagging
 */
export const dropXMLInternalSubset = str => {
  return str.replace(/(<!DOCTYPE\s+\w*\s*\[).*(\?]>)/, '$1$2')
  // return str.replace(/(?<doctypeOpen><!DOCTYPE\s+\w*\s*\[).*(?<doctypeClose>\?\]>)/, '$<doctypeOpen>$<doctypeClose>');
}

/**
 * Converts characters in a string to XML-friendly entities.
 * @function module:encoding-utils.toXml
 * @example `&` becomes `&amp;`
 * @param {string} str - The string to be converted
 * @returns {string} The converted string
 */
export const toXml = (str) => {
  const xmlEntities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;' // Note: `&apos;` is XML only
  }

  return str.replace(/[&<>"']/g, (char) => xmlEntities[char])
}

// This code was written by Tyler Akins and has been placed in the
// public domain.  It would be nice if you left this header intact.
// Base64 code from Tyler Akins -- http://rumkin.com

// schiller: Removed string concatenation in favour of Array.join() optimization,
//        also precalculate the size of the array needed.

/**
 * Converts a string to base64.
 * @function module:encoding-utils.encode64
 * @param {string} input
 * @returns {string} Base64 output
 */
export const encode64 = (input) => {
  const encoded = encodeUTF8(input) // convert non-ASCII characters
  return window.btoa(encoded) // Use native if available
}

/**
 * Converts a string from base64.
 * @function module:encoding-utils.decode64
 * @param {string} input Base64-encoded input
 * @returns {string} Decoded output
 */
export const decode64 = (input) => decodeUTF8(window.atob(input))

/**
 * Compute a hashcode from a given string
 * @param {string} word - The string we want to compute the hashcode from
 * @returns {number} Hashcode of the given string
 */
export const hashCode = (word) => {
  if (word.length === 0) return 0

  let hash = 0
  for (let i = 0; i < word.length; i++) {
    const chr = word.charCodeAt(i)
    hash = ((hash << 5) - hash + chr) | 0 // Convert to 32bit integer
  }
  return hash
}

/**
 * @function module:encoding-utils.decodeUTF8
 * @param {string} argString
 * @returns {string}
 */
export const decodeUTF8 = (argString) => decodeURIComponent(escape(argString))

/**
 * @function module:encoding-utils.encodeUTF8
 * @param {string} argString
 * @returns {string}
 */
export const encodeUTF8 = (argString) => unescape(encodeURIComponent(argString))

/**
 * Convert dataURL to object URL.
 * @function module:encoding-utils.dataURLToObjectURL
 * @param {string} dataurl
 * @returns {string} object URL or empty string
 */
export const dataURLToObjectURL = (dataurl) => {
  if (
    typeof Uint8Array === 'undefined' ||
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined' ||
    !URL.createObjectURL
  ) {
    return ''
  }

  const [prefix, suffix] = dataurl.split(',')
  const mimeMatch = prefix?.match(/:(.*?);/)

  if (!mimeMatch?.[1] || !suffix) {
    return ''
  }

  const mime = mimeMatch[1]
  const bstr = atob(suffix)
  const u8arr = new Uint8Array(bstr.length)

  for (let i = 0; i < bstr.length; i++) {
    u8arr[i] = bstr.charCodeAt(i)
  }

  const blob = new Blob([u8arr], { type: mime })
  return URL.createObjectURL(blob)
}

/**
 * Get object URL for a blob object.
 * @function module:encoding-utils.createObjectURL
 * @param {Blob} blob A Blob object or File object
 * @returns {string} object URL or empty string
 */
export const createObjectURL = (blob) => {
  if (!blob || typeof URL === 'undefined' || !URL.createObjectURL) {
    return ''
  }
  return URL.createObjectURL(blob)
}

/**
 * @property {string} blankPageObjectURL
 */
export const blankPageObjectURL = (() => {
  if (typeof Blob === 'undefined') {
    return ''
  }
  const blob = new Blob(
    ['<html><head><title>SVG-edit</title></head><body>&nbsp;</body></html>'],
    { type: 'text/html' }
  )
  return createObjectURL(blob)
})()

/**
 * Converts a string to use XML references (for non-ASCII).
 * @function module:encoding-utils.convertToXMLReferences
 * @param {string} input
 * @returns {string} Decimal numeric character references
 */
export const convertToXMLReferences = input => {
  let output = ''
  ;[...input].forEach(ch => {
    const c = ch.charCodeAt()
    output += c <= 127 ? ch : `&#${c};`
  })
  return output
}

/**
 * Cross-browser compatible method of converting a string to an XML tree.
 * Found this function [here]{@link http://groups.google.com/group/jquery-dev/browse_thread/thread/c6d11387c580a77f}.
 * @function module:encoding-utils.text2xml
 * @param {string} sXML
 * @throws {Error}
 * @returns {XMLDocument}
 */
export const text2xml = (sXML) => {
  let xmlString = sXML

  if (xmlString.includes('<svg:svg')) {
    xmlString = xmlString
      .replace(/<(\/?)svg:/g, '<$1')
      .replace('xmlns:svg', 'xmlns')
  }

  let parser
  try {
    parser = new DOMParser()
    parser.async = false
  } catch (e) {
    throw new Error('XML Parser could not be instantiated')
  }

  try {
    return parser.parseFromString(xmlString, 'text/xml')
  } catch (e) {
    throw new Error(`Error parsing XML string: ${e.message}`)
  }
}
