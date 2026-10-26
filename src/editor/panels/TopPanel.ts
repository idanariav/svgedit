// TopPanel.ts — Quick-action handlers + `updateContextPanel` (shows/hides trays & tab sections); binds relocated zoom/stroke/opacity listeners; `attrChanger()`
/* eslint-disable max-len */
/* globals seAlert */

import SvgCanvas from '@svgedit/svgcanvas'
import topPanelHTML from './TopPanel.html'
import { localizePanelFragment } from '../panelI18n.ts'
import { runSteps } from '../runSteps.ts'
import { updateContextPanel, round1 } from './topPanelContext.ts'
import { error as logError } from '@svgedit/svgcanvas/common/logger.ts'
import { selectSameAs } from '@svgedit/svgcanvas/core/select-same.ts'

const { getTypeMap } = SvgCanvas

export type SpinInput = HTMLElementTagNameMap['se-spin-input']

/** The `detail.value` of a dropdown's `change` event. */
const detailValue = (e: Event): string => (e as CustomEvent).detail.value

/** The value of the control a `change` event came from (a `se-spin-input` or `se-input`). */
const targetValue = (e: Event): string => (e.target as HTMLInputElement).value

/*
 * register actions for left panel
 */
/**
 *
 */
class TopPanel {
  editor: EditorInstance
  /** The Size fields keep the selection's proportions (`tool_ratio_lock`). */
  ratioLocked = false

  /** @param editor svgedit handler */
  constructor (editor: EditorInstance) {
    this.editor = editor
  }

  displayTool (className: string) {
    const { $qa } = this.editor // container-scoped lookups (see EditorStartup constructor)
    // default display is 'none' so removing the property will make the panel visible
    ;($qa(`.${className}`) as HTMLElement[]).forEach(el => el.style.removeProperty('display'))
  }

  hideTool (className: string) {
    const { $qa } = this.editor // container-scoped lookups (see EditorStartup constructor)
    ;($qa(`.${className}`) as HTMLElement[]).forEach(el => {
      el.style.display = 'none'
    })
  }

  /** Toggle visibility of a sidepanel section by id. */
  setSidepanelVisible (id: string, visible: boolean) {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const el = $id(id)
    if (el) el.style.display = visible ? '' : 'none'
  }

  get selectedElement () {
    return this.editor.selectedElement
  }

  get multiselected () {
    return this.editor.multiselected
  }

  get path () {
    return this.editor.svgCanvas.pathActions
  }

