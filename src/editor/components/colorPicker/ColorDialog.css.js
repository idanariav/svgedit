/**
 * ColorDialog.css.js — all styles for the <se-color-dialog> shadow DOM.
 * CSS variables are self-contained here so the dialog works wherever it's appended.
 */

export const css = /* css */`
  /* ── Host positioning ──────────────────────────────────────────────────── */
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

  /* ── Light tokens (default) ─────────────────────────────────────────────── */
  :host {
    --cp-modal-bg:           #FFFFFF;
    --cp-head-bg:            #FAFBFC;
    --cp-stage-bg:           #ECEEF2;
    --cp-backdrop:           rgba(20, 24, 35, 0.06);
    --cp-field-hover:        #B6BFCE;
    --cp-focus-ring:         rgba(41, 98, 255, 0.18);
    --cp-tab-shadow:         0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px rgba(20,24,35,0.04);
    --cp-stop-ring:          rgba(20, 24, 35, 0.30);
    --cp-danger:             #E11D48;
    --cp-danger-bg:          #FEE9EE;
    --cp-btn-primary-fg:     #FFFFFF;
    --cp-btn-primary-shadow: rgba(41, 98, 255, 0.28);
    --cp-dial-bg:            #F4F5F7;
    --cp-dial-border:        #DDE1E7;
    --cp-dial-tick:          #B6BFCE;
    --cp-swatch-bg:          #FFFFFF;
    --cp-swatch-border:      #C3C8D1;
    --cp-swatch-inset:       rgba(0, 0, 0, 0.18);
    --cp-checker:            rgba(0, 0, 0, 0.07);
    /* Light theme base tokens (mirrored from .theme-light) */
    --fg:            #1B1F24;
    --muted:         #6B7280;
    --icon:          #4B5563;
    --icon-hover:    #0F172A;
    --icon-hover-bg: #EEF1F5;
    --accent:        #2962FF;
    --accent-soft:   #E8EFFF;
    --accent-border: #C7D7FF;
    --chrome-border: #E6E8EC;
    --group-bg:      #F6F7F9;
    --group-border:  #E6E8EC;
    --field-bg:      #FFFFFF;
    --field-border:  #DDE1E7;
    --swatch-bg:     #FFFFFF;
    --swatch-border: #C3C8D1;
    --checker:       rgba(0,0,0,0.07);
  }

  /* ── Dark token overrides ───────────────────────────────────────────────── */
  :host(.theme-dark) {
    --cp-modal-bg:           #22252C;
    --cp-head-bg:            #1E2026;
    --cp-stage-bg:           #0F1115;
    --cp-backdrop:           rgba(0, 0, 0, 0.5);
    --cp-field-hover:        #4B5160;
    --cp-focus-ring:         rgba(246, 178, 58, 0.22);
    --cp-tab-shadow:         0 1px 2px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04);
    --cp-stop-ring:          rgba(0, 0, 0, 0.6);
    --cp-danger:             #FB7185;
    --cp-danger-bg:          #3A1A22;
    --cp-btn-primary-fg:     #1A1208;
    --cp-btn-primary-shadow: rgba(246, 178, 58, 0.30);
    --cp-dial-bg:            #1A1C22;
    --cp-dial-border:        #353944;
    --cp-dial-tick:          #4B5160;
    --cp-swatch-bg:          #2F333C;
    --cp-swatch-border:      #6A7180;
    --cp-swatch-inset:       rgba(255, 255, 255, 0.22);
    --cp-checker:            rgba(255, 255, 255, 0.06);
    /* Dark theme base tokens */
    --fg:            #ECEEF2;
    --muted:         #9098A5;
    --icon:          #B7BDC8;
    --icon-hover:    #FFFFFF;
    --icon-hover-bg: #2A2D35;
    --accent:        #F6B23A;
    --accent-soft:   #3A2E18;
    --accent-border: #5A4422;
    --chrome-border: #2C2F37;
    --group-bg:      #181A20;
    --group-border:  #2C2F37;
    --field-bg:      #14161A;
    --field-border:  #2C2F37;
    --swatch-bg:     #2F333C;
    --swatch-border: #6A7180;
    --checker:       rgba(255,255,255,0.06);
  }

  /* ── Backdrop ───────────────────────────────────────────────────────────── */
  .cp-backdrop {
    position: absolute;
    inset: 0;
    background: var(--cp-backdrop);
    backdrop-filter: blur(2px);
  }

  /* ── Modal frame ────────────────────────────────────────────────────────── */
  .cp-modal {
    position: relative;
    width: 880px;
    max-width: calc(100vw - 48px);
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    background: var(--cp-modal-bg);
    border: 1px solid var(--chrome-border);
    border-radius: 16px;
    box-shadow:
      0 1px 2px rgba(0,0,0,0.06),
      0 20px 60px -10px rgba(0,0,0,0.18),
      0 40px 100px -40px rgba(0,0,0,0.30);
    display: flex;
    flex-direction: column;
  }
  :host(.theme-dark) .cp-modal {
    box-shadow:
      0 1px 2px rgba(0,0,0,0.4),
      0 20px 60px -10px rgba(0,0,0,0.6),
      0 40px 100px -40px rgba(0,0,0,0.8);
  }

  /* ── Header ─────────────────────────────────────────────────────────────── */
  .cp-head {
    height: 56px;
    flex: 0 0 56px;
    padding: 0 18px 0 22px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--chrome-border);
    background: var(--cp-head-bg);
    border-radius: 16px 16px 0 0;
  }
  .cp-head-title {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    font-size: 15px;
  }
  .cp-head-pre { color: var(--muted); font-weight: 400; }
  .cp-head-target { font-weight: 600; color: var(--fg); }
  .cp-head-close {
    width: 32px; height: 32px;
    background: transparent; border: none;
    border-radius: 8px;
    color: var(--icon);
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .cp-head-close svg { width: 18px; height: 18px; }
  .cp-head-close:hover { background: var(--icon-hover-bg); color: var(--icon-hover); }

  /* ── Tabs row ───────────────────────────────────────────────────────────── */
  .cp-tabsrow {
    padding: 14px 22px 0;
    background: var(--cp-modal-bg);
    display: flex;
    align-items: center;
  }

  /* ── Eyedropper pick button ─────────────────────────────────────────────── */
  .cp-eyedropper {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--field-border);
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    color: var(--icon);
    flex-shrink: 0;
    margin-left: auto;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .cp-eyedropper:hover {
    background: var(--icon-hover-bg);
    color: var(--icon-hover);
    border-color: var(--cp-field-hover);
  }
  .cp-eyedropper svg { width: 15px; height: 15px; }
  .cp-tabs {
    display: inline-flex;
    padding: 4px;
    background: var(--group-bg);
    border: 1px solid var(--group-border);
    border-radius: 12px;
    gap: 2px;
  }
  .cp-tab {
    appearance: none; border: none;
    background: transparent;
    color: var(--muted);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    padding: 7px 14px;
    border-radius: 9px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s, box-shadow 0.15s;
  }
  .cp-tab:hover { color: var(--fg); }
  .cp-tab.is-active {
    background: var(--cp-modal-bg);
    color: var(--fg);
    box-shadow: var(--cp-tab-shadow);
  }

  /* ── Body slot ──────────────────────────────────────────────────────────── */
  .cp-body-slot {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  /* ── Body layouts ───────────────────────────────────────────────────────── */
  .cp-body {
    padding: 18px 22px 22px;
    display: flex;
    gap: 24px;
  }
  .cp-body-solid { gap: 22px; align-items: flex-start; }
  .cp-body-grad { flex-direction: column; gap: 20px; align-items: stretch; }
  .cp-section { display: flex; flex-direction: column; gap: 8px; }
  .cp-section-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 2px;
  }

  /* ── Solid: canvas col + side col ───────────────────────────────────────── */
  .cp-canvas-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  /* Grid gives explicit column widths so aspect-ratio on the spectrum
     has a known base — no flex circular-dependency for cross-axis height. */
  .cp-canvas-row { display: grid; grid-template-columns: 1fr 22px; gap: 14px; align-items: stretch; }
  .cp-side-col {
    width: 280px;
    flex: 0 0 280px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* ── HSV box ────────────────────────────────────────────────────────────── */
  .cp-hsv {
    position: relative;
    /* Grid column 1 (1fr) sets the width; aspect-ratio then sets height. */
    width: 100%;
    aspect-ratio: 1 / 0.86;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid var(--chrome-border);
    cursor: crosshair;
  }
  .cp-hsv > div { position: absolute; inset: 0; }
  .cp-hsv-sat { background: linear-gradient(to right, #fff, transparent); }
  .cp-hsv-val { background: linear-gradient(to top, #000, transparent); }
  .cp-hsv-dot {
    position: absolute;
    width: 14px; height: 14px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.35);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  /* ── Hue strip ──────────────────────────────────────────────────────────── */
  .cp-hue {
    position: relative;
    /* Grid column 2 is 22px; height comes from grid row (aspect-ratio of spectrum). */
    width: 100%;
    min-height: 120px; /* fallback if grid row collapses */
    z-index: 1;        /* always rendered above spectrum in any stacking context */
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid var(--chrome-border);
  }
  .cp-hue-grad {
    position: absolute; inset: 0;
    background: linear-gradient(to bottom,
      #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%,
      #0000ff 67%, #ff00ff 83%, #ff0000 100%);
  }
  .cp-hue-marker {
    position: absolute;
    left: -3px; right: -3px;
    height: 8px;
    background: var(--cp-modal-bg);
    border: 1.5px solid var(--fg);
    border-radius: 4px;
    transform: translateY(-50%);
    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
    pointer-events: none;
  }

  /* ── Alpha strip ────────────────────────────────────────────────────────── */
  .cp-alpha-row { position: relative; z-index: 1; display: flex; align-items: center; gap: 10px; height: 22px; }
  .cp-alpha-icon {
    width: 22px; height: 22px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 14px; color: var(--muted);
    font-style: italic;
  }
  .cp-alpha {
    position: relative;
    flex: 1; height: 16px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--chrome-border);
    background-color: var(--swatch-bg);
    background-image:
      linear-gradient(45deg, var(--checker) 25%, transparent 25%),
      linear-gradient(-45deg, var(--checker) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--checker) 75%),
      linear-gradient(-45deg, transparent 75%, var(--checker) 75%);
    background-size: 8px 8px;
    background-position: 0 0, 0 4px, 4px -4px, -4px 0;
  }
  .cp-alpha-grad { position: absolute; inset: 0; }
  .cp-alpha-marker {
    position: absolute;
    top: -3px; bottom: -3px;
    width: 8px;
    background: var(--cp-modal-bg);
    border: 1.5px solid var(--fg);
    border-radius: 4px;
    transform: translateX(-50%);
    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
    pointer-events: none;
  }

  /* ── Preview new/current ────────────────────────────────────────────────── */
  .cp-preview { display: flex; flex-direction: column; gap: 4px; }
  .cp-preview-row {
    display: flex;
    border-radius: 10px;
    overflow: hidden;
    border: 1.5px solid var(--swatch-border);
    height: 42px;
    background-color: var(--swatch-bg);
    background-image:
      linear-gradient(45deg, var(--checker) 25%, transparent 25%),
      linear-gradient(-45deg, var(--checker) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--checker) 75%),
      linear-gradient(-45deg, transparent 75%, var(--checker) 75%);
    background-size: 10px 10px;
    background-position: 0 0, 0 5px, 5px -5px, -5px 0;
  }
  .cp-preview-cell { position: relative; flex: 1; }
  .cp-preview-chk {
    position: absolute; inset: 0;
    background-color: var(--swatch-bg);
    background-image:
      linear-gradient(45deg, var(--checker) 25%, transparent 25%),
      linear-gradient(-45deg, var(--checker) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--checker) 75%),
      linear-gradient(-45deg, transparent 75%, var(--checker) 75%);
    background-size: 10px 10px;
    background-position: 0 0, 0 5px, 5px -5px, -5px 0;
  }
  .cp-preview-fill { position: absolute; inset: 0; }
  .cp-preview-current::after {
    content: ''; position: absolute; top: 0; bottom: 0; right: 0;
    width: 1px; background: rgba(0,0,0,0.15);
  }
  .cp-preview-labels {
    display: flex;
    font-size: 11px; color: var(--muted);
    font-weight: 500; letter-spacing: 0.02em; text-transform: uppercase;
  }
  .cp-preview-labels > span { flex: 1; padding: 0 10px; }

  /* ── Number inputs ──────────────────────────────────────────────────────── */
  .cp-inputs { display: flex; flex-direction: column; gap: 8px; }
  .cp-input-group { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
  .cp-num {
    display: inline-flex;
    align-items: center;
    height: 32px;
    background: var(--field-bg);
    border: 1px solid var(--field-border);
    border-radius: 8px;
    padding: 0 8px;
    gap: 4px;
    transition: border-color 0.12s, box-shadow 0.12s;
    cursor: text;
  }
  .cp-num:hover { border-color: var(--cp-field-hover); }
  .cp-num.is-active {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--cp-focus-ring);
  }
  .cp-num-label {
    font-size: 11px; font-weight: 600; color: var(--muted);
    letter-spacing: 0.04em; width: 12px; flex: 0 0 12px;
  }
  .cp-num-value {
    flex: 1;
    font-size: 13px; font-weight: 500; color: var(--fg);
    font-variant-numeric: tabular-nums;
    text-align: right;
    font-family: inherit;
  }
  .cp-num-unit { font-size: 11px; color: var(--muted); flex: 0 0 auto; }
  .cp-hex .cp-num-value { text-align: left; font-variant-numeric: normal; font-family: ui-monospace, monospace; }

  /* ── Preset palette ─────────────────────────────────────────────────────── */
  .cp-preset {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 4px;
    padding: 8px;
    background: var(--group-bg);
    border: 1px solid var(--group-border);
    border-radius: 10px;
  }
  .cp-preset-swatch {
    aspect-ratio: 1;
    border-radius: 5px;
    border: 1px solid rgba(0,0,0,0.18);
    padding: 0;
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.1s, outline 0.1s;
  }
  .cp-preset-swatch:hover {
    transform: translateY(-1px);
    box-shadow: 0 3px 8px rgba(0,0,0,0.18);
    position: relative; z-index: 2;
  }
  .cp-preset-swatch.is-selected {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    position: relative; z-index: 3;
  }

  /* ── Gradient layout ────────────────────────────────────────────────────── */
  /* Top row: gradient controls (wide) on the left, a narrow vertical color
     editor on the right. Direction/Settings stack full-width in the bottom row. */
  .cp-grad-top {
    display: flex; gap: 22px; align-items: flex-start;
  }
  .cp-grad-left {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; gap: 14px;
  }
  .cp-grad-colors {
    flex: 0 0 300px; min-width: 0; display: flex;
  }
  /* Stack the picker vertically so the colors column stays narrow:
     current/new + inputs + preset palette on top, the saturation/hue and
     alpha scales beneath them. */
  .cp-stop-color-editor > div { flex-direction: column; align-items: stretch; }
  .cp-stop-color-editor .cp-side-col { order: 1; width: 100%; flex: none; }
  .cp-stop-color-editor .cp-canvas-col { order: 2; width: 100%; flex: none; }

  /* Direction/Settings group: tucked under the stop list in the left column,
     stacked and filling the column width. */
  .cp-grad-bottom {
    display: flex; flex-direction: column; gap: 18px;
    margin-top: 4px; padding-top: 16px;
    border-top: 1px solid var(--chrome-border);
  }
  .cp-grad-bottom > .cp-section { width: 100%; }
  /* Direction lays its dial and presets in a full-width row. */
  .cp-dir-body { display: flex; align-items: center; gap: 18px; }
  .cp-dir-body .cp-dir-presets {
    flex: 1; grid-template-columns: repeat(8, 1fr);
  }

  /* ── Mode toggle ────────────────────────────────────────────────────────── */
  .cp-mode {
    display: inline-flex;
    padding: 3px;
    background: var(--group-bg);
    border: 1px solid var(--group-border);
    border-radius: 10px;
    gap: 2px;
    align-self: flex-start;
  }
  .cp-mode-btn {
    appearance: none; border: none;
    background: transparent;
    font-family: inherit; color: var(--muted);
    font-size: 12px; font-weight: 500;
    padding: 6px 12px;
    border-radius: 7px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s, box-shadow 0.15s;
  }
  .cp-mode-btn:hover { color: var(--fg); }
  .cp-mode-btn.is-active {
    background: var(--cp-modal-bg);
    color: var(--fg);
    box-shadow: var(--cp-tab-shadow);
  }

  /* ── Big gradient preview ───────────────────────────────────────────────── */
  .cp-preview-big {
    position: relative;
    width: 100%; height: 200px;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--chrome-border);
  }

  /* ── Radial markers ─────────────────────────────────────────────────────── */
  /* Zero-size anchor at the exact marker position — children offset themselves */
  .cp-radial-center {
    position: absolute;
    width: 0; height: 0;
    pointer-events: none;
  }
  .cp-radial-pt {
    position: absolute;
    width: 16px; height: 16px;
    border-radius: 50%;
    background: var(--cp-modal-bg);
    border: 2px solid var(--accent);
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    cursor: move;
    pointer-events: auto;
    /* Centre the dot on the anchor point */
    transform: translate(-50%, -50%);
  }
  .cp-radial-pt-label {
    position: absolute;
    left: 0;
    top: 12px; /* 8px half-dot + 4px gap */
    transform: translateX(-50%);
    font-size: 10px; font-weight: 600; color: #fff;
    letter-spacing: 0.05em; text-transform: uppercase;
    background: rgba(0,0,0,0.55);
    padding: 2px 6px; border-radius: 4px;
    pointer-events: none;
    white-space: nowrap;
  }
  .cp-radial-handle {
    position: absolute;
    border: 1.5px dashed rgba(255,255,255,0.65);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  /* ── Stop bar ───────────────────────────────────────────────────────────── */
  .cp-stopbar {
    position: relative;
    height: 56px;
    padding: 0 8px;
  }
  .cp-stopbar-track {
    position: relative;
    width: 100%; height: 32px;
    margin-top: 12px;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--chrome-border);
  }
  .cp-stopbar-track-chk {
    position: absolute; inset: 0; z-index: 0;
    background-color: var(--swatch-bg);
    background-image:
      linear-gradient(45deg, var(--cp-checker, rgba(0,0,0,.07)) 25%, transparent 25%),
      linear-gradient(-45deg, var(--cp-checker, rgba(0,0,0,.07)) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--cp-checker, rgba(0,0,0,.07)) 75%),
      linear-gradient(-45deg, transparent 75%, var(--cp-checker, rgba(0,0,0,.07)) 75%);
    background-size: 10px 10px;
    background-position: 0 0, 0 5px, 5px -5px, -5px 0;
  }
  .cp-stopbar-stops {
    position: absolute;
    top: 0; left: 8px; right: 8px;
    height: 100%;
    z-index: 1;        /* keep handles + arrows above the gradient track */
    pointer-events: none;
  }
  .cp-stop {
    position: absolute;
    top: 6px;
    width: 26px; height: 44px;
    transform: translateX(-50%);
    background: transparent; border: none; padding: 0;
    cursor: grab;
    pointer-events: auto;
    display: flex; flex-direction: column; align-items: center;
  }
  .cp-stop-chip {
    width: 22px; height: 22px;
    border-radius: 6px;
    border: 2.5px solid var(--cp-modal-bg);
    box-shadow: 0 0 0 1.5px var(--cp-stop-ring), 0 3px 6px rgba(0,0,0,0.25);
    position: relative; z-index: 2;
    transition: transform 0.1s;
  }
  .cp-stop::after {
    content: '';
    display: block;
    width: 0; height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 9px solid var(--cp-modal-bg);
    margin-top: -2px;
    filter: drop-shadow(0 1.5px 0 var(--cp-stop-ring));
  }
  .cp-stop.is-selected .cp-stop-chip {
    box-shadow: 0 0 0 2.5px var(--accent), 0 3px 8px rgba(0,0,0,0.3);
    transform: scale(1.08);
  }
  .cp-stopbar-add {
    position: absolute;
    right: -4px; top: 50%;
    transform: translateY(-50%);
    width: 30px; height: 30px;
    background: var(--field-bg);
    border: 1px dashed var(--cp-field-hover);
    border-radius: 8px;
    color: var(--muted);
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s, background 0.12s;
  }
  .cp-stopbar-add:hover { color: var(--accent); border-color: var(--accent); border-style: solid; background: var(--accent-soft); }

  /* ── Stop detail list ───────────────────────────────────────────────────── */
  .cp-stop-list {
    display: flex; flex-direction: column; gap: 6px;
    padding: 6px;
    background: var(--group-bg);
    border: 1px solid var(--group-border);
    border-radius: 10px;
  }
  .cp-stop-row {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 10px;
    border-radius: 7px;
    background: transparent;
    cursor: pointer;
    transition: background 0.12s;
  }
  .cp-stop-row:hover { background: var(--cp-modal-bg); }
  .cp-stop-row.is-selected {
    background: var(--cp-modal-bg);
    box-shadow: 0 0 0 1.5px var(--accent) inset;
  }
  .cp-stop-idx {
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--field-bg); border: 1px solid var(--field-border);
    font-size: 10px; font-weight: 600; color: var(--muted);
    display: inline-flex; align-items: center; justify-content: center;
    flex: 0 0 18px;
  }
  .cp-stop-chipbig {
    width: 28px; height: 22px; border-radius: 6px;
    border: 1.5px solid var(--swatch-border);
    flex: 0 0 28px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.08), inset 0 0 0 1px rgba(0,0,0,0.05);
    cursor: pointer;
  }
  .cp-stop-hex {
    font-family: ui-monospace, monospace;
    font-size: 13px; font-weight: 500; color: var(--fg);
    letter-spacing: -0.005em; flex: 0 0 auto;
  }
  .cp-stop-pos {
    margin-left: auto;
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--field-bg); border: 1px solid var(--field-border);
    border-radius: 7px; padding: 4px 10px;
  }
  .cp-stop-pos-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .cp-stop-pos-val { font-size: 12px; font-weight: 500; color: var(--fg); font-variant-numeric: tabular-nums; }
  .cp-stop-del {
    background: transparent; border: none; color: var(--muted);
    width: 26px; height: 26px; border-radius: 6px;
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background 0.12s, color 0.12s;
  }
  .cp-stop-del:hover { background: var(--cp-danger-bg); color: var(--cp-danger); }

  /* ── Direction dial ─────────────────────────────────────────────────────── */
  .cp-dial { display: flex; align-items: center; gap: 14px; }
  .cp-dial-readout { font-size: 14px; font-weight: 600; color: var(--fg); font-variant-numeric: tabular-nums; }
  .cp-dir-presets {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;
    padding: 4px;
    background: var(--group-bg); border: 1px solid var(--group-border);
    border-radius: 9px;
  }
  .cp-dir-preset {
    appearance: none; border: none;
    background: transparent; font-family: inherit;
    font-size: 14px; color: var(--icon);
    height: 28px; border-radius: 6px; cursor: pointer;
    transition: background 0.12s, color 0.12s, box-shadow 0.12s;
  }
  .cp-dir-preset:hover { background: var(--icon-hover-bg); color: var(--icon-hover); }
  .cp-dir-preset.is-active {
    background: var(--accent-soft); color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent-border) inset;
  }

  /* ── Slider ─────────────────────────────────────────────────────────────── */
  .cp-slider {
    display: grid; grid-template-columns: auto 1fr 50px;
    align-items: center; gap: 10px;
  }
  .cp-slider-label { font-size: 12px; color: var(--muted); font-weight: 500; white-space: nowrap; }
  .cp-slider-track {
    position: relative; height: 6px;
    background: var(--group-bg); border: 1px solid var(--group-border);
    border-radius: 999px; cursor: pointer;
  }
  .cp-slider-fill {
    position: absolute; inset: 0; right: auto;
    background: var(--accent); border-radius: 999px; opacity: 0.85;
  }
  .cp-slider-thumb {
    position: absolute; top: 50%;
    width: 14px; height: 14px;
    background: var(--cp-modal-bg);
    border: 2px solid var(--accent); border-radius: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 0 1px 4px rgba(0,0,0,0.25); cursor: grab;
  }
  .cp-slider-readout { font-size: 12px; color: var(--fg); font-weight: 500; text-align: right; font-variant-numeric: tabular-nums; }

  /* ── Select ─────────────────────────────────────────────────────────────── */
  .cp-select { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 10px; }
  .cp-select-label { font-size: 12px; color: var(--muted); font-weight: 500; white-space: nowrap; }
  .cp-select-btn {
    appearance: none; height: 32px;
    background: var(--field-bg); border: 1px solid var(--field-border);
    border-radius: 8px; padding: 0 10px;
    display: inline-flex; align-items: center; justify-content: space-between; gap: 8px;
    font-family: inherit; font-size: 13px; color: var(--fg); font-weight: 500;
    cursor: pointer; transition: border-color 0.12s, box-shadow 0.12s;
  }
  .cp-select-btn:hover { border-color: var(--cp-field-hover); }
  .cp-select-chev { color: var(--muted); display: flex; align-items: center; }

  /* ── Checkbox ───────────────────────────────────────────────────────────── */
  .cp-check { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
  .cp-check input { display: none; }
  .cp-check-box {
    width: 16px; height: 16px; border-radius: 5px;
    background: var(--field-bg); border: 1.5px solid var(--field-border);
    display: inline-flex; align-items: center; justify-content: center;
    transition: background 0.12s, border-color 0.12s;
  }
  .cp-check input:checked + .cp-check-box {
    background: var(--accent); border-color: var(--accent);
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path fill='none' stroke='white' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round' d='M3.5 8.5l3 3 6-6.5'/></svg>");
    background-size: 14px 14px; background-position: center; background-repeat: no-repeat;
  }
  .cp-check-label { font-size: 13px; color: var(--fg); font-weight: 500; }

  /* ── Mono settings ──────────────────────────────────────────────────────── */
  .cp-mono-row { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--muted); }
  .cp-mono-toggle {
    display: inline-flex; padding: 3px;
    background: var(--group-bg); border: 1px solid var(--group-border);
    border-radius: 8px; gap: 2px;
  }
  .cp-mono-toggle button {
    appearance: none; border: none; background: transparent;
    color: var(--muted); font-family: inherit; font-size: 11.5px; font-weight: 500;
    padding: 4px 8px; border-radius: 5px; cursor: pointer;
    transition: background 0.15s, color 0.15s, box-shadow 0.15s;
  }
  .cp-mono-toggle button.is-active {
    background: var(--cp-modal-bg); color: var(--fg);
    box-shadow: var(--cp-tab-shadow);
  }

  /* ── Footer ─────────────────────────────────────────────────────────────── */
  .cp-foot {
    height: 60px; flex: 0 0 60px;
    padding: 0 22px;
    background: var(--cp-head-bg);
    border-top: 1px solid var(--chrome-border);
    display: flex; align-items: center; gap: 10px;
    border-radius: 0 0 16px 16px;
  }
  .cp-foot-spacer { flex: 1; }
  .cp-btn {
    appearance: none; font-family: inherit;
    font-size: 13px; font-weight: 600; letter-spacing: -0.005em;
    height: 36px; padding: 0 16px;
    border-radius: 9px; cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s, box-shadow 0.12s, transform 0.05s;
  }
  .cp-btn-ghost {
    background: var(--field-bg); border: 1px solid var(--field-border); color: var(--fg);
  }
  .cp-btn-ghost:hover { background: var(--icon-hover-bg); border-color: var(--cp-field-hover); }
  .cp-btn-primary {
    background: var(--accent); border: 1px solid var(--accent);
    color: var(--cp-btn-primary-fg);
    box-shadow: 0 1px 0 rgba(0,0,0,0.08), 0 1px 2px var(--cp-btn-primary-shadow);
  }
  .cp-btn-primary:hover { filter: brightness(1.06); }
  .cp-btn-primary:active { transform: translateY(1px); }

  /* ── Stop color editor (right column of gradient panels) ────────────────── */
  .cp-stop-color-editor { padding: 0; flex: 1; min-width: 0; display: flex; }
`
