// @ts-check
/**
 * Greedy line breaking for area text. Pure: the caller supplies `measure`, a
 * function from a string to its rendered width, so the algorithm runs the same
 * in the browser (a hidden `<text>` probe) and under jsdom (a stub).
 *
 * A *paragraph* is the text between hard newlines. Each paragraph becomes one
 * or more rows; every row after the first of its paragraph is a **soft** row,
 * and records how many separator characters (spaces) the break consumed so that
 * the original text can be rebuilt exactly (`rows.map(...)`, see
 * `getTextWithNewlines` in `text-rows.js`).
 *
 * Out of scope: hyphenation, justification, kinsoku (CJK punctuation that must
 * not start a line).
 * @module text-wrap
 * @license MIT
 */

/**
 * @typedef {object} WrappedRow
 * @property {string} text The row as drawn (no trailing separator).
 * @property {number|null} soft `null` for the first row of a paragraph; otherwise the number of
 *   spaces the break swallowed (0 for a break inside a word or between CJK characters).
 */

/** Characters that may break before and after (ideographs, kana, fullwidth forms). */
const CJK = '\\u2E80-\\u9FFF\\uF900-\\uFAFF\\uFF00-\\uFFEF'
const TOKEN = new RegExp(`[ ]+|[${CJK}]|[^ ${CJK}]+`, 'g')
const CJK_CHAR = new RegExp(`^[${CJK}]$`)

/**
 * Split an over-long word into the longest pieces that each fit `maxWidth`
 * (at least one character per piece, so a narrow box still terminates).
 * @param {string} word
 * @param {number} maxWidth
 * @param {(s: string) => number} measure
 * @returns {string[]}
 */
const splitWord = (word, maxWidth, measure) => {
  const chars = Array.from(word)
  const pieces = []
  let cur = ''
  for (const ch of chars) {
    if (cur && measure(cur + ch) > maxWidth) {
      pieces.push(cur)
      cur = ch
    } else {
      cur += ch
    }
  }
  if (cur) pieces.push(cur)
  return pieces
}

/**
 * Wrap one paragraph (no newlines).
 * @param {string} text
 * @param {number} maxWidth
 * @param {(s: string) => number} measure
 * @returns {WrappedRow[]}
 */
export const wrapParagraph = (text, maxWidth, measure) => {
  /** @type {WrappedRow[]} */
  const rows = []
  const tokens = text.match(TOKEN) ?? []
  let cur = ''
  let pending = '' // spaces seen after `cur`, not yet committed to it
  let soft = /** @type {number|null} */ (null) // `soft` of the row being built

  /** @param {number} nextSoft `soft` of the row that follows */
  const closeRow = (nextSoft) => {
    rows.push({ text: cur, soft })
    cur = ''
    pending = ''
    soft = nextSoft
  }

  for (const tok of tokens) {
    if (tok[0] === ' ') {
      // Leading spaces of a paragraph are indentation: keep them in the row.
      if (cur === '' && rows.length === 0) cur = tok
      else pending += tok
      continue
    }
    const candidate = cur + pending + tok
    if (cur === '' || measure(candidate) <= maxWidth) {
      // Nothing to break before it, or it fits.
      if (cur === '' && measure(tok) > maxWidth && !CJK_CHAR.test(tok)) {
        // A word wider than the box: break inside it.
        const pieces = splitWord(tok, maxWidth, measure)
        pieces.slice(0, -1).forEach((piece) => {
          cur = piece
          closeRow(0)
        })
        cur = pieces[pieces.length - 1]
      } else {
        cur = candidate
      }
      pending = ''
      continue
    }
    // It does not fit: end the row here, swallowing the spaces before the token.
    const swallowed = pending.length
    closeRow(swallowed)
    if (measure(tok) > maxWidth && !CJK_CHAR.test(tok)) {
      const pieces = splitWord(tok, maxWidth, measure)
      pieces.slice(0, -1).forEach((piece) => {
        cur = piece
        closeRow(0)
      })
      cur = pieces[pieces.length - 1]
    } else {
      cur = tok
    }
  }
  // Trailing spaces stay on the last row (the text keeps them).
  rows.push({ text: cur + pending, soft })
  return rows
}

/**
 * Wrap text that may hold hard newlines.
 * @param {string} value
 * @param {number} maxWidth Box width; `<= 0` disables wrapping (hard breaks only).
 * @param {(s: string) => number} measure
 * @returns {WrappedRow[]}
 */
export const wrapText = (value, maxWidth, measure) => {
  /** @type {WrappedRow[]} */
  const rows = []
  for (const paragraph of String(value ?? '').split('\n')) {
    if (!(maxWidth > 0) || paragraph === '') {
      rows.push({ text: paragraph, soft: null })
    } else {
      rows.push(...wrapParagraph(paragraph, maxWidth, measure))
    }
  }
  return rows
}