  setStrokeOpt (opt: Element, changeElem?: boolean): void {
    const { id } = opt
    const bits = id.split('_')
    const [pre, val] = bits

    if (changeElem) {
      this.editor.svgCanvas.setStrokeAttr('stroke-' + pre, val)
    }
    opt.classList.add('current')
    const elements = Array.prototype.filter.call(
      opt.parentNode?.children ?? [],
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
   */
  update (): void {
    const { $id, $req, $qa } = this.editor // container-scoped lookups (see EditorStartup constructor)
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

            $req('stroke_width').value = gWidth === null ? '' : gWidth
            this.editor.bottomPanel.updateColorpickers(false)
            break
          }
          default: {
            this.editor.bottomPanel.updateColorpickers(false)

            $req('stroke_width').value =
              this.selectedElement.getAttribute('stroke-width') || 1
            $req('stroke_style').value =
              this.selectedElement.getAttribute('stroke-dasharray') || 'none'
            $req('stroke_style').setAttribute('value', $req('stroke_style').value)
            this.updateDashFitButton()

            let attr =
              this.selectedElement.getAttribute('stroke-linejoin') || 'miter'

            const joinOpt = $id('linejoin_' + attr)
            if (joinOpt) {
              this.setStrokeOpt(joinOpt)
              $req('stroke_linejoin').setAttribute('value', attr)
            }

            attr = this.selectedElement.getAttribute('stroke-linecap') || 'butt'
            const capOpt = $id('linecap_' + attr)
            if (capOpt) {
              this.setStrokeOpt(capOpt)
              $req('stroke_linecap').setAttribute('value', attr)
            }
          }
        }
      }],
      ['opacityIdClassFields', () => {
        // All elements including image and group have opacity
        if (this.selectedElement) {
          const opacPerc =
            Number(this.selectedElement.getAttribute('opacity') || 1.0) * 100
          $req('opacity').value = opacPerc
          $req('elem_id').value = this.selectedElement.id
          $req('elem_class').refresh(this.selectedElement)
        }
      }],
      ['bottomPanel.updateToolButtonState', () => this.editor.bottomPanel.updateToolButtonState()]
    ])
  }

  /** Updates the context panel tools based on the selected element (see topPanelContext.js). */
  updateContextPanel (): void {
    updateContextPanel(this)
  }

  /**
   * Live position readout while a single element is being dragged in select
   * mode. The drag only applies a temporary transform — attributes aren't
   * baked until mouseup's recalculateDimensions — so this adds the live
   * delta to the (unchanged) pre-drag attribute/bbox values rather than
   * re-reading stale attributes via updateContextPanel.
   */
  updateLiveMove (elem: Element, dx: number, dy: number): void {
    const $req = (id: string) => (this.editor.$req(id) as SpinInput)
    const { tagName } = elem
    const num = (v: string | null) => (parseFloat(v ?? '') || 0)

    if (['circle', 'ellipse'].includes(tagName)) {
      $req(`${tagName}_cx`).value = round1(num(elem.getAttribute('cx')) + dx)
      $req(`${tagName}_cy`).value = round1(num(elem.getAttribute('cy')) + dy)
    } else if (tagName === 'line') {
      $req('line_x1').value = round1(num(elem.getAttribute('x1')) + dx)
      $req('line_y1').value = round1(num(elem.getAttribute('y1')) + dy)
      $req('line_x2').value = round1(num(elem.getAttribute('x2')) + dx)
      $req('line_y2').value = round1(num(elem.getAttribute('y2')) + dy)
    } else if (['g', 'polyline', 'path'].includes(tagName)) {
      const bb = this.editor.svgCanvas.getStrokedBBox([elem])
      if (bb) {
        $req('selected_x').value = round1(bb.x + dx)
        $req('selected_y').value = round1(bb.y + dy)
      }
    } else if (tagName !== 'polygon') {
      $req('selected_x').value = round1(num(elem.getAttribute('x')) + dx)
      $req('selected_y').value = round1(num(elem.getAttribute('y')) + dy)
    }
  }

  /**
   * Live dimension readout while a single element is being resized via a
   * selection grip. `box` carries the same anchor/scale values event.js just
   * used to build the temporary translate-scale-translate transform, so this
   * mirrors that math onto the visible panel fields instead of the (still
   * unchanged) pre-drag attributes.
   */
  updateLiveResize (elem: Element, box: { left: number, top: number, width: number, height: number, tx: number, ty: number, sx: number, sy: number }): void {
    const $req = (id: string) => (this.editor.$req(id) as SpinInput)
    const { tagName } = elem
    const anchorX = box.left + box.tx
    const anchorY = box.top + box.ty
    const scalePt = (px: number, py: number) => ({
      x: anchorX + (px - anchorX) * box.sx,
      y: anchorY + (py - anchorY) * box.sy
    })
    const num = (v: string | null) => (parseFloat(v ?? '') || 0)

    if (tagName === 'line') {
      const p1 = scalePt(num(elem.getAttribute('x1')), num(elem.getAttribute('y1')))
      const p2 = scalePt(num(elem.getAttribute('x2')), num(elem.getAttribute('y2')))
      $req('line_x1').value = round1(p1.x)
      $req('line_y1').value = round1(p1.y)
      $req('line_x2').value = round1(p2.x)
      $req('line_y2').value = round1(p2.y)
      return
    }

    const width = box.width * box.sx
    const height = box.height * box.sy
    const { x, y } = scalePt(box.left, box.top)

    if (tagName === 'circle') {
      $req('circle_cx').value = round1(x + width / 2)
      $req('circle_cy').value = round1(y + height / 2)
      $req('circle_r').value = round1((width + height) / 4)
    } else if (tagName === 'ellipse') {
      $req('ellipse_cx').value = round1(x + width / 2)
      $req('ellipse_cy').value = round1(y + height / 2)
      $req('ellipse_rx').value = round1(width / 2)
      $req('ellipse_ry').value = round1(height / 2)
    } else {
      if (['rect', 'image'].includes(tagName)) {
        $req(`${tagName}_width`).value = round1(width)
        $req(`${tagName}_height`).value = round1(height)
      }
      if (tagName !== 'polygon') {
        $req('selected_x').value = round1(x)
        $req('selected_y').value = round1(y)
      }
    }
  }

  /** @param e Not used. */
  showSourceEditor (e?: Event | undefined, forSaving?: boolean): void {
    const { $req } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const $editorDialog = $req('se-svg-editor-dialog')
    if ($editorDialog.getAttribute('dialog') === 'open') return
    const origSource = this.editor.svgCanvas.getSvgString()
    $editorDialog.setAttribute('dialog', 'open')
    $editorDialog.setAttribute('value', origSource)
    $editorDialog.setAttribute('copysec', String(Boolean(forSaving)))
    $editorDialog.setAttribute('applysec', String(!forSaving))
  }

  /**
   * Activates the frame-drawing mode. The frame button lives in the top panel
   * but behaves like a left-panel drawing tool, so clear any pressed left-panel
   * tool and mark the frame button active. The button's pressed state is kept in
   * sync with the canvas mode by the modeChange listener in EditorStartup.
   */
  clickFrame (): void {
    const { $req, $qa } = this.editor // container-scoped lookups (see EditorStartup constructor)
    ;(($qa('#tools_left *[pressed]') as unknown) as { pressed: boolean }[]).forEach(b => { b.pressed = false })
    $req('tool_frame').pressed = true
    this.editor.svgCanvas.setMode('frame')
  }

  /** Fit the selection's dashes to their strokes, or turn the fit off. */
  clickDashFit (): void {
    const { svgCanvas } = this.editor
    svgCanvas.setDashFit(!svgCanvas.isDashFitted())
    this.updateDashFitButton()
  }

  /** Show whether the selection's dashes are fitted (the Dash row's Fit button). */
  updateDashFitButton (): void {
    const button = this.editor.$id('tool_dash_fit')
    if (button) button.pressed = this.editor.svgCanvas.isDashFitted()
  }

  /** Toggle wireframe mode. */
  clickWireframe (): void {
    const { $id, $req } = this.editor // container-scoped lookups (see EditorStartup constructor)
    $req('tool_wireframe').pressed = !$req('tool_wireframe').pressed
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
    const on = $req('tool_wireframe').pressed
    this.editor.svgCanvas.getCurConfig().wireframeSnapping = on
    this.editor.updateProportionMarkers?.()
  }

  clickUndo (): void {
    const { undoMgr, textActions } = this.editor.svgCanvas
    if (undoMgr.getUndoStackSize() > 0) {
      undoMgr.undo()
      this.editor.rightPanel.populateLayers()
      if (this.editor.svgCanvas.getMode() === 'textedit') {
        textActions.clear()
      }
    }
  }

  clickRedo (): void {
    const { undoMgr } = this.editor.svgCanvas
    if (undoMgr.getRedoStackSize() > 0) {
      undoMgr.redo()
      this.editor.rightPanel.populateLayers()
    }
  }

  changeRectRadius (e: Event): void {
    this.editor.svgCanvas.setRectRadius(targetValue(e))
  }

  changeCircleArc (e: Event): void {
    // Crossing 360° swaps <circle>/<ellipse> for an arc <path> (or back), which
    // clears + re-adds the selection; the panel briefly collapses and the
    // browser clamps its scroll to 0, jumping the arc field out from under the
    // pointer. Put the scroll position back once the panel is rebuilt.
    const { $req } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const scroller = $req('sidepanel_content')
    const { scrollTop } = scroller
    this.editor.svgCanvas.setCircleArc(Number(targetValue(e)))
    scroller.scrollTop = scrollTop
  }

  changeFontSize (e: Event): void {
    this.editor.svgCanvas.setFontSize(targetValue(e))
  }

  changeRotationAngle (e: Event): void {
    this.editor.svgCanvas.setRotationAngle(targetValue(e))
  }

  changeBlur (e: Event): void {
    this.editor.svgCanvas.setBlur(Number(targetValue(e)) / 10, true)
  }

  clickGroup (): void {
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
   */
  clickBoolOps (evt: Event): void {
    switch (detailValue(evt)) {
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

  clickBoolUnion (): void {
    this.editor.svgCanvas.booleanOps.union()
  }

  clickBoolIntersect (): void {
    this.editor.svgCanvas.booleanOps.intersect()
  }

  clickBoolSubtract (): void {
    this.editor.svgCanvas.booleanOps.subtract()
  }

  clickBoolExclude (): void {
    this.editor.svgCanvas.booleanOps.exclude()
  }

  clickBoolDivide (): void {
    this.editor.svgCanvas.booleanOps.divide()
  }

  clickClipSet (): void {
    this.editor.svgCanvas.clipMask.setClip()
  }

  clickMaskSet (): void {
    this.editor.svgCanvas.clipMask.setMask()
  }

  clickClipRelease (): void {
    this.editor.svgCanvas.clipMask.releaseClipMask()
  }

  changeFeather (e: Event): void {
    this.editor.svgCanvas.clipMask.setFeather(Number(targetValue(e)))
  }

  clickAlignEle (evt: Event): void {
    this.editor.svgCanvas.alignSelectedElements(detailValue(evt), 'page')
  }

  /** @param pos indicate the alignment relative to top, bottom, middle etc.. */
  clickAlign (pos: string): void {
    const { $req } = this.editor // container-scoped lookups (see EditorStartup constructor)
    let value = $req('tool_align_relative').value
    if (!value) {
      value = 'selected'
    }
    this.editor.svgCanvas.alignSelectedElements(pos, value)
  }

  /** Align multiple selected elements via the align dropdown. */
  clickAlignMulti (evt: Event): void {
    this.clickAlign(detailValue(evt))
  }

  attrChanger (e: Event): boolean {
    const target = e.target as HTMLInputElement
    const attr = target.getAttribute('data-attr') as string
    let val: string | number = target.value

    // For circle-arc paths, cx/cy/r must update both the data-* attr and the `d`
    const isArcPath = this.selectedElement?.tagName === 'path' &&
      this.selectedElement.hasAttribute('data-arc')
    if (isArcPath && ['cx', 'cy', 'r', 'rx', 'ry'].includes(attr)) {
      this.editor.svgCanvas.setCircleArcAttr(attr, Number(val))
      return true
    }

    const valid = this.editor.svgCanvas.isValidUnit(attr, val, this.selectedElement ?? undefined)

    if (!valid) {
      target.value = this.selectedElement?.getAttribute(attr) ?? ''
      alert(this.editor.i18next.t('notification.invalidAttrValGiven'))
      return false
    }

    if (attr !== 'id' && attr !== 'class') {
      if (Number.isNaN(Number(val))) {
        val = this.editor.svgCanvas.convertToNum(attr, val)
      } else if (this.editor.configObj.curConfig.baseUnit !== 'px') {
        // Convert unitless value to one with given unit

        const unitData = getTypeMap()

        if (
          ((this.editor.selectedElement as unknown) as Record<string, unknown> | null)?.[attr] ||
          this.editor.svgCanvas.getMode() === 'pathedit' ||
          attr === 'x' ||
          attr === 'y'
        ) {
          val = Number(val) * unitData[this.editor.configObj.curConfig.baseUnit]
        }
      }
    }

    this.editor.svgCanvas.changeSelectedAttribute(attr, val)
    return true
  }

  /** Toggle whether the Size fields keep the selection's proportions. */
  clickRatioLock (): void {
    this.ratioLocked = !this.ratioLocked
    this.editor.$req('tool_ratio_lock').pressed = this.ratioLocked
  }

  /**
   * Set the size of a group or a multi-selection from the Size fields; with the ratio lock on, the other side follows.
   * @param changed the field the user edited
   */
  changeSelectionSize (changed: 'width' | 'height'): void {
    const { svgCanvas, $req } = this.editor
    const selected = svgCanvas.getSelectedElements().filter(Boolean)
    const box = selected.length ? svgCanvas.getStrokedBBoxDefaultVisible(selected) : null
    if (!box?.width || !box.height) return
    const unit = this.editor.configObj.curConfig.baseUnit
    const toPx = unit !== 'px' ? getTypeMap()[unit] : 1
    let width = parseFloat(String($req('size_width').value)) * toPx
    let height = parseFloat(String($req('size_height').value)) * toPx
    if (this.ratioLocked) {
      if (changed === 'width') height = width * box.height / box.width
      else width = height * box.width / box.height
    }
    if (!(width > 0) || !(height > 0)) {
      this.updateContextPanel()
      return
    }
    svgCanvas.stretch.setSelectionSize(width, height)
  }

  convertToPath (): void {
    if (this.editor.selectedElement) {
      this.editor.svgCanvas.convertToPath()
    }
  }

  /** Convert the selected element's stroke into a filled outline path. */
  strokeToPath (): void {
    if (this.editor.selectedElement) {
      this.editor.svgCanvas.strokeToPath()
    }
  }

  /** The colour tolerance of "Select same" (Editor Preferences; 0 = exact). */
  selectSameTolerance (): number {
    const value = parseFloat(this.editor.configObj.pref('select_same_tolerance'))
    return Number.isFinite(value) && value > 0 ? value : 0
  }

  /**
   * Select every element sharing a property with the current selection.
 * @param evt - `change` event from the select-same dropdown.
   */
  clickSelectSame (evt: Event): void {
    selectSameAs(this.editor.svgCanvas, detailValue(evt), { tolerance: this.selectSameTolerance() })
  }

  /** Uniform stroke-width + round joins/caps across the selection. */
  clickMatchStrokes (): void {
    this.editor.svgCanvas.matchStrokes()
  }

  /** Flip selected element(s) horizontally. */
  clickFlipHorizontal (): void {
    if (this.editor.selectedElement || this.multiselected) {
      this.editor.svgCanvas.flipSelectedElements(-1, 1)
    }
  }

  /** Flip selected element(s) vertically. */
  clickFlipVertical (): void {
    if (this.editor.selectedElement || this.multiselected) {
      this.editor.svgCanvas.flipSelectedElements(1, -1)
    }
  }

  /** @returns Resolves to `undefined` */
  makeHyperlink (): void {
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

  linkControlPoints (): void {
    const { $req } = this.editor // container-scoped lookups (see EditorStartup constructor)
    $req('tool_node_link').pressed = !$req('tool_node_link').pressed
    const linked = !!$req('tool_node_link').pressed
    this.path.linkControlPoints(linked)
  }

  smoothPathNode (): void {
    this.path.smoothSelectedNodes()
  }

  clonePathNode (): void {
    if (this.path.getNodePoint()) {
      this.path.clonePathNode()
    }
  }

  deletePathNode (): void {
    if (this.path.getNodePoint()) {
      this.path.deletePathNode()
    }
  }

  addSubPath (): void {
    const { $req } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const button = $req('tool_add_subpath')
    const sp = !button.classList.contains('pressed')
    button.pressed = sp
    // button.toggleClass('push_button_pressed tool_button');
    this.path.addSubPath(sp)
  }

  opencloseSubPath (): void {
    this.path.opencloseSubPath()
  }

  /**
   * Delete is a contextual tool that only appears in the ribbon if
   * an element has been selected.
   */
  deleteSelected (): void {
    if (this.editor.selectedElement || this.editor.multiselected) {
      this.editor.svgCanvas.deleteSelectedElements()
    }
  }

  /** Handle a selection from the Arrange (z-order) dropdown. */
  clickArrange (evt: Event): void {
    switch (detailValue(evt)) {
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

  /** Checks if there are currently selected text elements to avoid firing of bold,italic when no text selected */
  get anyTextSelected (): boolean {
    const selected = this.editor.svgCanvas.getSelectedElements()
    return selected.filter(/** @type {{ tagName: string; }} */ (el: { tagName: string; }) => el.tagName === 'text').length > 0
  }

  clickBold (): false | undefined {
    if (this.anyTextSelected) {
      this.editor.svgCanvas.setBold(!this.editor.svgCanvas.getBold())
      this.updateContextPanel()
      return false
    }
  }

  clickItalic (): false | undefined {
    if (this.anyTextSelected) {
      this.editor.svgCanvas.setItalic(!this.editor.svgCanvas.getItalic())
      this.updateContextPanel()
      return false
    }
  }

  /** Area text on / off for the selected texts: a box the text wraps to, or plain point text. */
  clickTextArea (): false | undefined {
    if (this.anyTextSelected) {
      const { svgCanvas } = this.editor
      if (!svgCanvas.makeAreaText()) svgCanvas.makePointText()
      this.updateContextPanel()
      return false
    }
  }

  /**
   * Vertical alignment of the selected area texts inside their box.
 * @param evt the `se-select` change event
   */
  changeTextValign (evt: Event): void {
    this.editor.svgCanvas.setTextValign((detailValue(evt) as 'middle' | 'top' | 'bottom'))
  }

  /**
   * Handles the click on the text decoration buttons
 * @param value The text decoration value
 * @returns false
   */
  clickTextDecoration (value: string): boolean {
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
   **/
  clickTextAnchor (evt: Event): false {
    this.editor.svgCanvas.setTextAnchor(detailValue(evt))
    return false
  }

  changeLetterSpacing (e: Event): void {
    this.editor.svgCanvas.setLetterSpacing(targetValue(e))
  }

  changeWordSpacing (e: Event): void {
    this.editor.svgCanvas.setWordSpacing(targetValue(e))
  }

  changeTextLength (e: Event): void {
    this.editor.svgCanvas.setTextLength(targetValue(e))
  }

  changeTextPerspectiveX (e: Event): void {
    this.editor.svgCanvas.setTextPerspectiveX(targetValue(e))
  }

  changeTextPerspectiveY (e: Event): void {
    this.editor.svgCanvas.setTextPerspectiveY(targetValue(e))
  }

  changeLengthAdjust (evt: Event): void {
    this.editor.svgCanvas.setLengthAdjust(detailValue(evt))
  }

  /**
   * Set a selected image's URL.
   * @function module:SVGthis.setImageURL
   */
  setImageURL (url: string): void {
    const { $req } = this.editor // container-scoped lookups (see EditorStartup constructor)
    const { editor } = this
    if (!url) {
      url = editor.defaultImageURL
    }
    editor.svgCanvas.setImageURL(url)
    $req('image_url').value = url

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

  updateTitle (title?: string | undefined) {
    const { $qa } = this.editor // container-scoped lookups (see EditorStartup constructor)
    if (title) this.editor.title = title
    const titleElement = $qa('#title_panel > p')[0]
    if (titleElement) titleElement.textContent = this.editor.title
  }

  /** Enters image-crop mode for the selected `<image>` element. */
  clickImageCrop (): void {
    const [elem] = this.editor.svgCanvas.getSelectedElements().filter(Boolean)
    if (!this.editor.svgCanvas.imageCrop.isEligible(elem)) return
    this.editor.svgCanvas.imageCrop.start(elem)
  }

  /**
   * Applies the active image-crop session, surfacing a friendly alert if the
   * source image can't be resampled (e.g. a cross-origin URL without CORS).
   */
  async applyImageCrop (): Promise<void> {
    try {
      await this.editor.svgCanvas.imageCrop.apply()
    } catch (err) {
      logError('Image crop failed', err, 'TopPanel')
      seAlert(this.editor.i18next.t('tools.image_crop_error'))
    }
  }

  /** Shows/hides the transient Apply/Cancel tray while an image-crop session is active. */
  toggleImageCropMode (active: boolean): void {
    if (active) {
      this.displayTool('imagecrop_panel')
    } else {
      this.hideTool('imagecrop_panel')
    }
  }

  togglePathEditMode (editMode: boolean, elems: Element[]): void {
    const { $req } = this.editor // container-scoped lookups (see EditorStartup constructor)
    if (editMode) {
      this.displayTool('path_node_panel')
    } else {
      this.hideTool('path_node_panel')
    }
    if (editMode) {
      // Change select icon
      $req('tool_path').pressed = false
      $req('tool_select').pressed = true
      $req('tool_select').setAttribute('src', 'select_node.svg')
      this.editor.multiselected = false
      if (elems.length) {
        this.editor.selectedElement = elems[0]
      }
    } else {
      setTimeout(() => {
        $req('tool_select').setAttribute('src', 'select.svg')
      }, 1000)
    }
  }

  init () {
    const { $id, $req, $qa } = this.editor // container-scoped lookups (see EditorStartup constructor)
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
    $req('tool_link_url').setAttribute('title', i18next.t('tools.set_link_url'))
    // The panel's buttons are views of registry commands (`command=` in the markup,
    // panelCommands.js); only inputs / selects are bound here.
    // tool_undo / tool_redo / tool_clone(_multi) / tool_delete(_multi) /
    // tool_group_elements / tool_ungroup are views of registry commands
    // (`command=` in TopPanel.html, see coreCommands.js) -- no direct binding.
    $req('tool_arrange').addEventListener('change', this.clickArrange.bind(this))
    $req('tool_arrange_multi').addEventListener('change', this.clickArrange.bind(this))
    $req('tool_select_same').addEventListener('change', this.clickSelectSame.bind(this))
    $req('tool_bool_ops').addEventListener('change', this.clickBoolOps.bind(this))
    $req('clipmask_feather').addEventListener('change', this.changeFeather.bind(this))
    $req('tool_position').addEventListener('change', evt =>
      this.clickAlignEle.bind(this)(evt)
    )
    $req('tool_align_multi').addEventListener('change', this.clickAlignMulti.bind(this))
    $req('angle').addEventListener('change', this.changeRotationAngle.bind(this))
    $req('blur').addEventListener('change', this.changeBlur.bind(this))
    $req('rect_rx').addEventListener('change', this.changeRectRadius.bind(this))
    $req('circle_arc').addEventListener('change', this.changeCircleArc.bind(this))
    $req('ellipse_arc').addEventListener('change', this.changeCircleArc.bind(this))
    // Quick-pick buttons: set the field and fire its own change so the normal
    // changeCircleArc path (incl. circle <-> arc path swap) does the work.
    ;($qa('.arc_preset') as HTMLElement[]).forEach(btn => btn.addEventListener('click', () => {
      const field = $req(String(btn.dataset.target)) as SpinInput
      field.value = String(btn.dataset.arc)
      field.dispatchEvent(new CustomEvent('change'))
    }))
    $req('font_size').addEventListener('change', this.changeFontSize.bind(this))
    $req('tool_text_anchor').addEventListener('change', evt =>
      this.clickTextAnchor.bind(this)(evt)
    )
    $req('tool_text_valign').addEventListener('change', evt =>
      this.changeTextValign(evt)
    )
    $req('tool_letter_spacing').addEventListener(
      'change',
      this.changeLetterSpacing.bind(this)
    )
    $req('tool_word_spacing').addEventListener(
      'change',
      this.changeWordSpacing.bind(this)
    )
    $req('tool_text_length').addEventListener(
      'change',
      this.changeTextLength.bind(this)
    )
    $req('tool_length_adjust').addEventListener('change', evt =>
      this.changeLengthAdjust.bind(this)(evt)
    )
    $req('tool_perspective_x').addEventListener(
      'change',
      this.changeTextPerspectiveX.bind(this)
    )
    $req('tool_perspective_y').addEventListener(
      'change',
      this.changeTextPerspectiveY.bind(this)
    )
    $req('image_url').addEventListener('change', (evt) => {
      this.setImageURL((evt.currentTarget as HTMLInputElement).value)
    })

    // Controls relocated out of the bottom panel: zoom now lives in the top bar,
    // stroke + opacity in the right "Design" tab. They are bound here (TopPanel
    // initialises last) and delegate to the BottomPanel handlers.
    const bp = this.editor.bottomPanel
    $req('zoom').addEventListener('change', e => bp.changeZoom(detailValue(e)))
    // Narrow panes, two tiers. When the bar overflows: (1) drop the low-priority
    // items (file-name chip, theme toggle — also in Preferences) → `tt-compact`;
    // (2) if it still overflows, fold the object trays (clone/arrange/align…)
    // behind a "more" button that shows them as a floating panel → `tt-tight`.
    // Always re-measured from the full state, whenever the bar or a child changes
    // size, or a tray is shown/hidden (selection change).
    const bar = $req('tools_top')
    const more = $req('top_more')
    const OBJECT_TRAYS = '.selected_panel, .multiselected_panel, .g_panel, .image_panel'
    const pop = $req('top_more_pop')
    const topEnd = $req('top_end')
    const setMoreOpen = (open: boolean) => {
      bar.classList.toggle('tt-more-open', open)
      more.setAttribute('aria-expanded', String(open))
    }
    // The object trays live in the bar normally, and in the floating panel
    // (`#top_more_pop`, shown by `tt-more-open`) while tight. Always start a
    // measurement from the full state (trays back in the bar).
    const trays = () => (Array.from(bar.querySelectorAll(OBJECT_TRAYS)) as HTMLElement[])
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
        if (records.some(r => (r.target as Element).matches?.(OBJECT_TRAYS))) fitBar()
      }).observe(bar, { attributes: true, subtree: true, attributeFilter: ['style'] })
    }
    // In narrow panes the bar scrolls horizontally; let the plain mouse wheel do it.
    $req('tools_top').addEventListener('wheel', e => {
      const bar = e.currentTarget as HTMLElement
      if (bar.scrollWidth <= bar.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      bar.scrollLeft += e.deltaY
      e.preventDefault()
    }, { passive: false })
    $req('stroke_width').addEventListener('change', e => bp.changeStrokeWidth(e))
    $req('stroke_style').addEventListener('change', evt =>
      bp.handleStrokeAttr('stroke-dasharray', evt)
    )
    $req('stroke_linejoin').addEventListener('change', evt =>
      bp.handleStrokeAttr('stroke-linejoin', evt)
    )
    $req('stroke_linecap').addEventListener('change', evt =>
      bp.handleStrokeAttr('stroke-linecap', evt)
    )
    $req('opacity').addEventListener('change', e => bp.handleOpacity(e))

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
      $req(attrId).addEventListener('change', this.attrChanger.bind(this))
    )
    $req('size_width').addEventListener('change', () => this.changeSelectionSize('width'))
    $req('size_height').addEventListener('change', () => this.changeSelectionSize('height'))
  }
}

export default TopPanel
