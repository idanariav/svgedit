/* eslint-disable max-len */
/**
 * The top panel's context-panel refresh (which tools/fields show for the current
 * selection), split out of TopPanel.js, whose `updateContextPanel()` delegates here.
 */

import { runSteps } from '../runSteps.ts'
import { refreshToolOptions } from './toolOptionsBar.ts'
import { LIVE_ATTRS } from '@svgedit/svgcanvas/core/path-join.ts'

// Position/dimension fields read straight off drag math (move/resize) can
// carry long floating-point tails (e.g. 200.00000596046448) — round for
// display, same convention already used for font_size.
export const round1 = (n: number) => Number(Number(n).toFixed(1))

// Panel classes hidden at the start of every updateContextPanel() pass,
// before the current selection decides which (if any) to show again.
const STANDARD_CONTEXT_PANELS = [
  'selected_panel', 'multiselected_panel', 'g_panel', 'frame_panel',
  'rect_panel', 'circle_panel', 'ellipse_panel', 'line_panel',
  'text_panel', 'image_panel', 'container_panel', 'use_panel', 'a_panel'
]

/**
 * Updates the context panel tools based on the selected element.
 * @param topPanel The owning TopPanel
 */
export const updateContextPanel = (topPanel: import('./TopPanel.ts').default): void => {
  const { $id, $req } = topPanel.editor // container-scoped lookups (see EditorStartup constructor)
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
        $req('angle').value = angle

        const blurval = Number(topPanel.editor.svgCanvas.getBlur(elem)) * 10
        $req('blur').value = blurval

        if (!isNode && currentMode !== 'pathedit') {
          topPanel.displayTool('selected_panel')
          topPanel.setSidepanelVisible('sidepanel_general', true)
          topPanel.setSidepanelVisible('sidepanel_advanced', true)
          if (elem.getAttribute('clip-path') || elem.getAttribute('mask')) {
            topPanel.setSidepanelVisible('clipmask_panel', true)
            $req('clipmask_feather').value = topPanel.editor.svgCanvas.clipMask.getFeather(elem)
          }
          // Elements in this array already have coord fields
          const hasOwnCoords = ['line', 'circle', 'ellipse', 'polygon'].includes(elname) || isArcPath
          $req('selected_x').style.display = hasOwnCoords ? 'none' : ''
          $req('selected_y').style.display = hasOwnCoords ? 'none' : ''
          if (!hasOwnCoords) {
            let x: string | number | null | undefined
            let y: string | number | null | undefined

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
              x = topPanel.editor.svgCanvas.convertUnit((x as string | number))
              y = topPanel.editor.svgCanvas.convertUnit((y as string | number))
            }
            /**
             * Updates the value of an input field if needed
 * @param id - The ID of the input element to be updated.
 * @param newValue - The new numeric value to set in the input field.
             */
            const updateValue = (id: string, newValue: number) => {
              const rounded = round1(newValue)
              const field = $id(id) as HTMLInputElement | null
              const currentValue = field?.value ?? '' // Get current value from the field
              // do nothing if nothing changed...
              if (parseFloat(currentValue) === rounded) {
                return
              }
              if (field) field.value = String(rounded)
            }

            updateValue('selected_x', Number(x))
            updateValue('selected_y', Number(y))
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
          $req('tool_add_subpath').pressed = false
          $req('tool_node_delete').disabled = !topPanel.path.canDeleteNodes

          // Show open/close button based on selected point
          // setIcon('#tool_openclose_path', path.closed_subpath ? 'open_path' : 'close_path');

          if (point) {
            const segType = $req('seg_type')
            if (point.type) {
              segType.value = String(point.type)
              segType.removeAttribute('disabled')
            } else {
              segType.value = '4'
              segType.setAttribute('disabled', 'disabled')
            }
          }
          skipTail = true
          return
        }

        // update contextual tools here
        const panels: Record<string, string[]> = {
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
          const parent = elem.parentNode as Element
          const selements = Array.prototype.filter.call(
            parent.children,
            function (child) {
              return child !== elem
            }
          )
          if (parent.tagName === 'a' && !selements.length) {
            topPanel.displayTool('a_panel')
            linkHref = topPanel.editor.svgCanvas.getHref(parent)
          }
        }

        // Hide/show the make_link buttons
        if (linkHref) {
          topPanel.displayTool('tool_make_link')
          topPanel.displayTool('tool_make_link_multi')
          $req('link_url').value = linkHref
        } else {
          topPanel.hideTool('tool_make_link')
          topPanel.hideTool('tool_make_link_multi')
        }

        if (panels[tagName]) {
          const curPanel = panels[tagName]
          topPanel.displayTool(tagName + '_panel')

          curPanel.forEach((item: string) => {
            let attrVal: string | number | null = elem.getAttribute(item)
            const animated = ((elem as unknown) as Record<string, { baseVal: { value: number } } | undefined>)[item]
            if (topPanel.editor.configObj.curConfig.baseUnit !== 'px' && animated) {
              const bv = animated.baseVal.value
              attrVal = topPanel.editor.svgCanvas.convertUnit(bv)
            }
            ;(($req(`${tagName}_${item}`) as unknown) as { value: any }).value = attrVal ? round1(Number(attrVal)) : 0
          })

          if (tagName === 'image') {
            $req('tool_image_crop').style.display =
              topPanel.editor.svgCanvas.imageCrop.isEligible(elem) ? '' : 'none'
          }

          if (tagName === 'circle') {
            $req('circle_arc').value = 360
          }

          if (tagName === 'ellipse') {
            $req('ellipse_arc').value = 360
          }

          if (tagName === 'text') {
            topPanel.displayTool('text_panel')
            topPanel.setSidepanelVisible('sidepanel_text', true)
            $req('tool_italic').pressed = topPanel.editor.svgCanvas.getItalic()
            $req('tool_bold').pressed = topPanel.editor.svgCanvas.getBold()
            $req('tool_text_decoration_underline').pressed =
              topPanel.editor.svgCanvas.hasTextDecoration('underline')
            $req('tool_text_decoration_linethrough').pressed =
              topPanel.editor.svgCanvas.hasTextDecoration('line-through')
            $req('tool_text_decoration_overline').pressed =
              topPanel.editor.svgCanvas.hasTextDecoration('overline')
            // Area text: the box button is pressed and the vertical alignment shows
            const areaTexts = topPanel.editor.svgCanvas.getSelectedElements().filter((el: Element) => el?.tagName === 'text' && topPanel.editor.svgCanvas.isAreaText(el))
            $req('tool_text_area').pressed = areaTexts.length > 0
            $req('tool_text_valign').style.display = areaTexts.length ? '' : 'none'
            if (areaTexts.length) $req('tool_text_valign').value = topPanel.editor.svgCanvas.getTextValign(areaTexts[0])
            $req('tool_font_family').value = elem.getAttribute('font-family') ?? ''
            $req('tool_text_anchor').setAttribute(
              'value',
              elem.getAttribute('text-anchor') ?? ''
            )
            // Show at most 1 decimal so resized sizes read "20.4" not "20.41258606"
            $req('font_size').value = Number(
              parseFloat(elem.getAttribute('font-size') ?? '').toFixed(1)
            )
            $req('tool_letter_spacing').value =
              elem.getAttribute('letter-spacing') ?? 0
            $req('tool_word_spacing').value =
              elem.getAttribute('word-spacing') ?? 0
            $req('tool_text_length').value = elem.getAttribute('textLength') ?? 0
            $req('tool_length_adjust').value =
              elem.getAttribute('lengthAdjust') ?? 0
            $req('tool_perspective_x').value =
              topPanel.editor.svgCanvas.getTextPerspectiveX(elem)
            $req('tool_perspective_y').value =
              topPanel.editor.svgCanvas.getTextPerspectiveY(elem)
            const textValue = topPanel.editor.svgCanvas.getTextWithNewlines(elem)
            $req('text').value = textValue
            if (topPanel.editor.svgCanvas.gesture.addedNew) {
              // Timeout needed for IE9. A new text is empty, so there is nothing to select: a select-all here
              // used to land after the first letters were typed (or after a test placed its caret) and the next key replaced them.
              setTimeout(() => $req('text').focus(), 100)
            }
            // text
          } else if (
            tagName === 'image' &&
            topPanel.editor.svgCanvas.getMode() === 'image'
          ) {
            topPanel.editor.svgCanvas.setImageURL(topPanel.editor.svgCanvas.getHref(elem) ?? '')
            // image
          } else if (tagName === 'g' || tagName === 'use') {
            topPanel.displayTool('container_panel')
            const title = topPanel.editor.svgCanvas.getTitle()
            const label = $id('g_title')
            if (label) {
              label.value = title
              // (`se-input` has no `disabled`: this sets a plain property and disables nothing — see techdebt.md)
              ;(($req('g_title') as unknown) as HTMLInputElement).disabled = tagName === 'use'
            }
          }
        }

        // A frame is a data-frame rect: it keeps the standard rect dimension panel
        // and additionally shows the editable Frame name field.
        if (tagName === 'rect' && elem.hasAttribute('data-frame')) {
          topPanel.displayTool('frame_panel')
          $req('frame_name').value = topPanel.editor.svgCanvas.getTitle() || ''
        }

        if (isArcPath) {
          // An arc path stores its geometry in data-* attrs. rx === ry means it
          // came from a circle (show the circle panel); otherwise an ellipse.
          const dataNum = (a: string) => Number(elem.getAttribute(a)) || 0
          const rFallback = dataNum('data-r') // legacy single-radius arc paths
          const rx = elem.hasAttribute('data-rx') ? dataNum('data-rx') : rFallback
          const ry = elem.hasAttribute('data-ry') ? dataNum('data-ry') : rFallback
          const arc = Number(elem.getAttribute('data-arc')) || 360
          if (rx === ry) {
            topPanel.displayTool('circle_panel')
            $req('circle_cx').value = dataNum('data-cx')
            $req('circle_cy').value = dataNum('data-cy')
            $req('circle_r').value = rx
            $req('circle_arc').value = arc
          } else {
            topPanel.displayTool('ellipse_panel')
            $req('ellipse_cx').value = dataNum('data-cx')
            $req('ellipse_cy').value = dataNum('data-cy')
            $req('ellipse_rx').value = rx
            $req('ellipse_ry').value = ry
            $req('ellipse_arc').value = arc
          }
        }

        menuItems?.setAttribute(
          (tagName === 'g' ? 'en' : 'dis') + 'ablemenuitems',
          '#ungroup'
        )
        menuItems?.setAttribute(
          (tagName === 'g' || !topPanel.multiselected ? 'dis' : 'en') +
            'ablemenuitems',
          '#group'
        )

        // if (elem)
      } else if (topPanel.multiselected) {
        // Check if all selected elements are 'text' nodes, if yes enable text panel
        const selElems = topPanel.editor.svgCanvas.getSelectedElements()
        if (selElems.every(/** @type {{ tagName: string; }} */ (elem: { tagName: string; }) => elem.tagName === 'text')) {
          topPanel.displayTool('text_panel')
          topPanel.setSidepanelVisible('sidepanel_text', true)
        }

        topPanel.displayTool('multiselected_panel')
        // Switch Layers only applies to exactly two selected elements
        $req('arrange_switch').style.display =
          selElems.filter(Boolean).length === 2 ? '' : 'none'
        menuItems?.setAttribute('enablemenuitems', '#group,#add_to_shape_library')
        menuItems?.setAttribute('disablemenuitems', '#ungroup')
      } else {
        menuItems?.setAttribute(
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

      topPanel.editor.svgCanvas.gesture.addedNew = false
    }],
    // The current tool's options may depend on the selection (the Blend tool shows the selected blend's).
    ['toolOptions', () => refreshToolOptions(topPanel.editor)],
    ['layerAndMenuState', () => {
      if ((elem && !isNode) || topPanel.multiselected) {
        // update the selected elements' layer
        $req('selLayerNames').removeAttribute('disabled')
        $req('selLayerNames').value = currentLayerName
        $req('selLayerNames').setAttribute('value', currentLayerName)

        // Enable regular menu options
        const canCMenu = $id('se-cmenu_canvas')
        canCMenu?.setAttribute(
          'enablemenuitems',
          '#delete,#cut,#copy,#move_front,#move_up,#move_down,#move_back,#add_to_shape_library'
        )
      } else {
        $req('selLayerNames').setAttribute('disabled', 'disabled')
      }
    }]
  ])
}
