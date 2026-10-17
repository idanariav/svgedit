// RightPanel.ts — Tabbed properties panel: `activateTab`/`autoSelectTab` + layer ops
/* globals seAlert, sePrompt */
import SvgCanvas from '@svgedit/svgcanvas'
import RightPanelHtml from './RightPanel.html'
import { localizePanelFragment } from '../panelI18n.ts'
import { fetchSvgEl } from '../components/svgIconLoader.ts'
import { traceImageToSvg } from '../dialogs/traceImage.ts'
import { LayerTree } from './layerTree.ts'
import { LayerGestures } from './layerGestures.ts'

const { $click } = SvgCanvas

// Sentinel value used as the last option of the "Move elements to" dropdown.
// Selecting it creates a new layer and moves the selection there in one step.
export const NEW_LAYER_OPTION_VALUE = '__svgedit_move_to_new_layer__'

/**
 *
 */
/** Render the open/closed padlock into a lock-cell's icon span. */
const renderLockIcon = (span: Element, locked: boolean): void => {
  while (span.firstChild) { span.removeChild(span.firstChild) }
  fetchSvgEl(locked ? 'lock.svg' : 'lock_open.svg').then(svg => { if (svg) span.appendChild(svg) })
}

class RightPanel {
  updateContextPanel: () => void
  editor: EditorInstance
  activeTab: string
  layerTree: LayerTree
  layerGestures: LayerGestures

  /** the user group the Objects section names (see `updateObjectList`) */ _groupContext: Element | null = null

  constructor (editor: EditorInstance) {
    this.updateContextPanel = editor.topPanel.updateContextPanel.bind(editor.topPanel)
    this.editor = editor
    this.activeTab = 'design'
    this.layerTree = new LayerTree(editor)
    this.layerGestures = new LayerGestures(editor)
  }

