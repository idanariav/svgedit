/**
 * EyedropperActionMenu.css.js — styles for the <se-eyedropper-menu> shadow DOM.
 * Mirrors the `.contextMenu`/`.qa-label` class shape used by the canvas
 * right-click quick-action menu (cmenuDialog.html) so the two menus look
 * like one system, using the same theme CSS custom properties.
 */

export const css = /* css */`
  :host {
    all: initial;
    position: fixed;
    inset: 0;
    z-index: 99999;
    pointer-events: none;
  }
  .contextMenu {
    position: fixed;
    display: none;
    min-width: 200px;
    border: solid 1px var(--chrome-border, rgba(0, 0, 0, .33));
    background: var(--chrome-bg, rgba(255, 255, 255, .98));
    color: var(--fg, #222);
    padding: 5px 0;
    margin: 0;
    font: 12px/15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif;
    border-radius: 8px;
    box-shadow: 2px 5px 10px rgba(0, 0, 0, .3);
    pointer-events: auto;
  }
  :host(.is-open) .contextMenu { display: block; }
  .contextMenu ul { list-style: none; padding: 0; margin: 0; }
  .contextMenu li { list-style: none; padding: 0; margin: 0; }
  .contextMenu a {
    user-select: none;
    color: var(--fg, #222);
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 8px;
    line-height: 20px;
    min-height: 20px;
    outline: none;
    padding: 6px 16px;
    cursor: pointer;
    white-space: nowrap;
  }
  .contextMenu li:hover a,
  .contextMenu li a:focus {
    background-color: var(--accent, #2e5dea);
    color: #fff;
  }
  .contextMenu li.separator {
    border-top: solid 1px var(--chrome-border, #E3E3E3);
    padding-top: 5px;
    margin-top: 5px;
  }
`
