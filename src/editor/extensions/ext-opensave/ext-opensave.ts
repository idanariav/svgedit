// ext-opensave.ts — File open/save/import/append
/* globals seConfirm */
/**
 * @file ext-opensave.ts
 *
 * @license MIT
 *
 * @copyright 2020 OptimistikSAS
 *
 */

import { fileOpen, fileSave } from 'browser-fs-access'
import { insertImageFromHref } from '../../dialogs/insertImage.ts'
import { error as logError } from '@svgedit/svgcanvas/common/logger.ts'

const name = 'opensave'
let handle: FileSystemFileHandle | null | undefined = null

const loadExtensionTranslation = function (svgEditor: EditorInstance) {
  const lang = svgEditor.configObj.pref('lang')
  // Locale files are inlined into the bundle (statically resolved glob).
  const locales = import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: any }>
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, 'translation', translationModule.default, true, true)
  }
}

export default {
  name,
  async init () {
    const svgEditor = (this as unknown) as import('../../Editor.js').default
    const { svgCanvas } = svgEditor
    const { $id, $req } = svgCanvas
    await loadExtensionTranslation(svgEditor)
    const importImage = (e: Event): void => {
      const target = e.target as HTMLInputElement | null
      const fileInput = (target && target.type === 'file') ? target : null
      const resetFileInput = () => {
        if (fileInput) {
          fileInput.value = ''
        }
      }
      // only import files
      const dataTransfer = (e as DragEvent).dataTransfer
      if (dataTransfer && !dataTransfer.types?.includes('Files')) return

      $req('se-prompt-dialog').title = svgEditor.i18next.t('notification.loadingImage')
      $req('se-prompt-dialog').setAttribute('close', 'false')
      e.stopPropagation()
      e.preventDefault()
      const file = (e.type === 'drop') ? dataTransfer?.files[0] : (e.currentTarget as HTMLInputElement).files?.[0]
      if (!file) {
        $req('se-prompt-dialog').setAttribute('close', 'true')
        resetFileInput()
        return
      }

      if (!file.type.includes('image')) {
        resetFileInput()
        return
      }
      // Detected an image
      // svg handling
      let reader: FileReader
      if (file.type.includes('svg')) {
        reader = new FileReader()
        reader.onloadend = (ev) => {
          // imgImport.shiftKey (shift key pressed or not) will determine if import should preserve dimension)
          const newElement = svgCanvas.importSvgString(String(ev.target?.result), shiftKey)
          svgCanvas.alignSelectedElements('m', 'page')
          svgCanvas.alignSelectedElements('c', 'page')
          // highlight imported element, otherwise we get strange empty selectbox
          if (newElement) svgCanvas.selectOnly([newElement])
          $req('se-prompt-dialog').setAttribute('close', 'true')
          resetFileInput()
        }
        reader.readAsText(file)
      } else {
        // bitmap handling
        reader = new FileReader()
        reader.onloadend = () => {
          insertImageFromHref(svgEditor, String(reader.result))
          $req('se-prompt-dialog').setAttribute('close', 'true')
          resetFileInput()
        }
        reader.readAsDataURL(file)
      }
    }
    // create an input with type file to open the filesystem dialog
    const imgImport = document.createElement('input')
    /** shift held on the menu entry: import keeps the file's own dimensions */
    let shiftKey = false
    imgImport.type = 'file'
    imgImport.addEventListener('change', importImage)
    // dropping a svg file will import it in the svg as well
    svgEditor.workarea.addEventListener('drop', importImage)

    const clickClear = async function () {
      const [x, y] = svgEditor.configObj.curConfig.dimensions
      const ok = await seConfirm(svgEditor.i18next.t('notification.QwantToClear'))
      if (ok === 'Cancel') {
        return
      }
      svgEditor.leftPanel.clickSelect()
      svgEditor.svgCanvas.clear()
      svgEditor.svgCanvas.setResolution(x, y)
      svgEditor.updateCanvas(true)
      svgEditor.zoomImage()
      svgEditor.rightPanel.populateLayers()
      svgEditor.topPanel.updateContextPanel()
      svgEditor.topPanel.updateTitle('untitled.svg')
    }

    /**
     * By default,  this.editor.svgCanvas.open() is a no-op. It is up to an extension
     *  mechanism (opera widget, etc.) to call `setCustomHandlers()` which
     *  will make it do something.
     */
    const clickOpen = async function (): Promise<void> {
      // ask user before clearing an unsaved SVG
      const response = await svgEditor.openPrep()
      if (response === 'Cancel') { return }
      svgCanvas.clear()
      try {
        const blob = await fileOpen({
          mimeTypes: ['image/*']
        })
        const svgContent = await blob.text()
        await svgEditor.loadSvgString(svgContent)
        svgEditor.updateCanvas()
        handle = blob.handle
        svgEditor.topPanel.updateTitle(blob.name)
        svgEditor.svgCanvas.runExtensions('onOpenedDocument', {
          name: blob.name,
          lastModified: blob.lastModified,
          size: blob.size,
          type: blob.type
        })
        svgEditor.rightPanel.populateLayers()
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          return logError('Failed to open file', err, 'ext-opensave')
        }
      }
    }
    const b64toBlob = (b64Data: string, contentType = '', sliceSize = 512) => {
      const byteCharacters = atob(b64Data)
      const byteArrays = []
      for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize)
        const byteNumbers = new Array(slice.length)
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        byteArrays.push(byteArray)
      }
      const blob = new Blob(byteArrays, { type: contentType })
      return blob
    }

    const clickSave = async function (type: string): Promise<void> {
      const $editorDialog = $id('se-svg-editor-dialog')
      const editingsource = $editorDialog?.getAttribute('dialog') === 'open'
      if (editingsource) {
        // Save the source editor's text, as its own Save button does.
        const value = (($editorDialog as unknown) as import('../../dialogs/svgSourceDialog.ts').SeSvgSourceEditorDialog).$sourceTxt.value
        svgEditor.saveSourceEditor(new CustomEvent('change', { detail: { value, dialog: 'close' } }))
      } else {
        // In the future, more options can be provided here
        const saveOpts = {
          images: svgEditor.configObj.pref('img_save'),
          round_digits: 2
        }
        // remove the selected outline before serializing
        svgCanvas.clearSelection()
        // Update save options if provided
        if (saveOpts) {
          const saveOptions = svgCanvas.mergeDeep(svgCanvas.getSvgOption(), saveOpts)
          for (const [key, value] of Object.entries(saveOptions)) {
            svgCanvas.setSvgOption(key, value)
          }
        }
        svgCanvas.setSvgOption('apply', true)

        // no need for doctype, see https://jwatt.org/svg/authoring/#doctype-declaration
        const svg = '<?xml version="1.0"?>\n' + svgCanvas.svgCanvasToString()
        const b64Data = svgCanvas.encode64(svg)
        const blob = b64toBlob(b64Data, 'image/svg+xml')
        try {
          if (type === 'save' && handle !== null) {
            const throwIfExistingHandleNotGood = false
            handle = await fileSave(blob, {
              fileName: 'untitled.svg',
              extensions: ['.svg']
            }, handle, throwIfExistingHandleNotGood)
          } else {
            handle = await fileSave(blob, {
              fileName: svgEditor.title,
              extensions: ['.svg']
            })
          }
          if (handle) {
            svgEditor.topPanel.updateTitle(handle.name)
            svgCanvas.runExtensions('onSavedDocument', {
              name: handle.name,
              kind: handle.kind
            })
          }
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            return logError('Failed to save file', err, 'ext-opensave')
          }
        }
      }
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      // The callback should be used to load the DOM with the appropriate UI items
      callback () {
        const buttonTemplate = `
        <se-menu-item id="tool_clear" command="tool_clear" label="opensave.new_doc" shortcut="N" src="new.svg"></se-menu-item>`
        svgCanvas.insertChildAtIndex($req('main_button'), buttonTemplate, 0)
        const openButtonTemplate = '<se-menu-item id="tool_open" command="tool_open" label="opensave.open_image_doc" src="open.svg"></se-menu-item>'
        svgCanvas.insertChildAtIndex($req('main_button'), openButtonTemplate, 1)
        const saveButtonTemplate = '<se-menu-item id="tool_save" command="tool_save" label="opensave.save_doc" shortcut="S" src="saveImg.svg"></se-menu-item>'
        svgCanvas.insertChildAtIndex($req('main_button'), saveButtonTemplate, 2)
        const saveAsButtonTemplate = '<se-menu-item id="tool_save_as" command="tool_save_as" label="opensave.save_as_doc" src="saveImg.svg"></se-menu-item>'
        svgCanvas.insertChildAtIndex($req('main_button'), saveAsButtonTemplate, 3)
        const importButtonTemplate = '<se-menu-item id="tool_import" command="tool_import" label="tools.import_doc" src="importImg.svg"></se-menu-item>'
        svgCanvas.insertChildAtIndex($req('main_button'), importButtonTemplate, 4)

        // The menu entries are views of these commands (`command=` above).
        const register = (id: string, label: string, run: () => void | Promise<void>, extra = {}) =>
          svgEditor.commands.register({ id, label, group: 'Tools', pd: true, run, ...extra })
        register('tool_clear', 'opensave.new_doc', () => clickClear.call(this), { group: 'File' })
        register('tool_open', 'opensave.open_image_doc', () => clickOpen.call(this), { interactive: true })
        register('tool_save', 'opensave.save_doc', () => clickSave.call(this, 'save'), { group: 'File' })
        register('tool_save_as', 'opensave.save_as_doc', () => clickSave.call(this, 'saveas'))
        // tool_import pressed with shiftKey will not scale the SVG: the menu entry's
        // click tells us whether shift was held; any other route (hotkey, commands.run) scales.
        let shiftHeld = false
        $req('tool_import').addEventListener('click', (ev) => { shiftHeld = ev.shiftKey }, { capture: true })
        register('tool_import', 'tools.import_doc', () => {
          shiftKey = shiftHeld
          shiftHeld = false
          imgImport.click()
        }, { interactive: true })
      }
    }
  }
}
