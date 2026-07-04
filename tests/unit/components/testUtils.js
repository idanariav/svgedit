/**
 * Shared helpers for custom element component unit tests.
 *
 * The `se-*` components read a global `svgEditor` (attached to `window` by
 * `src/editor/Editor.js` in the real app) for things like the configured
 * icon path, the shared `$click` binder, and the live `svgCanvas` instance.
 * `installMockSvgEditor` stubs just enough of that surface for components to
 * construct/attach without needing the full editor bootstrapped.
 *
 * Components also call `t(key)` from `src/editor/locale.js`, which delegates
 * to the real i18next singleton. Tests never initialize i18next (that's
 * covered by tests/locale.test.js), so left alone `t()` returns `undefined`.
 * Any test file that asserts on text produced through `t()` must add, at
 * the top level (vi.mock calls are hoisted above imports, so this cannot
 * live in a helper function):
 *
 *   vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))
 */

/**
 * Install a minimal `svgEditor` global, merging any per-test overrides.
 * @param {object} overrides
 * @returns {object} the installed mock, for further mutation in a test
 */
export function installMockSvgEditor (overrides = {}) {
  const mock = {
    configObj: { curConfig: { imgPath: 'images' } },
    $click: (el, handler) => el.addEventListener('click', handler),
    i18next: { t: (key) => key },
    hotkeys: { registerEl: () => {} },
    svgCanvas: {},
    updateCanvas: () => {},
    topPanel: { update: () => {}, updateContextPanel: () => {} },
    ...overrides
  }
  globalThis.svgEditor = mock
  return mock
}

export function uninstallMockSvgEditor () {
  delete globalThis.svgEditor
}

/**
 * Create and attach a custom element to `document.body` so
 * `connectedCallback` fires, returning the element for inspection.
 * @param {string} tagName
 * @param {object} attrs - attribute name/value pairs to set before attaching
 * @returns {HTMLElement}
 */
export function mountElement (tagName, attrs = {}) {
  const el = document.createElement(tagName)
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value)
  }
  document.body.append(el)
  return el
}
