/* eslint-disable max-len */
/* globals seAlert */

import SvgCanvas from '@svgedit/svgcanvas'
import topPanelHTML from './TopPanel.html'
import { localizePanelFragment } from '../panelI18n.js'
import { runSteps } from '../runSteps.js'
import { updateContextPanel, round1 } from './topPanelContext.js'
import { error as logError } from '@svgedit/svgcanvas/common/logger.js'

const { $click, getTypeMap } = SvgCanvas

/*
 * register actions for left panel
 */
/**
 *
 */
class TopPanel {
  /**
   * @param {PlainObject} editor svgedit handler
   */
  constructor (editor) {
    this.editor = editor
  }

  /**
   * @type {module}
   */
  displayTool (className) {
    const { $qa } = this.editor // container-scoped lookups (see EditorStartup constructor)
    // default display is 'none' so removing the property will make the panel visible
    $qa(`.${className}`).map(el => el.style.removeProperty('display'))
  }

  /**
   * @type {module}
   */
  hideTool (className) {
    const { $qa } = this.editor // container-scoped lookups (see EditorStartup constructor)
    $qa(`.${className}`).forEach(el => {
      el.style.display = 'none'
    })
  }

  /**
   * Toggle visibility of a sidepanel section by id.
   * @param {string} id
   * @param {boolean} visible
   */
  setSidepanelVisible (id, visible) {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const el = $id(id)
    if (el) el.style.display = visible ? '' : 'none'
  }

  /**
   * @type {module}
   */
  get selectedElement () {
    return this.editor.selectedElement
  }

  /**
   * @type {module}
   */
  get multiselected () {
    return this.editor.multiselected
  }

  /**
   * @type {module}
   */
  get path () {
    return this.editor.svgCanvas.pathActions
  }

  /**
   *
   * @param {Element} opt
   * @param {boolean} changeElem
   * @returns {void}
   */
  setStrokeOpt (opt, changeElem) {
    const { id } = opt
    const bits = id.split('_')
    const [pre, val] = bits

    if (changeElem) {
      this.svgCanvas.setStrokeAttr('stroke-' + pre, val)
    }
    opt.classList.add('current')
    const elements = Array.prototype.filter.call(
      opt.parentNode.children,
      function (child) {
        return child !== opt
      }
    )
    Array.from(elements).forEach(function (element) {
      element.classList.remove('current')
    })
  }

  /**
   * Updates the toolbar (colors, opacity, etc) based on the selected element.
   * This function also updates the opacity and id elements that are in the
   * context panel.
   * @returns {void}
   */
  update () {
    const { $id, $qa } = this.editor // container-scoped lookups (see EditorStartup constructor)
    let i
    let len

    // Each step is isolated: a throw in one (e.g. a stale DOM id after a
    // panel refactor) is logged and skipped instead of aborting every step
    // after it — this is the exact function whose last step broke in
    // 26b91862 and silently took the rest of the panel-update chain down
    // with it.
    runSteps([
      ['title', () => {
        $qa('#title_panel > p')[0].textContent = this.editor.title
      }],
      ['strokeFields', () => {
        if (!this.selectedElement) return
        switch (this.selectedElement.tagName) {
          case 'use':
          case 'image':
          case 'foreignObject':
            break
          case 'g':
          case 'a': {
            // Look for common styles
            const childs = this.selectedElement.getElementsByTagName('*')
            let gWidth = null
            for (i = 0, len = childs.length; i < len; i++) {
              // A missing stroke-width means the SVG initial value of 1, not null —
              // cleanupElement strips the attribute at that value. Without this,
              // children that consistently lack the attribute (all default to 1)
              // would be mistaken for "mixed" and display blank.
              const swidth = childs[i].getAttribute('stroke-width') ?? '1'

              if (i === 0) {
                gWidth = swidth
              } else if (gWidth !== swidth) {
                gWidth = null
              }
            }

            $id('stroke_width').value = gWidth === null ? '' : gWidth
            this.editor.bottomPanel.updateColorpickers(false)
            break
          }
          default: {
            this.editor.bottomPanel.updateColorpickers(false)

            $id('stroke_width').value =
              this.selectedElement.getAttribute('stroke-width') || 1
            $id('stroke_style').value =
              this.selectedElement.getAttribute('stroke-dasharray') || 'none'
            $id('stroke_style').setAttribute('value', $id('stroke_style').value)

            let attr =
              this.selectedElement.getAttribute('stroke-linejoin') || 'miter'

            if ($id('linejoin_' + attr)) {
              this.setStrokeOpt($id('linejoin_' + attr))
              $id('stroke_linejoin').setAttribute('value', attr)
            }

            attr = this.selectedElement.getAttribute('stroke-linecap') || 'butt'
            if ($id('linecap_' + attr)) {
              this.setStrokeOpt($id('linecap_' + attr))
              $id('stroke_linecap').setAttribute('value', attr)
            }
          }
        }
      }],
      ['opacityIdClassFields', () => {
        // All elements including image and group have opacity
        if (this.selectedElement) {
          const opacPerc =
            (this.selectedElement.getAttribute('opacity') || 1.0) * 100
          $id('opacity').value = opacPerc
          $id('elem_id').value = this.selectedElement.id
          $id('elem_class').refresh(this.selectedElement)
        }
      }],
      ['bottomPanel.updateToolButtonState', () => this.editor.bottomPanel.updateToolButtonState()]
    ])
  }

