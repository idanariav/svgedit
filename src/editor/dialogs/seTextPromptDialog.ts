// seTextPromptDialog.ts — `<se-text-prompt-dialog>` — themed replacement for the browser `prompt()`; resolves with the entered text, or `null` when cancelled
import seTextPromptDialogHTML from './seTextPromptDialog.html'
import { closestRoot } from '../domScope.ts'
import { $click } from '@svgedit/svgcanvas/core/dom-utils.ts'
import { syncDialogTheme } from '../themeUtil.ts'

const template = document.createElement('template')
template.innerHTML = seTextPromptDialogHTML

/**
 * @class SeTextPromptDialog
 * An on-brand replacement for the native browser `prompt()`. Hosts (such as
 * Obsidian/Electron) render `window.prompt` as an ugly, sometimes non-functional
 * browser chrome dialog; this stays inside the editor's themed UI and resolves a
 * promise with the entered text (or `null` when cancelled).
 */
export class SeTextPromptDialog extends HTMLElement {
  _shadowRoot: ShadowRoot
  $dialog: HTMLDialogElement
  $title: HTMLParagraphElement
  $closeBtn: HTMLButtonElement
  $message: HTMLLabelElement
  $input: HTMLInputElement
  $cancelBtn: HTMLButtonElement
  $okBtn: HTMLButtonElement
  _resolve: ((value: string | PromiseLike<string | null> | null) => void) | null
  _okText: string
  _cancelText: string

  /**
    * @function constructor
    */
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dialog = (this._shadowRoot.querySelector('#text_prompt_box') as HTMLDialogElement)
    this.$title = (this._shadowRoot.querySelector('#text_prompt_title') as HTMLParagraphElement)
    this.$closeBtn = (this._shadowRoot.querySelector('#text_prompt_close') as HTMLButtonElement)
    this.$message = (this._shadowRoot.querySelector('#text_prompt_message') as HTMLLabelElement)
    this.$input = (this._shadowRoot.querySelector('#text_prompt_input') as HTMLInputElement)
    this.$cancelBtn = (this._shadowRoot.querySelector('#text_prompt_cancel') as HTMLButtonElement)
    this.$okBtn = (this._shadowRoot.querySelector('#text_prompt_ok') as HTMLButtonElement)
    // resolver for the in-flight prompt() promise
    this._resolve = null
    // default footer labels (overridable via init / prompt options)
    this._okText = 'OK'
    this._cancelText = 'Cancel'
  }

  /** @function init */
  init (i18next: import('i18next').i18n): void {
    this._okText = i18next.t('common.ok')
    this._cancelText = i18next.t('common.cancel')
    this.$okBtn.textContent = this._okText
    this.$cancelBtn.textContent = this._cancelText
  }

  /**
   * Open the dialog and resolve with the entered text, or `null` if cancelled.
 * @param message - the label shown above the input
 * @param value - the pre-filled / default value
   */
  prompt (message: string, value: string = '', opts: { title?: string, okText?: string, cancelText?: string } = {}): Promise<string | null> {
    // Resolve any prior, still-open prompt as cancelled before reusing.
    this._settle(null)
    return new Promise((resolve) => {
      this._resolve = resolve
      this.$title.textContent = opts.title ?? message
      this.$message.textContent = message
      this.$okBtn.textContent = opts.okText ?? this._okText
      this.$cancelBtn.textContent = opts.cancelText ?? this._cancelText
      this.$input.value = value
      // Mirror the editor's active theme onto the host so the shadow CSS tokens
      // resolve to the right palette (the dialog lives outside the themed
      // `.svg_editor` scope).
      syncDialogTheme(this)
      this.$dialog.showModal()
      // Focus + select after the dialog paints.
      setTimeout(() => {
        this.$input.focus()
        this.$input.select()
      }, 0)
    })
  }

  /** Resolve the pending promise once and clear it. */
  _settle (result: string | null): void {
    if (this._resolve) {
      const resolve = this._resolve
      this._resolve = null
      resolve(result)
    }
  }

  /** @function connectedCallback */
  connectedCallback (): void {
    const submit = () => {
      const val = this.$input.value
      this.$dialog.close()
      this._settle(val)
    }
    const cancel = () => {
      this.$dialog.close()
      this._settle(null)
    }
    $click(this.$okBtn, submit)
    $click(this.$cancelBtn, cancel)
    $click(this.$closeBtn, cancel)
    this.$input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
    })
    // Closing via backdrop / Esc on the dialog itself counts as cancel.
    this.$dialog.addEventListener('close', () => this._settle(null))
  }
}

// Register
customElements.define('se-text-prompt-dialog', SeTextPromptDialog)

/**
 * Promise-based replacement for the native `window.prompt`. Mirrors `seConfirm`
 * / `seAlert`: a global helper that drives the in-editor dialog.
 * @param scopeEl - element used to find the owning editor's dialog
when multiple svgedit instances share one document (see domScope.js)
 */
const sePrompt = (message: string, value: string = '', opts: { title?: string, okText?: string, cancelText?: string } = {}, scopeEl?: Element): Promise<string | null> => {
  // closestRoot() already falls back to `document` for standalone/no-scopeEl
  // use, so no separate document.querySelector fallback is needed here — one
  // used to follow this call and, whenever the owning container's own dialog
  // couldn't be found (e.g. called before EditorStartup finishes mounting
  // it), silently fell through to whichever editor's dialog the document-wide
  // query happened to hit first.
  const el = closestRoot(scopeEl ?? null).querySelector('se-text-prompt-dialog')
  if (!el) return Promise.resolve(null)
  return el.prompt(message, value, opts)
}

window.sePrompt = sePrompt
