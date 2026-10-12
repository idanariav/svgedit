/**
 * Type names the JSDoc inherited from upstream svgedit uses (`{PlainObject}`, `{GenericArray}`),
 * declared once so `// @ts-check` modules don't each need their comments rewritten.
 * New code should write the real type (`Record<string, string>`, `number[]`, …).
 */
type PlainObject<K extends string = string, V = any> = Record<K, V>
type GenericArray = any[]