  /**
   * Updates the context panel tools based on the selected element (see topPanelContext.js).
   * @returns {void}
   */
  updateContextPanel () {
    updateContextPanel(this)
  }

  /**
   * Live position readout while a single element is being dragged in select
   * mode. The drag only applies a temporary transform — attributes aren't
   * baked until mouseup's recalculateDimensions — so this adds the live
   * delta to the (unchanged) pre-drag attribute/bbox values rather than
   * re-reading stale attributes via updateContextPanel.
   * @param {Element} elem
   * @param {number} dx
   * @param {number} dy
   * @returns {void}
   */
  updateLiveMove (elem, dx, dy) {
    const { $id } = this.editor
    const { tagName } = elem
    const num = (v) => (parseFloat(v) || 0)

    if (['circle', 'ellipse'].includes(tagName)) {
      $id(`${tagName}_cx`).value = round1(num(elem.getAttribute('cx')) + dx)
      $id(`${tagName}_cy`).value = round1(num(elem.getAttribute('cy')) + dy)
    } else if (tagName === 'line') {
      $id('line_x1').value = round1(num(elem.getAttribute('x1')) + dx)
      $id('line_y1').value = round1(num(elem.getAttribute('y1')) + dy)
      $id('line_x2').value = round1(num(elem.getAttribute('x2')) + dx)
      $id('line_y2').value = round1(num(elem.getAttribute('y2')) + dy)
    } else if (['g', 'polyline', 'path'].includes(tagName)) {
      const bb = this.editor.svgCanvas.getStrokedBBox([elem])
      if (bb) {
        $id('selected_x').value = round1(bb.x + dx)
        $id('selected_y').value = round1(bb.y + dy)
      }
    } else if (tagName !== 'polygon') {
      $id('selected_x').value = round1(num(elem.getAttribute('x')) + dx)
      $id('selected_y').value = round1(num(elem.getAttribute('y')) + dy)
    }
  }

  /**
   * Live dimension readout while a single element is being resized via a
   * selection grip. `box` carries the same anchor/scale values event.js just
   * used to build the temporary translate-scale-translate transform, so this
   * mirrors that math onto the visible panel fields instead of the (still
   * unchanged) pre-drag attributes.
   * @param {Element} elem
   * @param {{left: number, top: number, width: number, height: number, tx: number, ty: number, sx: number, sy: number}} box
   * @returns {void}
   */
  updateLiveResize (elem, box) {
    const { $id } = this.editor
    const { tagName } = elem
    const anchorX = box.left + box.tx
    const anchorY = box.top + box.ty
    const scalePt = (px, py) => ({
      x: anchorX + (px - anchorX) * box.sx,
      y: anchorY + (py - anchorY) * box.sy
    })
    const num = (v) => (parseFloat(v) || 0)

    if (tagName === 'line') {
      const p1 = scalePt(num(elem.getAttribute('x1')), num(elem.getAttribute('y1')))
      const p2 = scalePt(num(elem.getAttribute('x2')), num(elem.getAttribute('y2')))
      $id('line_x1').value = round1(p1.x)
      $id('line_y1').value = round1(p1.y)
      $id('line_x2').value = round1(p2.x)
      $id('line_y2').value = round1(p2.y)
      return
    }

    const width = box.width * box.sx
    const height = box.height * box.sy
    const { x, y } = scalePt(box.left, box.top)

    if (tagName === 'circle') {
      $id('circle_cx').value = round1(x + width / 2)
      $id('circle_cy').value = round1(y + height / 2)
      $id('circle_r').value = round1((width + height) / 4)
    } else if (tagName === 'ellipse') {
      $id('ellipse_cx').value = round1(x + width / 2)
      $id('ellipse_cy').value = round1(y + height / 2)
      $id('ellipse_rx').value = round1(width / 2)
      $id('ellipse_ry').value = round1(height / 2)
    } else {
      if (['rect', 'image'].includes(tagName)) {
        $id(`${tagName}_width`).value = round1(width)
        $id(`${tagName}_height`).value = round1(height)
      }
      if (tagName !== 'polygon') {
        $id('selected_x').value = round1(x)
        $id('selected_y').value = round1(y)
      }
    }
  }

