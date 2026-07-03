const template = document.createElement('template')
template.innerHTML = `
  <style>
    dialog {
      padding: 1em;
      background: #CCC;
      width: 300px;
      border: 1px outset #777;
      font-size: 0.8em;
      font-family: Verdana, Helvetica, sans-serif;
      border-radius: 5px;
    }
    dialog::backdrop {
      background: rgba(0, 0, 0, 0.2);
    }
    #se-content-alert {
      height: 95px;
      background: #DDD;
      overflow: auto;
      text-align: left;
      border: 1px solid #5a6162;
      padding: 1em;
      border-radius: 5px;
    }
    #choiceButtonContainer {
      margin-top: 1em;
      text-align: center;
    }
    #choiceButtonContainer button:not(:first-child) {
      margin-left: 0.5em;
    }
  </style>
  <dialog>
    <div id="se-content-alert">
      <slot></slot>
    </div>
    <div id="choiceButtonContainer"></div>
  </dialog>
`

/**
 * @class SePlainAlertDialog
 * A single-question modal: shows the host element's light-DOM content and a
 * row of choice buttons (one per string in `choices`), resolving via
 * `whenClosed()` to `{ choice }` — the clicked button's label, the choice
 * matching a pressed first-letter key, or (on Escape) nothing, mirroring
 * `keyChoice` being set instead. Replaces the previous elix `PlainAlertDialog`
 * subclass; `choices`/`open()`/`close()`/`opened`/`whenClosed()`/`keyChoice`
 * are the same public surface its four consumers (seAlertDialog,
 * seConfirmDialog, sePromptDialog, seSelectDialog) already used.
 */
export default class SePlainAlertDialog extends HTMLElement {
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dialog = this._shadowRoot.querySelector('dialog')
    this.$buttonContainer = this._shadowRoot.querySelector('#choiceButtonContainer')

    this._choices = ['OK']
    this.keyChoice = null
    this._pendingResult = undefined
    this._autoAttached = false
    this._closeResolvers = []

    // Elix's AlertDialog let the user pick a choice by its initial letter;
    // Escape recorded a 'Cancel' keyChoice for callers to fall back on
    // (native showModal() already closes on Escape on its own).
    this.$dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.keyChoice = 'Cancel'
        this._pendingResult = undefined
        return
      }
      const key = e.key.length === 1 && e.key.toLowerCase()
      if (!key) return
      const choice = this._choices.find(c => c[0]?.toLowerCase() === key)
      if (choice) this.close({ choice })
    })

    this.$buttonContainer.addEventListener('click', (e) => {
      const button = e.target
      if (button instanceof HTMLButtonElement) {
        this.close({ choice: button.textContent })
      }
    })

    this.$dialog.addEventListener('close', () => {
      const result = this._pendingResult ?? {}
      this._pendingResult = undefined
      const resolvers = this._closeResolvers
      this._closeResolvers = []
      resolvers.forEach(resolve => resolve(result))
      if (this._autoAttached) {
        this._autoAttached = false
        this.remove()
      }
    })
  }

  get choices () {
    return this._choices
  }

  set choices (choices) {
    this._choices = choices
    this.$buttonContainer.replaceChildren(
      ...choices.map(choice => {
        const btn = document.createElement('button')
        btn.textContent = choice
        return btn
      })
    )
  }

  get opened () {
    return this.$dialog.open
  }

  /**
   * Opens the dialog, auto-attaching it to the end of `document.body` if it
   * isn't already in the document (matching elix Overlay's convenience
   * behavior); if auto-attached, it's removed again on close.
   * @returns {void}
   */
  open () {
    this.keyChoice = null
    this._pendingResult = undefined
    if (!this.isConnected) {
      document.body.appendChild(this)
      this._autoAttached = true
    }
    this.$dialog.showModal()
  }

  /**
   * @param {{choice: string}} [result]
   * @returns {void}
   */
  close (result) {
    this._pendingResult = result
    if (this.$dialog.open) this.$dialog.close()
  }

  /**
   * @returns {Promise<{choice?: string}>} Resolves with the close result
   *  once the dialog closes (immediately if already closed).
   */
  whenClosed () {
    if (!this.$dialog.open) return Promise.resolve(this._pendingResult ?? {})
    return new Promise(resolve => this._closeResolvers.push(resolve))
  }
}

customElements.define('se-elix-alert-dialog', SePlainAlertDialog)
