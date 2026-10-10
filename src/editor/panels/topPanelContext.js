/* eslint-disable max-len */
/**
 * The top panel's context-panel refresh (which tools/fields show for the current
 * selection), split out of TopPanel.js, whose `updateContextPanel()` delegates here.
 */

import { runSteps } from '../runSteps.js'
import { LIVE_ATTRS } from '@svgedit/svgcanvas/core/path-join.js'

// Position/dimension fields read straight off drag math (move/resize) can
// carry long floating-point tails (e.g. 200.00000596046448) — round for
// display, same convention already used for font_size.
export const round1 = (n) => Number(Number(n).toFixed(1))

// Panel classes hidden at the start of every updateContextPanel() pass,
// before the current selection decides which (if any) to show again.
const STANDARD_CONTEXT_PANELS = [
  'selected_panel', 'multiselected_panel', 'g_panel', 'frame_panel',
  'rect_panel', 'circle_panel', 'ellipse_panel', 'line_panel',
  'text_panel', 'image_panel', 'container_panel', 'use_panel', 'a_panel'
]

/**
 * Updates the context panel tools based on the selected element.
 * @param {object} topPanel The owning TopPanel
 * @returns {void}
 */
export const updateContextPanel = (topPanel) => {
  const { $id } = topPanel.editor // container-scoped lookups (see EditorStartup constructor)
  let elem = topPanel.editor.selectedElement
  // If element has just been deleted, consider it null
  if (!elem?.parentNode) {
    elem = null
  }
  const currentLayerName = topPanel.editor.svgCanvas
    .getCurrentDrawing()
    .getCurrentLayerName()
  const currentMode = topPanel.editor.svgCanvas.getMode()
  const unit =
    topPanel.editor.configObj.curConfig.baseUnit !== 'px'
      ? topPanel.editor.configObj.curConfig.baseUnit
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
      STANDARD_CONTEXT_PANELS.forEach(panel => topPanel.hideTool(panel))
      topPanel.setSidepanelVisible('sidepanel_general', false)
      topPanel.setSidepanelVisible('sidepanel_advanced', false)
      topPanel.setSidepanelVisible('sidepanel_text', false)
      topPanel.setSidepanelVisible('clipmask_panel', false)
    }],
    ['selectionPanels', () => {
      if (elem) {
        const elname = elem.nodeName
        const isArcPath = elname === 'path' && elem.hasAttribute('data-arc')

        const angle = topPanel.editor.svgCanvas.getRotationAngle(elem)
        $id('angle').value = angle

        const blurval = topPanel.editor.svgCanvas.getBlur(elem) * 10
        $id('blur').value = blurval

        if (!isNode && currentMode !== 'pathedit') {
          topPanel.displayTool('selected_panel')
          topPanel.setSidepanelVisible('sidepanel_general', true)
          topPanel.setSidepanelVisible('sidepanel_advanced', true)
          if (elem.getAttribute('clip-path') || elem.getAttribute('mask')) {
            topPanel.setSidepanelVisible('clipmask_panel', true)
            $id('clipmask_feather').value = topPanel.editor.svgCanvas.getFeather(elem)
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
              const bb = topPanel.editor.svgCanvas.getStrokedBBox([elem])
              if (bb) {
                ;({ x, y } = bb)
              }
            } else {
              x = elem.getAttribute('x')
              y = elem.getAttribute('y')
            }

            if (unit) {
              x = topPanel.editor.svgCanvas.convertUnit(x)
              y = topPanel.editor.svgCanvas.convertUnit(y)
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
            topPanel.hideTool('tool_topath')
          } else {
            topPanel.displayTool('tool_topath')
          }
          if (elname === 'path' && !isArcPath) {
            topPanel.displayTool('tool_path_offset')
          } else {
            topPanel.hideTool('tool_path_offset')
          }
          // Smoothing refits the path's own nodes and keeps its corners (core/path-fit.js), so it
          // fits any plain path. A path whose geometry is derived from a source attribute (live
          // effects, corner radius, taper) would be rewritten out from under that source.
          if (elname === 'path' && !LIVE_ATTRS.some((attr) => elem.hasAttribute(attr))) {
            topPanel.displayTool('tool_smooth_path')
          } else {
            topPanel.hideTool('tool_smooth_path')
          }
          // Stroke to Path never applies to an already-a-path element (use
          // node editing directly), and otherwise requires a visible stroke.
          if (elname === 'path' || !topPanel.editor.svgCanvas.hasVisibleStroke(elem)) {
            topPanel.hideTool('tool_stroke_to_path')
          } else {
            topPanel.displayTool('tool_stroke_to_path')
          }
        } else {
          const point = topPanel.path.getNodePoint()
          $id('tool_add_subpath').pressed = false
          $id('tool_node_delete').disabled = !topPanel.path.canDeleteNodes

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
          linkHref = topPanel.editor.svgCanvas.getHref(elem)
          topPanel.displayTool('g_panel')
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
            topPanel.displayTool('a_panel')
            linkHref = topPanel.editor.svgCanvas.getHref(elem.parentNode)
          }
        }

        // Hide/show the make_link buttons
        if (linkHref) {
          topPanel.displayTool('tool_make_link')
          topPanel.displayTool('tool_make_link_multi')
          $id('link_url').value = linkHref
        } else {
          topPanel.hideTool('tool_make_link')
          topPanel.hideTool('tool_make_link_multi')
        }

        if (panels[tagName]) {
          const curPanel = panels[tagName]
          topPanel.displayTool(tagName + '_panel')

          curPanel.forEach(item => {
            let attrVal = elem.getAttribute(item)
            if (topPanel.editor.configObj.curConfig.baseUnit !== 'px' && elem[item]) {
              const bv = elem[item].baseVal.value
              attrVal = topPanel.editor.svgCanvas.convertUnit(bv)
            }
            $id(`${tagName}_${item}`).value = attrVal ? round1(attrVal) : 0
          })

          if (tagName === 'image') {
            $id('tool_image_crop').style.display =
              topPanel.editor.svgCanvas.isImageCropEligible(elem) ? '' : 'none'
          }

          if (tagName === 'circle') {
            $id('circle_arc').value = 360
          }

          if (tagName === 'ellipse') {
            $id('ellipse_arc').value = 360
          }

          if (tagName === 'text') {
            topPanel.displayTool('text_panel')
            topPanel.setSidepanelVisible('sidepanel_text', true)
            $id('tool_italic').pressed = topPanel.editor.svgCanvas.getItalic()
            $id('tool_bold').pressed = topPanel.editor.svgCanvas.getBold()
            $id('tool_text_decoration_underline').pressed =
              topPanel.editor.svgCanvas.hasTextDecoration('underline')
            $id('tool_text_decoration_linethrough').pressed =
              topPanel.editor.svgCanvas.hasTextDecoration('line-through')
            $id('tool_text_decoration_overline').pressed =
              topPanel.editor.svgCanvas.hasTextDecoration('overline')
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
              topPanel.editor.svgCanvas.getTextPerspectiveX(elem)
            $id('tool_perspective_y').value =
              topPanel.editor.svgCanvas.getTextPerspectiveY(elem)
            $id('text').value = topPanel.editor.svgCanvas.getTextWithNewlines(elem)
            if (topPanel.editor.svgCanvas.addedNew) {
              // Timeout needed for IE9
              setTimeout(() => {
                $id('text').focus()
                $id('text').select()
              }, 100)
            }
            // text
          } else if (
            tagName === 'image' &&
            topPanel.editor.svgCanvas.getMode() === 'image'
          ) {
            topPanel.editor.svgCanvas.setImageURL(topPanel.editor.svgCanvas.getHref(elem))
            // image
          } else if (tagName === 'g' || tagName === 'use') {
            topPanel.displayTool('container_panel')
            const title = topPanel.editor.svgCanvas.getTitle()
            const label = $id('g_title')
            label.value = title
            $id('g_title').disabled = tagName === 'use'
          }
        }

        // A frame is a data-frame rect: it keeps the standard rect dimension panel
        // and additionally shows the editable Frame name field.
        if (tagName === 'rect' && elem.hasAttribute('data-frame')) {
          topPanel.displayTool('frame_panel')
          $id('frame_name').value = topPanel.editor.svgCanvas.getTitle() || ''
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
            topPanel.displayTool('circle_panel')
            $id('circle_cx').value = dataNum('data-cx')
            $id('circle_cy').value = dataNum('data-cy')
            $id('circle_r').value = rx
            $id('circle_arc').value = arc
          } else {
            topPanel.displayTool('ellipse_panel')
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
          (tagName === 'g' || !topPanel.multiselected ? 'dis' : 'en') +
            'ablemenuitems',
          '#group'
        )

        // if (elem)
      } else if (topPanel.multiselected) {
        // Check if all selected elements are 'text' nodes, if yes enable text panel
        const selElems = topPanel.editor.svgCanvas.getSelectedElements()
        if (selElems.every(elem => elem.tagName === 'text')) {
          topPanel.displayTool('text_panel')
          topPanel.setSidepanelVisible('sidepanel_text', true)
        }

        topPanel.displayTool('multiselected_panel')
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
      // Undo/redo (and every other `command=` control) follow their command's
      // `enabled` check; see CommandRegistry.refreshEnablement.
      topPanel.editor.commands?.refreshEnablement()

      topPanel.editor.svgCanvas.addedNew = false
    }],
    ['layerAndMenuState', () => {
      if ((elem && !isNode) || topPanel.multiselected) {
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