  /**
   * @param {Event} [e] Not used.
   * @param {boolean} forSaving
   * @returns {void}
   */
  showSourceEditor (e, forSaving) {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const $editorDialog = $id('se-svg-editor-dialog')
    if ($editorDialog.getAttribute('dialog') === 'open') return
    const origSource = this.editor.svgCanvas.getSvgString()
    $editorDialog.setAttribute('dialog', 'open')
    $editorDialog.setAttribute('value', origSource)
    $editorDialog.setAttribute('copysec', Boolean(forSaving))
    $editorDialog.setAttribute('applysec', !forSaving)
  }

  /**
   * Activates the frame-drawing mode. The frame button lives in the top panel
   * but behaves like a left-panel drawing tool, so clear any pressed left-panel
   * tool and mark the frame button active. The button's pressed state is kept in
   * sync with the canvas mode by the modeChange listener in EditorStartup.
   * @returns {void}
   */
  clickFrame () {
    const { $id, $qa } = this.editor // container-scoped lookups (see EditorStartup constructor)
    $qa('#tools_left *[pressed]').forEach((b) => { b.pressed = false })
    $id('tool_frame').pressed = true
    this.editor.svgCanvas.setMode('frame')
  }

  /**
   *
   * @returns {void}
   */
  clickWireframe () {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    $id('tool_wireframe').pressed = !$id('tool_wireframe').pressed
    this.editor.workarea.classList.toggle('wireframe')

    const wfRules = $id('wireframe_rules')
    if (!wfRules) {
      const fcRules = document.createElement('style')
      fcRules.setAttribute('id', 'wireframe_rules')
      // Keep the wireframe <style> inside this editor's container so multiple
      // editors don't share (and clobber) a single head-level #wireframe_rules.
      this.editor.$container.appendChild(fcRules)
    } else {
      while (wfRules.firstChild) {
        wfRules.removeChild(wfRules.firstChild)
      }
    }
    this.editor.updateWireFrame()

    // Markers + proportion snapping ride along with wireframe mode. Write the
    // snap flag to the canvas-side config object (svgCanvas.curConfig is a
    // separate object from the editor's configObj.curConfig after mergeDeep).
    const on = $id('tool_wireframe').pressed
    this.editor.svgCanvas.getCurConfig().wireframeSnapping = on
    this.editor.updateProportionMarkers?.()
  }

  /**
   *
   * @returns {void}
   */
  clickUndo () {
    const { undoMgr, textActions } = this.editor.svgCanvas
    if (undoMgr.getUndoStackSize() > 0) {
      undoMgr.undo()
      this.editor.rightPanel.populateLayers()
      if (this.editor.svgCanvas.getMode() === 'textedit') {
        textActions.clear()
      }
    }
  }

  /**
   *
   * @returns {void}
   */
  clickRedo () {
    const { undoMgr } = this.editor.svgCanvas
    if (undoMgr.getRedoStackSize() > 0) {
      undoMgr.redo()
      this.editor.rightPanel.populateLayers()
    }
  }

  /**
   * @type {module}
   */
  changeRectRadius (e) {
    this.editor.svgCanvas.setRectRadius(e.target.value)
  }

  /**
   * @type {module}
   */
  changeCircleArc (e) {
    // Crossing 360° swaps <circle>/<ellipse> for an arc <path> (or back), which
    // clears + re-adds the selection; the panel briefly collapses and the
    // browser clamps its scroll to 0, jumping the arc field out from under the
    // pointer. Put the scroll position back once the panel is rebuilt.
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const scroller = $id('sidepanel_content')
    const { scrollTop } = scroller
    this.editor.svgCanvas.setCircleArc(Number(e.target.value))
    scroller.scrollTop = scrollTop
  }

  /**
   * @type {module}
   */
  changeFontSize (e) {
    this.editor.svgCanvas.setFontSize(e.target.value)
  }

  /**
   * @type {module}
   */
  changeRotationAngle (e) {
    this.editor.svgCanvas.setRotationAngle(e.target.value)
  }

  /**
   * @param {PlainObject} e
   * @returns {void}
   */
  changeBlur (e) {
    this.editor.svgCanvas.setBlur(e.target.value / 10, true)
  }

  /**
   *
   * @returns {void}
   */
  clickGroup () {
    // group
    if (this.editor.multiselected) {
      this.editor.svgCanvas.groupSelectedElements()
      // ungroup
    } else if (this.editor.selectedElement) {
      this.editor.svgCanvas.ungroupSelectedElement()
    }
  }

  /**
   * Dispatches the `tool_bool_ops` dropdown's `change` event to the matching
   * boolean-op handler, mirroring `clickArrange`'s value-switch pattern.
   * @param {CustomEvent} evt
   * @returns {void}
   */
  clickBoolOps (evt) {
    switch (evt.detail.value) {
      case 'union':
        this.clickBoolUnion()
        break
      case 'intersect':
        this.clickBoolIntersect()
        break
      case 'subtract':
        this.clickBoolSubtract()
        break
      case 'exclude':
        this.clickBoolExclude()
        break
      case 'divide':
        this.clickBoolDivide()
        break
    }
  }

