/**
 * PaletteDialog.css.js — styles for the <se-palette-dialog> shadow DOM.
 * The --pd-* modal tokens mirror ColorDialog.css.js's --cp-* so the two dialogs
 * read as one system. The shared design tokens (--fg, --accent, …) come from
 * svgedit.css, which lists <se-palette-dialog> in its token blocks.
 */

export const css = /* css */`
  :host {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--ui-font, 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif);
    color: var(--fg, #1B1F24);
  }

  :host {
    --pd-modal-bg:   #FFFFFF;
    --pd-head-bg:    #FAFBFC;
    --pd-backdrop:   rgba(20, 24, 35, 0.06);
    --pd-checker:    rgba(0, 0, 0, 0.07);
  }

  :host(.theme-dark) {
    --pd-modal-bg:   #22252C;
    --pd-head-bg:    #1E2026;
    --pd-backdrop:   rgba(0, 0, 0, 0.5);
    --pd-checker:    rgba(255, 255, 255, 0.06);
  }

  .pd-backdrop {
    position: absolute;
    inset: 0;
    background: var(--pd-backdrop);
    backdrop-filter: blur(2px);
  }

  .pd-modal {
    position: relative;
    width: 720px;
    max-width: calc(100vw - 48px);
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    background: var(--pd-modal-bg);
    border: 1px solid var(--chrome-border);
    border-radius: 16px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 20px 60px -10px rgba(0,0,0,0.18);
    display: flex;
    flex-direction: column;
  }

  .pd-head {
    height: 56px; flex: 0 0 56px;
    padding: 0 18px 0 22px;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid var(--chrome-border);
    background: var(--pd-head-bg);
    border-radius: 16px 16px 0 0;
  }
  .pd-head-title { font-size: 15px; font-weight: 600; color: var(--fg); }
  .pd-head-close {
    width: 32px; height: 32px;
    background: transparent; border: none;
    border-radius: 8px; color: var(--icon);
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .pd-head-close svg { width: 18px; height: 18px; }
  .pd-head-close:hover { background: var(--icon-hover-bg); color: var(--icon-hover); }

  .pd-controls {
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    padding: 16px 22px;
    border-bottom: 1px solid var(--chrome-border);
  }
  .pd-field { display: flex; align-items: center; gap: 8px; }
  .pd-field-label {
    font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
    color: var(--muted);
  }
  .pd-select, .pd-number {
    height: 32px;
    background: var(--field-bg); border: 1px solid var(--field-border);
    border-radius: 8px; padding: 0 10px;
    font-family: inherit; font-size: 13px; color: var(--fg); font-weight: 500;
  }
  .pd-number { width: 70px; }
  .pd-mode {
    display: inline-flex; padding: 3px;
    background: var(--group-bg); border: 1px solid var(--group-border);
    border-radius: 8px; gap: 2px;
  }
  .pd-mode button {
    appearance: none; border: none; background: transparent;
    color: var(--muted); font-family: inherit; font-size: 12px; font-weight: 500;
    padding: 5px 10px; border-radius: 6px; cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .pd-mode button.is-active { background: var(--pd-modal-bg); color: var(--fg); }

  .pd-body {
    padding: 20px 22px 22px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }
  .pd-swatch { display: flex; flex-direction: column; gap: 6px; }
  .pd-swatch-color {
    height: 64px;
    border-radius: 10px;
    border: 1.5px solid var(--swatch-border);
  }
  .pd-swatch-name {
    font-size: 12px; font-weight: 600; color: var(--fg);
    text-transform: capitalize;
  }
  .pd-swatch-value-row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .pd-swatch-value {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 11px; color: var(--muted);
    font-family: ui-monospace, monospace;
    word-break: break-all;
  }
  .pd-copy-btn {
    flex: 0 0 auto;
    width: 20px; height: 20px;
    display: inline-flex; align-items: center; justify-content: center;
    background: transparent; border: none;
    border-radius: 5px;
    color: var(--muted);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .pd-copy-btn:hover { background: var(--icon-hover-bg); color: var(--icon-hover); }
  .pd-copy-btn.is-copied { color: var(--accent); }
  .pd-swatch-degraded {
    font-size: 10px; color: var(--muted);
    font-style: italic;
  }
`
