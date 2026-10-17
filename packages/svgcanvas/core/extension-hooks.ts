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

export interface MouseDownPayload {
  event: MouseEvent
  /** canvas coordinates */
  start_x: number
  start_y: number
  selectedElements: Element[]
  // Return `{ started: true }` to claim the gesture.
}

export interface MouseMovePayload {
  event: MouseEvent
  /** canvas coordinates */
  mouse_x: number
  mouse_y: number
  /** the first selected element */
  selected: Element
}

export interface MouseUpPayload {
  event: MouseEvent
  /** canvas coordinates */
  mouse_x: number
  mouse_y: number
  /** the element being drawn, if any */
  element: Element | null
  // Return `{ keep, element, started }` to commit/replace the drawn element.
}

/**
 * Dispatched for keydowns owned by the focused editor, before its own shortcut
 * handling. Return `{ preventDefault: true }` to swallow the key.
 */
export interface KeyDownPayload {
  event: KeyboardEvent
}

/** `zoomChanged` receives the new zoom factor (1 = 100%) as a bare number. */
export type ZoomChangedPayload = number

export interface IDsUpdatedPayload {
  /** the pasted elements */
  elems: Element[]
  /** maps old id to new id */
  changes: Record<string, string>
  // Return `{ remove: string[] }` to drop elements by id.
}

export interface CanvasUpdatedPayload {
  new_x: number
  new_y: number
  old_x: number
  old_y: number
  d_x: number
  d_y: number
}

export interface ToolButtonStateUpdatePayload {
  nofill: boolean
  nostroke: boolean
}

export interface SelectedChangedPayload {
  elems: Element[]
  selectedElement: Element | null
  multiselected: boolean
}

export interface ElementsPayload {
  elems: Element[]
}

export interface ElementRenamedPayload {
  /** the canvas `elementRenamed` event detail */
  renameObj: object
}

export interface OpenedDocumentPayload {
  name: string
  lastModified: number
  size: number
  type: string
}

export interface SavedDocumentPayload {
  name: string
  kind: string
}

/**
 * Hook name -> payload type. Hooks documented `undefined` are dispatched without a
 * payload (`vars` is `undefined`).
 */
export interface ExtensionHookPayloads {
  mouseDown: MouseDownPayload
  mouseMove: MouseMovePayload
  mouseUp: MouseUpPayload
  keyDown: KeyDownPayload
  zoomChanged: ZoomChangedPayload
  IDsUpdated: IDsUpdatedPayload
  canvasUpdated: CanvasUpdatedPayload
  toolButtonStateUpdate: ToolButtonStateUpdatePayload
  selectedChanged: SelectedChangedPayload
  elementTransition: ElementsPayload
  elementChanged: ElementsPayload
  elementRenamed: ElementRenamedPayload
  layersChanged: undefined
  layerVisChanged: undefined
  afterClear: undefined
  beforeClear: undefined
  onOpenedDocument: OpenedDocumentPayload
  onSavedDocument: SavedDocumentPayload
}

export const EXTENSION_HOOKS: ReadonlyArray<keyof ExtensionHookPayloads> = Object.freeze([
  'mouseDown', 'mouseMove', 'mouseUp', 'keyDown',
  'zoomChanged', 'IDsUpdated', 'canvasUpdated', 'toolButtonStateUpdate',
  'selectedChanged', 'elementTransition', 'elementChanged', 'elementRenamed',
  'layersChanged', 'layerVisChanged',
  'afterClear', 'beforeClear', 'onOpenedDocument', 'onSavedDocument'
] as const)

export const isExtensionHook = (name: string): boolean => (EXTENSION_HOOKS as readonly string[]).includes(name)

/** Non-hook functions an extension object may legitimately expose. */
export const EXTENSION_LIFECYCLE_METHODS = Object.freeze(['callback'])
