import SvgCanvas from '@svgedit/svgcanvas'
import leftPanelHTML from './LeftPanel.html'
import { insertImageFromHref, insertSvgElements } from '../dialogs/insertImage.js'
import { loadToolOrder, saveToolOrder, reconcileToolOrder } from '../toolOrder.js'
import { initToolDragReorder } from '../toolDragReorder.js'

const { $click } = SvgCanvas

/*
 * register actions for left panel
 */
/**
 * @type {module}
 */
class LeftPanel {
  /**
   * @param {PlainObject} editor svgedit handler
   */
  constructor (editor) {
    this.editor = editor
  }

  /**
   * This is a common function used when a tool has been clicked (chosen).
   * It does several common things:
   * - Removes the pressed button from whatever tool currently has it.
   * - Adds the the pressed button  to the button passed in.
   * @function this.updateLeftPanel
   * @param {string|Element} button The DOM element or string selector representing the toolbar button
   * @returns {boolean} Whether the button was disabled or not
   */
  updateLeftPanel (button) {
    const { $id, $qa } = this.editor // container-scoped lookups (see EditorStartup constructor)
    if (button.disabled) return false
    // switching tools exits lock mode (see lockTool / double-click gesture)
    this.editor.svgCanvas.setToolLocked(false)
    $qa('#tools_left *[locked]').forEach((b) => {
      b.removeAttribute('locked')
    })
    // remove the pressed state on other(s) button(s)
    $qa('#tools_left *[pressed]').forEach((b) => {
      b.pressed = false
    })
    // pressed state for the clicked button
    $id(button).pressed = true
    return true
  }

  /**
   * Lock the currently-selected drawing tool (double-click gesture). A locked
   * tool stays active after each object is created instead of reverting to
   * select; switching to another tool clears the lock (see updateLeftPanel).
   * @function this.lockTool
   * @param {Element} visibleEl The toolbar element to mark locked (an se-button,
   *   or the se-flyingbutton host for a shape variant)
   * @returns {void}
   */
  lockTool (visibleEl) {
    this.editor.svgCanvas.setToolLocked(true)
    visibleEl.setAttribute('locked', 'true')
    // close the flyout menu that a double-click may have opened
    if (visibleEl.tagName === 'SE-FLYINGBUTTON') visibleEl.opened = false
  }

  /**
   * Unless the select toolbar button is disabled, sets the button
   * and sets the select mode and cursor styles.
   * @function module:SVGEditor.clickSelect
   * @returns {void}
   */
  clickSelect () {
    if (this.updateLeftPanel('tool_select')) {
      // this.editor.workarea.style.cursor = 'auto'
      this.editor.svgCanvas.setMode('select')
    }
  }

  /**
   *
   * @returns {void}
   */
  clickFHPath () {
    if (this.updateLeftPanel('tool_fhpath')) {
      this.editor.svgCanvas.setMode('fhpath')
    }
  }

  /**
   *
   * @returns {void}
   */
  clickLine () {
    if (this.updateLeftPanel('tool_line')) {
      this.editor.svgCanvas.setMode('line')
    }
  }

  /**
   *
   * @returns {void}
   */
  clickRect () {
    if (this.updateLeftPanel('tool_rect')) {
      this.editor.svgCanvas.setMode('rect')
    }
  }

  /**
   *
   * @returns {void}
   */
  clickEllipse () {
    if (this.updateLeftPanel('tool_ellipse')) {
      this.editor.svgCanvas.setMode('ellipse')
    }
  }

  /**
   *
   * @returns {void}
   */
  clickImage () {
    // Open the import dialog instead of entering a draw mode; selection tool
    // stays active and the image is inserted centered on the canvas.
    this.editor.$id('se-image-import-dialog').setAttribute('dialog', 'open')
  }

