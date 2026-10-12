/**
 * Type names the JSDoc inherited from upstream svgedit uses (`{PlainObject}`, `{GenericArray}`),
 * declared once so `// @ts-check` modules don't each need their comments rewritten.
 * New code should write the real type (`Record<string, string>`, `number[]`, …).
 */
type PlainObject<K extends string = string, V = any> = Record<K, V>
type GenericArray = any[]

/** culori ships no types for its tree-shakeable `culori/fn` entry; the modules that use it wrap what they need. */
declare module 'culori/fn'

/** clipper-lib ships no types; path-offset and the boolean tools drive it through its untyped API. */
declare module 'clipper-lib'
