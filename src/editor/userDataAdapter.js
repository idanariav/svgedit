/**
 * userDataAdapter.js — module-level registry for an optional host storage
 * adapter used to persist user customizations (custom palette colors, the
 * saved shape library, and custom hotkey bindings) outside the editor's own
 * `localStorage`.
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
 *     setUserShapes(store): void,               // full store
 *     getHotkeys(): object,                     // overrides map, e.g. { tool_rect: ['r'] }
 *     setHotkeys(overrides: object): void,      // full overrides map
 *     getClasses(): Array,                      // style-preset "class" library
 *     setClasses(classes: Array): void,         // full class array
 *     getCanvasPresets(): Array<{ratio,w,h}>,   // canvas-size presets
 *     setCanvasPresets(presets: Array): void,   // full presets array
 *     getFonts(): Promise<Array<{family,woff2Base64}>>, // persisted custom fonts
 *     saveFont(family: string, woff2Base64: string): Promise<void> // persist one font
 *   }
 *
 * `getHotkeys`/`setHotkeys` back the Hotkey Manager (see `Hotkeys.js`). They are
 * optional like the others: when absent (or no adapter at all) hotkey bindings
 * fall back to `localStorage` key `svg-edit-hotkeys`.
 *
 * `getClasses`/`setClasses` back the class library (`classLibrary.js`), falling
 * back to `localStorage` key `svg-edit-class-library`.
 * `getCanvasPresets`/`setCanvasPresets` back the canvas-settings preset list
 * (`seCanvasSettings.js`), falling back to `localStorage` key
 * `svg-edit-canvas-presets`. `getFonts`/`saveFont`
 * back the custom-font cache (`ext-fonts/fontStore.js`); the async signatures
 * let a host read/write font binaries from a synced vault folder, falling back
 * to IndexedDB (`svgedit-fonts`) when absent.
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