  /**
   * @returns {void}
   */
  clickBoolUnion () {
    this.editor.svgCanvas.booleanUnion()
  }

  /**
   * @returns {void}
   */
  clickBoolIntersect () {
    this.editor.svgCanvas.booleanIntersect()
  }

  /**
   * @returns {void}
   */
  clickBoolSubtract () {
    this.editor.svgCanvas.booleanSubtract()
  }

  /**
   * @returns {void}
   */
  clickBoolExclude () {
    this.editor.svgCanvas.booleanExclude()
  }

  /**
   * @returns {void}
   */
  clickBoolDivide () {
    this.editor.svgCanvas.booleanDivide()
  }

  /**
   * @returns {void}
   */
  clickClipSet () {
    this.editor.svgCanvas.setClip()
  }

  /**
   * @returns {void}
   */
  clickMaskSet () {
    this.editor.svgCanvas.setMask()
  }

  /**
   * @returns {void}
   */
  clickClipRelease () {
    this.editor.svgCanvas.releaseClipMask()
  }

  /**
   * @returns {void}
   */
  changeFeather (e) {
    this.editor.svgCanvas.setFeather(Number(e.target.value))
  }

  /**
   *
   * @returns {void}
   */
  clickClone () {
    this.editor.svgCanvas.cloneSelectedElements(20, 20)
  }

  /**
   * @param {PlainObject} evt
   * @returns {void}
   */
  clickAlignEle (evt) {
    this.editor.svgCanvas.alignSelectedElements(evt.detail.value, 'page')
  }

  /**
   * @param {string} pos indicate the alignment relative to top, bottom, middle etc..
   * @returns {void}
   */
  clickAlign (pos) {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    let value = $id('tool_align_relative').value
    if (!value) {
      value = 'selected'
    }
    this.editor.svgCanvas.alignSelectedElements(pos, value)
  }

  /**
   * Align multiple selected elements via the align dropdown.
   * @param {PlainObject} evt
   * @returns {void}
   */
  clickAlignMulti (evt) {
    this.clickAlign(evt.detail.value)
  }

  /**
   *
   * @type {module}
   */
  attrChanger (e) {
    const attr = e.target.getAttribute('data-attr')
    let val = e.target.value

    // For circle-arc paths, cx/cy/r must update both the data-* attr and the `d`
    const isArcPath = this.selectedElement?.tagName === 'path' &&
      this.selectedElement.hasAttribute('data-arc')
    if (isArcPath && ['cx', 'cy', 'r', 'rx', 'ry'].includes(attr)) {
      this.editor.svgCanvas.setCircleArcAttr(attr, Number(val))
      return true
    }

    const valid = this.editor.svgCanvas.isValidUnit(attr, val, this.selectedElement)

    if (!valid) {
      e.target.value = this.selectedElement.getAttribute(attr)
      alert(this.editor.i18next.t('notification.invalidAttrValGiven'))
      return false
    }

    if (attr !== 'id' && attr !== 'class') {
      if (isNaN(val)) {
        val = this.editor.svgCanvas.convertToNum(attr, val)
      } else if (this.editor.configObj.curConfig.baseUnit !== 'px') {
        // Convert unitless value to one with given unit

        const unitData = getTypeMap()

        if (
          this.editor.selectedElement[attr] ||
          this.editor.svgCanvas.getMode() === 'pathedit' ||
          attr === 'x' ||
          attr === 'y'
        ) {
          val *= unitData[this.editor.configObj.curConfig.baseUnit]
        }
      }
    }

    this.editor.svgCanvas.changeSelectedAttribute(attr, val)
    return true
  }

  /**
   *
   * @returns {void}
   */
  convertToPath () {
    if (this.editor.selectedElement) {
      this.editor.svgCanvas.convertToPath()
    }
  }

  /**
   * Convert the selected element's stroke into a filled outline path.
   * @returns {void}
   */
  strokeToPath () {
    if (this.editor.selectedElement) {
      this.editor.svgCanvas.strokeToPath()
    }
  }

  /**
   * Select every element sharing a property with the current selection.
   * @param {Event} evt - `change` event from the select-same dropdown.
   * @returns {void}
   */
  clickSelectSame (evt) {
    this.editor.svgCanvas.selectSameAs(evt.detail.value)
  }

  /**
   * Uniform stroke-width + round joins/caps across the selection.
   * @returns {void}
   */
  clickMatchStrokes () {
    this.editor.svgCanvas.matchStrokes()
  }

  /**
   * Flip selected element(s) horizontally.
   * @returns {void}
   */
  clickFlipHorizontal () {
    if (this.editor.selectedElement || this.multiselected) {
      this.editor.svgCanvas.flipSelectedElements(-1, 1)
    }
  }