  /**
   * Handles the `change` event dispatched by the image import dialog.
   * @param {CustomEvent} e
   * @returns {void}
   */
  handleImageImport (e) {
    if (e?.detail?.trigger !== 'ok' || !e?.detail?.href) return
    // An editable (unlocked) whole-drawing import inserts real SVG elements;
    // everything else (locked embeds, raster images, frame crops) stays <image>.
    if (e.detail.editableSvg) {
      insertSvgElements(e.detail.editableSvg, { vaultLink: e.detail.vaultLink, asPaths: e.detail.asPaths })
      return
    }
    insertImageFromHref(e.detail.href, { vaultLink: e.detail.vaultLink, locked: e.detail.locked, external: e.detail.external })
  }

  /**
   *
   * @returns {void}
   */
  clickText () {
    if (this.updateLeftPanel('tool_text')) {
      this.editor.svgCanvas.setMode('text')
    }
  }

  /**
   *
   * @returns {void}
   */
  clickPath () {
    if (this.updateLeftPanel('tool_path')) {
      this.editor.svgCanvas.setMode('path')
    }
  }

  /**
   * @type {module}
   */
  add (id, handler) {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    $click($id(id), () => {
      if (this.updateLeftPanel(id)) {
        handler()
      }
    })
  }

  /**
   * Build the "Additional tools" overflow bucket, apply the user's saved
   * left-panel tool order (reconciled against whatever tools/extensions
   * actually exist right now), and wire up drag-to-reorder. Runs once, after
   * every built-in/user extension has finished inserting its own button
   * (bound to the canvas `extensions_added` event in init()) — by then
   * `#tools_left`'s direct children are the final, complete tool set, so the
   * bucket can simply be appended as the new last child without needing to
   * touch any extension's own hardcoded `insertChildAtIndex` position.
   * @returns {void}
   */
  finalizeToolOrder () {
    const { $id } = this.editor
    const container = $id('tools_left')
    const currentIds = Array.from(container.children).map((el) => el.id).filter(Boolean)
    const { main, overflow } = reconcileToolOrder(currentIds, loadToolOrder())

    const overflowEl = document.createElement('se-tool-overflow')
    overflowEl.id = 'tools_overflow'
    overflowEl.setAttribute('title', 'tools.additional_tools')
    overflowEl.setAttribute('src', 'more_tools.svg')
    container.appendChild(overflowEl)

    main.forEach((id) => container.insertBefore($id(id), overflowEl))
    overflow.forEach((id) => overflowEl.appendChild($id(id)))
    saveToolOrder({ main, overflow })

    initToolDragReorder({
      container,
      overflowHost: overflowEl,
      onChange: saveToolOrder
    })
  }

  /**
   * @type {module}
   */
  init () {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    // add Left panel
    const template = document.createElement('template')
    template.innerHTML = leftPanelHTML
    this.editor.$svgEditor.append(template.content.cloneNode(true))
    this.editor.svgCanvas.bind('extensions_added', () => this.finalizeToolOrder())
    // register actions for left panel
    $click($id('tool_select'), this.clickSelect.bind(this))
    $click($id('tool_fhpath'), this.clickFHPath.bind(this))
    $click($id('tool_text'), this.clickText.bind(this))
    $click($id('tool_image'), this.clickImage.bind(this))
    $id('se-image-import-dialog').addEventListener('change', this.handleImageImport.bind(this))
    $click($id('tool_path'), this.clickPath.bind(this))
    $click($id('tool_line'), this.clickLine.bind(this))

    // flyout
    $click($id('tool_rect'), this.clickRect.bind(this))
    $click($id('tool_ellipse'), this.clickEllipse.bind(this))

    // double-click a drawing tool to lock it (stays selected after each object).
    // Plain buttons bind on themselves; shape groups bind on the flyout host
    // (the variant buttons live in a menu that's hidden when collapsed), which
    // locks whatever variant is currently active.
    const lockable = ['tool_fhpath', 'tool_line', 'tool_path', 'tool_text', 'tools_shapes']
    lockable.forEach((id) => {
      const el = $id(id)
      el.addEventListener('dblclick', () => this.lockTool(el))
    })
  }
}

export default LeftPanel
