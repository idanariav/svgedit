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

/**
 * Signature depends on what the user adds; in the case of our uses with
 * SVGEditor, no parameters are passed nor anything expected for a return.
 * @callback module:contextmenu.MenuItemAction
 * @param {...args} args
 * @returns {any}
*/

/**
* @typedef {PlainObject} module:contextmenu.MenuItem
* @property {string} id
* @property {string} label
* @property {module:contextmenu.MenuItemAction} action
*/

/**
* @param {module:contextmenu.MenuItem} menuItem
* @returns {boolean}
*/
const menuItemIsValid = function (menuItem) {
  return menuItem && menuItem.id && menuItem.label && menuItem.action && typeof menuItem.action === 'function'
}

/**
 * @param {(id: string) => Element|null} [$id] - scoped element lookup for
 *   this editor's own container (defaults to a bare document.getElementById
 *   for standalone/single-editor use, e.g. tests).
 * @returns {{
 *   add: function(module:contextmenu.MenuItem): void,
 *   hasCustomHandler: function(string): boolean,
 *   getCustomHandler: function(string): module:contextmenu.MenuItemAction,
 *   injectExtendedContextMenuItemsIntoDom: function(): void,
 *   resetCustomMenus: function(): void
 * }}
 */
export const createContextMenu = ($id = (id) => document.getElementById(id)) => {
  let contextMenuExtensions = {}

  /**
  * @function module:contextmenu.add
  * @param {module:contextmenu.MenuItem} menuItem
  * @throws {Error|TypeError}
  * @returns {void}
  */
  const add = function (menuItem) {
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

  /**
  * @function module:contextmenu.hasCustomHandler
  * @param {string} handlerKey
  * @returns {boolean}
  */
  const hasCustomHandler = function (handlerKey) {
    return Boolean(contextMenuExtensions[handlerKey])
  }

  /**
  * @function module:contextmenu.getCustomHandler
  * @param {string} handlerKey
  * @returns {module:contextmenu.MenuItemAction}
  */
  const getCustomHandler = function (handlerKey) {
    return contextMenuExtensions[handlerKey].action
  }

  /**
  * @param {module:contextmenu.MenuItem} menuItem
  * @returns {void}
  */
  const injectExtendedContextMenuItemIntoDom = function (menuItem) {
    const cmenuCanvas = $id('cmenu_canvas')
    if (!Object.keys(contextMenuExtensions).length) {
      // all menuItems appear at the bottom of the menu in their own container.
      // if this is the first extension menu we need to add the separator.
      cmenuCanvas.appendChild('<li class=\'separator\'>')
    }
    const shortcut = menuItem.shortcut || ''
    cmenuCanvas.appendChild(`
      <li class='disabled'><a href='#${menuItem.id}'>${menuItem.label}<span class='shortcut'>${shortcut}</span></a></li>`)
  }

  /**
  * @function module:contextmenu.injectExtendedContextMenuItemsIntoDom
  * @returns {void}
  */
  const injectExtendedContextMenuItemsIntoDom = function () {
    Object.values(contextMenuExtensions).forEach((menuItem) => {
      injectExtendedContextMenuItemIntoDom(menuItem)
    })
  }

  /**
  * @function module:contextmenu.resetCustomMenus
  * @returns {void}
  */
  const resetCustomMenus = function () { contextMenuExtensions = {} }

  return { add, hasCustomHandler, getCustomHandler, injectExtendedContextMenuItemsIntoDom, resetCustomMenus }
}
