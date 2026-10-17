/**
 * Document model (R1 step a): a persistent tree with lossless SVG parse and serialize (`node.ts`, `parse.ts`,
 * `serialize.ts`) and a typed read-only view of a drawing over it (`drawing.ts`).
 * @module model
 * @license MIT
 */
export { cdata, comment, decl, doctype, element, getAt, getAttr, pi, setAttr, text, updateAt, walk } from './node.ts'
export { parseSvg, SvgParseError } from './parse.ts'
export { serializeNode, serializeSvg } from './serialize.ts'
export { readFeatures } from './features.ts'
export { findItem, pathAnchors, readDrawing, walkItems } from './drawing.ts'
export { summarizeDrawing } from './summary.ts'
