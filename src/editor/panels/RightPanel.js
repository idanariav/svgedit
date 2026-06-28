/* globals seAlert, sePrompt */
import SvgCanvas from '@svgedit/svgcanvas'
import RightPanelHtml from './RightPanel.html'
import { fetchSvgEl } from '../components/svgIconLoader.js'
import { traceImageToSvg } from '../dialogs/traceImage.js'

const { $click } = SvgCanvas

// Sentinel value used as the last option of the "Move elements to" dropdown.
// Selecting it creates a new layer and moves the selection there in one step.
export const NEW_LAYER_OPTION_VALUE = '__svgedit_move_to_new_layer__'

/**
 *
 */
class RightPanel {
  /**
   * @param {PlainObject} editor
   */
  constructor (editor) {
    this.updateContextPanel = editor.topPanel.updateContextPanel.bind(editor.topPanel)
    this.editor = editor
    this.activeTab = 'design'
  }

  /**
   * Show one of the right-panel tabs (Design / Text / Effects / Layers).
   * @param {string} name
   * @returns {void}
   */
  activateTab (name) {
    this.activeTab = name
    this.editor.$qa('#sidepanel_tabs .sidepanel_tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === name)
    })
    this.editor.$qa('#sidepanel_content .sidepanel_tabpanel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab_${name}`)
    })
  }

  /**
   * Pick the most relevant tab for the current selection: text elements open the
   * Text tab; any other selection falls back to Design (only if the user was on
   * Text). Other tabs are left as the user set them.
   * @param {Element|null} elem
   * @param {boolean} multiselected
   * @returns {void}
   */
  autoSelectTab (elem, multiselected) {
    const sel = this.editor.svgCanvas.getSelectedElements().filter(Boolean)
    const isText =
      elem?.tagName === 'text' ||
      (multiselected && sel.length > 0 && sel.every(e => e.tagName === 'text'))
    if (isText) {
      this.activateTab('text')
    } else if ((elem || multiselected) && this.activeTab === 'text') {
      this.activateTab('design')
    }
  }

  /**
   * @param {PlainObject} e event
   * @returns {void}
   */
  lmenuFunc (e) {
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

  /**
   * @returns {void}
   */
  init () {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const template = document.createElement('template')
    const { i18next } = this.editor

    template.innerHTML = RightPanelHtml
    this.editor.$svgEditor.append(template.content.cloneNode(true))
    // layer menu added to DOM
    const menuMore = document.createElement('se-cmenu-layers')
    menuMore.setAttribute('id', 'se-cmenu-layers-more')
    menuMore.value = 'layer_moreopts'
    menuMore.setAttribute('leftclick', true)
    this.editor.$container.append(menuMore)
    menuMore.init(i18next)
    const menuLayerBox = document.createElement('se-cmenu-layers')
    menuLayerBox.setAttribute('id', 'se-cmenu-layers-list')
    menuLayerBox.value = 'layerlist'
    menuLayerBox.setAttribute('leftclick', false)
    this.editor.$container.append(menuLayerBox)
    menuLayerBox.init(i18next)
    $click($id('layer_new'), this.newLayer.bind(this))
    $click($id('layer_delete'), this.deleteLayer.bind(this))
    $click($id('layer_up'), () => this.moveLayer.bind(this)(-1))
    $click($id('layer_down'), () => this.moveLayer.bind(this)(1))
    $click($id('layer_rename'), this.layerRename.bind(this))
    $id('se-cmenu-layers-more').addEventListener('change', this.lmenuFunc.bind(this))
    $id('se-cmenu-layers-list').addEventListener('change', (e) => { this.lmenuFunc(e) })
    $click($id('sidepanel_handle'), () => this.toggleSidePanel())
    // "Convert to editable SVG" (image trace): open the options dialog for the
    // selected <image>, then run the trace when the user confirms.
    const traceDialog = $id('se-trace-dialog')
    $click($id('tool_trace_image'), () => {
      const sel = this.editor.svgCanvas.getSelectedElements().filter(Boolean)
      if (sel[0]?.tagName !== 'image') return
      traceDialog._targetImage = sel[0]
      traceDialog.setAttribute('dialog', 'open')
    })
    traceDialog?.addEventListener('change', async (e) => {
      if (e.detail?.trigger !== 'ok') return
      const img = traceDialog._targetImage
      if (!img) return
      traceDialog.setBusy(true)
      try {
        await traceImageToSvg(img, {
          preset: e.detail.preset,
          numberofcolors: e.detail.numberofcolors
        })
        traceDialog.setAttribute('dialog', 'close')
      } catch (err) {
        traceDialog.showError(err.message)
      }
    })
    // Tab bar (Design / Text / Effects / Layers)
    this.editor.$qa('#sidepanel_tabs .sidepanel_tab').forEach(btn => {
      $click(btn, () => this.activateTab(btn.dataset.tab))
    })
    this.activateTab(this.activeTab)
    this.toggleSidePanel(this.editor.configObj.curConfig.showlayers)

    // Group name input in objects panel — renames the group context, not necessarily
    // the currently selected element (which may be a child of the group).
    $id('group_name_input')?.addEventListener('change', (evt) => {
      const g = this._groupContext
      if (!g) return
      g.setAttribute('data-name', evt.target.value)
    })
  }

  toggleSidePanel (displayFlag) {
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
   * @returns {Promise<string|null>}
   */
  async promptUniqueLayerName () {
    let uniqName
    let i = this.editor.svgCanvas.getCurrentDrawing().getNumLayers()
    do {
      uniqName = this.editor.i18next.t('layers.layer') + ' ' + ++i
    } while (this.editor.svgCanvas.getCurrentDrawing().hasLayer(uniqName))

    const newName = await sePrompt(
      this.editor.i18next.t('notification.enterUniqueLayerName'),
      uniqName
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
   * @returns {void}
   */
  async newLayer () {
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
   * @returns {void}
   */
  async moveSelectedToNewLayer () {
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

  /**
   *
   * @returns {void}
   */
  deleteLayer () {
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
      this.editor.$qq('#layerlist tr.layer').classList.add('layersel')
    }
  }

  /**
   *
   * @returns {void}
   */
  async cloneLayer () {
    const name =
      this.editor.svgCanvas.getCurrentDrawing().getCurrentLayerName() + ' copy'

    const newName = await sePrompt(
      this.editor.i18next.t('notification.enterUniqueLayerName'),
      name
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

  index (el) {
    if (!el) return -1
    return Array.from(this.editor.$qq('#layerlist tbody').children).indexOf(el)
  }

  /**
   *
   * @returns {void}
   */
  mergeLayer () {
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

  /**
   * @param {Integer} pos
   * @returns {void}
   */
  moveLayer (pos) {
    const curPos = this.editor.svgCanvas.indexCurrentLayer()
    if (curPos !== -1) {
      this.editor.svgCanvas.setCurrentLayerPosition(curPos - pos)
      this.populateLayers()
    }
  }

  /**
   * @returns {void}
   */
  async layerRename () {
    const ele = this.editor.$qq('#layerlist tr.layersel td.layername')
    const oldName = (ele) ? ele.textContent : ''
    const newName = await sePrompt(this.editor.i18next.t('notification.enterNewLayerName'), oldName)
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
   * @param {string} [layerNameToHighlight]
   * @returns {void}
   */
  toggleHighlightLayer (layerNameToHighlight) {
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

  /**
   * @returns {void}
   */
  populateLayers () {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    this.editor.svgCanvas.clearSelection()
    const self = this
    const layerlist = $id('layerlist').querySelector('tbody')
    while (layerlist.firstChild) { layerlist.removeChild(layerlist.firstChild) }

    $id('selLayerNames').setAttribute('options', '')
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
      const layerVis = document.createElement('td')
      layerVis.className = (!drawing.getLayerVisibility(name)) ? 'layerinvis layervis' : 'layervis'

      // fix the eye icon lost at right layers (inline SVG from the bundle)
      const _eye = document.createElement('span')
      _eye.style.width = '14px'
      _eye.style.height = '14px'
      _eye.style.display = 'inline-block'
      fetchSvgEl('eye.svg').then(svg => { if (svg) _eye.appendChild(svg) })
      layerVis.appendChild(_eye)

      const layerName = document.createElement('td')
      layerName.className = 'layername'
      layerName.textContent = name
      layerTr.appendChild(layerVis)
      layerTr.appendChild(layerName)
      layerlist.appendChild(layerTr)
      values = (values) ? values + '::' + name : name
      text = (text) ? text + ',' + name : name
    }
    $id('selLayerNames').setAttribute('options', text)
    $id('selLayerNames').setAttribute('values', values)
    // Append a trailing "+ New layer…" entry; choosing it creates a layer and
    // moves the current selection onto it (handled in EditorStartup). addOption
    // sets an explicit value, avoiding se-select's value/text aliasing.
    $id('selLayerNames').addOption(
      NEW_LAYER_OPTION_VALUE,
      this.editor.i18next.t('layers.move_elems_to_new')
    )
    // handle selection of layer
    const nelements = $id('layerlist').querySelectorAll('td.layername')
    Array.from(nelements).forEach(function (element) {
      element.addEventListener('mouseup', function (evt) {
        const trElements = $id('layerlist').querySelectorAll('tr.layer')
        Array.from(trElements).forEach(function (element) {
          element.classList.remove('layersel')
        })
        evt.currentTarget.parentNode.classList.add('layersel')
        self.editor.svgCanvas.setCurrentLayer(evt.currentTarget.textContent)
        // run extension when different layer is selected from listener
        self.editor.svgCanvas.runExtensions(
          'layersChanged'
        )
        evt.preventDefault()
      })
      element.addEventListener('mouseup', (evt) => {
        self.toggleHighlightLayer(evt.currentTarget.textContent)
      })
      element.addEventListener('mouseout', (_evt) => {
        self.toggleHighlightLayer()
      })
    })
    const elements = $id('layerlist').querySelectorAll('td.layervis')
    Array.from(elements).forEach(function (element) {
      $click(element, function (evt) {
        const ele = evt.currentTarget.parentNode.querySelector('td.layername')
        const name = (ele) ? ele.textContent : ''
        const vis = evt.currentTarget.classList.contains('layerinvis')
        self.editor.svgCanvas.setLayerVisibility(name, vis)
        evt.currentTarget.classList.toggle('layerinvis')
        // run extension if layer visibility is changed from listener
        self.editor.svgCanvas.runExtensions(
          'layerVisChanged'
        )
      })
    })

    // if there were too few rows, let's add a few to make it not so lonely
    let num = 5 - $id('layerlist').querySelectorAll('tr.layer').length
    while (num-- > 0) {
      // TODO: there must a better way to do this
      const tlayer = document.createElement('tr')
      tlayer.innerHTML = '<td style="color:white">_</td><td/>'
      layerlist.append(tlayer)
    }
    // run extension when layer panel is populated
    self.editor.svgCanvas.runExtensions(
      'layersChanged'
    )
  }

  /**
   * Shows or hides the objects panel depending on whether the selected element
   * is a user <g> group or an element inside one. When visible, lists all
   * children of the nearest ancestor group, highlighting the selected child.
   * The panel stays visible as long as the selection is within a group context.
   * @param {Element|null} elem - The currently selected SVG element (or null).
   */
  updateObjectList (elem) {
    const { $id } = this.editor
    const panel = $id('objects_panel')
    const listEl = $id('objects_list')
    const nameInput = $id('group_name_input')
    if (!panel) return

    // Layers are <g> elements that are direct children of the SVG drawing root.
    // User groups are any other <g> elements nested inside a layer.
    const svgContent = this.editor.svgCanvas.getSvgContent()
    const isLayerGroup = (el) => el?.tagName === 'g' && el.parentElement === svgContent

    // Walk up from elem to find the nearest ancestor that is a user group.
    // Returns the group element, or null if no group context exists.
    const findGroupContext = (el) => {
      if (!el) return null
      // If the element itself is a non-layer group, that is our context.
      if (el.tagName === 'g' && !isLayerGroup(el)) return el
      // Otherwise walk up to find a parent group that is not a layer.
      let parent = el.parentElement
      while (parent && parent !== svgContent) {
        if (parent.tagName === 'g' && !isLayerGroup(parent)) return parent
        parent = parent.parentElement
      }
      return null
    }

    const groupEl = findGroupContext(elem)
    this._groupContext = groupEl
    panel.style.display = groupEl ? '' : 'none'
    if (!groupEl) {
      if (listEl) listEl.innerHTML = ''
      return
    }

    if (nameInput) nameInput.value = groupEl.getAttribute('data-name') || ''

    const buildList = (parentEl) => {
      const ul = document.createElement('ul')
      ul.className = 'object-list'
      for (const child of parentEl.childNodes) {
        if (child.nodeType !== 1 || child.tagName === 'title') continue
        const li = document.createElement('li')
        const span = document.createElement('span')
        span.className = 'object-list-item'
        if (child === elem) span.classList.add('selected')
        const label = child.getAttribute('data-name') || child.id || child.tagName
        span.textContent = label
        span.title = label
        span.addEventListener('click', () => {
          this.editor.svgCanvas.selectOnly([child], true)
        })
        li.appendChild(span)
        if (child.tagName === 'g') {
          li.appendChild(buildList(child))
        }
        ul.appendChild(li)
      }
      return ul
    }

    if (listEl) {
      listEl.innerHTML = ''
      listEl.appendChild(buildList(groupEl))
    }
  }
}

export default RightPanel
