// seRecolorDialog.ts — Recolor Artwork dialog (`se-recolor-dialog`): rows "current → new", method / harmony / reduce / hue turn / keep white-black-grays; knows nothing of the drawing, hands `ext-recolor` an old → new `Map`
import { dialogSkin } from './dialogSkin.css.js'
import { syncDialogTheme } from '../themeUtil.ts'
import {
  buildRows, planMap, harmonyColors, shiftHue, keyColor, HARMONIES, METHODS, DEFAULT_PRESERVE
} from '@svgedit/svgcanvas/core/recolor.ts'

const template = document.createElement('template')
template.innerHTML = `
  <style>
    ${dialogSkin('#rc_card')}
    #rc_card { width: 460px; max-width: 94vw; }
    h2 { margin: 0 0 12px; font-size: 14px; font-weight: 600; }
    #rc_options { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; margin-bottom: 12px; }
    #rc_options label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted, #6B7280); }
    #rc_options select, #rc_options input[type=number] { width: 100%; }
    #rc_keep { display: flex; gap: 14px; flex-wrap: wrap; grid-column: 1 / -1; }
    #rc_keep label { flex-direction: row; align-items: center; gap: 6px; color: var(--fg, #1B1F24); }
    #rc_hue { display: flex; align-items: center; gap: 8px; }
    #rc_hue input[type=range] { flex: 1; min-width: 0; accent-color: var(--accent, #2962FF); }
    #rc_hue output { width: 3.2em; text-align: right; color: var(--fg, #1B1F24); }
    #rc_rows { max-height: 260px; overflow: auto; border: 1px solid var(--chrome-border, #E6E8EC); border-radius: 10px;
      background: var(--group-bg, transparent); }
    .rc_row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; }
    .rc_row + .rc_row { border-top: 1px solid var(--chrome-border, #E6E8EC); }
    .rc_from { flex: 1; display: flex; flex-wrap: wrap; gap: 3px; min-width: 0; align-items: center; }
    .rc_swatch { width: 18px; height: 18px; border-radius: 4px; border: 1px solid var(--field-border, #DDE1E7); }
    .rc_more { font-size: 11px; color: var(--muted, #6B7280); margin-left: 2px; }
    .rc_arrow { color: var(--muted, #6B7280); }
    .rc_to { width: 36px; height: 26px; padding: 0; border: 1px solid var(--field-border, #DDE1E7); border-radius: 6px;
      background: transparent; cursor: pointer; }
    .rc_hex { width: 5.2em; font: 12px ui-monospace, monospace; color: var(--muted, #6B7280); }
    #rc_empty { padding: 18px 12px; text-align: center; color: var(--muted, #6B7280); }
    #rc_buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
  </style>
  <dialog>
    <div id="rc_card">
      <h2 id="rc_title"></h2>
      <div id="rc_options">
        <label><span id="rc_method_label"></span><select id="rc_method"></select></label>
        <label><span id="rc_harmony_label"></span><select id="rc_harmony"></select></label>
        <label><span id="rc_reduce_label"></span><input id="rc_reduce" type="number" min="0" max="64" step="1" value="0"></label>
        <label><span id="rc_hue_label"></span>
          <span id="rc_hue"><input id="rc_hue_in" type="range" min="-180" max="180" step="1" value="0"><output id="rc_hue_out">0°</output></span>
        </label>
        <div id="rc_keep">
          <label><input id="rc_white" type="checkbox"><span id="rc_white_label"></span></label>
          <label><input id="rc_black" type="checkbox"><span id="rc_black_label"></span></label>
          <label><input id="rc_grays" type="checkbox"><span id="rc_grays_label"></span></label>
        </div>
      </div>
      <div id="rc_rows"></div>
      <div id="rc_buttons">
        <button id="rc_cancel" type="button"></button>
        <button id="rc_ok" type="button" class="dlg-primary"></button>
      </div>
    </div>
  </dialog>
`

