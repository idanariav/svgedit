// @ts-check
/**
 * Structural invariants of a healthy drawing, as a pure DOM check.
 *
 * `checkDrawing(svgContent)` returns a list of findings (empty = healthy). It
 * is meant to run *after* edits in tests (the e2e suite runs it after every
 * test; the command sweep runs it after every command), so corruption is
 * caught before it ships rather than repaired after users have saved it.
 * It is deliberately NOT run inside `setSvgString()` in production (cost and
 * noise); when a check catches something common, add a narrow entry to
 * `scripts/repair-drawings.mjs` that repairs the saved files instead (see
 * CLAUDE.md, "Data-corruption bug fixes").
 *
 * Ported in spirit from VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/testkit/src/invariants.rs` (`check_document`), MIT OR Apache-2.0.
 *
 * Not checked on purpose: a layer without a `<title>` (external SVGs have
 * unnamed layers and the editor loads them fine; only layers it creates itself
 * always carry one), unused `<defs>` (not corruption), references to
 * things outside the drawing (`<image href="https://…">`, vault links — only
 * `#fragment` refs are checked), and "closed subpaths carry an explicit
 * closing lineto" (the node editor repairs that itself when a path enters it,
 * so a `Z`-only subpath is normal data, not corruption).
 * @module drawing-invariants
 * @license MIT
 */

import { NS } from './namespaces.js'

/**
 * @typedef {object} Finding
 * @property {string} code stable rule name, e.g. `duplicate-id`
 * @property {string} message human-readable
 * @property {string} [id] id of the offending element, when it has one
 */

/**
 * Validator for one `se:*` attribute: `true` when the value parses, else a reason.
 * @callback AttrValidator
 * @param {string} value
 * @param {Element} elem
 * @returns {true|string}
 */

/** @type {Map<string, AttrValidator>} */
const attrValidators = new Map()

/**
 * Register the parser-backed check for an `se:*` attribute a module owns.
 * Modules call this from their `init`, like `registerGeometryRemap`.
 * @param {string} attrName e.g. `se:fx`
 * @param {AttrValidator} validator
 * @returns {void}
 */
export const registerAttrValidator = (attrName, validator) => {
  attrValidators.set(attrName, validator)
}

/**
 * Validator for attributes that hold SVG path data (`se:fx-d`, `se:orig-d`, `se:taper-d`).
 * @type {AttrValidator}
 */
export const pathDataValidator = (value) => {
  if (BAD_NUMBER_RE.test(value)) return 'contains a non-number'
  if (!/^\s*[Mm]/.test(value)) return 'does not start with a moveto'
  return /^[MmLlHhVvCcSsQqTtAaZz0-9eE+\-.,\s]*$/.test(value) ? true : 'is not path data'
}

/** Presentation attributes that may reference another element as `url(#id)`. */
const URL_REF_ATTRS = ['fill', 'stroke', 'filter', 'clip-path', 'mask', 'marker-start', 'marker-mid', 'marker-end']
/** Attributes whose value is numeric geometry and so must never contain NaN & co. */
const NUMERIC_ATTRS = [
  'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2',
  'points', 'd', 'transform', 'dx', 'dy', 'stroke-width', 'font-size'
]
/** Children allowed directly under `<svg id="svgcontent">` besides layers. */
const ROOT_CHILDREN = new Set(['defs', 'title', 'metadata', 'desc', 'style'])

const URL_RE = /url\(\s*['"]?#([^'")\s]+)/g
const BAD_NUMBER_RE = /(?:^|[^A-Za-z])(NaN|undefined|Infinity)(?![A-Za-z])/

/**
 * @param {Element} elem
 * @returns {string|undefined}
 */
const idOf = (elem) => elem.getAttribute('id') || undefined

/**
 * Check a drawing for corruption.
 * @param {Element} svgContent the `<svg id="svgcontent">` element (or any drawing root)
 * @returns {Finding[]} empty when healthy
 */
export const checkDrawing = (svgContent) => {
  /** @type {Finding[]} */
  const findings = []
  const add = (/** @type {string} */ code, /** @type {string} */ message, /** @type {Element} */ elem) => {
    const id = elem && idOf(elem)
    findings.push(id ? { code, message, id } : { code, message })
  }

  const all = Array.from(svgContent.querySelectorAll('*'))

  // duplicate-id
  /** @type {Map<string, number>} */
  const ids = new Map()
  for (const el of all) {
    const id = el.getAttribute('id')
    if (id) ids.set(id, (ids.get(id) ?? 0) + 1)
  }
  for (const [id, count] of ids) {
    if (count > 1) findings.push({ code: 'duplicate-id', message: `id "${id}" is used by ${count} elements`, id })
  }
  if (svgContent.getAttribute('id')) ids.set(/** @type {string} */ (svgContent.getAttribute('id')), 1)

  for (const el of all) {
    const tag = el.localName

    // dangling-ref
    for (const name of URL_REF_ATTRS) {
      const value = el.getAttribute(name)
      if (value) {
        for (const m of value.matchAll(URL_RE)) {
          if (!ids.has(m[1])) add('dangling-ref', `<${tag}> ${name}="${value}" references a missing element`, el)
        }
      }
    }
    const style = el.getAttribute('style')
    if (style) {
      for (const m of style.matchAll(URL_RE)) {
        if (!ids.has(m[1])) add('dangling-ref', `<${tag}> style references a missing element #${m[1]}`, el)
      }
    }
    for (const href of [el.getAttribute('href'), el.getAttributeNS(NS.XLINK, 'href')]) {
      if (href && href.startsWith('#') && !ids.has(href.slice(1))) {
        add('dangling-ref', `<${tag}> href="${href}" references a missing element`, el)
      }
    }

    // bad-number
    for (const name of NUMERIC_ATTRS) {
      const value = el.getAttribute(name)
      if (value && BAD_NUMBER_RE.test(value)) {
        add('bad-number', `<${tag}> ${name}="${value.length > 60 ? value.slice(0, 60) + '…' : value}" contains a non-number`, el)
      }
    }

    // stray-text-in-defs
    if (tag === 'defs') {
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === 3 && /\S/.test(node.nodeValue ?? '')) {
          add('stray-text-in-defs', `<defs> holds the text "${(node.nodeValue ?? '').trim().slice(0, 40)}"`, el)
        }
      }
    }

    // se-attr-parse
    for (const attr of Array.from(el.attributes)) {
      const validator = attr.name.startsWith('se:') ? attrValidators.get(attr.name) : undefined
      if (!validator) continue
      let verdict
      try {
        verdict = validator(attr.value, el)
      } catch (err) {
        verdict = `validator threw: ${err instanceof Error ? err.message : err}`
      }
      if (verdict !== true) add('se-attr-parse', `<${tag}> ${attr.name}="${attr.value.slice(0, 60)}": ${verdict}`, el)
    }
  }

  // layer-shape
  for (const child of Array.from(svgContent.children)) {
    const tag = child.localName
    if (ROOT_CHILDREN.has(tag)) continue
    if (tag !== 'g' || !child.classList.contains('layer')) {
      add('layer-shape', `<${tag}> sits directly under the drawing root instead of inside a layer`, child)
    }
  }

  return findings
}
