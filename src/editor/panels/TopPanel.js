/* eslint-disable max-len */
/* globals seAlert */

import SvgCanvas from '@svgedit/svgcanvas'
import topPanelHTML from './TopPanel.html'
import { runSteps } from '../runSteps.js'

const { $click, isValidUnit, getTypeMap, convertUnit } = SvgCanvas

// Position/dimension fields read straight off drag math (move/resize) can
// carry long floating-point tails (e.g. 200.00000596046448) — round for
// display, same convention already used for font_size.
const round1 = (n) => Number(Number(n).toFixed(1))

// Panel classes hidden at the start of every updateContextPanel() pass,
// before the current selection decides which (if any) to show again.
const STANDARD_CONTEXT_PANELS = [
  'selected_panel', 'multiselected_panel', 'g_panel', 'frame_panel',
  'rect_panel', 'circle_panel', 'ellipse_panel', 'line_panel',
  'text_panel', 'image_panel', 'container_panel', 'use_panel', 'a_panel'
]

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
   * Updates the context panel tools based on the selected element.
   * @returns {void}
   */
  updateContextPanel () {
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    let elem = this.editor.selectedElement
    // If element has just been deleted, consider it null
    if (!elem?.parentNode) {
      elem = null
    }
    const currentLayerName = this.editor.svgCanvas
      .getCurrentDrawing()
      .getCurrentLayerName()
    const currentMode = this.editor.svgCanvas.getMode()
    const unit =
      this.editor.configObj.curConfig.baseUnit !== 'px'
        ? this.editor.configObj.curConfig.baseUnit
        : null

    const isNode = currentMode === 'pathedit'
    const menuItems = $id('se-cmenu_canvas')

    // The selection-panel dispatch below is one big step: pathedit-node mode
    // exits it early (skipTail), preserving that original short-circuit
    // exactly. It's isolated from the reset step before it and the
    // history-button/layer-menu steps after it, so a throw dispatching on
    // one tagName (e.g. a stale field id in the text branch) can't also
    // leave the undo/redo buttons or layer-name field stuck stale.
    let skipTail = false
    runSteps([
      ['resetPanels', () => {
        STANDARD_CONTEXT_PANELS.forEach(panel => this.hideTool(panel))
        this.setSidepanelVisible('sidepanel_general', false)
        this.setSidepanelVisible('sidepanel_text', false)
        this.setSidepanelVisible('clipmask_panel', false)
      }],
      ['selectionPanels', () => {
        if (elem) {
          const elname = elem.nodeName
          const isArcPath = elname === 'path' && elem.hasAttribute('data-arc')

          const angle = this.editor.svgCanvas.getRotationAngle(elem)
          $id('angle').value = angle

          const blurval = this.editor.svgCanvas.getBlur(elem) * 10
          $id('blur').value = blurval

          if (!isNode && currentMode !== 'pathedit') {
            this.displayTool('selected_panel')
            this.setSidepanelVisible('sidepanel_general', true)
            if (elem.getAttribute('clip-path') || elem.getAttribute('mask')) {
              this.setSidepanelVisible('clipmask_panel', true)
              $id('clipmask_feather').value = this.editor.svgCanvas.getFeather(elem)
            }
            // Elements in this array already have coord fields
            const hasOwnCoords = ['line', 'circle', 'ellipse', 'polygon'].includes(elname) || isArcPath
            $id('selected_x').style.display = hasOwnCoords ? 'none' : ''
            $id('selected_y').style.display = hasOwnCoords ? 'none' : ''
            if (!hasOwnCoords) {
              let x
              let y

              // Get BBox vals for g, polyline and path
              if (['g', 'polyline', 'path'].includes(elname)) {
                const bb = this.editor.svgCanvas.getStrokedBBox([elem])
                if (bb) {
                  ;({ x, y } = bb)
                }
              } else {
                x = elem.getAttribute('x')
                y = elem.getAttribute('y')
              }

              if (unit) {
                x = convertUnit(x)
                y = convertUnit(y)
              }
              /**
               * Updates the value of an input field if needed
               * @param {string} id - The ID of the input element to be updated.
               * @param {number} newValue - The new numeric value to set in the input field.
               */
              const updateValue = (id, newValue) => {
                const rounded = round1(newValue)
                const currentValue = $id(id).value // Get current value from the field
                // do nothing if nothing changed...
                if (parseFloat(currentValue) === rounded) {
                  return
                }
                $id(id).value = rounded
              }

              updateValue('selected_x', x)
              updateValue('selected_y', y)
            }

            // Elements in this array cannot be converted to a path
            if (['image', 'text', 'path', 'g', 'use'].includes(elname)) {
              this.hideTool('tool_topath')
            } else {
              this.displayTool('tool_topath')
            }
            if (elname === 'path' && !isArcPath) {
              this.displayTool('tool_path_offset')
            } else {
              this.hideTool('tool_path_offset')
            }
            // Curve-fit smoothing assumes dense freehand point clouds — it
            // distorts the precise nodes of a hand-authored or converted path.
            if (elname === 'path' && elem.hasAttribute('data-freehand')) {
              this.displayTool('tool_smooth_path')
            } else {
              this.hideTool('tool_smooth_path')
            }
            // Stroke to Path never applies to an already-a-path element (use
            // node editing directly), and otherwise requires a visible stroke.
            if (elname === 'path' || !this.editor.svgCanvas.hasVisibleStroke(elem)) {
              this.hideTool('tool_stroke_to_path')
            } else {
              this.displayTool('tool_stroke_to_path')
            }
          } else {
            const point = this.path.getNodePoint()
            $id('tool_add_subpath').pressed = false
            $id('tool_node_delete').disabled = !this.path.canDeleteNodes

            // Show open/close button based on selected point
            // setIcon('#tool_openclose_path', path.closed_subpath ? 'open_path' : 'close_path');

            if (point) {
              const segType = $id('seg_type')
              if (point.type) {
                segType.value = point.type
                segType.removeAttribute('disabled')
              } else {
                segType.value = 4
                segType.setAttribute('disabled', 'disabled')
              }
            }
            skipTail = true
            return
          }

          // update contextual tools here
          const panels = {
            g: [],
            a: [],
            rect: ['rx', 'width', 'height'],
            image: ['width', 'height'],
            circle: ['cx', 'cy', 'r'],
            ellipse: ['cx', 'cy', 'rx', 'ry'],
            line: ['x1', 'y1', 'x2', 'y2'],
            text: [],
            use: []
          }

          const { tagName } = elem

          let linkHref = null
          if (tagName === 'a') {
            linkHref = this.editor.svgCanvas.getHref(elem)
            this.displayTool('g_panel')
          }
          // siblings
          if (elem.parentNode) {
            const selements = Array.prototype.filter.call(
              elem.parentNode.children,
              function (child) {
                return child !== elem
              }
            )
            if (elem.parentNode.tagName === 'a' && !selements.length) {
              this.displayTool('a_panel')
              linkHref = this.editor.svgCanvas.getHref(elem.parentNode)
            }
          }

          // Hide/show the make_link buttons
          if (linkHref) {
            this.displayTool('tool_make_link')
            this.displayTool('tool_make_link_multi')
            $id('link_url').value = linkHref
          } else {
            this.hideTool('tool_make_link')
            this.hideTool('tool_make_link_multi')
          }

          if (panels[tagName]) {
            const curPanel = panels[tagName]
            this.displayTool(tagName + '_panel')

            curPanel.forEach(item => {
              let attrVal = elem.getAttribute(item)
              if (this.editor.configObj.curConfig.baseUnit !== 'px' && elem[item]) {
                const bv = elem[item].baseVal.value
                attrVal = convertUnit(bv)
              }
              $id(`${tagName}_${item}`).value = attrVal ? round1(attrVal) : 0
            })

            if (tagName === 'image') {
              $id('tool_image_crop').style.display =
                this.editor.svgCanvas.isImageCropEligible(elem) ? '' : 'none'
            }

            if (tagName === 'circle') {
              $id('circle_arc').value = 360
            }

            if (tagName === 'ellipse') {
              $id('ellipse_arc').value = 360
            }

            if (tagName === 'text') {
              this.displayTool('text_panel')
              this.setSidepanelVisible('sidepanel_text', true)
              $id('tool_italic').pressed = this.editor.svgCanvas.getItalic()
              $id('tool_bold').pressed = this.editor.svgCanvas.getBold()
              $id('tool_text_decoration_underline').pressed =
                this.editor.svgCanvas.hasTextDecoration('underline')
              $id('tool_text_decoration_linethrough').pressed =
                this.editor.svgCanvas.hasTextDecoration('line-through')
              $id('tool_text_decoration_overline').pressed =
                this.editor.svgCanvas.hasTextDecoration('overline')
              $id('tool_font_family').value = elem.getAttribute('font-family')
              $id('tool_text_anchor').setAttribute(
                'value',
                elem.getAttribute('text-anchor')
              )
              // Show at most 1 decimal so resized sizes read "20.4" not "20.41258606"
              $id('font_size').value = Number(
                parseFloat(elem.getAttribute('font-size')).toFixed(1)
              )
              $id('tool_letter_spacing').value =
                elem.getAttribute('letter-spacing') ?? 0
              $id('tool_word_spacing').value =
                elem.getAttribute('word-spacing') ?? 0
              $id('tool_text_length').value = elem.getAttribute('textLength') ?? 0
              $id('tool_length_adjust').value =
                elem.getAttribute('lengthAdjust') ?? 0
              $id('tool_perspective_x').value =
                this.editor.svgCanvas.getTextPerspectiveX(elem)
              $id('tool_perspective_y').value =
                this.editor.svgCanvas.getTextPerspectiveY(elem)
              $id('text').value = this.editor.svgCanvas.getTextWithNewlines(elem)
              if (this.editor.svgCanvas.addedNew) {
                // Timeout needed for IE9
                setTimeout(() => {
                  $id('text').focus()
                  $id('text').select()
                }, 100)
              }
              // text
            } else if (
              tagName === 'image' &&
              this.editor.svgCanvas.getMode() === 'image'
            ) {
              this.editor.svgCanvas.setImageURL(this.editor.svgCanvas.getHref(elem))
              // image
            } else if (tagName === 'g' || tagName === 'use') {
              this.displayTool('container_panel')
              const title = this.editor.svgCanvas.getTitle()
              const label = $id('g_title')
              label.value = title
              $id('g_title').disabled = tagName === 'use'
            }
          }

          // A frame is a data-frame rect: it keeps the standard rect dimension panel
          // and additionally shows the editable Frame name field.
          if (tagName === 'rect' && elem.hasAttribute('data-frame')) {
            this.displayTool('frame_panel')
            $id('frame_name').value = this.editor.svgCanvas.getTitle() || ''
          }

          if (isArcPath) {
            // An arc path stores its geometry in data-* attrs. rx === ry means it
            // came from a circle (show the circle panel); otherwise an ellipse.
            const dataNum = (a) => Number(elem.getAttribute(a)) || 0
            const rFallback = dataNum('data-r') // legacy single-radius arc paths
            const rx = elem.hasAttribute('data-rx') ? dataNum('data-rx') : rFallback
            const ry = elem.hasAttribute('data-ry') ? dataNum('data-ry') : rFallback
            const arc = Number(elem.getAttribute('data-arc')) || 360
            if (rx === ry) {
              this.displayTool('circle_panel')
              $id('circle_cx').value = dataNum('data-cx')
              $id('circle_cy').value = dataNum('data-cy')
              $id('circle_r').value = rx
              $id('circle_arc').value = arc
            } else {
              this.displayTool('ellipse_panel')
              $id('ellipse_cx').value = dataNum('data-cx')
              $id('ellipse_cy').value = dataNum('data-cy')
              $id('ellipse_rx').value = rx
              $id('ellipse_ry').value = ry
              $id('ellipse_arc').value = arc
            }
          }

          menuItems.setAttribute(
            (tagName === 'g' ? 'en' : 'dis') + 'ablemenuitems',
            '#ungroup'
          )
          menuItems.setAttribute(
            (tagName === 'g' || !this.multiselected ? 'dis' : 'en') +
              'ablemenuitems',
            '#group'
          )

          // if (elem)
        } else if (this.multiselected) {
          // Check if all selected elements are 'text' nodes, if yes enable text panel
          const selElems = this.editor.svgCanvas.getSelectedElements()
          if (selElems.every(elem => elem.tagName === 'text')) {
            this.displayTool('text_panel')
            this.setSidepanelVisible('sidepanel_text', true)
          }

          this.displayTool('multiselected_panel')
          // Switch Layers only applies to exactly two selected elements
          $id('arrange_switch').style.display =
            selElems.filter(Boolean).length === 2 ? '' : 'none'
          menuItems.setAttribute('enablemenuitems', '#group,#add_to_shape_library')
          menuItems.setAttribute('disablemenuitems', '#ungroup')
        } else {
          menuItems.setAttribute(
            'disablemenuitems',
            '#delete,#cut,#copy,#group,#ungroup,#move_front,#move_up,#move_down,#move_back,#add_to_shape_library'
          )
        }
      }]
    ])

    if (skipTail) return

    runSteps([
      ['historyButtons', () => {
        $id('tool_undo').disabled =
          this.editor.svgCanvas.undoMgr.getUndoStackSize() === 0
        $id('tool_redo').disabled =
          this.editor.svgCanvas.undoMgr.getRedoStackSize() === 0

        this.editor.svgCanvas.addedNew = false
      }],
      ['layerAndMenuState', () => {
        if ((elem && !isNode) || this.multiselected) {
          // update the selected elements' layer
          $id('selLayerNames').removeAttribute('disabled')
          $id('selLayerNames').value = currentLayerName
          $id('selLayerNames').setAttribute('value', currentLayerName)

          // Enable regular menu options
          const canCMenu = $id('se-cmenu_canvas')
          canCMenu.setAttribute(
            'enablemenuitems',
            '#delete,#cut,#copy,#move_front,#move_up,#move_down,#move_back,#add_to_shape_library'
          )
        } else {
          $id('selLayerNames').setAttribute('disabled', 'disabled')
        }
      }]
    ])
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
    this.editor.svgCanvas.setCircleArc(Number(e.target.value))
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

    const valid = isValidUnit(attr, val, this.selectedElement)

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
            console.error('error =', error)
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
      console.error(err)
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
    const { $id } = this.editor // container-scoped lookups (see EditorStartup constructor)
    // add Top panel
    const template = document.createElement('template')
    const { i18next } = this.editor
    template.innerHTML = topPanelHTML
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