export interface RecolorOptions {
  /** the colours of the selection (`collectColors`) */
  uses: { hex: string, count: number }[]
  /** the dialog's strings */
  labels: Record<string, string>
  /** called on open and on every edit with the old → new map */
  onChange: (plan: Map<string, string>) => void
  /** the user confirmed */
  onOk: (plan: Map<string, string>) => void
  /** the user dismissed it */
  onCancel: () => void
}

/**
 * @class SeRecolorDialog
 * Recolor Artwork: lists the colours of the selection as rows "current → new" and lets the user edit a row's
 * new colour, apply a harmony rule, reduce to N colours, turn the hue and pick which neutrals stay. It knows
 * nothing about the drawing: `ext-recolor` previews each `onChange` plan and commits or rolls it back.
 */
export class SeRecolorDialog extends HTMLElement {
  _shadowRoot: ShadowRoot
  $dialog: HTMLDialogElement
  $title: HTMLElement
  $method: HTMLSelectElement
  $harmony: HTMLSelectElement
  $reduce: HTMLInputElement
  $hue_in: HTMLInputElement
  $hue_out: HTMLElement
  $white: HTMLInputElement
  $black: HTMLInputElement
  $grays: HTMLInputElement
  $rows: HTMLElement
  $cancel: HTMLButtonElement
  $ok: HTMLButtonElement
  $: (id: string) => HTMLElement

