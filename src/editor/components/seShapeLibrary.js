/* globals svgEditor */
/**
 * SeShapeLibrary — <se-shape-library> web component.
 *
 * Modernized shape library: toolbar button → popover (quick pick) → modal
 * (full library with search, category sidebar, grid/list views).
 *
 * Attributes:
 *   lib    — URL prefix for the shape library JSON files (must end with /)
 *   src    — filename of the toolbar button icon (relative to imgPath)
 *   title  — tooltip for the toolbar button
 *
 * Events dispatched (bubbles, composed):
 *   shape-insert  — { detail: { draw, categoryId, shapeId } }
 *                    draw = SVG path data string; also sets this.dataset.draw
 */

import { fetchSvgEl } from './svgIconLoader.js'
import { loadUserShapes, removeUserShape } from '../extensions/ext-shapes/userShapes.js'

// Inlined shape library data (bundled at build time). Keyed by file basename
// without `.json` — e.g. `index`, `animal`, `arrow`. This removes the runtime
// fetch of `shapelib/*.json`; the `lib` attribute is still honoured as a
// fallback for custom external libraries.
const shapeLibModules = import.meta.glob('../extensions/ext-shapes/shapelib/*.json', { eager: true, import: 'default' })
const shapeLibData = {}
for (const [p, data] of Object.entries(shapeLibModules)) {
  shapeLibData[p.slice(p.lastIndexOf('/') + 1).replace(/\.json$/, '')] = data
}

// ── Category labels ─────────────────────────────────────────────────────────
const CAT_LABELS = {
  basic: 'Basic',
  animal: 'Animals',
  arrow: 'Arrows',
  dialog_balloon: 'Dialog balloons',
  electronics: 'Electronics',
  flowchart: 'Flowchart',
  game: 'Game',
  math: 'Math',
  misc: 'Miscellaneous',
  music: 'Music',
  object: 'Objects',
  raphael_1: 'Raphael · Set 1',
  raphael_2: 'Raphael · Set 2',
  symbol: 'Symbols'
}

// ── Icon SVG strings ─────────────────────────────────────────────────────────
const STAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M12 3.5l2.6 5.4 5.9.9-4.3 4.1 1 5.9L12 17l-5.2 2.8 1-5.9L3.5 9.8l5.9-.9z"/></svg>'
const STAR18 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M12 3.5l2.6 5.4 5.9.9-4.3 4.1 1 5.9L12 17l-5.2 2.8 1-5.9L3.5 9.8l5.9-.9z"/></svg>'
const SEARCH16 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.5-3.5"/></svg>'
const SEARCH13 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.5-3.5"/></svg>'
const CLOSE18 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="18" height="18"><path d="M6 6l12 12M18 6L6 18"/></svg>'
const CLOSE12 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" width="12" height="12"><path d="M6 6l12 12M18 6L6 18"/></svg>'
const GRID_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/></svg>'
const ROWS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><rect x="4" y="4" width="16" height="4" rx="1.2"/><rect x="4" y="10" width="16" height="4" rx="1.2"/><rect x="4" y="16" width="16" height="4" rx="1.2"/></svg>'

// ── Component CSS ────────────────────────────────────────────────────────────
const CSS = `
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
  position: absolute; z-index: 200; top: 100%; right: 0;
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
`

// ── Component class ──────────────────────────────────────────────────────────
export class SeShapeLibrary extends HTMLElement {
  constructor () {
    super()
    this._shadow = this.attachShadow({ mode: 'open' })

    // State
    this._open = null // null | 'popover' | 'modal'
    this._categoryId = 'basic'
    this._selectedId = null
    this._query = ''
    this._view = localStorage.getItem('svg-edit-shape-view') || 'grid'

    // Popover-specific state (doesn't persist into modal)
    this._popCatId = 'basic'
    this._popQuery = ''

    // Data
    this._libPath = ''
    this._categories = [] // ordered array of category ids (user: prefixed first)
    this._builtinCategories = [] // built-in category ids from index.json
    this._catalog = {} // { catId: { data: {id: path|shapeEntry}, size, fill, isUser, displayName } }
    this._userStore = { categories: [], shapes: {} } // cached user shapes data
    this._allLoaded = false

    // Timers / observers
    this._searchTimer = null
    this._themeObserver = null
    this._outsideClickHandler = null
    this._keyHandler = null
  }

  static get observedAttributes () {
    return ['lib', 'src', 'title', 'pressed']
  }

  attributeChangedCallback (name, oldValue, newValue) {
    if (oldValue === newValue) return
    if (name === 'lib') {
      this._libPath = newValue
      this._loadIndex()
    } else if (name === 'src') {
      this._loadIcon(newValue)
    } else if (name === 'title') {
      const btn = this._shadow.querySelector('.sl-tool')
      if (btn) btn.title = newValue
    } else if (name === 'pressed') {
      this._syncToolPressed()
    }
  }

