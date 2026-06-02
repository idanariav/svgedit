/* globals svgEditor */
import imageImportDialogHTML from './imageImportDialog.html'

const template = document.createElement('template')
template.innerHTML = imageImportDialogHTML

/**
 * @class SeImageImportDialog
 * A clean, on-brand dialog for inserting an image onto the canvas by file
 * upload (drag-drop or browse, embedded as a data URL) or by URL. Replaces the
 * native browser `prompt()` that the image tool used to show.
 */
export class SeImageImportDialog extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$dialog = this._shadowRoot.querySelector('#image_import_box')
    this.$title = this._shadowRoot.querySelector('#image_import_title')
    this.$closeBtn = this._shadowRoot.querySelector('#image_import_close')
    this.$dropzone = this._shadowRoot.querySelector('#image_dropzone')
    this.$dropzoneText = this._shadowRoot.querySelector('#image_dropzone_text')
    this.$browseBtn = this._shadowRoot.querySelector('#image_browse_btn')
    this.$fileInput = this._shadowRoot.querySelector('#image_file_input')
    this.$orText = this._shadowRoot.querySelector('#image_import_or_text')
    this.$urlLabel = this._shadowRoot.querySelector('#image_url_label')
    this.$urlInput = this._shadowRoot.querySelector('#image_url_input')
    this.$previewRow = this._shadowRoot.querySelector('#image_preview_row')
    this.$preview = this._shadowRoot.querySelector('#image_preview')
    this.$previewName = this._shadowRoot.querySelector('#image_preview_name')
    this.$error = this._shadowRoot.querySelector('#image_import_error')
    this.$cancelBtn = this._shadowRoot.querySelector('#image_import_cancel')
    this.$okBtn = this._shadowRoot.querySelector('#image_import_ok')
    // pending href to insert (data URL for files, raw URL for the URL field)
    this.href = ''
  }

  /**
   * @function init
   * @param {any} i18next
   * @returns {void}
   */
  init (i18next) {
    this.setAttribute('title', i18next.t('tools.import_image_title'))
    this.setAttribute('drop-text', i18next.t('tools.import_drop_image'))
    this.setAttribute('browse-text', i18next.t('tools.import_browse'))
    this.setAttribute('or-text', i18next.t('tools.import_or'))
    this.setAttribute('url-label', i18next.t('properties.image_url'))
    this.setAttribute('error-text', i18next.t('tools.import_image_error'))
    this.setAttribute('common-ok', i18next.t('tools.import_insert'))
    this.setAttribute('common-cancel', i18next.t('common.cancel'))
  }

  /**
   * @function observedAttributes
   * @returns {string[]}
   */
  static get observedAttributes () {
    return ['dialog', 'title', 'drop-text', 'browse-text', 'or-text', 'url-label', 'error-text', 'common-ok', 'common-cancel']
  }

  /**
   * @function attributeChangedCallback
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   * @returns {void}
   */
  attributeChangedCallback (name, oldValue, newValue) {
    switch (name) {
      case 'dialog':
        if (newValue === 'open') {
          this.reset()
          // Mirror the editor's active theme onto the host so the shadow CSS
          // tokens resolve to the right palette (the dialog lives outside the
          // themed `.svg_editor` scope).
          this.classList.toggle('theme-dark', !!document.querySelector('.svg_editor')?.classList.contains('theme-dark'))
          this.$dialog.open()
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

  /**
   * @function get
   * @returns {any}
   */
  get dialog () {
    return this.getAttribute('dialog')
  }

  /**
   * @function set
   * @returns {void}
   */
  set dialog (value) {
    this.setAttribute('dialog', value)
  }

  /**
   * Clear all pending state and UI back to the empty dialog.
   * @returns {void}
   */
  reset () {
    this.href = ''
    this.$fileInput.value = ''
    this.$urlInput.value = ''
    this.$previewRow.classList.remove('show')
    this.$preview.removeAttribute('src')
    this.$previewName.textContent = ''
    this.$error.classList.remove('show')
    this.$dropzone.classList.remove('dragover')
    this.$okBtn.disabled = true
  }

  /**
   * Show a preview thumbnail and enable the Insert button.
   * @param {string} href
   * @param {string} [name]
   * @returns {void}
   */
  showPreview (href, name = '') {
    this.href = href
    this.$preview.src = href
    this.$previewName.textContent = name
    this.$previewRow.classList.add('show')
    this.$error.classList.remove('show')
    this.$okBtn.disabled = false
  }

  /**
   * Read a File object as a data URL and preview it.
   * @param {File} file
   * @returns {void}
   */
  handleFile (file) {
    if (!file || !file.type.includes('image')) return
    const reader = new FileReader()
    reader.onloadend = ({ target: { result } }) => {
      this.showPreview(result, file.name)
    }
    reader.readAsDataURL(file)
  }

  /**
   * @function connectedCallback
   * @returns {void}
   */
  connectedCallback () {
    const close = () => this.setAttribute('dialog', 'close')

    // Browse / dropzone click open the native file picker
    svgEditor.$click(this.$browseBtn, (e) => {
      e.stopPropagation()
      this.$fileInput.click()
    })
    svgEditor.$click(this.$dropzone, () => this.$fileInput.click())
    this.$dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        this.$fileInput.click()
      }
    })

    this.$fileInput.addEventListener('change', (e) => {
      this.handleFile(e.target.files[0])
    })

    // Drag & drop onto the zone
    const stop = (e) => {
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
      this.handleFile(e.dataTransfer.files[0])
    })

    // URL field
    const onUrl = () => {
      const url = this.$urlInput.value.trim()
      if (!url) {
        this.reset()
        return
      }
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

    // Footer + close
    svgEditor.$click(this.$cancelBtn, close)
    svgEditor.$click(this.$closeBtn, close)
    this.$dialog.addEventListener('close', () => this.reset())
    svgEditor.$click(this.$okBtn, () => {
      if (!this.href) return
      this.dispatchEvent(new CustomEvent('change', {
        detail: { trigger: 'ok', href: this.href }
      }))
      close()
    })
  }
}

// Register
customElements.define('se-image-import-dialog', SeImageImportDialog)
