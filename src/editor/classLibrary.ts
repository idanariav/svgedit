/**
 * Class library — a global, browser-persisted store of named style presets
 * ("classes"). A preset captures a set of SVG attribute values that can be
 * stamped onto an element to reformat it (e.g. a "title" preset that sets
 * font-size, fill and font-family on a text element).
 *
 * Storage is a single JSON array under the `svg-edit-class-library` localStorage
 * key, mirroring how the editor theme persists under `svg-edit-theme`.
 *
 * Preset shape:
 *   { name: string, scope: 'text'|'shape'|'any', attrs: { [attr]: string },
 *     shadow?: { angle, length, blur, opacity, color },
 *     outline?: { width, color, opacity },
 *     glow?: { outer: { blur, color, opacity } | null,
 *              inner: { blur, color, opacity, source } | null } }
 *
 * A drop shadow, outline or glow is not a plain attribute (each is a `filter`
 * reference plus filter primitives in <defs>), so they are captured separately
 * as structured params under `shadow` / `outline` / `glow` and re-applied via
 * the shadow, outline and glow extension APIs rather than stamped like the flat
 * `attrs`.
 *
 * Reads/writes go through the optional host storage adapter when one is
 * registered (see userDataAdapter.js); otherwise they fall back to the
 * localStorage key below. The schema is identical on both paths.
 *
 * @module classLibrary
 */

import { getUserDataAdapter } from './userDataAdapter.ts'

export interface ClassPreset {
  name: string
  /** `'text'`, `'shape'` or `'any'` */
  scope: string
  attrs: Record<string, string>
  shadow?: { angle: number, length: number, blur: number, opacity: number, color: string }
  outline?: { width: number, color: string, opacity: number }
  glow?: { outer: { blur: number, color: string, opacity: number } | null, inner: { blur: number, color: string, opacity: number, source: string } | null, feather?: { radius: number } | null }
}
/** One preset (see the shape above). */

const STORAGE_KEY = 'svg-edit-class-library'
const DEFAULTS_STORAGE_KEY = 'svg-edit-default-classes'

/** Common attributes offered for every element scope. */
export const COMMON_ATTRS: string[] = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linejoin',
  'stroke-linecap',
  'opacity'
]

/**
 * Text-specific attributes, offered in addition to {@link COMMON_ATTRS} for
 * text elements.
 */
export const TEXT_ATTRS: string[] = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-anchor',
  'letter-spacing',
  'word-spacing'
]

/** Classify an element into a preset scope bucket. */
export const elementScope = (elem: Element | null): 'text' | 'shape' => {
  const tag = elem?.tagName?.toLowerCase()
  return tag === 'text' || tag === 'tspan' ? 'text' : 'shape'
}

/** The catalog of attributes that may be captured for a given scope. */
export const attrCatalog = (scope: 'text' | 'shape' | 'any'): string[] =>
  scope === 'text' ? [...COMMON_ATTRS, ...TEXT_ATTRS] : [...COMMON_ATTRS]