  async _loadIcon (src) {
    if (!src) return
    const imgPath = svgEditor?.configObj?.curConfig?.imgPath
    if (!imgPath) return
    const url = `${imgPath}/${src}`
    const svgEl = await fetchSvgEl(url)
    const iconWrap = this._shadow.querySelector('.sl-tool-icon')
    if (iconWrap && svgEl) {
      svgEl.setAttribute('width', '22')
      svgEl.setAttribute('height', '22')
      iconWrap.replaceChildren(svgEl)
    }
  }

  connectedCallback () {
    this._renderShell()
    this._syncTheme()
    this._observeTheme()
    this.addEventListener('user-shapes-updated', () => this._reloadUserShapes())
  }

  disconnectedCallback () {
    this._themeObserver?.disconnect()
    this._removeGlobalListeners()
  }

  // ── Theme sync ─────────────────────────────────────────────────────────────
  _syncTheme () {
    const root = document.querySelector('.svg_editor')
    const isDark = root?.classList.contains('theme-dark')
    this.classList.toggle('theme-dark', !!isDark)
    this.classList.toggle('theme-light', !isDark)
  }

  _observeTheme () {
    const root = document.querySelector('.svg_editor')
    if (!root) return
    this._themeObserver = new MutationObserver(() => this._syncTheme())
    this._themeObserver.observe(root, { attributes: true, attributeFilter: ['class'] })
  }

  // ── Data loading ───────────────────────────────────────────────────────────
  async _loadIndex () {
    if (!this._libPath) return
    let json = shapeLibData.index
    if (!json) {
      try {
        const r = await fetch(`${this._libPath}index.json`)
        json = await r.json()
      } catch (e) {
        console.error('SeShapeLibrary: failed to load index', e)
        json = { lib: [] }
      }
    }
    this._builtinCategories = json.lib || []
    this._loadUserShapesIntoMemory()
    this._rebuildCategoryList()
    if (this._categories.length > 0) {
      const first = this._categories[0]
      await this._loadCategory(first)
      this._categoryId = first
      this._popCatId = first
    }
  }

  async _loadCategory (catId) {
    if (this._catalog[catId]) return this._catalog[catId]
    // User categories are already loaded in memory — no fetch needed
    if (catId.startsWith('user:')) return this._catalog[catId] || null
    let json = shapeLibData[catId]
    if (!json) {
      try {
        const r = await fetch(`${this._libPath}${catId}.json`)
        json = await r.json()
      } catch (e) {
        console.error(`SeShapeLibrary: failed to load category "${catId}"`, e)
        return null
      }
    }
    this._catalog[catId] = json
    // Inject any user shapes that belong to this built-in category
    const userShapes = this._userStore?.shapes?.[catId]
    if (userShapes) this._injectUserShapesIntoCatalog(catId, userShapes)
    return json
  }

  async _loadAllCategories () {
    if (this._allLoaded) return
    await Promise.all(this._categories.map(id => this._loadCategory(id)))
    this._allLoaded = true
  }

  // ── User shapes ────────────────────────────────────────────────────────────
  /** Read user shapes from localStorage and inject them into the catalog. */
  /**
   * Inject user shapes into a built-in catalog entry's data map.
   * User shape entries are objects { svgContent, bbox } — built-in shapes are strings —
   * so they are naturally distinguishable at render time.
   */
  _injectUserShapesIntoCatalog (catId, userShapes) {
    const cat = this._catalog[catId]
    if (!cat?.data) return
    // Remove any previously injected user shapes (objects), leave built-in strings intact
    for (const key of Object.keys(cat.data)) {
      if (typeof cat.data[key] === 'object') delete cat.data[key]
    }
    Object.assign(cat.data, userShapes)
  }

  _loadUserShapesIntoMemory () {
    this._userStore = loadUserShapes()
    for (const catId of this._userStore.categories) {
      const userShapes = this._userStore.shapes[catId] || {}
      if (this._builtinCategories.includes(catId)) {
        // Merge into the built-in catalog entry (if already fetched)
        this._injectUserShapesIntoCatalog(catId, userShapes)
      } else {
        // Purely custom category — keep as a standalone user: entry
        this._catalog[`user:${catId}`] = {
          data: userShapes,
          isUser: true,
          displayName: CAT_LABELS[catId] || (catId.charAt(0).toUpperCase() + catId.slice(1))
        }
      }
    }
  }

