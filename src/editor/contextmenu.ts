/**
 * Adds context menu functionality.
 *
 * `createContextMenu()` returns a fresh, self-contained registry per call.
 * svgedit mounts one editor instance per open pane in the same document, so
 * a module-level singleton here would mean two panes both registering (or
 * reading) their custom context-menu items into the same shared object —
 * throwing "already exists" on the second pane's init, and injecting one
 * pane's extension items via whichever pane's `#cmenu_canvas` a global
 * lookup happened to resolve to. EditorStartup creates one per instance via
 * `this.contextMenu = createContextMenu(this.$id)` and exposes it on the
 * editor object; extensions call `this.contextMenu.add(...)` from their
 * `init()` (where `this` is the editor, same as `this.svgCanvas`/
 * `this.i18next`/etc.) instead of importing this module directly.
 * @module contextmenu
 * @license Apache-2.0
 * @author Adam Bender
 */

export type MenuItemAction = (...args: any[]) => any
/**
 * Signature depends on what the user adds; in the case of our uses with
 * SVGEditor, no parameters are passed nor anything expected for a return.
 */

export interface MenuItem {
  id: string
  label: string
  action: MenuItemAction
  shortcut?: string
}

const menuItemIsValid = function (menuItem: MenuItem): boolean {
  return Boolean(menuItem && menuItem.id && menuItem.label && menuItem.action && typeof menuItem.action === 'function')
}

/**
 * @param $id - scoped element lookup for
this editor's own container (defaults to a bare document.getElementById
for standalone/single-editor use, e.g. tests).
 */
export const createContextMenu = ($id: (id: string) => Element | null = (id) => document.getElementById(id)): { add: (menuItem: MenuItem) => void, hasCustomHandler: (handlerKey: string) => boolean, getCustomHandler: (handlerKey: string) => MenuItemAction, injectExtendedContextMenuItemsIntoDom: () => void, resetCustomMenus: () => void } => {
  let contextMenuExtensions: Record<string, MenuItem> = {}

  /**
  * @function module:contextmenu.add
  * @throws {Error|TypeError}
   */
  const add = function (menuItem: MenuItem): void {
    // menuItem: {id, label, shortcut, action}
    if (!menuItemIsValid(menuItem)) {
      throw new TypeError(
        'Menu items must be defined and have at least properties: ' +
        'id, label, action, where action must be a function'
      )
    }
    if (menuItem.id in contextMenuExtensions) {
      throw new Error('Cannot add extension "' + menuItem.id + '", an extension by that name already exists"')
    }
    // Register menuItem action, see below for deferred menu dom injection
    contextMenuExtensions[menuItem.id] = menuItem
    // TODO: Need to consider how to handle custom enable/disable behavior
  }

  /** @function module:contextmenu.hasCustomHandler */
  const hasCustomHandler = function (handlerKey: string): boolean {
    return Boolean(contextMenuExtensions[handlerKey])
  }

  /** @function module:contextmenu.getCustomHandler */
  const getCustomHandler = function (handlerKey: string): MenuItemAction {
    return contextMenuExtensions[handlerKey].action
  }

  const injectExtendedContextMenuItemIntoDom = function (menuItem: MenuItem): void {
    const cmenuCanvas = $id('cmenu_canvas')
    if (!cmenuCanvas) return
    if (!Object.keys(contextMenuExtensions).length) {
      // all menuItems appear at the bottom of the menu in their own container.
      // if this is the first extension menu we need to add the separator.
      cmenuCanvas.insertAdjacentHTML('beforeend', '<li class=\'separator\'>')
    }
    const shortcut = menuItem.shortcut || ''
    cmenuCanvas.insertAdjacentHTML('beforeend', `
      <li class='disabled'><a href='#${menuItem.id}'>${menuItem.label}<span class='shortcut'>${shortcut}</span></a></li>`)
  }

  /** @function module:contextmenu.injectExtendedContextMenuItemsIntoDom */
  const injectExtendedContextMenuItemsIntoDom = function (): void {
    Object.values(contextMenuExtensions).forEach((menuItem) => {
      injectExtendedContextMenuItemIntoDom(menuItem)
    })
  }

  /** @function module:contextmenu.resetCustomMenus */
  const resetCustomMenus = function (): void { contextMenuExtensions = {} }

  return { add, hasCustomHandler, getCustomHandler, injectExtendedContextMenuItemsIntoDom, resetCustomMenus }
}
