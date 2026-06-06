/**
 * @file ext-connector.js
 *
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria
 * @copyright 2023 Optimistik SAS
 *
 */

const name = 'connector'

const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  // Locale files are inlined into the bundle (statically resolved glob).
  const locales = import.meta.glob('./locale/*.js', { eager: true })
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

export default {
  name,
  async init (S) {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { getElement, $id, $click, addSVGElementsFromJson } = svgCanvas
    const { svgroot, selectorManager } = S
    const seNs = svgCanvas.getEditorNS()
    await loadExtensionTranslation(svgEditor)

    let startX
    let startY
    let curLine
    let startElem
    let endElem

    let started = false
    let connections = []

    // Save the original groupSelectedElements method
    const originalGroupSelectedElements = svgCanvas.groupSelectedElements

    // Override the original groupSelectedElements to exclude connectors
    svgCanvas.groupSelectedElements = function (...args) {
      // Remove connectors from selection
      svgCanvas.removeFromSelection(document.querySelectorAll('[id^="conn_"]'))

      // Call the original method
      return originalGroupSelectedElements.apply(this, args)
    }

    // Save the original moveSelectedElements method
    const originalMoveSelectedElements = svgCanvas.moveSelectedElements

    // Override the original moveSelectedElements to handle connectors
    svgCanvas.moveSelectedElements = function (...args) {
      // Call the original method and store its result
      const cmd = originalMoveSelectedElements.apply(this, args)

      // Update connectors
      updateConnectors(svgCanvas.getSelectedElements())

      // Return the result of the original method
      return cmd
    }

    /**
     * getBBintersect
     * @param {Float} x
     * @param {Float} y
     * @param {module:utilities.BBoxObject} bb
     * @param {Float} offset
     * @returns {module:math.XYObject}
     */
    const getBBintersect = (x, y, bb, offset) => {
      // Adjust bounding box if offset is provided
      if (offset) {
        bb = { ...bb } // Create a shallow copy
        bb.width += offset
        bb.height += offset
        bb.x -= offset / 2
        bb.y -= offset / 2
      }

      // Calculate center of bounding box
      const midX = bb.x + bb.width / 2
      const midY = bb.y + bb.height / 2

      // Calculate lengths from (x, y) to center
      const lenX = x - midX
      const lenY = y - midY

      // Calculate slope of line from (x, y) to center
      const slope = Math.abs(lenY / lenX)

      // Calculate ratio to find intersection point
      let ratio
      if (slope < bb.height / bb.width) {
        ratio = bb.width / 2 / Math.abs(lenX)
      } else {
        ratio = lenY ? bb.height / 2 / Math.abs(lenY) : 0
      }

      // Calculate intersection point
      return {
        x: midX + lenX * ratio,
        y: midY + lenY * ratio
      }
    }

    /**
     * getOffset
     * @param {"start"|"end"} side - The side of the line ("start" or "end") where the marker may be present.
     * @param {Element} line - The line element to check for a marker.
     * @returns {Float} - Returns the calculated offset if a marker is present, otherwise returns 0.
     */
    const getOffset = (side, line) => {
      // Check for marker attribute on the given side ("marker-start" or "marker-end")
      const hasMarker = line.getAttribute('marker-' + side)

      // Calculate size based on stroke-width, multiplied by a constant factor (here, 5)
      // TODO: This factor should ideally be based on the actual size of the marker.
      const size = line.getAttribute('stroke-width') * 5

      // Return calculated size if marker is present, otherwise return 0.
      return hasMarker ? size : 0
    }

    /**
     * getConnMode
     * Reads the routing mode stored on a connector (se:conn_mode).
     * @param {Element} line - The connector polyline.
     * @returns {"straight"|"elbow"} Defaults to "straight".
     */
    const getConnMode = (line) => {
      return line.getAttributeNS(seNs, 'conn_mode') === 'elbow' ? 'elbow' : 'straight'
    }

    /**
     * computeConnectorPoints
     * Builds the full ordered point list for a connector based on its routing
     * mode. Straight keeps a single mid vertex (so marker-mid still renders);
     * elbow emits a 4-point orthogonal "Z" route between the facing box sides.
     * @param {module:utilities.BBoxObject} startBB
     * @param {module:utilities.BBoxObject} endBB
     * @param {Element} line - The connector polyline (for mode + marker offsets).
     * @returns {module:math.XYObject[]}
     */
    const computeConnectorPoints = (startBB, endBB, line) => {
      const sc = { x: startBB.x + startBB.width / 2, y: startBB.y + startBB.height / 2 }
      const ec = { x: endBB.x + endBB.width / 2, y: endBB.y + endBB.height / 2 }

      if (getConnMode(line) === 'elbow') {
        // Push attach points outward by half the marker offset so arrowheads clear the box.
        const offS = getOffset('start', line) / 2
        const offE = getOffset('end', line) / 2
        const dx = ec.x - sc.x
        const dy = ec.y - sc.y
        let sPt, ePt
        if (Math.abs(dx) >= Math.abs(dy)) {
          // Horizontal-dominant: attach on the left/right faces.
          if (dx >= 0) {
            sPt = { x: startBB.x + startBB.width + offS, y: sc.y }
            ePt = { x: endBB.x - offE, y: ec.y }
          } else {
            sPt = { x: startBB.x - offS, y: sc.y }
            ePt = { x: endBB.x + endBB.width + offE, y: ec.y }
          }
          const midX = (sPt.x + ePt.x) / 2
          // Note: elbow routes carry two interior vertices, so marker-mid renders at both bends.
          return [sPt, { x: midX, y: sPt.y }, { x: midX, y: ePt.y }, ePt]
        }
        // Vertical-dominant: attach on the top/bottom faces.
        if (dy >= 0) {
          sPt = { x: sc.x, y: startBB.y + startBB.height + offS }
          ePt = { x: ec.x, y: endBB.y - offE }
        } else {
          sPt = { x: sc.x, y: startBB.y - offS }
          ePt = { x: ec.x, y: endBB.y + endBB.height + offE }
        }
        const midY = (sPt.y + ePt.y) / 2
        return [sPt, { x: sPt.x, y: midY }, { x: ePt.x, y: midY }, ePt]
      }

      // Straight (default): endpoints on the box edges, single mid vertex.
      const sPt = getBBintersect(ec.x, ec.y, startBB, getOffset('start', line))
      const ePt = getBBintersect(sPt.x, sPt.y, endBB, getOffset('end', line))
      return [sPt, { x: (sPt.x + ePt.x) / 2, y: (sPt.y + ePt.y) / 2 }, ePt]
    }

    /**
     * routeConnector
     * Recomputes and writes a connector's full geometry from both bounding boxes.
     * @param {Element} line - The connector polyline.
     * @param {module:utilities.BBoxObject} startBB
     * @param {module:utilities.BBoxObject} endBB
     * @returns {void}
     */
    const routeConnector = (line, startBB, endBB) => {
      if (!startBB || !endBB) return
      const pts = computeConnectorPoints(startBB, endBB, line)
      line.setAttribute('points', pts.map((p) => `${p.x},${p.y}`).join(' '))
    }

    /**
     * showPanel
     * @param {boolean} on - Determines whether to show or hide the elements.
     * @param {Element} [elem] - The selected connector, used to sync the routing toggle.
     * @returns {void}
     */
    const showPanel = (on, elem) => {
      // Find the 'connector_rules' or create it if it doesn't exist.
      let connRules = $id('connector_rules')
      if (!connRules) {
        connRules = document.createElement('style')
        connRules.setAttribute('id', 'connector_rules')
        document.getElementsByTagName('head')[0].appendChild(connRules)
      }

      // Update the content of <style> element to either hide or show certain elements.
      connRules.textContent = !on
        ? ''
        : '#tool_clone, #tool_topath, #tool_angle, #xy_panel { display: none !important; }'

      // Update the display property of the <style> element itself based on the 'on' value.
      if ($id('connector_rules')) {
        $id('connector_rules').style.display = on ? 'block' : 'none'
      }

      // Toggle the connector context panel (routing + leader) and sync its state.
      const panel = $id('connector_panel')
      if (panel) {
        panel.style.display = on ? 'block' : 'none'
        if (on && elem) {
          const elbow = getConnMode(elem) === 'elbow'
          $id('connroute_straight').pressed = !elbow
          $id('connroute_elbow').pressed = elbow
        }
      }
    }

    /**
     * setRouting
     * Changes the routing mode of the selected connector and re-flows it.
     * @param {"straight"|"elbow"} mode
     * @returns {void}
     */
    const setRouting = (mode) => {
      const sel = svgCanvas.getSelectedElements()[0]
      if (!sel?.id?.startsWith('conn_')) return
      const dataStorage = svgCanvas.getDataStorage()
      sel.setAttributeNS(seNs, 'se:conn_mode', mode)
      routeConnector(sel, dataStorage.get(sel, 'start_bb'), dataStorage.get(sel, 'end_bb'))
      $id('connroute_straight').pressed = (mode !== 'elbow')
      $id('connroute_elbow').pressed = (mode === 'elbow')
      svgCanvas.call('changed', [sel])
    }

    /**
     * applyLeaderPreset
     * Restyles the selected connector as a thin leader-line callout: a slim
     * stroke with a small filled dot at the target (end). Reuses ext-markers
     * for the dot rather than duplicating marker creation.
     * @returns {void}
     */
    const applyLeaderPreset = () => {
      const sel = svgCanvas.getSelectedElements()[0]
      if (!sel?.id?.startsWith('conn_')) return
      // Thin the stroke - marker size is strokeWidth-relative so the dot shrinks too.
      svgCanvas.changeSelectedAttribute('stroke-width', 1)
      // Reuse the ext-markers picker to place a small filled dot at the target end.
      const endList = $id('end_marker_list_opts')
      if (endList) {
        endList.setAttribute('value', 'mcircle')
        endList.dispatchEvent(new CustomEvent('change', { detail: { value: 'mcircle' } }))
      }
      svgCanvas.call('changed', [sel])
    }

    /**
     * setPoint
     * @param {Element} elem - The SVG element.
     * @param {Integer|"end"} pos - The position index or "end".
     * @param {Float} x - The x-coordinate.
     * @param {Float} y - The y-coordinate.
     * @param {boolean} [setMid] - Whether to set the midpoint.
     * @returns {void}
     */
    const setPoint = (elem, pos, x, y, setMid) => {
      // Create a new SVG point
      const pts = elem.points
      const pt = svgroot.createSVGPoint()
      pt.x = x
      pt.y = y

      // If position is "end", set it to the last index
      if (pos === 'end') {
        pos = pts.numberOfItems - 1
      }

      // Try replacing the point at the specified position
      pts.replaceItem(pt, pos)

      // Optionally, set the midpoint
      if (setMid) {
        const ptStart = pts.getItem(0)
        const ptEnd = pts.getItem(pts.numberOfItems - 1)
        setPoint(elem, 1, (ptEnd.x + ptStart.x) / 2, (ptEnd.y + ptStart.y) / 2)
      }
    }

    /**
     * @param {Float} diffX
     * @param {Float} diffY
     * @returns {void}
     */
    const updatePoints = (line, conn, bb, altBB) => {
      const startBB = conn.is_start ? bb : altBB
      const endBB = conn.is_start ? altBB : bb
      routeConnector(line, startBB, endBB)
    }

    const updateLine = (diffX, diffY) => {
      const dataStorage = svgCanvas.getDataStorage()

      for (const conn of connections) {
        const {
          connector: line,
          is_start: isStart,
          start_x: startX,
          start_y: startY
        } = conn

        const pre = isStart ? 'start' : 'end'
        const altPre = isStart ? 'end' : 'start'

        // Update bbox for this element
        const bb = { ...dataStorage.get(line, `${pre}_bb`) }
        bb.x = startX + diffX
        bb.y = startY + diffY

        dataStorage.put(line, `${pre}_bb`, bb)

        // Get center point of connected element
        const altBB = dataStorage.get(line, `${altPre}_bb`)

        updatePoints(line, conn, bb, altBB, pre, altPre)
      }
    }

    // Finds connectors associated with selected elements
    const findConnectors = (elems = []) => {
      // Fetch data storage object from svgCanvas
      const dataStorage = svgCanvas.getDataStorage()

      // Query all connector elements (id startss with conn_)
      const connectors = document.querySelectorAll('[id^="conn_"]')
      // Reset connections array
      connections = []

      // Loop through each connector
      for (const connector of connectors) {
        let addThis = false // Flag to indicate whether to add this connector
        const parts = [] // To hold the starting and ending elements connected by the connector

        // Loop through the connector ends ("start" and "end")
        for (const [i, pos] of ['start', 'end'].entries()) {
          // Fetch connected element and its bounding box
          let part = dataStorage.get(connector, `c_${pos}`)

          // If part is null or undefined, fetch it and store it
          if (!part) {
            part = document.getElementById(
              connector.attributes['se:connector'].value.split(' ')[i]
            )
            dataStorage.put(connector, `c_${pos}`, part.id)
            dataStorage.put(
              connector,
              `${pos}_bb`,
              svgCanvas.getStrokedBBox([part])
            )
          } else {
            // If part is already stored, fetch it by ID
            part = document.getElementById(part)
          }

          // Add the part to the parts array
          parts.push(part)
        }

        // Loop through the starting and ending elements connected by the connector
        for (let i = 0; i < 2; i++) {
          const cElem = parts[i]
          const parents = svgCanvas.getParents(cElem?.parentNode)

          // Check if the element is part of a selected group
          for (const el of parents) {
            if (elems.includes(el)) {
              addThis = true
              break
            }
          }

          // If element is missing or parent is null, remove the connector
          if (!cElem || !cElem.parentNode) {
            connector.remove()
            continue
          }

          // If element is in the selection or part of a selected group
          if (elems.includes(cElem) || addThis) {
            const bb = svgCanvas.getStrokedBBox([cElem])

            // Add connection information to the connections array
            connections.push({
              elem: cElem,
              connector,
              is_start: i === 0,
              start_x: bb.x,
              start_y: bb.y
            })
          }
        }
      }
    }

    /**
     * Updates the connectors based on selected elements.
     * @param {Element[]} [elems] - Optional array of selected elements.
     * @returns {void}
     */
    const updateConnectors = elems => {
      const dataStorage = svgCanvas.getDataStorage()

      // Find connectors associated with selected elements
      findConnectors(elems)

      if (connections.length) {
        // Iterate through each connection to update its state
        for (const conn of connections) {
          const {
            elem,
            connector: line,
            is_start: isStart,
            start_x: startX,
            start_y: startY
          } = conn

          // Determine whether the connection starts or ends with this element
          const pre = isStart ? 'start' : 'end'

          // Update the bounding box for this element
          const bb = svgCanvas.getStrokedBBox([elem])
          bb.x = startX
          bb.y = startY
          dataStorage.put(line, `${pre}_bb`, bb)

          // Determine the opposite end ('start' or 'end') of the connection
          const altPre = isStart ? 'end' : 'start'

          // Retrieve the bounding box for the connected element at the opposite end
          const bb2 = dataStorage.get(line, `${altPre}_bb`)

          // Recompute the whole route from both bounding boxes (handles straight + elbow)
          const startBB = isStart ? bb : bb2
          const endBB = isStart ? bb2 : bb
          routeConnector(line, startBB, endBB)
        }
      }
    }

    /**
     * Do on reset.
     * @returns {void}
     */
    const reset = () => {
      const dataStorage = svgCanvas.getDataStorage()
      // Make sure all connectors have data set
      const svgContent = svgCanvas.getSvgContent()
      const elements = svgContent.querySelectorAll('*')
      elements.forEach(element => {
        const conn = element.getAttributeNS(seNs, 'connector')
        if (conn) {
          const connData = conn.split(' ')
          const sbb = svgCanvas.getStrokedBBox([getElement(connData[0])])
          const ebb = svgCanvas.getStrokedBBox([getElement(connData[1])])
          dataStorage.put(element, 'c_start', connData[0])
          dataStorage.put(element, 'c_end', connData[1])
          dataStorage.put(element, 'start_bb', sbb)
          dataStorage.put(element, 'end_bb', ebb)
          svgCanvas.getEditorNS(true)
        }
      })
    }

    reset()

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        // Add the button and its handler(s)
        const buttonTemplate = document.createElement('template')
        const title = `${name}:buttons.0.title`
        buttonTemplate.innerHTML = `
         <se-button id="tool_connect" title="${title}" src="conn.svg"></se-button>
         `
        $id('tools_left').append(buttonTemplate.content.cloneNode(true))
        $click($id('tool_connect'), () => {
          if (this.leftPanel.updateLeftPanel('tool_connect')) {
            svgCanvas.setMode('connector')
          }
        })

        // Add the connector context panel (routing toggle + leader preset) as a
        // Design-tab side-panel section, shown only when a connector is selected.
        const panelTemplate = document.createElement('template')
        panelTemplate.innerHTML = `
          <div id="connector_panel" class="sidepanel_section" style="display:none">
            <div class="sidepanel_section_label">Connector</div>
            <div class="sidepanel_btn_row">
              <se-button id="connroute_straight" title="${name}:routing.straight" src="conn_straight.svg"></se-button>
              <se-button id="connroute_elbow" title="${name}:routing.elbow" src="conn_elbow.svg"></se-button>
              <se-button id="connleader" title="${name}:routing.leader" src="conn_leader.svg"></se-button>
            </div>
          </div>
        `
        const designTab = $id('tab_design')
        if (designTab) {
          designTab.appendChild(panelTemplate.content)
        } else {
          $id('tools_top').appendChild(panelTemplate.content.cloneNode(true))
        }
        $click($id('connroute_straight'), () => setRouting('straight'))
        $click($id('connroute_elbow'), () => setRouting('elbow'))
        $click($id('connleader'), () => applyLeaderPreset())
      },
      mouseDown (opts) {
        // Retrieve necessary data from the SVG canvas and the event object
        const dataStorage = svgCanvas.getDataStorage()
        const svgContent = svgCanvas.getSvgContent()
        const { event: e, start_x: startX, start_y: startY } = opts
        const mode = svgCanvas.getMode()
        const {
          curConfig: { initStroke }
        } = svgEditor.configObj

        if (mode === 'connector') {
          // Return if the line is already started
          if (started) return undefined

          const mouseTarget = e.target
          const parents = svgCanvas.getParents(mouseTarget.parentNode)

          // Check if the target is a child of the main SVG content
          if (parents.includes(svgContent)) {
            // Identify the connectable element, considering foreignObject elements
            const fo = svgCanvas.getClosest(
              mouseTarget.parentNode,
              'foreignObject'
            )
            startElem = fo || mouseTarget

            // Retrieve the bounding box and calculate the center of the start element
            const bb = svgCanvas.getStrokedBBox([startElem])
            const x = bb.x + bb.width / 2
            const y = bb.y + bb.height / 2

            // Set the flag to indicate the line has started
            started = true

            // Create a new polyline element
            curLine = addSVGElementsFromJson({
              element: 'polyline',
              attr: {
                id: 'conn_' + svgCanvas.getNextId(),
                points: `${x},${y} ${x},${y} ${startX},${startY}`,
                stroke:
                  initStroke.color === 'none'
                    ? 'none'
                    : `#${initStroke.color}`,
                'stroke-width':
                  !startElem.stroke_width || startElem.stroke_width === 0
                    ? initStroke.width
                    : startElem.stroke_width,
                fill: 'none',
                opacity: initStroke.opacity,
                style: 'pointer-events:none'
              }
            })

            // Store the bounding box of the start element
            dataStorage.put(curLine, 'start_bb', bb)
          }

          return {
            started: true
          }
        }

        if (mode === 'select') {
          // Find connectors if the mode is 'select'
          findConnectors(opts.selectedElements)
        }

        return undefined
      },
      mouseMove (opts) {
        // Exit early if there are no connectors
        if (connections.length === 0) return

        const dataStorage = svgCanvas.getDataStorage()
        const zoom = svgCanvas.getZoom()
        // const e = opts.event;
        const x = opts.mouse_x / zoom
        const y = opts.mouse_y / zoom
        /** @todo  We have a concern if startX or startY are undefined */
        if (!startX || !startY) return

        const diffX = x - startX
        const diffY = y - startY

        const mode = svgCanvas.getMode()
        if (mode === 'connector' && started) {
          // const sw = curLine.getAttribute('stroke-width') * 3;
          // Set start point (adjusts based on bb)
          const pt = getBBintersect(
            x,
            y,
            dataStorage.get(curLine, 'start_bb'),
            getOffset('start', curLine)
          )
          startX = pt.x
          startY = pt.y

          setPoint(curLine, 0, pt.x, pt.y, true)

          // Set end point
          setPoint(curLine, 'end', x, y, true)
        } else if (mode === 'select') {
          for (const elem of svgCanvas.getSelectedElements()) {
            if (elem && dataStorage.has(elem, 'c_start')) {
              svgCanvas.removeFromSelection([elem])
              elem.transform.baseVal.clear()
            }
          }
          if (connections.length) {
            updateLine(diffX, diffY)
          }
        }
      },
      mouseUp (opts) {
        // Get necessary data and initial setups
        const dataStorage = svgCanvas.getDataStorage()
        const svgContent = svgCanvas.getSvgContent()
        const { event: e } = opts
        let mouseTarget = e.target

        // Early exit if not in connector mode
        if (svgCanvas.getMode() !== 'connector') return undefined

        // Check for a foreignObject parent and update mouseTarget if found
        const fo = svgCanvas.getClosest(mouseTarget.parentNode, 'foreignObject')
        if (fo) mouseTarget = fo

        // Check if the target is a child of the main SVG content
        const parents = svgCanvas.getParents(mouseTarget.parentNode)
        const isInSvgContent = parents.includes(svgContent)

        if (mouseTarget === startElem) {
          // Case: Started drawing line via click
          started = true
          return {
            keep: true,
            element: null,
            started
          }
        }

        if (!isInSvgContent) {
          // Case: Invalid target element; remove the line
          curLine?.remove()
          started = false
          return {
            keep: false,
            element: null,
            started
          }
        }

        // Valid target element for the end of the line
        endElem = mouseTarget

        const startId = startElem?.id || ''
        const endId = endElem?.id || ''
        const connStr = `${startId} ${endId}`
        const altStr = `${endId} ${startId}`

        // Prevent duplicate connectors
        const dupe = Array.from(
          document.querySelectorAll('[id^="conn_"]')
        ).filter(
          conn =>
            conn.getAttributeNS(seNs, 'connector') === connStr ||
            conn.getAttributeNS(seNs, 'connector') === altStr
        )

        if (dupe.length) {
          curLine.remove()
          return {
            keep: false,
            element: null,
            started: false
          }
        }

        // Save metadata to the connector
        const bb = svgCanvas.getStrokedBBox([endElem])
        dataStorage.put(curLine, 'c_start', startId)
        dataStorage.put(curLine, 'c_end', endId)
        dataStorage.put(curLine, 'end_bb', bb)
        curLine.setAttributeNS(seNs, 'se:connector', connStr)

        // Route the finalized connector from both bounding boxes
        routeConnector(curLine, dataStorage.get(curLine, 'start_bb'), bb)
        curLine.setAttribute('opacity', 1)

        // Finalize the connector
        svgCanvas.addToSelection([curLine])
        svgCanvas.moveToBottomSelectedElement()
        selectorManager.requestSelector(curLine).showGrips(false)

        started = false
        return {
          keep: true,
          element: curLine,
          started
        }
      },
      selectedChanged (opts) {
        // Get necessary data storage and SVG content
        const dataStorage = svgCanvas.getDataStorage()
        const svgContent = svgCanvas.getSvgContent()

        // Exit early if there are no connectors
        if (!svgContent.querySelectorAll('[id^="conn_"]').length) return

        // If the current mode is 'connector', switch to 'select'
        if (svgCanvas.getMode() === 'connector') {
          svgCanvas.setMode('select')
        }

        // Get currently selected elements
        const { elems: selElems } = opts

        // Iterate through selected elements
        for (const elem of selElems) {
          // If the element has a connector start, handle it
          if (elem && dataStorage.has(elem, 'c_start')) {
            selectorManager.requestSelector(elem).showGrips(false)

            // Show panel depending on selection state
            showPanel(opts.selectedElement && !opts.multiselected, elem)
          } else {
            // Hide panel if no connector start
            showPanel(false)
          }
        }

        // Update connectors based on selected elements
        updateConnectors(svgCanvas.getSelectedElements())
      },
      elementChanged (opts) {
        // Get the necessary data storage
        const dataStorage = svgCanvas.getDataStorage()

        // Get the first element from the options; exit early if it's null
        let [elem] = opts.elems
        if (!elem) return

        // Reinitialize if it's the main SVG content
        if (elem.tagName === 'svg' && elem.id === 'svgcontent') {
          reset()
        }

        // Check for marker attributes and update offsets
        const { markerStart, markerMid, markerEnd } = elem.attributes
        if (markerStart || markerMid || markerEnd) {
          curLine = elem
          dataStorage.put(elem, 'start_off', Boolean(markerStart))
          dataStorage.put(elem, 'end_off', Boolean(markerEnd))

          // Convert lines to polyline if there's a mid-marker
          if (elem.tagName === 'line' && markerMid) {
            const { x1, x2, y1, y2, id } = elem.attributes

            const midPt = `${(Number(x1.value) + Number(x2.value)) / 2},${
              (Number(y1.value) + Number(y2.value)) / 2
            }`
            const pline = addSVGElementsFromJson({
              element: 'polyline',
              attr: {
                points: `${x1.value},${y1.value} ${midPt} ${x2.value},${y2.value}`,
                stroke: elem.getAttribute('stroke'),
                'stroke-width': elem.getAttribute('stroke-width'),
                'marker-mid': markerMid.value,
                fill: 'none',
                opacity: elem.getAttribute('opacity') || 1
              }
            })

            elem.insertAdjacentElement('afterend', pline)
            elem.remove()
            svgCanvas.clearSelection()
            pline.id = id.value
            svgCanvas.addToSelection([pline])
            elem = pline
          }
        }

        // Update connectors based on the current element
        if (elem?.id.startsWith('conn_')) {
          const start = getElement(dataStorage.get(elem, 'c_start'))
          updateConnectors([start])
        } else {
          updateConnectors(svgCanvas.getSelectedElements())
        }
      },
      IDsUpdated (input) {
        const remove = []
        input.elems.forEach(function (elem) {
          if ('se:connector' in elem.attr) {
            elem.attr['se:connector'] = elem.attr['se:connector']
              .split(' ')
              .map(function (oldID) {
                return input.changes[oldID]
              })
              .join(' ')

            // Check validity - the field would be something like 'svg_21 svg_22', but
            // if one end is missing, it would be 'svg_21' and therefore fail this test
            if (!/. ./.test(elem.attr['se:connector'])) {
              remove.push(elem.attr.id)
            }
          }
        })
        return { remove }
      },
      toolButtonStateUpdate (opts) {
        const button = document.getElementById('tool_connect')
        if (opts.nostroke && button.pressed === true) {
          svgEditor.clickSelect()
        }
        button.disabled = opts.nostroke
      }
    }
  }
}
