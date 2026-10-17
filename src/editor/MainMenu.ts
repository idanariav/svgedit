// MainMenu.ts — Export, Preferences, Tablet mode toggle (`clickTabletMode`), Hotkey Manager launcher (`tool_hotkeys` → opens `se-hotkey-dialog`), Favorites launcher (`tool_favorites` → opens `se-favorites-dialog`)
import { applyUiMode, isTabletMode } from './uiMode.ts'
import { applyTheme } from './themeUtil.ts'

export type PrefsDialog = import('./dialogs/editorPreferencesDialog.ts').SeEditPrefsDialog

/**
 *
 */
class MainMenu {
  editor: EditorInstance

  /** @param editor svgedit handler */
  constructor (editor: EditorInstance) {
    this.editor = editor
    this.editor.exportWindowCt = 0
  }

  /**
   * Toggle the touch-first tablet shell on/off and persist the choice.
   * */
  clickTabletMode (): void {
    const on = !isTabletMode(this.editor.configObj.pref('tabletMode'))
    this.editor.configObj.pref('tabletMode', on, true)
    applyUiMode(on, this.editor.$svgEditor)
  }

  hidePreferences (): void {
    const { $req } = this.editor // container-scoped lookups (see EditorStartup constructor)
    $req('se-edit-prefs').setAttribute('dialog', 'close')
    this.editor.configObj.preferences = false
  }

  /**
   * Save user preferences based on current values in the UI.
   * @function module:SVGthis.savePreferences
   * */
  async savePreferences (e: CustomEvent): Promise<void> {
    const {
      showrulers,
      baseunit,
      theme,
      scrubfields,
      selectsametolerance,
      pencilstabilization,
      pencilfidelity
    } = e.detail

    if (scrubfields !== undefined) this.editor.configObj.pref('scrub_numeric_fields', scrubfields, true)
    if (selectsametolerance !== undefined) this.editor.configObj.pref('select_same_tolerance', selectsametolerance, true)
    // The pencil reads its settings from the canvas config (a 0-0.95 factor and user units).
    if (pencilstabilization !== undefined) {
      this.editor.configObj.pref('pencil_stabilization', pencilstabilization, true)
      this.editor.configObj.curConfig.pencilStabilization = pencilstabilization / 100
    }
    if (pencilfidelity !== undefined) {
      this.editor.configObj.pref('pencil_fidelity', pencilfidelity, true)
      this.editor.configObj.curConfig.pencilFidelity = pencilfidelity
    }

    if (theme && theme !== (this.editor.configObj.pref('theme') || 'light')) {
      this.editor.configObj.pref('theme', theme)
      applyTheme(theme, this.editor.$svgEditor)
      this.editor.$svgEditor.dispatchEvent(new CustomEvent('svgedit-themechange', { detail: { theme } }))
    }

    // set ruler / unit settings (grid settings live in the grid-settings popover)
    this.editor.configObj.curConfig.showRulers = showrulers
    if (this.editor.configObj.curConfig.showRulers) {
      this.editor.rulers.display(true)
      this.editor.rulers.updateRulers()
    } else {
      this.editor.rulers.display(false)
    }
    this.editor.configObj.curConfig.baseUnit = baseunit
    this.editor.svgCanvas.setConfig(this.editor.configObj.curConfig)
    this.editor.updateCanvas()
    this.hidePreferences()
  }

  /** @returns Resolves to `undefined` */
  async clickExport (e: CustomEvent): Promise<void> {
    if (e?.detail?.trigger !== 'ok' || e?.detail?.imgType === undefined) {
      return
    }
    const imgType = e?.detail?.imgType
    const quality = e?.detail?.quality ? e?.detail?.quality / 100 : 1
    const includeBg = e?.detail?.includeBg ?? false
    const crop = this.resolveFrameCrop(e?.detail?.frameId)
    const scale = Number(e?.detail?.scale) || 1
    // Open placeholder window (prevents popup)

    const openExportWindow = (): void => {
      if (this.editor.configObj.curConfig.exportWindowType === 'new') {
        this.editor.exportWindowCt = (this.editor.exportWindowCt ?? 0) + 1
      }
      this.editor.exportWindowName =
        this.editor.configObj.curConfig.canvasName + this.editor.exportWindowCt
    }
    if (!this.editor.customExportImage) {
      openExportWindow()
    }
    const bkgdColor = this.editor.configObj.curPrefs.bkgd_color
    /* const results = */ await this.editor.svgCanvas.rasterExport(
      imgType,
      quality,
      this.editor.exportWindowName ?? undefined,
      { includeBg, bgcolor: bkgdColor, crop, ...(scale !== 1 && { scale }) }
    )
  }