  /**
   * Flip selected element(s) vertically.
   * @returns {void}
   */
  clickFlipVertical () {
    if (this.editor.selectedElement || this.multiselected) {
      this.editor.svgCanvas.flipSelectedElements(1, -1)
    }
  }

  /**
   *
   * @returns {void} Resolves to `undefined`
   */
  makeHyperlink () {
    if (this.editor.selectedElement || this.multiselected) {
      const url = prompt(
        this.editor.i18next.t('notification.enterNewLinkURL'),
        'http://'
      )
      if (url) {
        this.editor.svgCanvas.makeHyperlink(url)
      }
    }
  }

  /**
   *
   * @returns {void}
   */
  linkControlPoints () {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    $id('tool_node_link').pressed = !$id('tool_node_link').pressed
    const linked = !!$id('tool_node_link').pressed
    this.path.linkControlPoints(linked)
  }

  /**
   *
   * @returns {void}
   */
  smoothPathNode () {
    this.path.smoothSelectedNodes()
  }

  /**
   *
   * @returns {void}
   */
  clonePathNode () {
    if (this.path.getNodePoint()) {
      this.path.clonePathNode()
    }
  }

  /**
   *
   * @returns {void}
   */
  deletePathNode () {
    if (this.path.getNodePoint()) {
      this.path.deletePathNode()
    }
  }

  /**
   *
   * @returns {void}
   */
  addSubPath () {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const button = $id('tool_add_subpath')
    const sp = !button.classList.contains('pressed')
    button.pressed = sp
    // button.toggleClass('push_button_pressed tool_button');
    this.path.addSubPath(sp)
  }

  /**
   *
   * @returns {void}
   */
  opencloseSubPath () {
    this.path.opencloseSubPath()
  }

  /**
   * Delete is a contextual tool that only appears in the ribbon if
   * an element has been selected.
   * @returns {void}
   */
  deleteSelected () {
    if (this.editor.selectedElement || this.editor.multiselected) {
      this.editor.svgCanvas.deleteSelectedElements()
    }
  }

  /**
   * Handle a selection from the Arrange (z-order) dropdown.
   * @param {PlainObject} evt
   * @returns {void}
   */
  clickArrange (evt) {
    switch (evt.detail.value) {
      case 'front':
        this.editor.svgCanvas.moveToTopSelectedElement()
        break
      case 'back':
        this.editor.svgCanvas.moveToBottomSelectedElement()
        break
      case 'forward':
        this.editor.moveUpDownSelected('Up')
        break
      case 'backward':
        this.editor.moveUpDownSelected('Down')
        break
      case 'switch':
        this.editor.svgCanvas.switchSelectedZorder()
        break
    }
  }

  /**
   * Checks if there are currently selected text elements to avoid firing of bold,italic when no text selected
   * @returns {boolean}
   */
  get anyTextSelected () {
    const selected = this.editor.svgCanvas.getSelectedElements()
    return selected.filter(el => el.tagName === 'text').length > 0
  }

  /**
   *
   * @returns {false}
   */
  clickBold () {
    if (this.anyTextSelected) {
      this.editor.svgCanvas.setBold(!this.editor.svgCanvas.getBold())
      this.updateContextPanel()
      return false
    }
  }

  /**
   *
   * @returns {false}
   */
  clickItalic () {
    if (this.anyTextSelected) {
      this.editor.svgCanvas.setItalic(!this.editor.svgCanvas.getItalic())
      this.updateContextPanel()
      return false
    }
  }

  /**
   * Handles the click on the text decoration buttons
   *
   * @param value The text decoration value
   * @returns {boolean} false
   */
  clickTextDecoration (value) {
    if (this.editor.svgCanvas.hasTextDecoration(value)) {
      this.editor.svgCanvas.removeTextDecoration(value)
    } else {
      this.editor.svgCanvas.addTextDecoration(value)
    }
    this.updateContextPanel()
    return false
  }

  /**
   * Sets the text anchor value
   *
   * @returns {false}
   */
  clickTextAnchor (evt) {
    this.editor.svgCanvas.setTextAnchor(evt.detail.value)
    return false
  }

  /**
   * @type {module}
   */
  changeLetterSpacing (e) {
    this.editor.svgCanvas.setLetterSpacing(e.target.value)
  }

  /**
   * @type {module}
   */
  changeWordSpacing (e) {
    this.editor.svgCanvas.setWordSpacing(e.target.value)
  }

  /**
   * @type {module}
   */
  changeTextLength (e) {
    this.editor.svgCanvas.setTextLength(e.target.value)
  }

  /**
   * @type {module}
   */
  changeTextPerspectiveX (e) {
    this.editor.svgCanvas.setTextPerspectiveX(e.target.value)
  }

