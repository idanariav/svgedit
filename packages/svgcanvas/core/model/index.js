// @ts-check
/**
 * Document model (R1 step a): a persistent tree with lossless SVG parse and serialize (`node.js`, `parse.js`,
 * `serialize.js`) and a typed read-only view of a drawing over it (`drawing.js`).
 * @module model
 * @license MIT
 */
export { cdata, comment, decl, doctype, element, getAt, getAttr, pi, setAttr, text, updateAt, walk } from './node.ts'
export { parseSvg, SvgParseError } from './parse.js'
export { serializeNode, serializeSvg } from './serialize.js'
export { readFeatures } from './features.js'
export { findItem, pathAnchors, readDrawing, walkItems } from './drawing.js'