  /**
   * Resolve an export region picker value to a crop box in viewBox/user-space
   * coordinates. Frames are `[data-frame]` rects whose x/y/width/height
   * attributes are authoritative (svgedit bakes transforms into them on edit);
   * `getBBox()` is used as a fallback.
 * @param frameId - The selected frame's element id, or '' for the whole canvas.
 * @returns The crop box, or null for the whole canvas.
   */
  resolveFrameCrop (frameId?: string): { x: number, y: number, w: number, h: number } | null {
    if (!frameId) return null
    const content = this.editor.svgCanvas.getSvgContent()
    const frame = content?.querySelector(`#${CSS.escape(frameId)}`)
    if (!frame) return null
    const num = (attr: string) => Number(frame.getAttribute(attr))
    let x = num('x')
    let y = num('y')
    let w = num('width')
    let h = num('height')
    if (!w || !h) {
      const bb = (frame as SVGGraphicsElement).getBBox()
      x = bb.x; y = bb.y; w = bb.width; h = bb.height
    }
    return { x, y, w, h }
  }

  showPreferences (): void {
    const { $req } = this.editor // container-scoped lookups (see EditorStartup constructor)
    if (this.editor.configObj.preferences) {
      return
    }
    this.editor.configObj.preferences = true
    $req('se-edit-prefs').setAttribute('theme', this.editor.configObj.pref('theme') || 'light')
    const $editDialog = ($req('se-edit-prefs') as unknown) as PrefsDialog
    $editDialog.scrubFields = String(this.editor.configObj.pref('scrub_numeric_fields')) !== 'false'
    $editDialog.selectSameTolerance = parseFloat(this.editor.configObj.pref('select_same_tolerance')) || 0
    const { pencilStabilization, pencilFidelity } = this.editor.configObj.curConfig
    $editDialog.pencilStabilization = Math.round((pencilStabilization ?? 0.3) * 100)
    $editDialog.pencilFidelity = pencilFidelity ?? 2
    $editDialog.setAttribute('dialog', 'open')
  }

  init () {
    const { $req } = this.editor // container-scoped lookups (see EditorStartup constructor)
    // add Top panel
    const hideTabletToggle = this.editor.configObj.curConfig.hideTabletToggle
    const tabletItem = hideTabletToggle
      ? ''
      : `<se-menu-item id="tool_tablet_mode" command="tool_tablet_mode" label="tools.tablet_mode" src="tablet.svg"></se-menu-item>
        <div role="separator"></div>`
    const template = document.createElement('template')
    template.innerHTML = `
    <se-menu id="main_button" label="Sketch Editor" src="logo.svg" alt="logo">
        <se-menu-item id="tool_export" command="tool_export" label="tools.export_img" src="export.svg"></se-menu-item>
        <div role="separator"></div>
        ${tabletItem}
        <se-menu-item id="tool_command_search" command="tool_command_search" label="tools.command_search" src="search.svg" shortcut="mod+k"></se-menu-item>
        <se-menu-item id="tool_hotkeys" command="tool_hotkeys" label="tools.hotkey_manager" src="keyboard.svg"></se-menu-item>
        <se-menu-item id="tool_favorites" command="tool_favorites" label="tools.favorites_manager" src="star.svg"></se-menu-item>
        <div role="separator"></div>
        <se-menu-item id="tool_editor_prefs" command="tool_editor_prefs" label="config.editor_prefs" src="editPref.svg"></se-menu-item>
    </se-menu>`
    this.editor.$svgEditor.append(template.content.cloneNode(true))

    // The menu entries are views of registry commands (`command=` below, panelCommands.js).
    $req('se-export-dialog').addEventListener(
      'change',
      ((this.clickExport.bind(this) as unknown) as EventListener)
    )
    $req('se-edit-prefs').addEventListener(
      'change',
      ((((e: CustomEvent) => {
        if (e.detail.dialog === 'closed') {
          this.hidePreferences()
        } else {
          this.savePreferences(e)
        }
      }) as unknown) as EventListener)
    )
  }
}

export default MainMenu