  /**
   * @type {module}
   */
  changeTextPerspectiveY (e) {
    this.editor.svgCanvas.setTextPerspectiveY(e.target.value)
  }

  /**
   * @type {module}
   */
  changeLengthAdjust (evt) {
    this.editor.svgCanvas.setLengthAdjust(evt.detail.value)
  }

  /**
   * Set a selected image's URL.
   * @function module:SVGthis.setImageURL
   * @param {string} url
   * @returns {void}
   */
  setImageURL (url) {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const { editor } = this
    if (!url) {
      url = editor.defaultImageURL
    }
    editor.svgCanvas.setImageURL(url)
    $id('image_url').value = url

    if (url.startsWith('data:')) {
      // data URI found
      this.hideTool('image_url')
    } else {
      // regular URL
      const promised = editor.svgCanvas.embedImage(url)
      // eslint-disable-next-line promise/catch-or-return
      promised
        // eslint-disable-next-line promise/always-return
        .then(
          () => {
            // switch into "select" mode if we've clicked on an element
            editor.svgCanvas.setMode('select')
            editor.svgCanvas.selectOnly(
              editor.svgCanvas.getSelectedElements(),
              true
            )
          },
          error => {
            logError('error =', error, 'TopPanel')
            seAlert(editor.i18next.t('tools.no_embed'))
            editor.svgCanvas.deleteSelectedElements()
          }
        )
      this.displayTool('image_url')
    }
  }

  /**
   *
   */
  updateTitle (title) {
    const { $qa } = this.editor // container-scoped lookups (see EditorStartup constructor)
    if (title) this.editor.title = title
    const titleElement = $qa('#title_panel > p')[0]
    if (titleElement) titleElement.textContent = this.editor.title
  }

  /**
   * Enters image-crop mode for the selected `<image>` element.
   * @returns {void}
   */
  clickImageCrop () {
    const [elem] = this.editor.svgCanvas.getSelectedElements().filter(Boolean)
    if (!this.editor.svgCanvas.isImageCropEligible(elem)) return
    this.editor.svgCanvas.startImageCrop(elem)
  }

  /**
   * Applies the active image-crop session, surfacing a friendly alert if the
   * source image can't be resampled (e.g. a cross-origin URL without CORS).
   * @returns {Promise<void>}
   */
  async applyImageCrop () {
    try {
      await this.editor.svgCanvas.applyImageCrop()
    } catch (err) {
      logError('Image crop failed', err, 'TopPanel')
      seAlert(this.editor.i18next.t('tools.image_crop_error'))
    }
  }

  /**
   * Shows/hides the transient Apply/Cancel tray while an image-crop session is active.
   * @param {boolean} active
   * @returns {void}
   */
  toggleImageCropMode (active) {
    if (active) {
      this.displayTool('imagecrop_panel')
    } else {
      this.hideTool('imagecrop_panel')
    }
  }

  /**
   * @param {boolean} editmode
   * @param {module:svgcanvas.SvgCanvas#event:selected} elems
   * @returns {void}
   */
  togglePathEditMode (editMode, elems) {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    if (editMode) {
      this.displayTool('path_node_panel')
    } else {
      this.hideTool('path_node_panel')
    }
    if (editMode) {
      // Change select icon
      $id('tool_path').pressed = false
      $id('tool_select').pressed = true
      $id('tool_select').setAttribute('src', 'select_node.svg')
      this.editor.multiselected = false
      if (elems.length) {
        this.editor.selectedElement = elems[0]
      }
    } else {
      setTimeout(() => {
        $id('tool_select').setAttribute('src', 'select.svg')
      }, 1000)
    }
  }

