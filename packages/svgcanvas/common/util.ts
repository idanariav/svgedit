// util.ts — Common utility functions

/** Page position of an element: the sum of its offsets up the `offsetParent` chain. */
export const findPos = (obj: HTMLElement | null | undefined): { left: number, top: number } => {
  let left = 0
  let top = 0

  if (obj?.offsetParent) {
    let current: HTMLElement | null = obj
    do {
      left += current.offsetLeft
      top += current.offsetTop
      current = current.offsetParent as HTMLElement | null
    } while (current)
  }

  return { left, top }
}

type Matcher = (el: Element, sel: string) => boolean | undefined
type Matchers = Record<string, Matcher>

export const isObject = (item: unknown): item is Record<string, unknown> =>
  !!item && typeof item === 'object' && !Array.isArray(item)

/** A copy of `target` with `source`'s properties merged in, recursing into plain objects. */
export const mergeDeep = <T extends object, U extends object>(target: T, source: U): T & U => {
  const output: Record<string, unknown> = { ...(target as Record<string, unknown>) }

  if (isObject(target) && isObject(source)) {
    for (const key of Object.keys(source)) {
      if (isObject(source[key])) {
        output[key] = key in target
          ? mergeDeep(target[key] as object, source[key])
          : source[key]
      } else {
        output[key] = source[key]
      }
    }
  }

  return output as T & U
}

/**
 * Get the closest matching element up the DOM tree.
 * Uses native Element.closest() when possible for better performance.
 * `selector` is a class, ID, data attribute or tag; returns null if no match is found.
 */
export const getClosest = (elem: Element, selector: string): Element | null => {
  // Use native closest for standard CSS selectors
  if (elem?.closest) {
    try {
      return elem.closest(selector)
    } catch (e) {
      // Fallback for invalid selectors
    }
  }

  // Fallback implementation for edge cases
  const selectorMatcher: Matchers = {
    '.': (el, sel) => el.classList?.contains(sel.slice(1)),
    '#': (el, sel) => el.id === sel.slice(1),
    '[': (el, sel) => {
      const [attr, val] = sel.slice(1, -1).split('=').map(s => s.replace(/["']/g, ''))
      return val ? el.getAttribute(attr) === val : el.hasAttribute(attr)
    },
    tag: (el, sel) => el.tagName?.toLowerCase() === sel
  }

  const firstChar = selector.charAt(0)
  const matcher = selectorMatcher[firstChar] || selectorMatcher.tag

  for (let current = elem as Element | null; current && current !== (document as unknown) && current.nodeType === 1; current = current.parentNode as Element | null) {
    if (matcher(current, selector)) return current
  }

  return null
}

/**
 * Get all DOM elements up the tree that match a selector (a class, id,
 * data attribute or tag), or null if none match.
 */
export const getParents = (elem: Node, selector?: string): Element[] | null => {
  const parents: Element[] = []
  const matchers: Matchers = {
    '.': (el, sel) => el.classList?.contains(sel.slice(1)),
    '#': (el, sel) => el.id === sel.slice(1),
    '[': (el, sel) => el.hasAttribute(sel.slice(1, -1)),
    tag: (el, sel) => el.tagName?.toLowerCase() === sel
  }

  const firstChar = selector?.charAt(0) ?? ''
  const matcher = selector ? (matchers[firstChar] || matchers.tag) : null

  for (let current = elem as Element | null; current && current !== (document as unknown); current = current.parentNode as Element | null) {
    if (!selector || matcher?.(current, selector)) {
      parents.push(current)
    }
  }

  return parents.length > 0 ? parents : null
}

/** Ancestors of `elem` (matching `selector`, if given) up to, not including, the first one matching `parent`. */
export const getParentsUntil = (elem: Node, parent?: string, selector?: string): Element[] | null => {
  const parents: Element[] = []

  const matchers: Matchers = {
    '.': (el, sel) => el.classList?.contains(sel.slice(1)),
    '#': (el, sel) => el.id === sel.slice(1),
    '[': (el, sel) => el.hasAttribute(sel.slice(1, -1)),
    tag: (el, sel) => el.tagName?.toLowerCase() === sel
  }

  const getMatcherFn = (selectorStr?: string): Matcher | null => {
    if (!selectorStr) return null
    const firstChar = selectorStr.charAt(0)
    return matchers[firstChar] || matchers.tag
  }

  const parentMatcher = getMatcherFn(parent)
  const selectorMatcher = getMatcherFn(selector)

  for (let current = elem as Element | null; current && current !== (document as unknown); current = current.parentNode as Element | null) {
    // Check if we've reached the parent boundary
    if (parent && parentMatcher?.(current, parent)) {
      break
    }

    // Add to results if matches selector (or no selector specified)
    if (!selector || selectorMatcher?.(current, selector)) {
      parents.push(current)
    }
  }

  return parents.length > 0 ? parents : null
}
