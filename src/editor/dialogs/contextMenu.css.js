/**
 * contextMenu.css.js — shared look of the right-click menus (the canvas quick-action menu and the Layers panel's).
 *
 * The same card and rows as the main menu (`se-menu` / `se-menu-item`): the UI font at 13px, a 10px-round card with 6px of
 * padding, rows inset with 7px corners that take the soft hover background, 18px icons and a muted shortcut. Each menu keeps
 * only its own extra rules and prepends this to its template:
 *
 *   template.innerHTML = `<style>${contextMenuCss}</style>${html}`
 */

export const contextMenuCss = /* css */`
  .contextMenu {
    position: fixed;
    z-index: 99999;
    min-width: 200px;
    box-sizing: border-box;
    margin: 0;
    padding: 6px;
    list-style: none;
    display: none;
    background: var(--chrome-bg, #fff);
    border: 1px solid var(--chrome-border, #E6E8EC);
    border-radius: 10px;
    box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.12);
    color: var(--fg, #1B1F24);
    font-family: var(--ui-font, inherit);
    font-size: 13px;
    line-height: normal;
  }

  .contextMenu li {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .contextMenu a {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 7px;
    color: var(--fg, #1B1F24);
    text-decoration: none;
    outline: none;
    cursor: pointer;
    user-select: none;
  }

  .contextMenu li:not(.disabled) a:hover,
  .contextMenu li:not(.disabled) a:focus-visible {
    background: var(--icon-hover-bg, #EEF1F5);
  }

  .contextMenu li.disabled a {
    color: var(--muted, #6B7280);
    opacity: 0.45;
    pointer-events: none;
  }

  .contextMenu li.separator {
    border-top: 1px solid var(--chrome-border, #E6E8EC);
    margin-top: 4px;
    padding-top: 4px;
  }
`
