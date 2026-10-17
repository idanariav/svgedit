/**
 * userDataAdapter.ts — module-level registry for an optional host storage
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
 *     getPalette(): object,                     // overrides map, e.g. { 6: '#abc', removed: [3, 4] }
 *     setPalette(overrides: object): void,      // full overrides map
 *     getUserShapes(): { categories, shapes },  // user shape store
 *     setUserShapes(store): void,               // full store
 *     getHotkeys(): object,                     // overrides map, e.g. { tool_rect: ['r'] }
 *     setHotkeys(overrides: object): void,      // full overrides map
 *     getClasses(): Array,                      // style-preset "class" library
 *     setClasses(classes: Array): void,         // full class array
 *     getDefaultClasses(): object,               // per-tag default class names, e.g. { text: 'title' }
 *     setDefaultClasses(defaults: object): void, // full per-tag default map
 *     getCanvasPresets(): Array<{ratio,w,h}>,   // canvas-size presets
 *     setCanvasPresets(presets: Array): void,   // full presets array
 *     getFonts(): Promise<Array<{family,woff2Base64}>>, // persisted custom fonts
 *     saveFont(family: string, woff2Base64: string): Promise<void>, // persist one font
 *     getBrushes(): object,                     // saved brush slots, e.g. { 0: {...} }
 *     setBrushes(slots: object): void,           // full brush slots map
 *     getToolOrder(): { main: string[], overflow: string[] }, // left-panel tool order
 *     setToolOrder(order: object): void          // full { main, overflow } tool order
 *   }
 *
 * `getHotkeys`/`setHotkeys` back the Hotkey Manager (see `Hotkeys.js`). They are
 * optional like the others: when absent (or no adapter at all) hotkey bindings
 * fall back to `localStorage` key `svg-edit-hotkeys`.
 *
 * `getClasses`/`setClasses` back the class library (`classLibrary.js`), falling
 * back to `localStorage` key `svg-edit-class-library`. `getDefaultClasses`/
 * `setDefaultClasses` back its per-object-type default class assignments,
 * falling back to `localStorage` key `svg-edit-default-classes`; both are
 * optional (called via `?.()`) so an adapter written before this feature
 * existed still works, just without default-class persistence.
 * `getCanvasPresets`/`setCanvasPresets` back the canvas-settings preset list
 * (`seCanvasSettings.js`), falling back to `localStorage` key
 * `svg-edit-canvas-presets`. `getFonts`/`saveFont`
 * back the custom-font cache (`ext-fonts/fontStore.js`); the async signatures
 * let a host read/write font binaries from a synced vault folder, falling back
 * to IndexedDB (`svgedit-fonts`) when absent.
 *
 * `getBrushes`/`setBrushes` back the 5 saved custom-brush slots
 * (`customBrushes.js`), falling back to `localStorage` key
 * `svg-edit-custom-brushes`.
 *
 * `getToolOrder`/`setToolOrder` back the left panel's drag-to-reorder tool
 * order and "Additional tools" overflow bucket (`toolOrder.js`), falling
 * back to `localStorage` key `svg-edit-tool-order`.
 */

export interface UserDataAdapter {
  getPalette?: () => unknown
  setPalette?: (overrides: unknown) => void
  getUserShapes?: () => unknown
  setUserShapes?: (store: unknown) => void
  getHotkeys?: () => any
  setHotkeys?: (overrides: unknown) => void
  getClasses?: () => unknown
  setClasses?: (classes: unknown) => void
  getDefaultClasses?: () => any
  setDefaultClasses?: (defaults: unknown) => void
  getCanvasPresets?: () => unknown
  setCanvasPresets?: (presets: unknown) => void
  getCanvasLayouts?: () => unknown
  setCanvasLayouts?: (layouts: unknown) => void
  getFonts?: () => Promise<any>
  saveFont?: (family: string, woff2Base64: string) => Promise<void>
  getBrushes?: () => any
  setBrushes?: (slots: unknown) => void
  getToolOrder?: () => any
  setToolOrder?: (order: unknown) => void
  getFavorites?: () => string[]
  setFavorites?: (ids: string[]) => void
}
/** The adapter's methods, all optional; payloads are owned by the module that stores them. */

let _adapter: UserDataAdapter | null = null

/** Register (or clear) the host storage adapter. Called once during editor init. */
export const setUserDataAdapter = (adapter: UserDataAdapter | null): void => {
  _adapter = adapter || null
}

/** @returns The registered adapter, or `null` for localStorage fallback. */
export const getUserDataAdapter = (): UserDataAdapter | null => _adapter
