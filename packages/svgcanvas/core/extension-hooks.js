/**
 * Registry of extension hook names. `svgCanvas.runExtensions(name, vars)` calls
 * `ext[name](vars)` on every extension that implements it; keeping the names in
 * one place lets us warn about typos (a hook nothing ever dispatches).
 * `keyDown` receives `{ event: KeyboardEvent }`; returning
 * `{ preventDefault: true }` swallows the key.
 * @module extension-hooks
 * @license MIT
 */

export const EXTENSION_HOOKS = Object.freeze([
  'mouseDown', 'mouseMove', 'mouseUp', 'keyDown',
  'zoomChanged', 'IDsUpdated', 'canvasUpdated', 'toolButtonStateUpdate',
  'selectedChanged', 'elementTransition', 'elementChanged', 'elementRenamed',
  'layersChanged', 'layerVisChanged',
  'langReady', 'langChanged', 'addLangData', 'workareaResized',
  'afterClear', 'beforeClear', 'onOpenedDocument', 'onSavedDocument'
])

export const isExtensionHook = (name) => EXTENSION_HOOKS.includes(name)

/** Non-hook functions an extension object may legitimately expose. */
export const EXTENSION_LIFECYCLE_METHODS = Object.freeze(['callback'])