  /** Show one of the right-panel tabs (Design / Text / Effects / Layers). */
  activateTab (name: string): void {
    this.activeTab = name
    ;(this.editor.$qa('#sidepanel_tabs .sidepanel_tab') as HTMLElement[]).forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === name)
    })
    ;(this.editor.$qa('#sidepanel_content .sidepanel_tabpanel') as HTMLElement[]).forEach((panel) => {
      panel.classList.toggle('active', panel.id === `tab_${name}`)
    })
    // The object rows are not kept current while the tab is hidden.
    if (name === 'layers') this.layerTree.refresh()
  }

  /**
   * Pick the most relevant tab for the current selection: text elements open the
   * Text tab; any other selection falls back to Design (only if the user was on
   * Text). Other tabs are left as the user set them.
   */
  autoSelectTab (elem: Element | null, multiselected: boolean): void {
    const sel = this.editor.svgCanvas.getSelectedElements().filter(Boolean)
    const isText =
      elem?.tagName === 'text' ||
      (multiselected && sel.length > 0 && sel.every(/** @type {{ tagName: string; }} */ (e: { tagName: string; }) => e.tagName === 'text'))
    if (isText) {
      this.activateTab('text')
    } else if ((elem || multiselected) && this.activeTab === 'text') {
      this.activateTab('design')
    }
  }

  /** @param e event */
  lmenuFunc (e: PlainObject): void {
    const action = e?.detail?.trigger
    switch (action) {
      case 'dupe':
        this.cloneLayer()
        break
      case 'delete':
        this.deleteLayer()
        break
      case 'merge_down':
        this.mergeLayer()
        break
      case 'merge_all':
        this.editor.svgCanvas.mergeAllLayers()
        this.updateContextPanel()
        this.populateLayers()
        break
    }
  }

  init (): void {
    const { $id, $req } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const template = document.createElement('template')
    const { i18next } = this.editor

    template.innerHTML = RightPanelHtml
    localizePanelFragment(template.content, i18next)
    this.editor.$svgEditor.append(template.content.cloneNode(true))
    // layer menu added to DOM
    const menuMore = document.createElement('se-cmenu-layers')
    menuMore.setAttribute('id', 'se-cmenu-layers-more')
    menuMore.value = 'layer_moreopts'
    menuMore.setAttribute('leftclick', 'true')
    this.editor.$container.append(menuMore)
    menuMore.init(i18next)
    const menuLayerBox = document.createElement('se-cmenu-layers')
    menuLayerBox.setAttribute('id', 'se-cmenu-layers-list')
    menuLayerBox.value = 'layerlist'
    menuLayerBox.setAttribute('leftclick', 'false')
    this.editor.$container.append(menuLayerBox)
    menuLayerBox.init(i18next)
    this.layerTree.attach()
    this.layerGestures.attach()
    $req('se-cmenu-layers-more').addEventListener('change', this.lmenuFunc.bind(this))
    $req('se-cmenu-layers-list').addEventListener('change', (e) => { this.lmenuFunc(e) })
    $click($req('sidepanel_handle'), () => {
      // A manual toggle means the user has an opinion: never auto-open again.
      this.editor.configObj.pref('sidePanelManual', true, true)
      this.toggleSidePanel()
    })
    // "Convert to editable SVG" (image trace): the `tool_trace_image` command opens
    // the options dialog (openTraceDialog); the trace runs when the user confirms.
    const traceDialog = $id('se-trace-dialog') as HTMLElementTagNameMap['se-trace-dialog'] | null
    traceDialog?.addEventListener('change', async (event) => {
      const e = event as CustomEvent
      if (e.detail?.trigger !== 'ok') return
      const img = traceDialog._targetImage
      if (!img) return
      traceDialog.setBusy(true)
      try {
        await traceImageToSvg(this.editor, img, {
          preset: e.detail.preset,
          numberofcolors: e.detail.numberofcolors
        })
        traceDialog.setAttribute('dialog', 'close')
      } catch (err) {
        traceDialog.showError(err instanceof Error ? err.message : String(err))
      }
    })
    // Tab bar (Design / Text / Effects / Layers)
    ;(this.editor.$qa('#sidepanel_tabs .sidepanel_tab') as HTMLElement[]).forEach((btn) => {
      $click(btn, () => this.activateTab(String(btn.dataset.tab)))
    })
    this.activateTab(this.activeTab)
    this.toggleSidePanel(this.editor.configObj.curConfig.showlayers)
    this.autoOpenOnFirstSelection()

    // Group name input in objects panel — renames the group context, not necessarily
    // the currently selected element (which may be a child of the group).
    $id('group_name_input')?.addEventListener('change', (evt) => {
      const g = this._groupContext
      if (!g) return
      g.setAttribute('data-name', (evt.target as HTMLInputElement).value)
    })
  }

  /**
   * The panel starts closed, so the editor stays uncluttered, but a first
   * selection is when its fields become useful: open it once, in a pane wide
   * enough to spare the space, unless the user ever toggled it by hand.
   */
  autoOpenOnFirstSelection (): void {
    const { configObj, svgCanvas, $svgEditor } = this.editor
    let pending = true
    svgCanvas.bind('selected', (_win, elems: Element[] | undefined) => {
      if (!pending || !elems?.some(Boolean)) return
      pending = false
      const manual = String(configObj.pref('sidePanelManual')) === 'true'
      if (manual || $svgEditor.classList.contains('ui-tablet') || $svgEditor.clientWidth < 1100) return
      this.toggleSidePanel(true)
    })
  }

  toggleSidePanel (displayFlag?: boolean | undefined) {
    if (displayFlag === undefined) {
      this.editor.$svgEditor.classList.toggle('open')
    } else if (displayFlag) {
      this.editor.$svgEditor.classList.add('open')
    } else {
      this.editor.$svgEditor.classList.remove('open')
    }
  }

  /**
   * Prompt the user for a unique new layer name, suggesting the next "Layer N".
   * Returns the chosen name, or null if the user cancelled or the name is taken.
   */
  async promptUniqueLayerName (): Promise<string | null> {
    let uniqName
    let i = this.editor.svgCanvas.getCurrentDrawing().getNumLayers()
    do {
      uniqName = this.editor.i18next.t('layers.layer') + ' ' + ++i
    } while (this.editor.svgCanvas.getCurrentDrawing().hasLayer(uniqName))

    const newName = await sePrompt(
      this.editor.i18next.t('notification.enterUniqueLayerName'),
      uniqName,
      {},
      this.editor.$svgEditor
    )
    if (!newName) {
      return null
    }
    if (this.editor.svgCanvas.getCurrentDrawing().hasLayer(newName)) {
      seAlert(this.editor.i18next.t('notification.dupeLayerName'))
      return null
    }
    return newName
  }

  /**
   * "Convert to editable SVG": open the trace options dialog for the selected
   * `<image>` (the `tool_trace_image` command). The trace itself runs when the
   * user confirms (see the dialog's `change` listener in init()).
   */
  openTraceDialog (): void {
    const traceDialog = this.editor.$req('se-trace-dialog') as HTMLElementTagNameMap['se-trace-dialog']
    const sel = this.editor.svgCanvas.getSelectedElements().filter(Boolean)
    if (sel[0]?.tagName !== 'image') return
    traceDialog._targetImage = sel[0]
    traceDialog.setAttribute('dialog', 'open')
  }

  async newLayer (): Promise<void> {
    const newName = await this.promptUniqueLayerName()
    if (!newName) {
      return
    }
    this.editor.svgCanvas.createLayer(newName)
    this.updateContextPanel()
    this.populateLayers()
  }

  /**
   * Create a new layer and move the currently selected elements onto it,
   * combining the "new layer" and "move elements to" actions into one step.
   */
  async moveSelectedToNewLayer (): Promise<void> {
    const newName = await this.promptUniqueLayerName()
    if (!newName) {
      // Restore the dropdown so it no longer shows the "+ New layer…" option.
      this.populateLayers()
      return
    }
    // createLayer clears the selection, so capture it first and re-select before
    // moving (moveSelectedToLayer acts on the current selection).
    const selected = this.editor.svgCanvas.getSelectedElements().filter(Boolean)
    this.editor.svgCanvas.createLayer(newName)
    this.editor.svgCanvas.selectOnly(selected)
    this.editor.svgCanvas.moveSelectedToLayer(newName)
    this.editor.svgCanvas.clearSelection()
    this.updateContextPanel()
    this.populateLayers()
  }

  deleteLayer (): void {
    if (this.editor.svgCanvas.deleteCurrentLayer()) {
      this.updateContextPanel()
      this.populateLayers()
      // This matches what this.editor.svgCanvas does
      // TODO: make this behavior less brittle (svg-editor should get which
      // layer is selected from the canvas and then select that one in the UI)
      const elements = this.editor.$qa('#layerlist tr.layer')
      Array.prototype.forEach.call(elements, function (el) {
        el.classList.remove('layersel')
      })
      ;(this.editor.$qq('#layerlist tr.layer') as Element).classList.add('layersel')
    }
  }

  async cloneLayer (): Promise<void> {
    const name =
      this.editor.svgCanvas.getCurrentDrawing().getCurrentLayerName() + ' copy'

    const newName = await sePrompt(
      this.editor.i18next.t('notification.enterUniqueLayerName'),
      name,
      {},
      this.editor.$svgEditor
    )
    if (!newName) {
      return
    }
    if (this.editor.svgCanvas.getCurrentDrawing().hasLayer(newName)) {
      seAlert(this.editor.i18next.t('notification.dupeLayerName'))
      return
    }
    this.editor.svgCanvas.cloneLayer(newName)
    this.updateContextPanel()
    this.populateLayers()
  }

  /**
 * @param el a layer row
 * @returns its position among the layer rows
   */
  index (el: Element | null): number {
    if (!el) return -1
    return Array.from((this.editor.$qq('#layerlist tbody') as Element).children).filter(tr => !tr.classList.contains('object') && !tr.classList.contains('objmore')).indexOf(el)
  }

  mergeLayer (): void {
    if (
      (this.index(this.editor.$qq('#layerlist tr.layersel')) - 1) ===
      this.editor.svgCanvas.getCurrentDrawing().getNumLayers() - 1
    ) {
      return
    }
    this.editor.svgCanvas.mergeLayer()
    this.updateContextPanel()
    this.populateLayers()
  }

  moveLayer (pos: number): void {
    const curPos = this.editor.svgCanvas.indexCurrentLayer()
    if (curPos !== -1) {
      this.editor.svgCanvas.setCurrentLayerPosition(curPos - pos)
      this.populateLayers()
    }
  }

  async layerRename (): Promise<void> {
    const ele = this.editor.$qq('#layerlist tr.layersel td.layername')
    const oldName = (ele) ? ele.textContent : ''
    const newName = await sePrompt(this.editor.i18next.t('notification.enterNewLayerName'), oldName, {}, this.editor.$svgEditor)
    if (!newName) {
      return
    }
    if (
      oldName === newName ||
      this.editor.svgCanvas.getCurrentDrawing().hasLayer(newName)
    ) {
      seAlert(this.editor.i18next.t('notification.layerHasThatName'))
      return
    }
    this.editor.svgCanvas.renameCurrentLayer(newName)
    this.populateLayers()
  }

  /**
   * This function highlights the layer passed in (by fading out the other layers).
   * If no layer is passed in, this function restores the other layers.
   */
  toggleHighlightLayer (layerNameToHighlight?: string): void {
    let i
    const curNames = []
    const numLayers = this.editor.svgCanvas.getCurrentDrawing().getNumLayers()
    for (i = 0; i < numLayers; i++) {
      curNames[i] = this.editor.svgCanvas.getCurrentDrawing().getLayerName(i)
    }

    if (layerNameToHighlight) {
      curNames.forEach((curName) => {
        if (curName !== layerNameToHighlight) {
          this.editor.svgCanvas
            .getCurrentDrawing()
            .setLayerOpacity(curName, 0.5)
        }
      })
    } else {
      curNames.forEach((curName) => {
        this.editor.svgCanvas.getCurrentDrawing().setLayerOpacity(curName, 1.0)
      })
    }
  }

  populateLayers (): void {
    const { $req } = this.editor // container-scoped lookups (see EditorStartup constructor)
    this.editor.svgCanvas.clearSelection()
    const self = this
    const layerlist = $req('layerlist').querySelector('tbody') as HTMLTableSectionElement
    while (layerlist.firstChild) { layerlist.removeChild(layerlist.firstChild) }

    $req('selLayerNames').setAttribute('options', '')
    const drawing = this.editor.svgCanvas.getCurrentDrawing()
    const currentLayerName = drawing.getCurrentLayerName()
    let layer = this.editor.svgCanvas.getCurrentDrawing().getNumLayers()
    // we get the layers in the reverse z-order (the layer rendered on top is listed first)
    let values = ''
    let text = ''
    while (layer--) {
      const name = drawing.getLayerName(layer)
      const layerTr = document.createElement('tr')
      layerTr.className = (name === currentLayerName) ? 'layer layersel' : 'layer'
      const layerToggle = document.createElement('td')
      layerToggle.className = 'layertoggle'
      layerToggle.title = this.editor.i18next.t('layers.obj_toggle')
      const layerVis = document.createElement('td')
      layerVis.className = (!drawing.getLayerVisibility(name)) ? 'layerinvis layervis' : 'layervis'
      layerVis.title = this.editor.i18next.t('layers.vis_hint')

      // fix the eye icon lost at right layers (inline SVG from the bundle)
      const _eye = document.createElement('span')
      _eye.style.width = '14px'
      _eye.style.height = '14px'
      _eye.style.display = 'inline-block'
      fetchSvgEl('eye.svg').then(svg => { if (svg) _eye.appendChild(svg) })
      layerVis.appendChild(_eye)

      const layerLock = document.createElement('td')
      layerLock.className = drawing.getLayerLocked(name) ? 'layerlock locked' : 'layerlock'
      layerLock.title = this.editor.i18next.t('layers.lock_hint')
      const _lock = document.createElement('span')
      _lock.style.width = '14px'
      _lock.style.height = '14px'
      _lock.style.display = 'inline-block'
      // Open padlock when unlocked (signals it's clickable), closed when locked.
      renderLockIcon(_lock, drawing.getLayerLocked(name))
      layerLock.appendChild(_lock)

      const layerComment = document.createElement('td')
      layerComment.className = 'layercomment' + (drawing.getLayerComment(name) ? ' commented' : '') +
        (drawing.getLayerTemplate(name) ? ' templated' : '')
      layerComment.title = this.editor.i18next.t('layers.comment_hint')
      const _comment = document.createElement('span')
      _comment.style.width = '14px'
      _comment.style.height = '14px'
      _comment.style.display = 'inline-block'
      fetchSvgEl('comment.svg').then(svg => { if (svg) _comment.appendChild(svg) })
      layerComment.appendChild(_comment)

      // Small live preview of the layer's contents: an inline <svg> whose only
      // child is a <use> pointing at the layer's own group element. Since the
      // group already lives in the same document (the canvas is not an
      // iframe), the <use> mirrors it continuously with no manual redraws —
      // it reflects new/edited/moved shapes as they happen, not just the
      // layer-list-changing events that repopulate this table.
      const layerPreview = document.createElement('td')
      layerPreview.className = 'layerpreview'
      const layerGroup = drawing.getLayerByName(name)
      if (layerGroup) {
        // <use> can only target an id, so lazily stamp one the first time a
        // layer group is previewed; harmless and persists for the group's
        // lifetime (same convention every other canvas element already uses).
        if (!layerGroup.getAttribute('id')) {
          layerGroup.setAttribute('id', this.editor.svgCanvas.getNextId())
        }
        const svgNs = 'http://www.w3.org/2000/svg'
        const thumb = document.createElementNS(svgNs, 'svg')
        thumb.setAttribute('class', 'layerpreview-thumb')
        thumb.setAttribute('preserveAspectRatio', 'xMidYMid meet')
        const res = this.editor.svgCanvas.getResolution()
        thumb.setAttribute('viewBox', `0 0 ${res.w} ${res.h}`)
        const use = document.createElementNS(svgNs, 'use')
        use.setAttribute('href', `#${layerGroup.getAttribute('id')}`)
        use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `#${layerGroup.getAttribute('id')}`)
        thumb.appendChild(use)
        layerPreview.appendChild(thumb)
      }

      const layerName = document.createElement('td')
      layerName.className = 'layername'
      layerName.textContent = name
      layerTr.appendChild(layerToggle)
      layerTr.appendChild(layerVis)
      layerTr.appendChild(layerLock)
      layerTr.appendChild(layerComment)
      layerTr.appendChild(layerPreview)
      layerTr.appendChild(layerName)
      layerlist.appendChild(layerTr)
      values = (values) ? values + '::' + name : name
      text = (text) ? text + ',' + name : name
    }
    $req('selLayerNames').setAttribute('options', text)
    $req('selLayerNames').setAttribute('values', values)
    // Append a trailing "+ New layer…" entry; choosing it creates a layer and
    // moves the current selection onto it (handled in EditorStartup). addOption
    // sets an explicit value, avoiding se-select's value/text aliasing.
    $req('selLayerNames').addOption(
      NEW_LAYER_OPTION_VALUE,
      this.editor.i18next.t('layers.move_elems_to_new')
    )
    // handle selection of layer
    const nelements = $req('layerlist').querySelectorAll('td.layername')
    Array.from(nelements).forEach(function (element) {
      element.addEventListener('mouseup', function (evt) {
        const cell = evt.currentTarget as HTMLElement
        const trElements = $req('layerlist').querySelectorAll('tr.layer')
        Array.from(trElements).forEach(function (element) {
          element.classList.remove('layersel')
        })
        ;(cell.parentNode as HTMLElement).classList.add('layersel')
        self.editor.svgCanvas.setCurrentLayer(String(cell.textContent))
        self.layerTree.invalidate()
        // run extension when different layer is selected from listener
        self.editor.svgCanvas.runExtensions(
          'layersChanged'
        )
        evt.preventDefault()
      })
      element.addEventListener('mouseup', (evt) => {
        self.toggleHighlightLayer((evt.currentTarget as HTMLElement).textContent ?? undefined)
      })
      element.addEventListener('mouseout', (_evt) => {
        self.toggleHighlightLayer()
      })
    })
    const elements = $req('layerlist').querySelectorAll('td.layervis')
    Array.from(elements).forEach(function (element) {
      $click(element, function (evt) {
        const ele = ((evt.currentTarget as Node).parentNode as Element).querySelector('td.layername')
        const name = (ele) ? String(ele.textContent) : ''
        const vis = (evt.currentTarget as Element).classList.contains('layerinvis')
        self.applyLayerVisibility({ [name]: vis })
      })
    })
    const lockElements = $req('layerlist').querySelectorAll('td.layerlock')
    Array.from(lockElements).forEach(function (element) {
      $click(element, function (evt) {
        const ele = ((evt.currentTarget as Node).parentNode as Element).querySelector('td.layername')
        const name = (ele) ? String(ele.textContent) : ''
        const locked = (evt.currentTarget as Element).classList.contains('locked')
        self.applyLayerLock({ [name]: !locked })
      })
    })
    const commentElements = $req('layerlist').querySelectorAll('td.layercomment')
    Array.from(commentElements).forEach(function (element) {
      $click(element, function (evt) {
        const row = (evt.currentTarget as Node).parentNode as Element
        const ele = row.querySelector('td.layername')
        const name = (ele) ? String(ele.textContent) : ''
        const wasComment = (evt.currentTarget as Element).classList.contains('commented')
        self.editor.svgCanvas.setLayerComment(name, !wasComment)
        ;(evt.currentTarget as Element).classList.toggle('commented')
        // Un-marking also ends a tracing template (and unlocks the layer).
        if (wasComment) self.syncLayerRows()
        // Marking a layer as comments hides it immediately, so it doesn't
        // clutter the canvas until deliberately shown again via the eye icon.
        if (!wasComment) {
          self.editor.svgCanvas.setLayerVisibility(name, false)
          const visCell = row.querySelector('td.layervis')
          visCell?.classList.add('layerinvis')
        }
        self.editor.svgCanvas.runExtensions(
          'layersChanged'
        )
      })
    })

    // if there were too few rows, let's add a few to make it not so lonely
    let num = 5 - $req('layerlist').querySelectorAll('tr.layer').length
    while (num-- > 0) {
      // TODO: there must a better way to do this
      const tlayer = document.createElement('tr')
      tlayer.innerHTML = '<td style="color:white">_</td><td/>'
      layerlist.append(tlayer)
    }
    // the object rows follow the (new) layer rows
    this.layerTree.observe()
    this.layerTree.invalidate()
    // run extension when layer panel is populated
    self.editor.svgCanvas.runExtensions(
      'layersChanged'
    )
    // Layer commands (delete, move up / down) depend on where the current layer sits.
    self.editor.commands?.refreshEnablement()
  }

  /**
   * Show / hide several layers as one undo step, then bring their rows up to date.
 * @param states layer name → visible
 * @returns whether anything changed
   */
  applyLayerVisibility (states: Record<string, boolean>): boolean {
    if (!this.editor.svgCanvas.setLayersVisibility(states)) return false
    this.syncLayerRows()
    // Toggling visibility by hand takes over from Focus mode (ext-layer_view).
    this.editor.svgCanvas.runExtensions('layerVisChanged')
    return true
  }

  /**
   * Lock / unlock several layers (not undoable), then bring their rows up to date.
 * @param states layer name → locked
 * @returns whether anything changed
   */
  applyLayerLock (states: Record<string, boolean>): boolean {
    if (!this.editor.svgCanvas.setLayersLocked(states)) return false
    this.syncLayerRows()
    this.editor.svgCanvas.runExtensions('layersChanged')
    return true
  }

  /**
   * Make a layer a tracing template (a comment layer that is dimmed, locked,
   * unselectable and never exported), or end that. A layer that is not a comment
   * layer yet becomes one.
 * @param name the current layer by default
 * @returns whether the layer is a template now
   */
  toggleLayerTemplate (name?: string): boolean {
    const c = this.editor.svgCanvas
    const drawing = c.getCurrentDrawing()
    const layerName = name || drawing.getCurrentLayerName()
    const group = drawing.getLayerByName(layerName)
    if (!group) return false
    const on = !c.getLayerTemplate(layerName)
    if (on) {
      if (!c.getLayerComment(layerName)) c.setLayerComment(layerName, true)
      // Its objects are about to become unselectable.
      if (c.getSelectedElements().some((e) => e && group.contains(e))) c.clearSelection()
    }
    c.setLayerTemplate(layerName, on)
    this.syncLayerRows()
    c.runExtensions('layersChanged')
    return on
  }

  /**
   * Bring every layer row's eye, padlock and comment cells up to date with the
   * drawing, without rebuilding the rows (which would clear the selection).
   */
  syncLayerRows (): void {
    const drawing = this.editor.svgCanvas.getCurrentDrawing()
    for (const tr of this.layerTree.layerRows()) {
      const name = tr.querySelector('td.layername')?.textContent
      if (!name || !drawing.getLayerByName(name)) continue
      tr.querySelector('td.layervis')?.classList.toggle('layerinvis', !drawing.getLayerVisibility(name))
      const lockCell = tr.querySelector('td.layerlock')
      const locked = drawing.getLayerLocked(name)
      if (lockCell && lockCell.classList.contains('locked') !== locked) {
        lockCell.classList.toggle('locked', locked)
        const span = lockCell.querySelector('span')
        if (span) renderLockIcon(span, locked)
      }
      const commentCell = tr.querySelector('td.layercomment')
      commentCell?.classList.toggle('commented', drawing.getLayerComment(name))
      commentCell?.classList.toggle('templated', drawing.getLayerTemplate(name))
    }
  }

  /**
   * Shows or hides the group-name field depending on whether the selected element
   * is a user <g> group or an element inside one. (The group's children are rows
   * of the layer tree, `layerTree.js`.)
 * @param elem - The currently selected SVG element (or null).
   */
  updateObjectList (elem: Element | null) {
    const { $id } = this.editor
    const panel = $id('objects_panel')
    const nameInput = $id('group_name_input')
    if (!panel) return

    // Layers are <g> elements that are direct children of the SVG drawing root.
    // User groups are any other <g> elements nested inside a layer.
    const svgContent = this.editor.svgCanvas.getSvgContent()
    const isLayerGroup = (el: Element) => el?.tagName === 'g' && el.parentNode === svgContent

    // Walk up from elem to find the nearest ancestor that is a user group.
    // Returns the group element, or null if no group context exists.
    const findGroupContext = (el: Element | null) => {
      if (!el) return null
      // If the element itself is a non-layer group, that is our context.
      if (el.tagName === 'g' && !isLayerGroup(el)) return el
      // Otherwise walk up to find a parent group that is not a layer.
      let parent = el.parentElement as Element | null
      while (parent && parent !== svgContent) {
        if (parent.tagName === 'g' && !isLayerGroup(parent)) return parent
        parent = parent.parentElement
      }
      return null
    }

    const groupEl = findGroupContext(elem)
    this._groupContext = groupEl
    panel.style.display = groupEl ? '' : 'none'
    if (!groupEl) return

    if (nameInput) nameInput.value = groupEl.getAttribute('data-name') || ''
  }
}

export default RightPanel