  /**
   * @type {module}
   */
  init () {
    const { $id, $qa } = this.editor // container-scoped lookups (see EditorStartup constructor)
    // add Top panel
    const template = document.createElement('template')
    const { i18next } = this.editor
    template.innerHTML = topPanelHTML
    localizePanelFragment(template.content, i18next)
    this.editor.$svgEditor.append(template.content.cloneNode(true))
    // Optionally hide the drawing-name panel (host UI may already show the filename)
    if (this.editor.configObj.curConfig.hideTitle) {
      const titlePanel = $id('title_panel')
      if (titlePanel) titlePanel.style.display = 'none'
    }
    // svg editor source dialoag added to DOM
    const newSeEditorDialog = document.createElement(
      'se-svg-source-editor-dialog'
    )
    newSeEditorDialog.setAttribute('id', 'se-svg-editor-dialog')
    this.editor.$container.append(newSeEditorDialog)
    this.updateTitle()
    newSeEditorDialog.init(i18next)
    $id('tool_link_url').setAttribute('title', i18next.t('tools.set_link_url'))
    // register action to top panel buttons
    $click($id('tool_frame'), this.clickFrame.bind(this))
    $click($id('tool_wireframe'), this.clickWireframe.bind(this))
    $click($id('tool_undo'), this.clickUndo.bind(this))
    $click($id('tool_redo'), this.clickRedo.bind(this))
    $click($id('tool_clone'), this.clickClone.bind(this))
    $click($id('tool_clone_multi'), this.clickClone.bind(this))
    $click($id('tool_delete'), this.deleteSelected.bind(this))
    $click($id('tool_delete_multi'), this.deleteSelected.bind(this))
    $id('tool_arrange').addEventListener('change', this.clickArrange.bind(this))
    $id('tool_arrange_multi').addEventListener('change', this.clickArrange.bind(this))
    $click($id('tool_topath'), this.convertToPath.bind(this))
    $click($id('tool_stroke_to_path'), this.strokeToPath.bind(this))
    $id('tool_select_same').addEventListener('change', this.clickSelectSame.bind(this))
    $click($id('tool_match_strokes'), this.clickMatchStrokes.bind(this))
    $click($id('tool_make_link'), this.makeHyperlink.bind(this))
    $click($id('tool_make_link_multi'), this.makeHyperlink.bind(this))
    $click($id('tool_flip_h'), this.clickFlipHorizontal.bind(this))
    $click($id('tool_flip_v'), this.clickFlipVertical.bind(this))
    $click($id('tool_group_elements'), this.clickGroup.bind(this))
    $id('tool_bool_ops').addEventListener('change', this.clickBoolOps.bind(this))
    $click($id('tool_clip_set'), this.clickClipSet.bind(this))
    $click($id('tool_mask_set'), this.clickMaskSet.bind(this))
    $click($id('clipmask_release'), this.clickClipRelease.bind(this))
    $id('clipmask_feather').addEventListener('change', this.changeFeather.bind(this))
    $id('tool_position').addEventListener('change', evt =>
      this.clickAlignEle.bind(this)(evt)
    )
    $id('tool_align_multi').addEventListener('change', this.clickAlignMulti.bind(this))
    $click($id('tool_node_smooth'), this.smoothPathNode.bind(this))
    $click($id('tool_node_clone'), this.clonePathNode.bind(this))
    $click($id('tool_node_delete'), this.deletePathNode.bind(this))
    $click($id('tool_openclose_path'), this.opencloseSubPath.bind(this))
    $click($id('tool_add_subpath'), this.addSubPath.bind(this))
    $click($id('tool_node_link'), this.linkControlPoints.bind(this))
    $id('angle').addEventListener('change', this.changeRotationAngle.bind(this))
    $id('blur').addEventListener('change', this.changeBlur.bind(this))
    $id('rect_rx').addEventListener('change', this.changeRectRadius.bind(this))
    $id('circle_arc').addEventListener('change', this.changeCircleArc.bind(this))
    $id('ellipse_arc').addEventListener('change', this.changeCircleArc.bind(this))
    // Quick-pick buttons: set the field and fire its own change so the normal
    // changeCircleArc path (incl. circle <-> arc path swap) does the work.
    $qa('.arc_preset').forEach(btn => btn.addEventListener('click', () => {
      const field = $id(btn.dataset.target)
      field.value = btn.dataset.arc
      field.dispatchEvent(new CustomEvent('change'))
    }))
    $id('font_size').addEventListener('change', this.changeFontSize.bind(this))
    $click($id('tool_ungroup'), this.clickGroup.bind(this))
    $click($id('tool_bold'), this.clickBold.bind(this))
    $click($id('tool_italic'), this.clickItalic.bind(this))
    $click($id('tool_text_decoration_underline'), () =>
      this.clickTextDecoration.bind(this)('underline')
    )
    $click($id('tool_text_decoration_linethrough'), () =>
      this.clickTextDecoration.bind(this)('line-through')
    )
    $click($id('tool_text_decoration_overline'), () =>
      this.clickTextDecoration.bind(this)('overline')
    )
    $id('tool_text_anchor').addEventListener('change', evt =>
      this.clickTextAnchor.bind(this)(evt)
    )
    $id('tool_letter_spacing').addEventListener(
      'change',
      this.changeLetterSpacing.bind(this)
    )
    $id('tool_word_spacing').addEventListener(
      'change',
      this.changeWordSpacing.bind(this)
    )
    $id('tool_text_length').addEventListener(
      'change',
      this.changeTextLength.bind(this)
    )
    $id('tool_length_adjust').addEventListener('change', evt =>
      this.changeLengthAdjust.bind(this)(evt)
    )
    $id('tool_perspective_x').addEventListener(
      'change',
      this.changeTextPerspectiveX.bind(this)
    )
    $id('tool_perspective_y').addEventListener(
      'change',
      this.changeTextPerspectiveY.bind(this)
    )
    $click($id('tool_unlink_use'), this.clickGroup.bind(this))
    $id('image_url').addEventListener('change', evt => {
      this.setImageURL(evt.currentTarget.value)
    })
    $click($id('tool_image_crop'), this.clickImageCrop.bind(this))
    $click($id('tool_image_crop_apply'), this.applyImageCrop.bind(this))
    $click($id('tool_image_crop_cancel'), () => this.editor.svgCanvas.cancelImageCrop())

    // Controls relocated out of the bottom panel: zoom now lives in the top bar,
    // stroke + opacity in the right "Design" tab. They are bound here (TopPanel
    // initialises last) and delegate to the BottomPanel handlers.
    const bp = this.editor.bottomPanel
    $id('zoom').addEventListener('change', e => bp.changeZoom(e.detail.value))
    // Narrow panes, two tiers. When the bar overflows: (1) drop the low-priority
    // items (file-name chip, theme toggle — also in Preferences) → `tt-compact`;
    // (2) if it still overflows, fold the object trays (clone/arrange/align…)
    // behind a "more" button that shows them as a floating panel → `tt-tight`.
    // Always re-measured from the full state, whenever the bar or a child changes
    // size, or a tray is shown/hidden (selection change).
    const bar = $id('tools_top')
    const more = $id('top_more')
    const OBJECT_TRAYS = '.selected_panel, .multiselected_panel, .g_panel, .image_panel'
    const pop = $id('top_more_pop')
    const topEnd = $id('top_end')
    const setMoreOpen = (open) => {
      bar.classList.toggle('tt-more-open', open)
      more.setAttribute('aria-expanded', String(open))
    }
    // The object trays live in the bar normally, and in the floating panel
    // (`#top_more_pop`, shown by `tt-more-open`) while tight. Always start a
    // measurement from the full state (trays back in the bar).
    const trays = () => Array.from(bar.querySelectorAll(OBJECT_TRAYS))
    const fitBar = () => {
      trays().forEach(t => { if (t.parentNode !== bar) bar.insertBefore(t, topEnd) })
      bar.classList.remove('tt-compact', 'tt-tight')
      const overflows = () => bar.scrollWidth > bar.clientWidth + 1
      if (overflows()) {
        bar.classList.add('tt-compact')
        if (overflows()) bar.classList.add('tt-tight')
      }
      const tight = bar.classList.contains('tt-tight')
      if (tight) trays().forEach(t => pop.appendChild(t))
      more.hidden = !(tight && trays().some(el => el.style.display !== 'none'))
      if (more.hidden) setMoreOpen(false)
    }
    more.addEventListener('click', (e) => {
      e.stopPropagation()
      setMoreOpen(!bar.classList.contains('tt-more-open'))
    })
    document.addEventListener('click', (e) => {
      if (bar.classList.contains('tt-more-open') && !e.composedPath().some(n => n === bar)) setMoreOpen(false)
    }, { signal: this.editor.listenerAbort.signal })
    bar.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMoreOpen(false) })
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(fitBar)
      ro.observe(bar)
      Array.from(bar.children).forEach(c => ro.observe(c))
    }
    if (typeof MutationObserver !== 'undefined') {
      // Trays are shown/hidden through their inline display; in tight mode they
      // have no size, so ResizeObserver alone can't see that.
      new MutationObserver((records) => {
        if (records.some(r => r.target.matches?.(OBJECT_TRAYS))) fitBar()
      }).observe(bar, { attributes: true, subtree: true, attributeFilter: ['style'] })
    }
    // In narrow panes the bar scrolls horizontally; let the plain mouse wheel do it.
    $id('tools_top').addEventListener('wheel', e => {
      const bar = e.currentTarget
      if (bar.scrollWidth <= bar.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      bar.scrollLeft += e.deltaY
      e.preventDefault()
    }, { passive: false })
    $id('stroke_width').addEventListener('change', e => bp.changeStrokeWidth(e))
    $id('stroke_style').addEventListener('change', evt =>
      bp.handleStrokeAttr('stroke-dasharray', evt)
    )
    $id('stroke_linejoin').addEventListener('change', evt =>
      bp.handleStrokeAttr('stroke-linejoin', evt)
    )
    $id('stroke_linecap').addEventListener('change', evt =>
      bp.handleStrokeAttr('stroke-linecap', evt)
    )
    $id('opacity').addEventListener('change', e => bp.handleOpacity(e))

    // all top panel attributes
    ;[
      'elem_id',
      'circle_cx',
      'circle_cy',
      'circle_r',
      'ellipse_cx',
      'ellipse_cy',
      'ellipse_rx',
      'ellipse_ry',
      'selected_x',
      'selected_y',
      'rect_width',
      'rect_height',
      'line_x1',
      'line_x2',
      'line_y1',
      'line_y2',
      'image_width',
      'image_height'
    ].forEach(attrId =>
      $id(attrId).addEventListener('change', this.attrChanger.bind(this))
    )
  }
}

export default TopPanel
