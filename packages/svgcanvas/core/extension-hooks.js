// @ts-check
/**
 * Registry of extension hook names, with the payload each one receives.
 * `svgCanvas.runExtensions(name, vars)` calls `ext[name](vars)` on every
 * extension that implements it; keeping the names in one place lets us warn
 * about typos (a hook nothing ever dispatches). Add a hook here (name + payload
 * typedef) before dispatching a new one — `tests/unit/extension-hooks.test.js`
 * fails if a dispatched name is missing, or a registered one is never dispatched.
 *
 * Return values (only where noted) are collected by the dispatcher.
 * @module extension-hooks
 * @license MIT
 */

/**
 * @typedef {object} MouseDownPayload
 * @property {MouseEvent} event
 * @property {number} start_x - canvas coordinates
 * @property {number} start_y
 * @property {Element[]} selectedElements
 * Return `{ started: true }` to claim the gesture.
 */

/**
 * @typedef {object} MouseMovePayload
 * @property {MouseEvent} event
 * @property {number} mouse_x - canvas coordinates
 * @property {number} mouse_y
 * @property {Element} selected - the first selected element
 */

/**
 * @typedef {object} MouseUpPayload
 * @property {MouseEvent} event
 * @property {number} mouse_x - canvas coordinates
 * @property {number} mouse_y
 * @property {?Element} element - the element being drawn, if any
 * Return `{ keep, element, started }` to commit/replace the drawn element.
 */

/**
 * @typedef {object} KeyDownPayload
 * @property {KeyboardEvent} event
 * Dispatched for keydowns owned by the focused editor, before its own shortcut
 * handling. Return `{ preventDefault: true }` to swallow the key.
 */

/**
 * `zoomChanged` receives the new zoom factor (1 = 100%) as a bare number.
 * @typedef {number} ZoomChangedPayload
 */

/**
 * @typedef {object} IDsUpdatedPayload
 * @property {Element[]} elems - the pasted elements
 * @property {Object<string, string>} changes - maps old id to new id
 * Return `{ remove: string[] }` to drop elements by id.
 */

/**
 * @typedef {object} CanvasUpdatedPayload
 * @property {number} new_x
 * @property {number} new_y
 * @property {number} old_x
 * @property {number} old_y
 * @property {number} d_x
 * @property {number} d_y
 */

/**
 * @typedef {object} ToolButtonStateUpdatePayload
 * @property {boolean} nofill
 * @property {boolean} nostroke
 */

/**
 * @typedef {object} SelectedChangedPayload
 * @property {Element[]} elems
 * @property {?Element} selectedElement
 * @property {boolean} multiselected
 */

/**
 * @typedef {object} ElementsPayload
 * @property {Element[]} elems
 */

/**
 * @typedef {object} ElementRenamedPayload
 * @property {object} renameObj - the canvas `elementRenamed` event detail
 */

/**
 * @typedef {object} OpenedDocumentPayload
 * @property {string} name
 * @property {number} lastModified
 * @property {number} size
 * @property {string} type
 */

/**
 * @typedef {object} SavedDocumentPayload
 * @property {string} name
 * @property {string} kind
 */

/**
 * Hook name -> payload type. Hooks documented `none` are dispatched without a
 * payload (`vars` is `undefined`); `langChanged` receives the new language code.
 * @typedef {object} ExtensionHookPayloads
 * @property {MouseDownPayload} mouseDown
 * @property {MouseMovePayload} mouseMove
 * @property {MouseUpPayload} mouseUp
 * @property {KeyDownPayload} keyDown
 * @property {ZoomChangedPayload} zoomChanged
 * @property {IDsUpdatedPayload} IDsUpdated
 * @property {CanvasUpdatedPayload} canvasUpdated
 * @property {ToolButtonStateUpdatePayload} toolButtonStateUpdate
 * @property {SelectedChangedPayload} selectedChanged
 * @property {ElementsPayload} elementTransition
 * @property {ElementsPayload} elementChanged
 * @property {ElementRenamedPayload} elementRenamed
 * @property {undefined} layersChanged
 * @property {undefined} layerVisChanged
 * @property {string} langChanged - the new language code
 * @property {undefined} afterClear
 * @property {undefined} beforeClear
 * @property {OpenedDocumentPayload} onOpenedDocument
 * @property {SavedDocumentPayload} onSavedDocument
 */

/** @type {ReadonlyArray<keyof ExtensionHookPayloads>} */
export const EXTENSION_HOOKS = Object.freeze([
  'mouseDown', 'mouseMove', 'mouseUp', 'keyDown',
  'zoomChanged', 'IDsUpdated', 'canvasUpdated', 'toolButtonStateUpdate',
  'selectedChanged', 'elementTransition', 'elementChanged', 'elementRenamed',
  'layersChanged', 'layerVisChanged',
  'langChanged',
  'afterClear', 'beforeClear', 'onOpenedDocument', 'onSavedDocument'
])

export const isExtensionHook = (name) => EXTENSION_HOOKS.includes(name)

/** Non-hook functions an extension object may legitimately expose. */
export const EXTENSION_LIFECYCLE_METHODS = Object.freeze(['callback'])
