/**
 * String/XML/base64 encoding utilities.
 * @module encoding-utils
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

/**
 * Used to prevent the [Billion laughs attack]{@link https://en.wikipedia.org/wiki/Billion_laughs_attack}.
 * Returns the string with entity declarations in the internal subset removed.
 * @todo This might be needed in other places `parseFromString` is used even without LGTM flagging
 */
export const dropXMLInternalSubset = (str: string): string => {
  return str.replace(/(<!DOCTYPE\s+\w*\s*\[).*(\?]>)/, '$1$2')
  // return str.replace(/(?<doctypeOpen><!DOCTYPE\s+\w*\s*\[).*(?<doctypeClose>\?\]>)/, '$<doctypeOpen>$<doctypeClose>');
}

/**
 * Converts characters in a string to XML-friendly entities.
 * `&` becomes `&amp;`.
 */
export const toXml = (str: string): string => {
  const xmlEntities: Record<string, string> = {
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
 */
export const encode64 = (input: string): string => {
  const encoded = encodeUTF8(input) // convert non-ASCII characters
  return window.btoa(encoded) // Use native if available
}

/**
 * Converts a string from base64.
 */
export const decode64 = (input: string): string => decodeUTF8(window.atob(input))

/**
 * Compute a hashcode from a given string
 */
export const hashCode = (word: string): number => {
  if (word.length === 0) return 0

  let hash = 0
  for (let i = 0; i < word.length; i++) {
    const chr = word.charCodeAt(i)
    hash = ((hash << 5) - hash + chr) | 0 // Convert to 32bit integer
  }
  return hash
}

export const decodeUTF8 = (argString: string): string => decodeURIComponent(escape(argString))

export const encodeUTF8 = (argString: string): string => unescape(encodeURIComponent(argString))

/**
 * Convert dataURL to object URL.
 * Returns the object URL, or an empty string.
 */
export const dataURLToObjectURL = (dataurl: string): string => {
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
 * `blob` is a Blob or File; returns the object URL, or an empty string.
 */
export const createObjectURL = (blob: Blob): string => {
  if (!blob || typeof URL === 'undefined' || !URL.createObjectURL) {
    return ''
  }
  return URL.createObjectURL(blob)
}

export const blankPageObjectURL: string = (() => {
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
 * Returns decimal numeric character references.
 */
export const convertToXMLReferences = (input: string): string => {
  let output = ''
  ;[...input].forEach(ch => {
    const c = ch.charCodeAt(0)
    output += c <= 127 ? ch : `&#${c};`
  })
  return output
}

/**
 * Cross-browser compatible method of converting a string to an XML tree.
 * Found this function [here]{@link http://groups.google.com/group/jquery-dev/browse_thread/thread/c6d11387c580a77f}.
 * Throws an Error when the parser cannot be made or the string does not parse.
 */
export const text2xml = (sXML: string): XMLDocument => {
  let xmlString = sXML

  if (xmlString.includes('<svg:svg')) {
    xmlString = xmlString
      .replace(/<(\/?)svg:/g, '<$1')
      .replace('xmlns:svg', 'xmlns')
  }

  let parser: DOMParser
  try {
    parser = new DOMParser()
    ;(parser as DOMParser & { async?: boolean }).async = false
  } catch (e) {
    throw new Error('XML Parser could not be instantiated')
  }

  try {
    return parser.parseFromString(xmlString, 'text/xml')
  } catch (e) {
    throw new Error(`Error parsing XML string: ${(e as Error).message}`)
  }
}
