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

export interface WrappedRow {
  /** The row as drawn (no trailing separator). */
  text: string
  /**
   * `null` for the first row of a paragraph; otherwise the number of
   * spaces the break swallowed (0 for a break inside a word or between CJK characters).
   */
  soft: number | null
}

type Measure = (s: string) => number

/** Characters that may break before and after (ideographs, kana, fullwidth forms). */
const CJK = '\\u2E80-\\u9FFF\\uF900-\\uFAFF\\uFF00-\\uFFEF'
const TOKEN = new RegExp(`[ ]+|[${CJK}]|[^ ${CJK}]+`, 'g')
const CJK_CHAR = new RegExp(`^[${CJK}]$`)

/**
 * Split an over-long word into the longest pieces that each fit `maxWidth`
 * (at least one character per piece, so a narrow box still terminates).
 */
const splitWord = (word: string, maxWidth: number, measure: Measure): string[] => {
  const chars = Array.from(word)
  const pieces: string[] = []
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

/** Wrap one paragraph (no newlines). */
export const wrapParagraph = (text: string, maxWidth: number, measure: Measure): WrappedRow[] => {
  const rows: WrappedRow[] = []
  const tokens = text.match(TOKEN) ?? []
  let cur = ''
  let pending = '' // spaces seen after `cur`, not yet committed to it
  let soft: number | null = null // `soft` of the row being built

  /** `nextSoft` is the `soft` of the row that follows */
  const closeRow = (nextSoft: number) => {
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

/** Wrap text that may hold hard newlines. `maxWidth` is the box width; `<= 0` disables wrapping (hard breaks only). */
export const wrapText = (value: string, maxWidth: number, measure: Measure): WrappedRow[] => {
  const rows: WrappedRow[] = []
  for (const paragraph of String(value ?? '').split('\n')) {
    if (!(maxWidth > 0) || paragraph === '') {
      rows.push({ text: paragraph, soft: null })
    } else {
      rows.push(...wrapParagraph(paragraph, maxWidth, measure))
    }
  }
  return rows
}
