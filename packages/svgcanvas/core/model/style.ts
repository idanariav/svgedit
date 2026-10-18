/**
 * Presentation properties on the document model: the value of a property on an element, from its `style` declarations or its
 * attribute, and as inherited from the elements above it.
 *
 * No DOM and no `window` here: this runs in Node (the headless engine) as well as in the browser.
 * @module model/style
 * @license MIT
 */
import type { ModelElement } from './node.ts'

/** A `style="a: b; c: d"` declaration list as a map. */
export const declarations = (style: string | undefined): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const part of (style ?? '').split(';')) {
    const at = part.indexOf(':')
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim()
  }
  return out
}

/** The value `el` itself gives a property: a `style` declaration (which wins, as in CSS) or the presentation attribute. */
export const ownProperty = (el: ModelElement, name: string): string | undefined =>
  declarations(el.attrs.find((a) => a.name === 'style')?.value)[name] ?? el.attrs.find((a) => a.name === name)?.value

/** The value of an inherited property on the last element of `chain` (root first): the nearest element that gives one. */
export const inheritedProperty = (chain: readonly ModelElement[], name: string): string | undefined => {
  for (let i = chain.length - 1; i >= 0; i--) {
    const v = ownProperty(chain[i], name)
    if (v !== undefined && v !== 'inherit') return v
  }
  return undefined
}

/** A plain length in user units (`12`, `12px`), or undefined for anything else (a percentage, `em`, junk). */
export const userLength = (value: string | undefined): number | undefined => {
  if (value === undefined || !/^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?(px)?\s*$/i.test(value)) return undefined
  return parseFloat(value)
}
