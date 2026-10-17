// imageImportDialog.ts — Insert image dialog (`se-image-import-dialog`) — file upload + URL, self-themed shadow DOM
import imageImportDialogHTML from './imageImportDialog.html'
import { $click } from '@svgedit/svgcanvas/core/dom-utils.ts'
import { syncDialogTheme } from '../themeUtil.ts'

const template = document.createElement('template')
template.innerHTML = imageImportDialogHTML

/**
 * @class SeImageImportDialog
 * A clean, on-brand dialog for inserting an image onto the canvas by file
 * upload (drag-drop or browse, embedded as a data URL) or by URL. Replaces the
 * native browser `prompt()` that the image tool used to show.
 */
export class SeImageImportDialog extends HTMLElement {
  _shadowRoot: ShadowRoot
  $dialog: HTMLDialogElement
  $title: HTMLParagraphElement
  $closeBtn: HTMLButtonElement
  $dropzone: HTMLDivElement
  $dropzoneText: HTMLSpanElement
  $browseBtn: HTMLButtonElement
  $fileInput: HTMLInputElement
  $orText: HTMLSpanElement
  $urlLabel: HTMLLabelElement
  $urlInput: HTMLInputElement
  $previewRow: HTMLDivElement
  $preview: HTMLImageElement
  $previewName: HTMLSpanElement
  $error: HTMLDivElement
  $cancelBtn: HTMLButtonElement
  $okBtn: HTMLButtonElement
  $vaultOr: HTMLDivElement
  $vaultBtn: HTMLButtonElement
  $pathsRow: HTMLLabelElement
  $pathsToggle: HTMLInputElement
  href: string
  vaultLink: string
  locked: boolean
  external: boolean
  editableSvg: string
  asPaths: boolean
  _suppressClose: boolean