/** Read the raw preset array from storage. */
export const getClasses = (): ClassPreset[] => {
  const adapter = getUserDataAdapter()
  if (adapter) {
    const parsed = adapter.getClasses?.()
    return Array.isArray(parsed) ? parsed : []
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Persist the full preset array. */
const writeClasses = (classes: ClassPreset[]): void => {
  const adapter = getUserDataAdapter()
  if (adapter) {
    adapter.setClasses?.(classes)
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(classes))
  } catch {
    /* storage may be unavailable (private mode); fail silently */
  }
}

/**
 * Presets visible for a given element scope: those tagged with the same scope
 * plus universal (`any`) presets.
 */
export const getClassesForScope = (scope: 'text' | 'shape'): ClassPreset[] =>
  getClasses().filter(c => c.scope === scope || c.scope === 'any')

/** Look up a single preset by name. */
export const getClass = (name: string): ClassPreset | undefined => getClasses().find(c => c.name === name)

/**
 * Upsert a preset by name — an existing preset with the same name is replaced,
 * enabling "update". Returns the stored preset.
 */
export const saveClass = (preset: ClassPreset): unknown => {
  const classes = getClasses()
  const idx = classes.findIndex(c => c.name === preset.name)
  if (idx >= 0) {
    classes[idx] = preset
  } else {
    classes.push(preset)
  }
  writeClasses(classes)
  return preset
}

/**
 * Per-object-type ("tag") default class assignments — e.g. `{ text: 'title' }`
 * means every newly created `<text>` element gets the "title" preset stamped
 * on automatically. Storage mirrors {@link getClasses}: adapter-first
 * (`getDefaultClasses`/`setDefaultClasses`), else `localStorage`.
 * @returns Map of lowercase tag name -> class name.
 */
export const getDefaultClasses = (): Record<string, string> => {
  const adapter = getUserDataAdapter()
  if (adapter) {
    const parsed = adapter.getDefaultClasses?.()
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {}
  }
  try {
    const raw = window.localStorage.getItem(DEFAULTS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const writeDefaultClasses = (defaults: Record<string, string>) => {
  const adapter = getUserDataAdapter()
  if (adapter) {
    adapter.setDefaultClasses?.(defaults)
    return
  }
  try {
    window.localStorage.setItem(DEFAULTS_STORAGE_KEY, JSON.stringify(defaults))
  } catch {
    /* storage may be unavailable (private mode); fail silently */
  }
}

/**
 * The default class name for a given element tag, if one is set.
 * @param tag Lowercase tag name (e.g. `'text'`, `'rect'`).
 */
export const getDefaultClassForTag = (tag: string): string | undefined => getDefaultClasses()[tag]

/**
 * Set (or clear, when `name` is falsy) the default class for an element tag.
 * @param tag Lowercase tag name (e.g. `'text'`, `'rect'`).
 */
export const setDefaultClassForTag = (tag: string, name: string | null): void => {
  const defaults = getDefaultClasses()
  if (name) {
    defaults[tag] = name
  } else {
    delete defaults[tag]
  }
  writeDefaultClasses(defaults)
}

/**
 * Remove a preset by name. Also clears it from any object type's default
 * (see {@link getDefaultClassForTag}) so a deleted class can't be silently
 * re-applied to newly created elements under a stale name.
 */
export const deleteClass = (name: string): void => {
  writeClasses(getClasses().filter(c => c.name !== name))
  const defaults = getDefaultClasses()
  const tags = Object.keys(defaults).filter(tag => defaults[tag] === name)
  if (tags.length) {
    tags.forEach(tag => delete defaults[tag])
    writeDefaultClasses(defaults)
  }
}

/**
 * Class tokens not under editor control (e.g. layer/internal `se_*`),
 * preserved whenever the library's `class` token is stamped onto an element.
 */
export const internalClassTokens = (elem: Element): string[] =>
  (elem.getAttribute('class') || '').split(/\s+/).filter(tk => tk.startsWith('se_'))

/**
 * Build the next `class` attribute string for an element, preserving its
 * internal tokens and appending/replacing the library class name.
 * @param name Library class name, or `''`/falsy to remove it.
 * @returns The new `class` value, or `null` when it would be empty.
 */
export const nextClassString = (elem: Element, name: string): string | null => {
  const next = [...internalClassTokens(elem), name].filter(Boolean).join(' ')
  return next || null
}

/**
 * Stamp a preset's flat attributes (and library `class` token) onto an
 * element with plain `setAttribute` calls — no undo tracking. Used to apply
 * an object type's default class to a brand-new element that isn't in the
 * undo history yet (see `Editor.js#elementInserted`); unlike
 * `<se-class-select>`'s `applyClass`, which stamps onto an already-inserted,
 * possibly-selected element and must record each change for undo.
 * Shadow/outline/glow (structured, filter-based) presets are not applied here —
 * defaults only cover the flat attribute set.
 */
export const applyDefaultClassAttrs = (elem: Element, preset: { name: string, attrs?: Record<string, string> | null }): void => {
  const cls = nextClassString(elem, preset.name)
  if (cls) elem.setAttribute('class', cls)
  else elem.removeAttribute('class')
  const attrs = preset.attrs || {}
  Object.entries(attrs as Record<string, string>).forEach(([k, v]) => elem.setAttribute(k, v))
  if ('stroke-width' in attrs) {
    elem.setAttribute('paint-order', 'stroke')
  }
}
