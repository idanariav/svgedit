/* globals svgEditor */
import { SeSettingsPopover } from './seSettingsPopover.js'

const TEMPLATE_HTML = `
  <style>
  :host {
    display: inline-flex;
    align-items: center;
  }
  .trigger {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--icon, #4B5563);
    cursor: pointer;
    transition: background .12s, color .12s;
  }
  .trigger:hover {
    background: var(--icon-hover-bg, #EEF1F5);
    color: var(--icon-hover, #0F172A);
  }
  .trigger[aria-expanded="true"] {
    background: var(--accent-soft, #E8EFFF);
    border-color: var(--accent-border, #C7D7FF);
    color: var(--accent, #2962FF);
  }
  #icon {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  #icon svg, #icon img {
    width: 18px;
    height: 18px;
    display: block;
  }
  #options-container {
    position: fixed;
    flex-direction: column;
    gap: 10px;
    min-width: 200px;
    padding: 12px;
    background: var(--chrome-bg, #FFFFFF);
    border: 1px solid var(--chrome-border, #E6E8EC);
    border-radius: 10px;
    box-shadow: 0 4px 16px -2px rgba(0,0,0,0.12);
    z-index: 100;
  }
  .section-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted, #6B7280);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .toggles {
    display: flex;
    gap: 6px;
  }
  .toggles button {
    flex: 1;
    padding: 6px 0;
    border: 1px solid var(--field-border, #E2E5EA);
    border-radius: 7px;
    background: var(--field-bg, #F7F8FA);
    color: var(--fg, #1B1F24);
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background .12s, border-color .12s, color .12s;
  }
  .toggles button[aria-pressed="true"] {
    border-color: var(--accent-border, #C7D7FF);
    background: var(--accent-soft, #E8EFFF);
    color: var(--accent, #2962FF);
  }
  .clear {
    padding: 7px 0;
    border-radius: 8px;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--field-border, #E2E5EA);
    background: var(--field-bg, #F7F8FA);
    color: var(--fg, #1B1F24);
    transition: border-color .12s;
  }
  .clear:hover {
    border-color: var(--accent, #2962FF);
  }
  .hint {
    font-size: 11px;
    color: var(--muted, #6B7280);
    line-height: 1.4;
  }
  </style>
  <button class="trigger" title="Guides" aria-haspopup="dialog" aria-expanded="false">
    <span id="icon"></span>
  </button>
  <div id="options-container" role="dialog" aria-label="Guides" style="display:none">
    <div class="section-label">Composition overlays</div>
    <div class="toggles">
      <button id="ov_thirds" aria-pressed="false">Thirds</button>
      <button id="ov_golden" aria-pressed="false">Golden</button>
      <button id="ov_center" aria-pressed="false">Center</button>
    </div>
    <div class="section-label">Guides</div>
    <div class="toggles">
      <button id="guide_add_v">+ Vertical</button>
      <button id="guide_add_h">+ Horizontal</button>
    </div>
    <button class="clear" id="guides_clear">Clear all guides</button>
    <div class="hint">Drag a guide to place it; drag it off the canvas to remove it. With rulers enabled (Editor Options), drag guides straight off a ruler.</div>
  </div>
`

/**
 * @class SeGuidesSettings
 * View-tray button + popover for the guides tool. Pure UI — composition
 * overlay toggles and guide clearing are delegated to the `svgCanvas`
 * methods provided by ext-guides (`getCompOverlays`, `setCompOverlay`,
 * `clearRulerGuides`).
 */
class SeGuidesSettings extends SeSettingsPopover {
  constructor () {
    super(TEMPLATE_HTML)

    for (const kind of ['thirds', 'golden', 'center']) {
      const btn = this._shadowRoot.querySelector(`#ov_${kind}`)
      btn.addEventListener('click', () => {
        const on = btn.getAttribute('aria-pressed') !== 'true'
        btn.setAttribute('aria-pressed', String(on))
        svgEditor.svgCanvas.setCompOverlay?.(kind, on)
      })
    }
    this._shadowRoot.querySelector('#guides_clear').addEventListener('click', () => {
      svgEditor.svgCanvas.clearRulerGuides?.()
    })
    this._shadowRoot.querySelector('#guide_add_v').addEventListener('click', () => {
      svgEditor.svgCanvas.addRulerGuide?.('v')
    })
    this._shadowRoot.querySelector('#guide_add_h').addEventListener('click', () => {
      svgEditor.svgCanvas.addRulerGuide?.('h')
    })
  }

  open () {
    const state = svgEditor.svgCanvas.getCompOverlays?.() ?? {}
    for (const kind of ['thirds', 'golden', 'center']) {
      this._shadowRoot.querySelector(`#ov_${kind}`)
        .setAttribute('aria-pressed', String(!!state[kind]))
    }
    super.open()
  }
}

// Register
customElements.define('se-guides-settings', SeGuidesSettings)