  _opts: RecolorOptions | null
  _rows: import('@svgedit/svgcanvas/core/recolor.ts').Row[]
  /** the new colour of each row before the hue turn */ _base: string[]
  _finished: boolean
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    const $ = (id: string) => (this._shadowRoot.querySelector('#' + id) as HTMLElement)
    this.$dialog = (this._shadowRoot.querySelector('dialog') as HTMLDialogElement)
    this.$title = $('rc_title')
    this.$method = ($('rc_method') as HTMLSelectElement)
    this.$harmony = ($('rc_harmony') as HTMLSelectElement)
    this.$reduce = ($('rc_reduce') as HTMLInputElement)
    this.$hue_in = ($('rc_hue_in') as HTMLInputElement)
    this.$hue_out = $('rc_hue_out')
    this.$white = ($('rc_white') as HTMLInputElement)
    this.$black = ($('rc_black') as HTMLInputElement)
    this.$grays = ($('rc_grays') as HTMLInputElement)
    this.$rows = $('rc_rows')
    this.$cancel = ($('rc_cancel') as HTMLButtonElement)
    this.$ok = ($('rc_ok') as HTMLButtonElement)
    this.$ = $
    this._opts = null
    this._rows = []
    this._base = []
    this._finished = false
  }

  connectedCallback () {
    for (const el of [this.$method, this.$harmony, this.$reduce, this.$white, this.$black, this.$grays]) {
      el.addEventListener('change', () => this._optionsChanged())
    }
    this.$reduce.addEventListener('input', () => this._optionsChanged())
    this.$hue_in.addEventListener('input', () => {
      this.$hue_out.textContent = `${this.$hue_in.value}°`
      this._emit()
    })
    this.$cancel.addEventListener('click', () => this.dismiss())
    this.$ok.addEventListener('click', () => {
      this._finished = true
      this._opts?.onOk(this._plan())
      this.$dialog.close()
    })
    // Escape (and anything else that closes the <dialog>) is a cancel too; its event arrives a task late.
    this.$dialog.addEventListener('close', () => this.dismiss())
  }

  get opened () {
    return this.$dialog.open
  }

  open (opts: RecolorOptions): void {
    this._opts = opts
    this._finished = false
    const { labels } = opts
    this.$title.textContent = labels.title
    this.$('rc_method_label').textContent = labels.method
    this.$('rc_harmony_label').textContent = labels.harmony
    this.$('rc_reduce_label').textContent = labels.reduce
    this.$('rc_hue_label').textContent = labels.hue
    this.$('rc_white_label').textContent = labels.keepWhite
    this.$('rc_black_label').textContent = labels.keepBlack
    this.$('rc_grays_label').textContent = labels.keepGrays
    this.$cancel.textContent = labels.cancel
    this.$ok.textContent = labels.ok
    this.$method.replaceChildren(...METHODS.map((m) => new Option(m.label, m.id)))
    this.$harmony.replaceChildren(new Option(labels.harmonyNone, ''), ...HARMONIES.map((h) => new Option(h.label, h.id)))
    this.$method.value = 'exact'
    this.$harmony.value = ''
    this.$reduce.value = '0'
    this.$hue_in.value = '0'
    this.$hue_out.textContent = '0°'
    this.$white.checked = DEFAULT_PRESERVE.white
    this.$black.checked = DEFAULT_PRESERVE.black
    this.$grays.checked = DEFAULT_PRESERVE.grays
    this._optionsChanged()
    syncDialogTheme(this)
    this.$dialog.showModal()
  }

  /** Cancel: hand the owner the news once, at once. */
  dismiss (): void {
    if (!this._finished) {
      this._finished = true
      this._opts?.onCancel()
    }
    this.close()
  }

  close (): void {
    if (this.$dialog.open) this.$dialog.close()
  }

  /** The rows, and the new colours they start with, follow the options. */
  _optionsChanged () {
    const opts = this._opts
    if (!opts) return
    const reduce = Math.max(0, Math.floor(Number(this.$reduce.value) || 0))
    this._rows = buildRows(opts.uses, {
      preserve: { white: this.$white.checked, black: this.$black.checked, grays: this.$grays.checked },
      reduce
    })
    const keys = this._rows.map((r) => keyColor(this.$method.value, r.colors.map((c) => c.hex)))
    const rule = this.$harmony.value
    const tones = rule && keys.length ? harmonyColors(rule, keys[0]) : null
    this._base = keys.map((k, i) => (tones ? tones[i % tones.length] : k))
    this._renderRows()
    this._emit()
  }

  _hue (): number {
    return Number(this.$hue_in.value) || 0
  }

  /** @returns what each row's new colour is, hue turn included */
  _targets (): string[] {
    return this._base.map((c) => shiftHue(c, this._hue()))
  }

  _plan (): Map<string, string> {
    return planMap(this._rows, this._targets(), this.$method.value)
  }

  _renderRows () {
    const labels = this._opts?.labels
    if (!labels) return
    if (!this._rows.length) {
      const empty = document.createElement('div')
      empty.id = 'rc_empty'
      empty.textContent = labels.empty
      this.$rows.replaceChildren(empty)
      return
    }
    this.$rows.replaceChildren(...this._rows.map((row, i) => {
      const el = document.createElement('div')
      el.className = 'rc_row'
      const from = document.createElement('span')
      from.className = 'rc_from'
      for (const { hex, count } of row.colors.slice(0, 8)) {
        const sw = document.createElement('span')
        sw.className = 'rc_swatch'
        sw.style.background = hex
        sw.title = `${hex} ×${count}`
        from.append(sw)
      }
      if (row.colors.length > 8) {
        const more = document.createElement('span')
        more.className = 'rc_more'
        more.textContent = `+${row.colors.length - 8}`
        from.append(more)
      }
      const arrow = document.createElement('span')
      arrow.className = 'rc_arrow'
      arrow.textContent = '→'
      const to = document.createElement('input')
      to.type = 'color'
      to.className = 'rc_to'
      to.dataset.row = String(i)
      to.title = labels.newColor
      to.addEventListener('input', () => {
        this._base[i] = shiftHue(to.value, -this._hue())
        this._emit()
      })
      const hex = document.createElement('code')
      hex.className = 'rc_hex'
      el.append(from, arrow, to, hex)
      return el
    }))
  }

  /** Show the targets and hand the new plan to the owner. */
  _emit () {
    const targets = this._targets()
    this.$rows.querySelectorAll('.rc_to').forEach((input, i) => {
      (input as HTMLInputElement).value = targets[i]
      const hex = input.parentElement?.querySelector('.rc_hex')
      if (hex) hex.textContent = targets[i]
    })
    this.$ok.disabled = !this._rows.length
    this._opts?.onChange(this._plan())
  }
}

if (!customElements.get('se-recolor-dialog')) customElements.define('se-recolor-dialog', SeRecolorDialog)
export default SeRecolorDialog