  /** Rebuild the merged category list: user categories first, then built-ins. */
  _rebuildCategoryList () {
    // Only add user: prefix entries for categories that have no matching built-in
    const customUserCats = this._userStore.categories
      .filter(c => !this._builtinCategories.includes(c))
      .map(c => `user:${c}`)
    this._categories = [
      ...customUserCats,
      ...this._builtinCategories
    ]
  }

  /** Re-read localStorage, update catalog, and re-render any open panel. */
  _reloadUserShapes () {
    // Remove stale purely-custom user catalog entries
    for (const key of Object.keys(this._catalog)) {
      if (key.startsWith('user:')) delete this._catalog[key]
    }
    // Clear user shapes previously merged into built-in catalog entries
    for (const catId of this._builtinCategories) {
      const cat = this._catalog[catId]
      if (cat?.data) {
        for (const key of Object.keys(cat.data)) {
          if (typeof cat.data[key] === 'object') delete cat.data[key]
        }
      }
    }
    this._loadUserShapesIntoMemory()
    this._rebuildCategoryList()

    // If the active category was removed, fall back to the first available
    if (this._categoryId?.startsWith('user:') && !this._categories.includes(this._categoryId)) {
      this._categoryId = this._categories[0] || 'basic'
    }
    if (this._popCatId?.startsWith('user:') && !this._categories.includes(this._popCatId)) {
      this._popCatId = this._categories[0] || 'basic'
    }

    if (this._open === 'popover') {
      this._renderPopover()
    } else if (this._open === 'modal') {
      this._renderModal()
    }
  }

  /**
   * Return the display label for a category id.
   * @param {string} id
   * @returns {string}
   */
  _catLabel (id) {
    if (this._catalog[id]?.isUser) return this._catalog[id].displayName
    return CAT_LABELS[id] || id
  }

  _countCategory (catId) {
    return Object.keys(this._catalog[catId]?.data ?? {}).length
  }

  _totalCount () {
    return Object.values(this._catalog).reduce((n, c) => n + Object.keys(c?.data ?? {}).length, 0)
  }

  // ── Shape thumbnail ────────────────────────────────────────────────────────
  _shapeThumb (path, catData, w, h) {
    const sz = catData?.size ?? 300
    const off = sz * 0.05
    const vb = `${-off} ${-off} ${sz + off * 2} ${sz + off * 2}`
    if (catData?.fill) {
      return `<svg viewBox="${vb}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="${path}"/></svg>`
    }
    const sw = (sz / 30).toFixed(1)
    return `<svg viewBox="${vb}" width="${w}" height="${h}" fill="none" xmlns="http://www.w3.org/2000/svg"><path stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" d="${path}"/></svg>`
  }

  /**
   * Generate an SVG thumbnail for a user-saved shape entry.
   * @param {{ svgContent: string, bbox: {x,y,width,height} }} shapeEntry
   * @param {number} w
   * @param {number} h
   * @returns {string} HTML string
   */
  _userShapeThumb (shapeEntry, w, h) {
    const { bbox, svgContent } = shapeEntry
    const m = Math.max(bbox.width, bbox.height) * 0.05
    const vb = `${bbox.x - m} ${bbox.y - m} ${bbox.width + m * 2} ${bbox.height + m * 2}`
    return `<svg viewBox="${vb}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`
  }

  // ── Shell render (once) ────────────────────────────────────────────────────
  _renderShell () {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(CSS)
    this._shadow.adoptedStyleSheets = [sheet]

    this._shadow.innerHTML = `
      <button class="sl-tool" type="button" title="${this._esc(this.getAttribute('title') || 'Shapes')}"
              aria-label="${this._esc(this.getAttribute('title') || 'Shapes')}">
        <span class="sl-tool-icon">${STAR_SVG}</span>
      </button>
      <div class="sl-popover" style="display:none" role="dialog" aria-label="Shapes"></div>
      <div class="sl-backdrop" style="display:none"></div>
      <div class="sl-modal" role="dialog" aria-modal="true" aria-label="Shape library" style="display:none"></div>
    `
    // Load the real icon if src was already set before connectedCallback
    const src = this.getAttribute('src')
    if (src) this._loadIcon(src)

    this._shadow.querySelector('.sl-tool').addEventListener('click', e => {
      e.stopPropagation()
      this._togglePopover()
    })
    this._shadow.querySelector('.sl-backdrop').addEventListener('click', () => this.close())
  }

  _syncToolPressed () {
    const btn = this._shadow.querySelector('.sl-tool')
    if (!btn) return
    btn.classList.toggle('pressed', !!this._open)
  }

