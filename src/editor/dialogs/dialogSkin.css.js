/**
 * dialogSkin.css.js — shared look for the form-style dialogs (export, SVG source,
 * document properties, preferences, alert/confirm/prompt).
 *
 * Everything here reads the design tokens that svgedit.css defines for the dialog
 * host (the dialog tags are listed in its light/dark token blocks and the host gets
 * `theme-dark` from `syncDialogTheme()`), so the dialogs follow the editor theme.
 * Each dialog keeps only its own layout rules and prepends this to its template:
 *
 *   template.innerHTML = `<style>${dialogSkin('#my_container')}</style>${html}`
 *
 * Mark the confirming button with `class="dlg-primary"`.
 */

/**
 * @param {string} surface - selector of the element that is the dialog's visible card
 * @returns {string} CSS text
 */
export const dialogSkin = (surface) => /* css */`
  dialog {
    padding: 0;
    border: none;
    background: transparent;
    color: var(--fg, #1B1F24);
    overflow: visible;
  }
  dialog::backdrop { background: rgba(0, 0, 0, 0.2); }

  ${surface} {
    box-sizing: border-box;
    padding: 16px;
    background: var(--chrome-bg, #FFFFFF);
    color: var(--fg, #1B1F24);
    border: 1px solid var(--chrome-border, #E6E8EC);
    border-radius: 14px;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
    font-family: var(--ui-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
    font-size: 13px;
  }

  label, legend, p, span { color: var(--fg, #1B1F24); }

  fieldset {
    border: 1px solid var(--chrome-border, #E6E8EC);
    border-radius: 10px;
    background: var(--group-bg, transparent);
  }

  input[type=text], input[type=number], textarea, select {
    box-sizing: border-box;
    padding: 6px 9px;
    color: var(--fg, #1B1F24);
    background: var(--field-bg, #FFFFFF);
    border: 1px solid var(--field-border, #DDE1E7);
    border-radius: 8px;
    font: inherit;
    transition: border-color .12s, box-shadow .12s;
  }
  input[type=text]:focus, input[type=number]:focus, textarea:focus, select:focus {
    outline: none;
    border-color: var(--accent, #2962FF);
    box-shadow: 0 0 0 3px var(--accent-ring, rgba(41, 98, 255, 0.16));
  }
  input[type=checkbox], input[type=radio] { accent-color: var(--accent, #2962FF); }

  button {
    appearance: none;
    font: inherit;
    font-weight: 500;
    padding: 7px 16px;
    color: var(--fg, #1B1F24);
    background: var(--field-bg, #FFFFFF);
    border: 1px solid var(--field-border, #DDE1E7);
    border-radius: 8px;
    cursor: pointer;
    transition: background .12s, border-color .12s, opacity .12s;
  }
  button:hover { border-color: var(--field-border-h, #C8CDD6); }
  button:disabled { opacity: 0.45; cursor: default; }
  button.dlg-primary {
    color: #FFFFFF;
    background: var(--accent, #2962FF);
    border-color: var(--accent, #2962FF);
  }
  /* The dark theme's amber accent needs dark text for contrast. */
  :host(.theme-dark) button.dlg-primary { color: #1B1F24; }
`