  /**
    * @function constructor
    */
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dialog = (this._shadowRoot.querySelector('#image_import_box') as HTMLDialogElement)
    this.$title = (this._shadowRoot.querySelector('#image_import_title') as HTMLParagraphElement)
    this.$closeBtn = (this._shadowRoot.querySelector('#image_import_close') as HTMLButtonElement)
    this.$dropzone = (this._shadowRoot.querySelector('#image_dropzone') as HTMLDivElement)
    this.$dropzoneText = (this._shadowRoot.querySelector('#image_dropzone_text') as HTMLSpanElement)
    this.$browseBtn = (this._shadowRoot.querySelector('#image_browse_btn') as HTMLButtonElement)
    this.$fileInput = (this._shadowRoot.querySelector('#image_file_input') as HTMLInputElement)
    this.$orText = (this._shadowRoot.querySelector('#image_import_or_text') as HTMLSpanElement)
    this.$urlLabel = (this._shadowRoot.querySelector('#image_url_label') as HTMLLabelElement)
    this.$urlInput = (this._shadowRoot.querySelector('#image_url_input') as HTMLInputElement)
    this.$previewRow = (this._shadowRoot.querySelector('#image_preview_row') as HTMLDivElement)
    this.$preview = (this._shadowRoot.querySelector('#image_preview') as HTMLImageElement)
    this.$previewName = (this._shadowRoot.querySelector('#image_preview_name') as HTMLSpanElement)
    this.$error = (this._shadowRoot.querySelector('#image_import_error') as HTMLDivElement)
    this.$cancelBtn = (this._shadowRoot.querySelector('#image_import_cancel') as HTMLButtonElement)
    this.$okBtn = (this._shadowRoot.querySelector('#image_import_ok') as HTMLButtonElement)
    this.$vaultOr = (this._shadowRoot.querySelector('#image_vault_or') as HTMLDivElement)
    this.$vaultBtn = (this._shadowRoot.querySelector('#image_vault_btn') as HTMLButtonElement)
    this.$pathsRow = (this._shadowRoot.querySelector('#image_paths_row') as HTMLLabelElement)
    this.$pathsToggle = (this._shadowRoot.querySelector('#image_paths_toggle') as HTMLInputElement)
    // pending href to insert (data URL for files, raw URL for the URL field)
    this.href = ''
    // optional provenance link carried alongside a vault-imported image
    this.vaultLink = ''
    // whether a vault-imported image should be inserted as a "locked" embed
    this.locked = false
    // whether a vault-imported image should stay an external reference
    // (never embedded), re-resolved by the host on every load
    this.external = false
    // full <svg>…</svg> source for an editable (unlocked) whole-drawing import
    this.editableSvg = ''
    // whether an editable SVG import converts its shapes to <path> elements
    this.asPaths = false
    // guards the dialog's 'close' listener against resetting state while it's
    // briefly released for the host's vault picker (see the vault button
    // handler in connectedCallback)
    this._suppressClose = false
  }

  /** @function init */
  init (i18next: import('i18next').i18n): void {
    this.setAttribute('title', i18next.t('tools.import_image_title'))
    this.setAttribute('drop-text', i18next.t('tools.import_drop_image'))
    this.setAttribute('browse-text', i18next.t('tools.import_browse'))
    this.setAttribute('or-text', i18next.t('tools.import_or'))
    this.setAttribute('url-label', i18next.t('properties.image_url'))
    this.setAttribute('error-text', i18next.t('tools.import_image_error'))
    this.setAttribute('common-ok', i18next.t('tools.import_insert'))
    this.setAttribute('common-cancel', i18next.t('common.cancel'))
  }

  /** @function observedAttributes */
  static get observedAttributes (): string[] {
    return ['dialog', 'title', 'drop-text', 'browse-text', 'or-text', 'url-label', 'error-text', 'common-ok', 'common-cancel']
  }

  /** @function attributeChangedCallback */
  attributeChangedCallback (name: string, oldValue: string, newValue: string): void {
    switch (name) {
      case 'dialog':
        if (newValue === 'open') {
          this.reset()
          // Mirror the editor's active theme onto the host so the shadow CSS
          // tokens resolve to the right palette (the dialog lives outside the
          // themed `.svg_editor` scope).
          syncDialogTheme(this)
          // Reveal the "Import from vault" option only when an embedding host
          // exposes a picker. Standalone svgedit keeps just file/URL.
          const hasVault = typeof window.svgEditHost?.pickVaultImage === 'function'
          this.$vaultBtn.style.display = hasVault ? '' : 'none'
          this.$vaultOr.style.display = hasVault ? '' : 'none'
          this.$dialog.showModal()
        } else {
          this.$dialog.close()
        }
        break
      case 'title':
        this.$title.textContent = newValue
        break
      case 'drop-text':
        this.$dropzoneText.textContent = newValue
        break
      case 'browse-text':
        this.$browseBtn.textContent = newValue
        break
      case 'or-text':
        this.$orText.textContent = newValue
        break
      case 'url-label':
        this.$urlLabel.textContent = newValue
        break
      case 'error-text':
        this.$error.textContent = newValue
        break
      case 'common-ok':
        this.$okBtn.textContent = newValue
        break
      case 'common-cancel':
        this.$cancelBtn.textContent = newValue
        break
      default:
        break
    }
  }

  /** @function get */
  get dialog (): string | null {
    return this.getAttribute('dialog')
  }

  /** @function set */
  set dialog (value: string | number) {
    this.setAttribute('dialog', String(value))
  }

  /** Clear all pending state and UI back to the empty dialog. */
  reset (): void {
    this.href = ''
    this.vaultLink = ''
    this.locked = false
    this.external = false
    this.editableSvg = ''
    this.asPaths = false
    this.$pathsToggle.checked = false
    this.$pathsRow.classList.remove('show')
    this.$fileInput.value = ''
    this.$urlInput.value = ''
    this.$previewRow.classList.remove('show')
    this.$preview.removeAttribute('src')
    this.$previewName.textContent = ''
    this.$error.classList.remove('show')
    this.$dropzone.classList.remove('dragover')
    this.$okBtn.disabled = true
  }

  /** Show a preview thumbnail and enable the Insert button. */
  showPreview (href: string, name: string = ''): void {
    this.href = href
    this.$preview.src = href
    this.$previewName.textContent = name
    this.$previewRow.classList.add('show')
    this.$error.classList.remove('show')
    this.$okBtn.disabled = false
  }

  /**
   * Read a File object as a data URL and preview it.
   * SVG files are additionally read as text and stashed in `editableSvg` so the
   * insert routes through `insertSvgElements` (real, editable elements) rather
   * than being flattened into a locked `<image>` embed like a raster file.
   */
  handleFile (file: File): void {
    if (!file || !file.type.includes('image')) return
    // A locally-picked file has no vault provenance; drop any stale link.
    this.vaultLink = ''
    this.locked = false
    this.external = false
    this.editableSvg = ''
    const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)
    // The "import as paths" toggle only applies to editable SVG imports.
    this.$pathsRow.classList.toggle('show', isSvg)
    const reader = new FileReader()
    reader.onloadend = () => {
      this.showPreview((reader.result as string), file.name)
    }
    reader.readAsDataURL(file)
    if (isSvg) {
      const textReader = new FileReader()
      textReader.onloadend = () => {
        this.editableSvg = (textReader.result as string)
      }
      textReader.readAsText(file)
    }
  }

  /** @function connectedCallback */
  connectedCallback (): void {
    const close = () => this.setAttribute('dialog', 'close')

    // Browse / dropzone click open the native file picker
    $click(this.$browseBtn, (e) => {
      e.stopPropagation()
      this.$fileInput.click()
    })
    $click(this.$dropzone, () => this.$fileInput.click())
    this.$dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        this.$fileInput.click()
      }
    })

    this.$fileInput.addEventListener('change', (e) => {
      this.handleFile(((e.target as HTMLInputElement).files as FileList)[0])
    })

    // Drag & drop onto the zone
    const stop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    this.$dropzone.addEventListener('dragover', (e) => {
      stop(e)
      this.$dropzone.classList.add('dragover')
    })
    this.$dropzone.addEventListener('dragleave', (e) => {
      stop(e)
      this.$dropzone.classList.remove('dragover')
    })
    this.$dropzone.addEventListener('drop', (e) => {
      stop(e)
      this.$dropzone.classList.remove('dragover')
      this.handleFile((e.dataTransfer as DataTransfer).files[0])
    })

    // URL field
    const onUrl = () => {
      const url = this.$urlInput.value.trim()
      if (!url) {
        this.reset()
        return
      }
      // A pasted URL has no vault provenance; drop any stale link. URL imports
      // are locked <image> embeds, so the "import as paths" toggle never applies.
      this.vaultLink = ''
      this.locked = false
      this.external = false
      this.editableSvg = ''
      this.$pathsRow.classList.remove('show')
      // probe the URL; only enable insert once it loads
      const probe = new Image()
      probe.onload = () => this.showPreview(url)
      probe.onerror = () => {
        this.href = ''
        this.$previewRow.classList.remove('show')
        this.$error.classList.add('show')
        this.$okBtn.disabled = true
      }
      probe.src = url
    }
    this.$urlInput.addEventListener('change', onUrl)
    this.$urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onUrl()
      }
    })

    // Vault import — delegates to the embedding host's picker. The host returns
    // a data URL (embedded inline) plus a provenance `link` to record.
    $click(this.$vaultBtn, async () => {
      // A native <dialog> shown via showModal() renders in the browser's top
      // layer, which always paints above regular (non-native) content —
      // including the host's own modal system (e.g. Obsidian's file picker).
      // Release it for the duration of the host picker so that picker isn't
      // stuck behind an unusable backdrop, then reclaim it to show the result.
      this._suppressClose = true
      this.$dialog.close()
      const r = await window.svgEditHost?.pickVaultImage?.()
      this.$dialog.showModal()
      this._suppressClose = false
      if (!r) return
      this.vaultLink = r.link || ''
      // An editable (unlocked) whole-drawing import carries the full <svg>
      // source; `locked` is irrelevant in that case (editable implies unlocked).
      this.editableSvg = r.editableSvg || ''
      this.locked = this.editableSvg ? false : !!r.locked
      this.external = this.editableSvg ? false : !!r.external
      // Offer the "import as paths" toggle only for editable SVG imports.
      this.$pathsRow.classList.toggle('show', !!this.editableSvg)
      this.showPreview(r.dataUrl)
    })

    // "Import as paths" toggle — default off (native shapes).
    this.$pathsToggle.addEventListener('change', () => {
      this.asPaths = this.$pathsToggle.checked
    })

    // Footer + close
    $click(this.$cancelBtn, close)
    $click(this.$closeBtn, close)
    this.$dialog.addEventListener('close', () => {
      if (this._suppressClose) return
      this.reset()
    })
    $click(this.$okBtn, () => {
      if (!this.href) return
      this.dispatchEvent(new CustomEvent('change', {
        detail: { trigger: 'ok', href: this.href, vaultLink: this.vaultLink || undefined, locked: this.locked || undefined, external: this.external || undefined, editableSvg: this.editableSvg || undefined, asPaths: this.asPaths || undefined }
      }))
      close()
    })
  }
}

// Register
customElements.define('se-image-import-dialog', SeImageImportDialog)