  // ── Open / close ───────────────────────────────────────────────────────────
  async _togglePopover () {
    if (this._open === 'popover') { this.close(); return }
    this._open = 'popover'
    this._syncToolPressed()

    if (!this._catalog[this._popCatId] && this._libPath) {
      await this._loadCategory(this._popCatId)
    }
    this._renderPopover()
    const popover = this._shadow.querySelector('.sl-popover')
    popover.style.display = ''
    this._shadow.querySelector('.sl-modal').style.display = 'none'
    this._shadow.querySelector('.sl-backdrop').style.display = 'none'
    // Position after display is set so we can measure actual dimensions
    this._positionPopover(popover)
    this._attachOutsideClick()
    this._attachEscape()
  }

  _positionPopover (popover) {
    const btnRect = this.getBoundingClientRect()
    const popRect = popover.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const gap = 8

    // Prefer opening to the right of the button; flip left if it would overflow
    let left = btnRect.right + gap
    if (left + popRect.width > vw - gap) left = Math.max(gap, btnRect.left - gap - popRect.width)

    // Align top to button, clamp so bottom stays within viewport
    let top = Math.max(gap, btnRect.top)
    if (top + popRect.height > vh - gap) top = Math.max(gap, vh - gap - popRect.height)

    popover.style.left = `${left}px`
    popover.style.top = `${top}px`
  }

  async _openModal () {
    this._open = 'modal'
    this._syncToolPressed()

    if (!this._catalog[this._categoryId] && this._libPath) {
      await this._loadCategory(this._categoryId)
    }
    this._renderModal()
    this._shadow.querySelector('.sl-popover').style.display = 'none'
    this._shadow.querySelector('.sl-modal').style.display = ''
    this._shadow.querySelector('.sl-backdrop').style.display = ''
    this._removeGlobalListeners()
    this._attachEscape()

    requestAnimationFrame(() => {
      this._shadow.querySelector('.sl-search input')?.focus()
    })
  }

  close () {
    this._open = null
    this._query = ''
    this._selectedId = null
    this._syncToolPressed()
    this._shadow.querySelector('.sl-popover').style.display = 'none'
    this._shadow.querySelector('.sl-modal').style.display = 'none'
    this._shadow.querySelector('.sl-backdrop').style.display = 'none'
    this._removeGlobalListeners()
  }

