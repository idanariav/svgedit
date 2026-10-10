import { error as logError } from '@svgedit/svgcanvas/common/logger.js'
/**
 * @file ext-markers.js
 *
 * @license Apache-2.0
 *
 * @copyright 2010 Will Schleter based on ext-arrows.js by Copyright(c) 2010 Alexis Deveria
 * @copyright 2021 OptimistikSAS
 *
 * This extension provides for the addition of markers to the either end
 * or the middle of a line, polyline, path, polygon.
 *
 * Markers are graphics
 *
 * to simplify the coding and make the implementation as robust as possible,
 * markers are not shared - every object has its own set of markers.
 * this relationship is maintained by a naming convention between the
 * ids of the markers and the ids of the object
 *
 * The following restrictions exist for simplicty of use and programming
 *    objects and their markers to have the same color
 *    marker size is fixed
 *    an application specific attribute - se_type - is added to each marker element
 *        to store the type of marker
 *
 * @todo
 *    remove some of the restrictions above
 *
*/

export default {
  name: 'markers',
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { BatchCommand, RemoveElementCommand, InsertElementCommand } = svgCanvas.history
    const { $id, addSVGElementsFromJson: addElem } = svgCanvas
    const mtypes = ['start', 'mid', 'end']
    const markerElems = ['line', 'path', 'polyline', 'polygon']

    // note - to add additional marker types add them below with a unique id
    // and add the associated icon(s) to marker-icons.svg
    // the geometry is normalized to a 100x100 box with the origin at lower left
    // Safari did not like negative values for low left of viewBox
    // remember that the coordinate system has +y downward
    const markerTypes = {
      nomarker: {},
      leftarrow:
        { element: 'path', attr: { d: 'M0,50 L100,90 L70,50 L100,10 Z' } },
      rightarrow:
        { element: 'path', attr: { d: 'M100,50 L0,90 L30,50 L0,10 Z' } },
      box:
        { element: 'path', attr: { d: 'M20,20 L20,80 L80,80 L80,20 Z' } },
      mcircle:
        { element: 'circle', attr: { r: 30, cx: 50, cy: 50 } },
      triangle:
        { element: 'path', attr: { d: 'M0,10 L100,50 L0,90 Z' } },
      diamond:
        { element: 'path', attr: { d: 'M0,50 L50,10 L100,50 L50,90 Z' } },
      openarrow:
        { element: 'path', attr: { d: 'M0,10 L100,50 L0,90' } },
      star:
        { element: 'path', attr: { d: 'M50,5 L61,39 L97,39 L68,61 L79,95 L50,75 L21,95 L32,61 L3,39 L39,39 Z' } },
      xmark:
        { element: 'path', attr: { d: 'M20,20 L80,80 M80,20 L20,80' } },
      forwardslash:
        { element: 'path', attr: { d: 'M20,80 L80,20' } },
      reverseslash:
        { element: 'path', attr: { d: 'M20,20 L80,80' } },
      verticalslash:
        { element: 'path', attr: { d: 'M50,10 L50,90' } }
    };

    // duplicate shapes to support unfilled (open) marker types with an _o suffix
    ['leftarrow', 'rightarrow', 'box', 'mcircle', 'triangle', 'star', 'diamond'].forEach((v) => {
      markerTypes[v + '_o'] = markerTypes[v]
    })

    // markers that are open strokes (lines / chevron) - never filled, even
    // without the _o suffix, otherwise SVG auto-closes them for the fill
    const strokeOnly = ['openarrow', 'forwardslash', 'reverseslash', 'verticalslash', 'xmark']

    /**
    * @param {Element} elem - A graphic element will have an attribute like marker-start
    * @param {"marker-start"|"marker-mid"|"marker-end"} attr
    * @returns {Element} The marker element that is linked to the graphic element
    */
    const getLinked = (elem, attr) => {
      const str = elem.getAttribute(attr)
      if (!str) { return null }
      const m = str.match(/\(#(.*)\)/)
      // "url(#mkr_end_svg_1)" would give m[1] = "mkr_end_svg_1"
      if (!m || m.length !== 2) {
        return null
      }
      return svgCanvas.getElement(m[1])
    }

    /**
     * Toggles context tool panel off/on.
     * @param {boolean} on
     * @returns {void}
    */
    const showPanel = (on, elem) => {
      $id('marker_panel').style.display = (on) ? 'block' : 'none'
      if (on && elem) {
        const align = $id('marker_align')
        align.value = svgCanvas.getArrowAlign(elem) ?? 'center'
        align.toggleAttribute('disabled', !svgCanvas.canAlignArrows(elem))
        mtypes.forEach((pos) => {
          const marker = getLinked(elem, 'marker-' + pos)
          if (marker?.attributes?.se_type) {
            $id(`${pos}_marker_list_opts`).setAttribute('value', marker.attributes.se_type.value)
          } else {
            $id(`${pos}_marker_list_opts`).setAttribute('value', 'nomarker')
          }
        })
      }
    }

    /**
    * @param {string} id
    * @param {""|"nomarker"|"nomarker"|"leftarrow"|"rightarrow"|"textmarker"|"forwardslash"|"reverseslash"|"verticalslash"|"box"|"star"|"xmark"|"triangle"|"mcircle"} seType
    * @returns {SVGMarkerElement}
    */
    const addMarker = (id, seType, el = svgCanvas.getSelectedElements()[0]) => {
      let marker = svgCanvas.getElement(id)
      if (marker) { return undefined }
      if (seType === '' || seType === 'nomarker') { return undefined }
      const color = el.getAttribute('stroke')
      const strokeWidth = 10
      const refX = 50
      const refY = 50
      const viewBox = '0 0 100 100'
      const markerWidth = 5
      const markerHeight = 5

      if (!markerTypes[seType]) {
        logError(`unknown marker type: ${seType}`, undefined, 'ext-markers')
        return undefined
      }

      // create a generic marker
      marker = addElem({
        element: 'marker',
        attr: {
          id,
          markerUnits: 'strokeWidth',
          orient: 'auto',
          style: 'pointer-events:none',
          se_type: seType
        }
      })

      // addElem (addSVGElementsFromJson) can return null (e.g. no live
      // document yet). marker.append(mel) below would throw on that, and
      // even findDefs().append(marker) further down wouldn't fail loudly --
      // it'd silently insert a literal "undefined" text node into <defs> --
      // so bail explicitly rather than either.
      if (!marker) return undefined

      const mel = addElem(markerTypes[seType])
      const fillcolor = (seType.substr(-2) === '_o' || strokeOnly.includes(seType))
        ? 'none'
        : color

      mel.setAttribute('fill', fillcolor)
      mel.setAttribute('stroke', color)
      mel.setAttribute('stroke-width', strokeWidth)
      marker.append(mel)

      marker.setAttribute('viewBox', viewBox)
      marker.setAttribute('markerWidth', markerWidth)
      marker.setAttribute('markerHeight', markerHeight)
      marker.setAttribute('refX', refX)
      marker.setAttribute('refY', refY)
      svgCanvas.findDefs().append(marker)

      return marker
    }

    /**
    * @param {Element} elem
    * @returns {SVGPolylineElement}
    */
    const convertline = (elem) => {
      // this routine came from the connectors extension
      // it is needed because midpoint markers don't work with line elements
      if (elem.tagName !== 'line') { return elem }

      // Convert to polyline to accept mid-arrow
      const x1 = Number(elem.getAttribute('x1'))
      const x2 = Number(elem.getAttribute('x2'))
      const y1 = Number(elem.getAttribute('y1'))
      const y2 = Number(elem.getAttribute('y2'))
      const { id } = elem

      // An aligned line is drawn trimmed: the new polyline starts from its real ends and trims again.
      const [p1, p2] = svgCanvas.getArrowSourcePoints(elem) ?? [{ x: x1, y: y1 }, { x: x2, y: y2 }]
      const pline = addElem({
        element: 'polyline',
        attr: {
          points: (p1.x + ',' + p1.y + ' ' + ((p1.x + p2.x) / 2) + ',' + ((p1.y + p2.y) / 2) + ' ' + p2.x + ',' + p2.y),
          stroke: elem.getAttribute('stroke'),
          // A missing stroke-width means the SVG initial value of 1 — pass
          // that through explicitly, since assignAttributes would otherwise
          // set the attribute to the literal string "null".
          'stroke-width': elem.getAttribute('stroke-width') ?? 1,
          fill: 'none',
          opacity: elem.getAttribute('opacity') || 1
        }
      })
      mtypes.forEach((pos) => { // get any existing marker definitions
        const nam = 'marker-' + pos
        const m = elem.getAttribute(nam)
        if (m) { pline.setAttribute(nam, elem.getAttribute(nam)) }
      })
      // Carry over any effect filter (outline/shadow). The polyline reuses the
      // line's id below, so the filter url still resolves; without this the
      // halo/shadow would be dropped when a mid-marker forces the conversion.
      const filterAttr = elem.getAttribute('filter')
      if (filterAttr) { pline.setAttribute('filter', filterAttr) }
      const align = svgCanvas.getArrowAlign(elem)

      const batchCmd = new BatchCommand()
      batchCmd.addSubCommand(new RemoveElementCommand(elem, elem.parentNode))
      batchCmd.addSubCommand(new InsertElementCommand(pline))

      elem.insertAdjacentElement('afterend', pline)
      elem.remove()
      svgCanvas.clearSelection()
      pline.id = id
      if (align) svgCanvas.setArrowAlign(pline, align)
      svgCanvas.addToSelection([pline])
      svgCanvas.addCommandToHistory(batchCmd)
      return pline
    }

    /**
    *
    * @returns {void}
    */
    const setMarker = (pos, markerType) => {
      const selElems = svgCanvas.getSelectedElements()
      if (selElems.length === 0) return
      // One undo step for the marker, its alignment and the trimmed geometry.
      svgCanvas.transact('Set marker', () => {
        const markerName = 'marker-' + pos
        let el = selElems[0]
        const marker = getLinked(el, markerName)
        if (marker) { marker.remove() }
        el.removeAttribute(markerName)
        let val = markerType
        if (val === '') { val = 'nomarker' }
        if (val !== 'nomarker') {
          // Set marker on element
          const id = 'mkr_' + pos + '_' + el.id
          addMarker(id, val)
          svgCanvas.changeSelectedAttribute(markerName, 'url(#' + id + ')')
          if (el.tagName === 'line' && pos === 'mid') {
            el = convertline(el)
          }
        }
        // New heads go tip-on-end; an aligned element follows its markers.
        if (pos !== 'mid' && val !== 'nomarker' && !svgCanvas.getArrowAlign(el)) svgCanvas.setArrowAlign(el, 'tip')
        svgCanvas.syncArrowAlign(el)
      })
      svgCanvas.call('changed', svgCanvas.getSelectedElements().filter(Boolean))
    }

    /**
     * Called when the main system modifies an object. This routine changes
     *   the associated markers to be the same color.
     * @param {Element} elem
     * @returns {void}
    */
    const colorChanged = (elem) => {
      const color = elem.getAttribute('stroke')

      mtypes.forEach((pos) => {
        const marker = getLinked(elem, 'marker-' + pos)
        if (!marker) { return }
        if (!marker.attributes.se_type) { return } // not created by this extension
        const ch = marker.lastElementChild
        if (!ch) { return }
        const curfill = ch.getAttribute('fill')
        const curstroke = ch.getAttribute('stroke')
        if (curfill && curfill !== 'none') { ch.setAttribute('fill', color) }
        if (curstroke && curstroke !== 'none') { ch.setAttribute('stroke', color) }
      })
    }

    /**
    * Called when the main system creates or modifies an object. It gives an element that shares a
    * marker with another one (a copy made without duplicating <defs>) a marker of its own.
    * Clone and paste already duplicate the markers inside the copy's own undo step, so they need nothing here.
    * @param {Element} el
    * @returns {void}
    */
    const updateReferences = (el) => {
      const selElems = svgCanvas.getSelectedElements()
      mtypes.forEach((pos) => {
        const markerName = 'marker-' + pos
        const marker = getLinked(el, markerName)
        if (!marker || !marker.attributes.se_type) { return } // not created by this extension
        const url = el.getAttribute(markerName)
        // Mirror twins stay linked to their source and share its markers on purpose.
        const partners = (other) => other.getAttribute('se:mirror-of') === el.id || el.getAttribute('se:mirror-of') === other.id
        const shared = Array.from(svgCanvas.getSvgContent().querySelectorAll('*'))
          .some((other) => other !== el && other.getAttribute(markerName) === url && !partners(other))
        const newMarkerId = 'mkr_' + pos + '_' + el.id
        if (shared && url !== `url(#${newMarkerId})`) {
          addMarker(newMarkerId, marker.attributes.se_type.value, el)
          svgCanvas.changeSelectedAttribute(markerName, 'url(#' + newMarkerId + ')', [el])
          svgCanvas.syncArrowAlign(el)
          svgCanvas.call('changed', selElems)
        }
      })
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      // The callback should be used to load the DOM with the appropriate UI items
      callback () {
        // Add the context panel and its handler(s)
        const panelTemplate = document.createElement('template')
        // create the marker panel as a Design-tab side-panel section
        const posLabels = { start: 'Start', mid: 'Mid', end: 'End' }
        let innerHTML = '<div id="marker_panel" class="sidepanel_section" style="display:none">'
        innerHTML += '<div class="sidepanel_section_label">Markers</div>'
        innerHTML += '<div class="sidepanel_btn_row">'
        mtypes.forEach((pos) => {
          innerHTML += `<div><div class="sub_label">${posLabels[pos]}</div>`
          innerHTML += `<se-list id="${pos}_marker_list_opts" title="tools.${pos}_marker_list_opts" label="" width="22px" height="22px">`
          Object.entries(markerTypes).forEach(([marker, _mkr]) => {
            innerHTML += `<se-list-item id="mkr_${pos}_${marker}" value="${marker}" title="tools.mkr_${marker}" src="${marker}.svg" img-height="22px"></se-list-item>`
          })
          innerHTML += '</se-list></div>'
        })
        innerHTML += '</div>'
        innerHTML += '<se-select id="marker_align" label="Head position" title="Where the head sits on the end of the line"></se-select>'
        innerHTML += '</div>'
        panelTemplate.innerHTML = innerHTML
        // Inject into the Design tab, right after Stroke & Opacity (before the
        // Object section); fall back to the top toolbar if the tab is missing.
        const designTab = $id('tab_design')
        const objectPanel = designTab?.querySelector('.selected_panel')
        if (designTab) {
          if (objectPanel) {
            designTab.insertBefore(panelTemplate.content, objectPanel)
          } else {
            designTab.appendChild(panelTemplate.content)
          }
        } else {
          $id('tools_top').appendChild(panelTemplate.content.cloneNode(true))
        }
        const align = $id('marker_align')
        align.addOption('center', 'Centered on the end')
        align.addOption('tip', 'Tip on the end')
        align.addOption('extend', 'Tip past the end')
        align.addEventListener('change', (evt) => {
          const el = svgCanvas.getSelectedElements()[0]
          const mode = evt.target.value === 'center' ? null : evt.target.value
          if (!el || svgCanvas.getArrowAlign(el) === mode) return
          svgCanvas.transact('Head position', () => svgCanvas.setArrowAlign(el, mode))
          svgCanvas.gettingSelectorManager().requestSelector(el).resize()
          svgCanvas.call('changed', [el])
        })
        // don't display the panels on start
        showPanel(false)
        mtypes.forEach((pos) => {
          $id(`${pos}_marker_list_opts`).addEventListener('change', (evt) => {
            setMarker(pos, evt.detail.value)
          })
        })
      },
      selectedChanged (opts) {
        // Use this to update the current selected elements
        if (opts.elems.length === 0) showPanel(false)
        opts.elems.forEach((elem) => {
          if (elem && markerElems.includes(elem.tagName)) {
            if (opts.selectedElement && !opts.multiselected) {
              showPanel(true, elem)
            } else {
              showPanel(false)
            }
          } else {
            showPanel(false)
          }
        })
      },
      elementChanged (opts) {
        const elem = opts.elems[0]
        // Stroke width, markers or the source changed: the trimmed geometry follows.
        if (elem?.hasAttribute?.('se:arrow-align') && svgCanvas.syncArrowAlign(elem)) {
          svgCanvas.gettingSelectorManager().requestSelector(elem).resize()
        }
        if (elem && (
          elem.getAttribute('marker-start') ||
          elem.getAttribute('marker-mid') ||
          elem.getAttribute('marker-end')
        )) {
          colorChanged(elem)
          updateReferences(elem)
        }
      }
    }
  }
}
