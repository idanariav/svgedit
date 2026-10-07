/** Shadow-DOM stylesheet for <se-shape-library> (split out of seShapeLibrary.js). */

// ── Component CSS ────────────────────────────────────────────────────────────
export const CSS = `
/* ── Toolbar button ──────────────────────────────────────────────────────── */
:host { display: inline-flex; align-items: center; justify-content: center; }

.sl-tool {
  width: var(--sl-tool-size, 40px); height: var(--sl-tool-size, 40px);
  display: flex; align-items: center; justify-content: center;
  border: 1px solid transparent; border-radius: var(--sl-tool-radius, 10px);
  background: transparent; cursor: pointer;
  color: var(--icon, #4B5563);
  font-family: var(--ui-font, system-ui, sans-serif);
  transition: background 0.12s, color 0.12s, border-color 0.12s, box-shadow 0.12s;
}
.sl-tool:hover { background: var(--icon-hover-bg, #EEF1F5); color: var(--icon-hover, #0F172A); }
.sl-tool.pressed {
  background: var(--accent-soft, #E8EFFF); color: var(--accent, #2962FF);
  border-color: var(--accent-border, #C7D7FF);
  box-shadow: var(--active-shadow, 0 1px 2px rgba(41,98,255,.18));
}
.sl-tool svg { display: block; }
.sl-tool-icon {
  display: flex; align-items: center; justify-content: center;
  width: var(--sl-tool-icon-size, 22px); height: var(--sl-tool-icon-size, 22px);
}
/* Let the icon track --sl-tool-icon-size (overrides the inline width/height). */
.sl-tool-icon svg { width: 100%; height: 100%; }

/* ── Popover ─────────────────────────────────────────────────────────────── */
.sl-popover {
  position: fixed; z-index: 9999;
  width: 480px;
  background: var(--sl-modal-bg, #FFF);
  border: 1px solid var(--chrome-border, #E6E8EC);
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 20px 50px -10px rgba(0,0,0,.22), 0 40px 80px -40px rgba(0,0,0,.30);
  display: flex; flex-direction: column;
  overflow: hidden;
  font-family: var(--ui-font, system-ui, sans-serif);
  animation: sl-pop-in 0.12s ease-out;
}
@keyframes sl-pop-in { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }

.sl-pop-head {
  display: flex; align-items: center; gap: 10px;
  height: 48px; padding: 0 12px 0 16px;
  background: var(--sl-head-bg, #FAFBFC);
  border-bottom: 1px solid var(--chrome-border, #E6E8EC);
  flex-shrink: 0;
}
.sl-pop-title { font-size: 13px; font-weight: 600; color: var(--fg, #1B1F24); letter-spacing: -0.005em; }
.sl-pop-search-box {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: 6px;
  height: 28px; width: 160px; padding: 0 10px;
  background: var(--field-bg, #FFF); border: 1px solid var(--field-border, #DDE1E7);
  border-radius: 7px;
}
.sl-pop-search-box input {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: 12px; color: var(--fg, #1B1F24); font-family: inherit;
}
.sl-pop-search-box input::placeholder { color: var(--muted, #6B7280); }
.sl-pop-search-icon { width: 13px; height: 13px; color: var(--muted, #6B7280); display: flex; align-items: center; flex-shrink: 0; }
.sl-pop-search-icon svg { display: block; }

.sl-pop-cats {
  display: flex; align-items: center; flex-wrap: wrap; gap: 4px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--chrome-border, #E6E8EC);
  background: var(--sl-modal-bg, #FFF);
  flex-shrink: 0;
}
.sl-pop-cat {
  appearance: none; cursor: pointer;
  font-family: inherit; font-size: 11.5px; font-weight: 500; color: var(--fg, #1B1F24);
  padding: 4px 9px;
  background: var(--field-bg, #FFF); border: 1px solid var(--field-border, #DDE1E7);
  border-radius: 999px;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.sl-pop-cat:hover { border-color: var(--sl-field-hover, #B6BFCE); }
.sl-pop-cat.is-active {
  background: var(--accent, #2962FF); border-color: var(--accent, #2962FF);
  color: var(--sl-btn-primary-fg, #FFF);
}
.sl-pop-cat-more { color: var(--muted, #6B7280); }

.sl-pop-grid {
  display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px;
  padding: 10px 12px; flex-shrink: 0;
}
.sl-chip {
  appearance: none; border: 1px solid transparent;
  background: transparent; aspect-ratio: 1; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--sl-shape, #4B5563);
  transition: background 0.12s, border-color 0.12s, color 0.12s, transform 0.08s;
  padding: 0;
}
.sl-chip:hover { background: var(--icon-hover-bg, #EEF1F5); border-color: var(--chrome-border, #E6E8EC); color: var(--sl-shape-hover, #0F172A); }
.sl-chip.is-selected {
  background: var(--accent-soft, #E8EFFF); border-color: var(--accent-border, #C7D7FF);
  color: var(--accent, #2962FF); box-shadow: 0 0 0 1px var(--accent, #2962FF) inset;
}
.sl-chip svg { display: block; }

.sl-pop-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 10px 14px;
  background: var(--sl-head-bg, #FAFBFC);
  border-top: 1px solid var(--chrome-border, #E6E8EC);
  flex-shrink: 0;
}
.sl-pop-hint { font-size: 11.5px; color: var(--muted, #6B7280); }
.sl-pop-browse {
  appearance: none; border: none; background: transparent; padding: 0;
  font-family: inherit; font-size: 12px; font-weight: 600; color: var(--accent, #2962FF);
  cursor: pointer;
}
.sl-pop-browse:hover { text-decoration: underline; }

/* ── Modal backdrop ──────────────────────────────────────────────────────── */
.sl-backdrop {
  position: fixed; inset: 0; z-index: 9998;
  background: var(--cp-backdrop, rgba(20,24,35,.06));
  backdrop-filter: blur(2px);
  animation: sl-fade-in 0.12s ease-out;
}
@keyframes sl-fade-in { from { opacity: 0; } to { opacity: 1; } }

/* ── Modal ───────────────────────────────────────────────────────────────── */
.sl-modal {
  position: fixed; z-index: 9999;
  left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 880px; max-width: calc(100vw - 48px);
  height: 600px; max-height: calc(100vh - 48px);
  background: var(--sl-modal-bg, #FFF);
  border: 1px solid var(--chrome-border, #E6E8EC);
  border-radius: 16px; overflow: hidden;
  display: flex; flex-direction: column;
  box-shadow: 0 1px 2px rgba(0,0,0,.06), 0 20px 60px -10px rgba(0,0,0,.18), 0 40px 100px -40px rgba(0,0,0,.30);
  font-family: var(--ui-font, system-ui, sans-serif);
  animation: sl-modal-in 0.16s ease-out;
}
@keyframes sl-modal-in {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

/* ── Modal header ────────────────────────────────────────────────────────── */
.sl-head {
  height: 60px; flex: 0 0 60px;
  padding: 0 16px 0 22px;
  display: flex; align-items: center; gap: 14px;
  border-bottom: 1px solid var(--chrome-border, #E6E8EC);
  background: var(--sl-head-bg, #FAFBFC);
}
.sl-head-title {
  display: inline-flex; align-items: center; gap: 10px;
  font-size: 15px; font-weight: 600; color: var(--fg, #1B1F24);
  letter-spacing: -0.005em; white-space: nowrap;
}
.sl-head-icon { width: 18px; height: 18px; color: var(--accent, #2962FF); display: inline-flex; }
.sl-head-icon svg { display: block; }
.sl-search-wrap { margin-left: 8px; flex: 1; max-width: 320px; }
.sl-search {
  display: flex; align-items: center; height: 34px;
  padding: 0 10px; gap: 8px;
  background: var(--field-bg, #FFF); border: 1px solid var(--field-border, #DDE1E7);
  border-radius: 9px; cursor: text;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.sl-search:hover { border-color: var(--sl-field-hover, #B6BFCE); }
.sl-search.focused {
  border-color: var(--sl-field-hover, #B6BFCE);
  box-shadow: 0 0 0 3px var(--cp-focus-ring, rgba(41,98,255,.18));
}
.sl-search-icon { width: 16px; height: 16px; color: var(--muted, #6B7280); display: flex; flex-shrink: 0; }
.sl-search-icon svg { display: block; }
.sl-search input {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: 13px; font-weight: 500; color: var(--fg, #1B1F24); font-family: inherit;
}
.sl-search input::placeholder { color: var(--muted, #6B7280); font-weight: 400; }
.sl-search-clear {
  width: 16px; height: 16px; color: var(--muted, #6B7280);
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 4px; cursor: pointer; border: none; background: transparent; padding: 0;
}
.sl-search-clear:hover { background: var(--icon-hover-bg, #EEF1F5); color: var(--icon-hover, #0F172A); }
.sl-search-clear svg { display: block; }
.sl-head-close {
  margin-left: auto; width: 32px; height: 32px;
  background: transparent; border: none; border-radius: 8px;
  color: var(--icon, #4B5563);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background 0.12s, color 0.12s;
}
.sl-head-close:hover { background: var(--icon-hover-bg, #EEF1F5); color: var(--icon-hover, #0F172A); }
.sl-head-close svg { display: block; }

/* ── Modal body ──────────────────────────────────────────────────────────── */
.sl-body { flex: 1; display: flex; min-height: 0; }

/* Sidebar */
.sl-side {
  flex: 0 0 200px; background: var(--sl-side-bg, #F6F7F9);
  padding: 14px 10px; overflow-y: auto;
}
.sl-side-cats { display: flex; flex-direction: column; gap: 1px; }
.sl-cat {
  appearance: none; border: none; background: transparent;
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  height: 32px; padding: 0 10px 0 12px; border-radius: 8px;
  color: var(--fg, #1B1F24); font-family: inherit; font-size: 13px; font-weight: 500;
  letter-spacing: -0.005em; cursor: pointer; text-align: left; width: 100%;
  transition: background 0.12s, color 0.12s;
}
.sl-cat:hover { background: var(--icon-hover-bg, #EEF1F5); color: var(--icon-hover, #0F172A); }
.sl-cat.is-active {
  background: var(--accent-soft, #E8EFFF); color: var(--accent, #2962FF);
  box-shadow: 0 0 0 1px var(--accent-border, #C7D7FF) inset;
}
.sl-cat-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sl-cat-count { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--muted, #6B7280); font-weight: 500; flex-shrink: 0; }
.sl-cat.is-active .sl-cat-count { color: var(--accent, #2962FF); opacity: 0.75; }

/* Divider */
.sl-divider { width: 1px; background: var(--chrome-border, #E6E8EC); flex-shrink: 0; }

/* Content */
.sl-content { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--sl-modal-bg, #FFF); }
.sl-content-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px 8px; gap: 12px; flex-shrink: 0;
}
.sl-content-title { display: inline-flex; align-items: baseline; gap: 10px; }
.sl-content-name { font-size: 14px; font-weight: 600; color: var(--fg, #1B1F24); letter-spacing: -0.005em; }
.sl-content-meta { font-size: 11px; color: var(--muted, #6B7280); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 500; }

/* View toggle */
.sl-view-toggle {
  display: inline-flex; padding: 3px; gap: 2px;
  background: var(--group-bg, #F6F7F9); border: 1px solid var(--group-border, #E6E8EC);
  border-radius: 8px;
}
.sl-view-btn {
  appearance: none; border: none; background: transparent;
  width: 26px; height: 24px; border-radius: 5px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--muted, #6B7280); cursor: pointer;
  transition: background 0.12s, color 0.12s, box-shadow 0.12s;
}
.sl-view-btn:hover { color: var(--fg, #1B1F24); }
.sl-view-btn.is-active {
  background: var(--sl-modal-bg, #FFF); color: var(--fg, #1B1F24);
  box-shadow: var(--sl-tab-shadow, 0 1px 2px rgba(0,0,0,.06));
}
.sl-view-btn svg { display: block; }

/* Shapes area (scrollable) */
.sl-shapes-area { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }

/* Grid view */
.sl-grid-body {
  display: grid; grid-template-columns: repeat(8, 1fr);
  gap: 6px; padding: 6px 18px 18px; align-content: start;
}
.sl-tile {
  appearance: none; border: 1px solid transparent;
  background: transparent; border-radius: 10px; padding: 10px 4px 6px;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  cursor: pointer; color: var(--fg, #1B1F24); font-family: inherit;
  transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
}
.sl-tile:hover { background: var(--icon-hover-bg, #EEF1F5); border-color: var(--chrome-border, #E6E8EC); }
.sl-tile:hover .sl-tile-icon { color: var(--sl-shape-hover, #0F172A); transform: scale(1.05); }
.sl-tile.is-selected {
  background: var(--accent-soft, #E8EFFF); border-color: var(--accent-border, #C7D7FF);
  box-shadow: 0 0 0 1px var(--accent, #2962FF) inset, var(--sl-tile-shadow, 0 2px 6px rgba(41,98,255,.12));
}
.sl-tile.is-selected .sl-tile-icon { color: var(--accent, #2962FF); }
.sl-tile.is-selected .sl-tile-name { color: var(--accent, #2962FF); }
.sl-tile-icon {
  width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center;
  color: var(--sl-shape, #4B5563);
  transition: color 0.12s, transform 0.12s;
}
.sl-tile-icon svg { display: block; }
.sl-tile-name {
  font-size: 10.5px; font-weight: 500; color: var(--muted, #6B7280);
  letter-spacing: -0.002em; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; max-width: 100%; text-align: center;
}

/* List view */
.sl-list-body {
  display: flex; flex-direction: column; gap: 1px;
  padding: 4px 14px 18px;
}
.sl-row {
  appearance: none; border: 1px solid transparent; background: transparent;
  display: flex; align-items: center; gap: 12px; height: 40px;
  padding: 0 12px; border-radius: 8px; cursor: pointer; text-align: left;
  font-family: inherit;
  transition: background 0.12s, border-color 0.12s;
}
.sl-row:hover { background: var(--icon-hover-bg, #EEF1F5); }
.sl-row.is-selected { background: var(--accent-soft, #E8EFFF); border-color: var(--accent-border, #C7D7FF); }
.sl-row.is-selected .sl-row-icon { color: var(--accent, #2962FF); }
.sl-row.is-selected .sl-row-name { color: var(--accent, #2962FF); }
.sl-row-icon {
  width: 24px; height: 24px; color: var(--sl-shape, #4B5563);
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.sl-row-icon svg { display: block; }
.sl-row-name { flex: 1; font-size: 13px; font-weight: 500; color: var(--fg, #1B1F24); }
.sl-row-id { font-size: 11.5px; color: var(--muted, #6B7280); font-variant-numeric: tabular-nums; font-family: ui-monospace, monospace; }

/* Search groups */
.sl-search-group { padding: 0 18px; }
.sl-search-group-label {
  font-size: 11px; font-weight: 600; color: var(--muted, #6B7280);
  text-transform: uppercase; letter-spacing: 0.06em;
  padding: 12px 0 4px;
  border-top: 1px solid var(--chrome-border, #E6E8EC);
  margin-top: 4px;
}
.sl-search-group:first-child .sl-search-group-label { border-top: none; margin-top: 8px; }
.sl-grid-inline { padding: 0 0 8px; }
.sl-list-inline { padding: 0 0 8px; }

/* Empty / loading states */
.sl-empty { padding: 40px 24px; text-align: center; font-size: 13px; color: var(--muted, #6B7280); }
.sl-loading { padding: 40px 24px; text-align: center; font-size: 13px; color: var(--muted, #6B7280); }

/* ── Modal footer ────────────────────────────────────────────────────────── */
.sl-foot {
  height: 64px; flex: 0 0 64px;
  padding: 0 16px 0 14px;
  background: var(--sl-head-bg, #FAFBFC);
  border-top: 1px solid var(--chrome-border, #E6E8EC);
  display: flex; align-items: center; gap: 10px;
}
.sl-foot-status {
  display: inline-flex; align-items: center; gap: 10px;
  height: 40px; padding: 0 10px;
  background: var(--sl-modal-bg, #FFF); border: 1px solid var(--chrome-border, #E6E8EC);
  border-radius: 10px;
}
.sl-foot-chip {
  width: 28px; height: 28px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--accent, #2962FF); background: var(--accent-soft, #E8EFFF);
  border-radius: 7px; flex-shrink: 0;
}
.sl-foot-chip svg { display: block; }
.sl-foot-meta { display: flex; flex-direction: column; line-height: 1.15; }
.sl-foot-name { font-size: 13px; font-weight: 600; color: var(--fg, #1B1F24); letter-spacing: -0.005em; }
.sl-foot-path { font-size: 11px; color: var(--muted, #6B7280); font-family: ui-monospace, monospace; }
.sl-foot-empty { font-size: 13px; color: var(--muted, #6B7280); padding: 0 4px; }
.sl-foot-spacer { flex: 1; }

.sl-action-btn {
  appearance: none; font-family: inherit; font-size: 13px; font-weight: 600;
  letter-spacing: -0.005em; height: 36px; padding: 0 16px; border-radius: 9px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s, box-shadow 0.12s, transform 0.05s;
}
.sl-action-ghost {
  background: var(--field-bg, #FFF); border: 1px solid var(--field-border, #DDE1E7);
  color: var(--fg, #1B1F24);
}
.sl-action-ghost:hover { background: var(--icon-hover-bg, #EEF1F5); border-color: var(--sl-field-hover, #B6BFCE); }
.sl-action-primary {
  background: var(--accent, #2962FF); border: 1px solid var(--accent, #2962FF);
  color: var(--sl-btn-primary-fg, #FFF);
  box-shadow: 0 1px 0 rgba(0,0,0,.08), 0 1px 2px var(--sl-btn-primary-shadow, rgba(41,98,255,.28));
}
.sl-action-primary:hover { filter: brightness(1.06); }
.sl-action-primary:active { transform: translateY(1px); }
.sl-action-primary:disabled { opacity: 0.5; cursor: not-allowed; filter: none; transform: none; }

/* Focus rings */
button:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--cp-focus-ring, rgba(41,98,255,.18)); }
input:focus { outline: none; }

/* ── User shape tile wrappers & three-dot menu ───────────────────────────── */
.sl-tile-wrap { position: relative; display: inline-flex; flex-direction: column; align-items: center; }
.sl-tile-user .sl-shape-menu {
  position: absolute; top: 2px; right: 2px;
  appearance: none; border: none; background: transparent;
  width: 20px; height: 20px; border-radius: 4px;
  font-size: 14px; line-height: 1;
  cursor: pointer; color: var(--muted, #6B7280);
  display: none; align-items: center; justify-content: center;
  padding: 0;
}
.sl-tile-wrap:hover .sl-shape-menu { display: flex; }
.sl-shape-menu:hover { background: var(--icon-hover-bg, #EEF1F5); color: var(--icon-hover, #0F172A); }

/* ── Shape removal dropdown ──────────────────────────────────────────────── */
.sl-shape-dropdown {
  position: absolute; z-index: 200; top: 0; left: 0;
  background: var(--sl-modal-bg, #FFF);
  border: 1px solid var(--chrome-border, #E6E8EC);
  border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,.12);
  padding: 4px 0; min-width: 160px;
}
.sl-shape-dropdown button {
  appearance: none; border: none; background: transparent;
  display: block; width: 100%; padding: 8px 14px;
  text-align: left; cursor: pointer; font-size: 12px; font-family: inherit;
  color: var(--fg, #1B1F24);
}
.sl-shape-dropdown button:hover { background: var(--icon-hover-bg, #EEF1F5); }
.sl-shape-dropdown .sl-remove { color: #DC2626; }
.sl-shape-dropdown .sl-menu-empty { color: var(--muted, #6B7280); cursor: default; }
.sl-shape-dropdown .sl-menu-empty:hover { background: transparent; }

/* ── Category wrapper & ⋮ menu (sidebar) ─────────────────────────────────── */
.sl-cat-wrap { position: relative; display: block; }
.sl-cat-menu {
  position: absolute; top: 50%; right: 6px; transform: translateY(-50%);
  appearance: none; border: none; background: transparent;
  width: 20px; height: 20px; border-radius: 4px;
  font-size: 14px; line-height: 1; cursor: pointer;
  color: var(--muted, #6B7280);
  display: none; align-items: center; justify-content: center; padding: 0;
}
.sl-cat-wrap:hover .sl-cat-menu { display: flex; }
.sl-cat-menu:hover { background: var(--icon-hover-bg, #EEF1F5); color: var(--icon-hover, #0F172A); }
/* Make room for the menu button (covers the count) on hover. */
.sl-cat-wrap:hover .sl-cat-count { opacity: 0; }

/* ── Inline rename input (hosted in a dropdown popover) ───────────────────── */
.sl-shape-dropdown.sl-rename-pop { padding: 6px; }
.sl-inline-edit {
  font: inherit; font-size: 12px;
  padding: 5px 8px; width: 100%; box-sizing: border-box;
  border: 1px solid var(--accent-border, #C7D7FF); border-radius: 5px;
  background: var(--field-bg, #FFF); color: var(--fg, #1B1F24);
  outline: none;
}
.sl-inline-edit:focus { border-color: var(--accent, #2962FF); }

/* ── Hidden-categories restore section ───────────────────────────────────── */
.sl-hidden-section { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--chrome-border, #E6E8EC); }
.sl-hidden-toggle {
  appearance: none; border: none; background: transparent;
  width: 100%; text-align: left; padding: 6px 12px;
  font: inherit; font-size: 11px; font-weight: 600;
  color: var(--muted, #6B7280); cursor: pointer;
}
.sl-hidden-toggle::before { content: '▸ '; }
.sl-hidden-toggle.is-open::before { content: '▾ '; }
.sl-hidden-toggle:hover { color: var(--fg, #1B1F24); }
.sl-hidden-row {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 12px; font-size: 12px; color: var(--fg, #1B1F24);
}
.sl-hidden-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sl-hidden-restore {
  appearance: none; border: 1px solid var(--field-border, #DDE1E7);
  background: var(--field-bg, #FFF); color: var(--accent, #2962FF);
  border-radius: 5px; padding: 2px 8px; font: inherit; font-size: 11px; cursor: pointer;
}
.sl-hidden-restore:hover { border-color: var(--accent-border, #C7D7FF); background: var(--accent-soft, #E8EFFF); }
`