  _removeGlobalListeners () {
    if (this._outsideClickHandler) {
      document.removeEventListener('click', this._outsideClickHandler, true)
      this._outsideClickHandler = null
    }
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler)
      this._keyHandler = null
    }
  }

  _attachOutsideClick () {
    this._outsideClickHandler = e => {
      const path = e.composedPath()
      if (!path.includes(this) && !path.some(el => el.classList?.contains('sl-popover'))) {
        this.close()
      }
    }
    setTimeout(() => document.addEventListener('click', this._outsideClickHandler, true), 0)
  }

  _attachEscape () {
    this._keyHandler = e => {
      if (e.key !== 'Escape') return
      if (this._open === 'modal' && this._query) {
        // First Esc clears search
        this._query = ''
        const input = this._shadow.querySelector('.sl-search input')
        if (input) input.value = ''
        this._updateShapesArea()
        this._updateFooter()
        this._updateSearchClear()
      } else {
        this.close()
      }
    }
    document.addEventListener('keydown', this._keyHandler)
  }

  // ── Insert ─────────────────────────────────────────────────────────────────
  _doInsert () {
    if (!this._selectedId) return
    const cat = this._catalog[this._categoryId]
    if (!cat) return
    const shapeData = cat.data[this._selectedId]
    if (!shapeData) return

    const isUser = shapeData !== null && typeof shapeData === 'object' && 'svgContent' in shapeData
    if (isUser) {
      // User shape: shapeData = { svgContent, bbox }
      delete this.dataset.draw
      this.dispatchEvent(new CustomEvent('shape-insert', {
        bubbles: true,
        composed: true,
        detail: {
          isUserShape: true,
          svgContent: shapeData.svgContent,
          bbox: shapeData.bbox,
          linkedFile: shapeData.linkedFile,
          categoryId: this._categoryId,
          shapeId: this._selectedId
        }
      }))
    } else {
      // Built-in shape: shapeData is the path 'd' string
      this.dataset.draw = shapeData
      this.dispatchEvent(new CustomEvent('shape-insert', {
        bubbles: true,
        composed: true,
        detail: { draw: shapeData, categoryId: this._categoryId, shapeId: this._selectedId }
      }))
    }
    this.close()
  }

  // ── Popover render ─────────────────────────────────────────────────────────
  _renderPopover () {
    const popover = this._shadow.querySelector('.sl-popover')
    const cat = this._catalog[this._popCatId]
    const all = cat ? Object.entries(cat.data) : []
    const q = this._popQuery.toLowerCase()
    const shapes = q
      ? all.filter(([id]) => id.toLowerCase().includes(q) || this._fmtName(id).toLowerCase().includes(q))
      : all.slice(0, 24)

    const visibleCats = this._categories.slice(0, 7)
    const total = this._totalCount()

    popover.innerHTML = `
      <header class="sl-pop-head">
        <span class="sl-pop-title">Shapes</span>
        <div class="sl-pop-search-box">
          <span class="sl-pop-search-icon">${SEARCH13}</span>
          <input type="text" placeholder="Filter…" value="${this._escAttr(this._popQuery)}"
                 aria-label="Filter shapes" autocomplete="off" spellcheck="false">
        </div>
      </header>
      <div class="sl-pop-cats">
        ${visibleCats.map(id => `
          <button class="sl-pop-cat${id === this._popCatId ? ' is-active' : ''}" data-cat="${id}">
            ${this._esc(this._catLabel(id))}
          </button>`).join('')}
        <button class="sl-pop-cat sl-pop-cat-more" data-more>More…</button>
      </div>
      <div class="sl-pop-grid">
        ${shapes.map(([id, shapeData]) => {
          const isUserShape = shapeData !== null && typeof shapeData === 'object' && 'svgContent' in shapeData
          const thumb = isUserShape
            ? this._userShapeThumb(shapeData, 26, 26)
            : this._shapeThumb(shapeData, cat, 26, 26)
          const label = isUserShape ? id : this._fmtName(id)
          return `
          <button class="sl-chip${id === this._selectedId ? ' is-selected' : ''}"
                  data-id="${this._escAttr(id)}" title="${this._escAttr(label)}">
            ${thumb}
          </button>`
        }).join('')}
      </div>
      <footer class="sl-pop-foot">
        <span class="sl-pop-hint">Click a shape, then draw on canvas to size it.</span>
        <button class="sl-pop-browse">Browse all${total ? ` ${total}` : ''} →</button>
      </footer>
    `

    // Events
    popover.querySelectorAll('.sl-pop-cat[data-cat]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation()
        const id = btn.dataset.cat
        this._popCatId = id
        if (!this._catalog[id]) await this._loadCategory(id)
        this._selectedId = null
        this._renderPopover()
      })
    })

    popover.querySelector('[data-more]')?.addEventListener('click', e => {
      e.stopPropagation()
      this._categoryId = this._popCatId
      this._openModal()
    })

    popover.querySelectorAll('.sl-chip[data-id]').forEach(chip => {
      chip.addEventListener('click', e => {
        e.stopPropagation()
        this._categoryId = this._popCatId
        this._selectedId = chip.dataset.id
        this._doInsert()
      })
    })

    const filterInput = popover.querySelector('.sl-pop-search-box input')
    filterInput?.addEventListener('input', () => {
      clearTimeout(this._searchTimer)
      this._searchTimer = setTimeout(() => {
        this._popQuery = filterInput.value
        this._renderPopover()
        this._shadow.querySelector('.sl-pop-search-box input')?.focus()
      }, 200)
    })

    popover.querySelector('.sl-pop-browse')?.addEventListener('click', e => {
      e.stopPropagation()
      this._categoryId = this._popCatId
      this._openModal()
    })
  }

  // ── Modal render ───────────────────────────────────────────────────────────
  _renderModal () {
    const modal = this._shadow.querySelector('.sl-modal')
    const total = this._totalCount()
    const placeholder = total ? `Search ${total} shapes…` : 'Search shapes…'

    modal.innerHTML = `
      <header class="sl-head">
        <div class="sl-head-title">
          <span class="sl-head-icon">${STAR18}</span>
          <span>Shape library</span>
        </div>
        <div class="sl-search-wrap">
          <div class="sl-search">
            <span class="sl-search-icon">${SEARCH16}</span>
            <input type="text" placeholder="${this._escAttr(placeholder)}"
                   value="${this._escAttr(this._query)}"
                   aria-label="Search shapes" autocomplete="off" spellcheck="false">
            ${this._query ? `<button class="sl-search-clear" type="button" aria-label="Clear search">${CLOSE12}</button>` : ''}
          </div>
        </div>
        <button class="sl-head-close" type="button" aria-label="Close shape library">${CLOSE18}</button>
      </header>

      <div class="sl-body">
        <aside class="sl-side">
          <nav class="sl-side-cats" aria-label="Shape categories">
            ${this._categories.map(id => `
              <button class="sl-cat${id === this._categoryId ? ' is-active' : ''}" data-cat="${id}">
                <span class="sl-cat-label">${this._esc(this._catLabel(id))}</span>
                <span class="sl-cat-count">${this._countCategory(id)}</span>
              </button>`).join('')}
          </nav>
        </aside>
        <div class="sl-divider" aria-hidden="true"></div>
        <section class="sl-content">
          <header class="sl-content-head">
            <div class="sl-content-title">
              <span class="sl-content-name">${this._esc(this._catLabel(this._categoryId))}</span>
              <span class="sl-content-meta">${this._countCategory(this._categoryId)} shapes</span>
            </div>
            <div class="sl-view-toggle" role="group" aria-label="View mode">
              <button class="sl-view-btn${this._view === 'grid' ? ' is-active' : ''}" data-view="grid" title="Grid view" aria-label="Grid view">${GRID_SVG}</button>
              <button class="sl-view-btn${this._view === 'rows' ? ' is-active' : ''}" data-view="rows" title="List view" aria-label="List view">${ROWS_SVG}</button>
            </div>
          </header>
          <div class="sl-shapes-area" id="sl-shapes-area">
            ${this._buildShapesArea()}
          </div>
        </section>
      </div>

      ${this._buildFooter()}
    `

    this._bindModalEvents()
  }

  _buildShapesArea () {
    if (this._query) {
      return this._buildSearchResults()
    }
    const cat = this._catalog[this._categoryId]
    if (!cat) return '<div class="sl-loading">Loading…</div>'

    const shapes = Object.entries(cat.data)
    if (this._view === 'grid') {
      return `<div class="sl-grid-body">${shapes.map(([id, p]) => this._tileHtml(id, p, cat, this._categoryId)).join('')}</div>`
    }
    return `<div class="sl-list-body">${shapes.map(([id, p]) => this._rowHtml(id, p, cat, this._categoryId)).join('')}</div>`
  }

  _buildSearchResults () {
    const q = this._query.toLowerCase()
    const groups = []
    for (const catId of this._categories) {
      const cat = this._catalog[catId]
      if (!cat) continue
      const hits = Object.entries(cat.data).filter(([id]) =>
        id.toLowerCase().includes(q) || this._fmtName(id).toLowerCase().includes(q)
      )
      if (hits.length) groups.push({ catId, cat, hits })
    }
    if (!groups.length) return `<div class="sl-empty">No shapes found for &ldquo;${this._esc(this._query)}&rdquo;</div>`

    if (this._view === 'grid') {
      return groups.map(({ catId, cat, hits }) => `
        <div class="sl-search-group">
          <div class="sl-search-group-label">${this._esc(this._catLabel(catId))}</div>
          <div class="sl-grid-body sl-grid-inline">
            ${hits.map(([id, p]) => this._tileHtml(id, p, cat, catId)).join('')}
          </div>
        </div>`).join('')
    }
    return groups.map(({ catId, cat, hits }) => `
      <div class="sl-search-group">
        <div class="sl-search-group-label">${this._esc(CAT_LABELS[catId] || catId)}</div>
        <div class="sl-list-body sl-list-inline">
          ${hits.map(([id, p]) => this._rowHtml(id, p, cat, catId)).join('')}
        </div>
      </div>`).join('')
  }

  _tileHtml (id, shapeData, cat, catId) {
    const sel = id === this._selectedId && catId === this._categoryId
    // User shapes are objects { svgContent, bbox }; built-in shapes are path strings
    const isUser = shapeData !== null && typeof shapeData === 'object' && 'svgContent' in shapeData
    const thumb = isUser
      ? this._userShapeThumb(shapeData, 40, 40)
      : this._shapeThumb(shapeData, cat, 40, 40)
    const label = isUser ? id : this._fmtName(id)
    const menuBtn = isUser
      ? `<button class="sl-shape-menu" data-cat="${this._escAttr(catId)}" data-id="${this._escAttr(id)}"
                 aria-label="Shape options" title="Options" type="button">⋮</button>`
      : ''
    return `
      <div class="sl-tile-wrap${isUser ? ' sl-tile-user' : ''}">
        <button class="sl-tile${sel ? ' is-selected' : ''}"
                data-id="${this._escAttr(id)}" data-cat="${catId}"
                title="${this._escAttr(label)}">
          <span class="sl-tile-icon">${thumb}</span>
          <span class="sl-tile-name">${this._esc(label)}</span>
        </button>
        ${menuBtn}
      </div>`
  }

  _rowHtml (id, shapeData, cat, catId) {
    const sel = id === this._selectedId && catId === this._categoryId
    const isUser = shapeData !== null && typeof shapeData === 'object' && 'svgContent' in shapeData
    const thumb = isUser
      ? this._userShapeThumb(shapeData, 24, 24)
      : this._shapeThumb(shapeData, cat, 24, 24)
    const label = isUser ? id : this._fmtName(id)
    const menuBtn = isUser
      ? `<button class="sl-shape-menu" data-cat="${this._escAttr(catId)}" data-id="${this._escAttr(id)}"
                 aria-label="Shape options" title="Options" type="button">⋮</button>`
      : ''
    return `
      <div class="sl-tile-wrap${isUser ? ' sl-tile-user' : ''}">
        <button class="sl-row${sel ? ' is-selected' : ''}"
                data-id="${this._escAttr(id)}" data-cat="${catId}">
          <span class="sl-row-icon">${thumb}</span>
          <span class="sl-row-name">${this._esc(label)}</span>
          <span class="sl-row-id">${this._esc(catId)} / ${this._esc(id)}</span>
        </button>
        ${menuBtn}
      </div>`
  }

  _buildFooter () {
    const cat = this._selectedId ? this._catalog[this._categoryId] : null
    const shapeData = cat?.data?.[this._selectedId]
    const isUser = shapeData !== null && typeof shapeData === 'object' && 'svgContent' in shapeData
    let footChip = ''
    let footMeta = ''
    if (this._selectedId && shapeData) {
      const thumb = isUser
        ? this._userShapeThumb(shapeData, 22, 22)
        : this._shapeThumb(shapeData, cat, 22, 22)
      const label = isUser ? this._selectedId : this._fmtName(this._selectedId)
      footChip = `<span class="sl-foot-chip">${thumb}</span>`
      footMeta = `
        <span class="sl-foot-meta">
          <span class="sl-foot-name">${this._esc(label)}</span>
          <span class="sl-foot-path">${this._esc(this._categoryId)} / ${this._esc(this._selectedId)}</span>
        </span>`
    }
    return `
      <footer class="sl-foot">
        <div class="sl-foot-status">
          ${this._selectedId && shapeData
? `${footChip}${footMeta}`
: `
            <span class="sl-foot-empty">Select a shape</span>`}
        </div>
        <span class="sl-foot-spacer"></span>
        <button class="sl-action-btn sl-action-ghost" data-action="cancel">Cancel</button>
        <button class="sl-action-btn sl-action-primary" data-action="insert"${this._selectedId ? '' : ' disabled'}>Insert shape</button>
      </footer>`
  }

  _bindModalEvents () {
    const modal = this._shadow.querySelector('.sl-modal')

    modal.querySelector('.sl-head-close')?.addEventListener('click', () => this.close())
    modal.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.close())
    modal.querySelector('[data-action="insert"]')?.addEventListener('click', () => this._doInsert())

    // Category sidebar
    modal.querySelectorAll('.sl-cat[data-cat]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.cat
        if (id === this._categoryId && !this._query) return
        this._categoryId = id
        this._selectedId = null
        this._query = ''
        const searchInput = modal.querySelector('.sl-search input')
        if (searchInput) searchInput.value = ''
        if (!this._catalog[id]) await this._loadCategory(id)
        this._refreshModalContent()
      })
    })

    // View toggle
    modal.querySelectorAll('.sl-view-btn[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._view = btn.dataset.view
        localStorage.setItem('svg-edit-shape-view', this._view)
        modal.querySelectorAll('.sl-view-btn').forEach(b => b.classList.toggle('is-active', b === btn))
        this._updateShapesArea()
      })
    })

    // Shape selection (delegated via shapes area)
    this._bindShapeButtons()

    // Search field
    const searchWrap = modal.querySelector('.sl-search')
    const searchInput = modal.querySelector('.sl-search input')
    searchInput?.addEventListener('focus', () => searchWrap?.classList.add('focused'))
    searchInput?.addEventListener('blur', () => searchWrap?.classList.remove('focused'))
    searchInput?.addEventListener('input', () => {
      clearTimeout(this._searchTimer)
      this._searchTimer = setTimeout(async () => {
        const q = searchInput.value.trim()
        if (q && !this._allLoaded) await this._loadAllCategories()
        this._query = q
        this._selectedId = null
        this._updateShapesArea()
        this._updateFooter()
        this._updateSearchClear()
      }, 200)
    })

    modal.querySelector('.sl-search-clear')?.addEventListener('click', () => {
      this._query = ''
      if (searchInput) searchInput.value = ''
      this._updateShapesArea()
      this._updateFooter()
      this._updateSearchClear()
      searchInput?.focus()
    })

    modal.addEventListener('keydown', e => {
      if (e.key === 'Enter' && this._selectedId) { e.preventDefault(); this._doInsert() }
    })
  }

  _bindShapeButtons () {
    const area = this._shadow.querySelector('#sl-shapes-area')
    if (!area) return
    area.querySelectorAll('.sl-tile[data-id], .sl-row[data-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.cat) this._categoryId = btn.dataset.cat
        this._selectedId = btn.dataset.id
        this._refreshSelectedState()
        this._updateFooter()
      })
      btn.addEventListener('dblclick', () => {
        if (btn.dataset.cat) this._categoryId = btn.dataset.cat
        this._selectedId = btn.dataset.id
        this._doInsert()
      })
    })

    // Three-dot menu for user shapes
    area.querySelectorAll('.sl-shape-menu').forEach(menuBtn => {
      menuBtn.addEventListener('click', e => {
        e.stopPropagation()
        // Close any open dropdown
        area.querySelectorAll('.sl-shape-dropdown').forEach(d => d.remove())

        const wrap = menuBtn.closest('.sl-tile-wrap')
        const dropdown = document.createElement('div')
        dropdown.className = 'sl-shape-dropdown'
        dropdown.innerHTML = '<button class="sl-remove">Remove from library</button>'
        wrap.appendChild(dropdown)

        dropdown.querySelector('.sl-remove').addEventListener('click', ev => {
          ev.stopPropagation()
          dropdown.remove()
          const rawCat = menuBtn.dataset.cat.replace(/^user:/, '')
          removeUserShape({ category: rawCat, label: menuBtn.dataset.id })
          this._reloadUserShapes()
        })

        // Close on outside click
        const closeDropdown = ev => {
          if (!dropdown.contains(ev.target)) {
            dropdown.remove()
            document.removeEventListener('click', closeDropdown, true)
          }
        }
        setTimeout(() => document.addEventListener('click', closeDropdown, true), 0)
      })
    })
  }

  // ── Targeted DOM updates (avoid full re-render) ────────────────────────────
  _refreshSelectedState () {
    const area = this._shadow.querySelector('#sl-shapes-area')
    if (!area) return
    area.querySelectorAll('.sl-tile, .sl-row').forEach(btn => {
      const sel = btn.dataset.id === this._selectedId && btn.dataset.cat === this._categoryId
      btn.classList.toggle('is-selected', sel)
    })
  }

  _updateShapesArea () {
    const area = this._shadow.querySelector('#sl-shapes-area')
    if (!area) return
    area.innerHTML = this._buildShapesArea()
    this._bindShapeButtons()
  }

  _updateFooter () {
    const foot = this._shadow.querySelector('.sl-foot')
    if (!foot) return
    const tmp = document.createElement('template')
    tmp.innerHTML = this._buildFooter()
    const newFoot = tmp.content.firstElementChild
    foot.replaceWith(newFoot)
    this._shadow.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.close())
    this._shadow.querySelector('[data-action="insert"]')?.addEventListener('click', () => this._doInsert())
  }

  _updateSearchClear () {
    const wrap = this._shadow.querySelector('.sl-search')
    if (!wrap) return
    const existing = wrap.querySelector('.sl-search-clear')
    if (this._query && !existing) {
      const btn = document.createElement('button')
      btn.className = 'sl-search-clear'
      btn.type = 'button'
      btn.setAttribute('aria-label', 'Clear search')
      btn.innerHTML = CLOSE12
      btn.addEventListener('click', () => {
        this._query = ''
        const inp = wrap.querySelector('input')
        if (inp) inp.value = ''
        this._updateShapesArea()
        this._updateFooter()
        this._updateSearchClear()
        inp?.focus()
      })
      wrap.appendChild(btn)
    } else if (!this._query && existing) {
      existing.remove()
    }
  }

  _refreshModalContent () {
    const modal = this._shadow.querySelector('.sl-modal')
    if (!modal) return

    // Sync category active states
    modal.querySelectorAll('.sl-cat[data-cat]').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.cat === this._categoryId)
    })

    // Update section header
    const nameEl = modal.querySelector('.sl-content-name')
    const metaEl = modal.querySelector('.sl-content-meta')
    if (nameEl) nameEl.textContent = this._catLabel(this._categoryId)
    if (metaEl) metaEl.textContent = `${this._countCategory(this._categoryId)} shapes`

    this._updateShapesArea()
    this._updateFooter()
    this._updateSearchClear()
  }

  // ── Utilities ──────────────────────────────────────────────────────────────
  _fmtName (id) {
    return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  _esc (str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  _escAttr (str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  /**
   * Returns the built-in category list as { id, label } pairs.
   * Used by the "Add to Shape Library" dialog to populate the category dropdown.
   * May return [] if the index hasn't been loaded yet (library not yet opened).
   * @returns {{ id: string, label: string }[]}
   */
  getBuiltinCategoryOptions () {
    return this._builtinCategories.map(id => ({ id, label: CAT_LABELS[id] || id }))
  }
}

if (!customElements.get('se-shape-library')) {
  customElements.define('se-shape-library', SeShapeLibrary)
}
