/**
 * userDataAdapter.js — module-level registry for an optional host storage
 * adapter used to persist user customizations (custom palette colors and the
 * saved shape library) outside the editor's own `localStorage`.
 *
 * A consumer supplies the adapter through `setConfig({ userDataAdapter })`; the
 * editor registers it here once during `init()` (see EditorStartup.js). Both the
 * palette component (`sePalette.js`) and the user-shapes module
 * (`userShapes.js`) resolve it from here, so a single seam serves a Web
 * Component and a plain module alike.
 *
 * When no adapter is registered (standalone svgedit and every other consumer),
 * the stores fall back to their original `localStorage` behavior.
 *
 * Adapter shape (all methods synchronous from the editor's perspective; writes
 * may be fire-and-forget on the host side):
 *   {
 *     getPalette(): object,                     // overrides map, e.g. { 6: '#abc' }
 *     setPalette(overrides: object): void,      // full overrides map
 *     getUserShapes(): { categories, shapes },  // user shape store
 *     setUserShapes(store): void                // full store
 *   }
 */

let _adapter = null

/**
 * Register (or clear) the host storage adapter. Called once during editor init.
 * @param {object|null} adapter
 * @returns {void}
 */
export const setUserDataAdapter = (adapter) => {
  _adapter = adapter || null
}

/**
 * @returns {object|null} The registered adapter, or `null` for localStorage fallback.
 */
export const getUserDataAdapter = () => _adapter
