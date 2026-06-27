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

    // ── Hover-highlight state ────────────────────────────────────────────────
    let highlightRect = null
    const snapDots = {}       // { n, s, e, w } → SVGCircleElement
    let currentHoverElem = null

    // ── Proximity snap constants ─────────────────────────────────────────────
    // How far (screen px) outside a shape the cursor can be and still bind.
    const SNAP_RING_OFFSETS = [
      [0, 0], [12, 0], [-12, 0], [0, 12], [0, -12],
      [9, 9], [-9, 9], [9, -9], [-9, -9]
    ]

    // Save the original groupSelectedElements method
    const originalGroupSelectedElements = svgCanvas.groupSelectedElements

    // Override the original groupSelectedElements to exclude connectors
    svgCanvas.groupSelectedElements = function (...args) {
      // Remove connectors from selection
      svgCanvas.removeFromSelection(svgCanvas.$qa('[id^="conn_"]'))

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

    // ── Cardinal-point geometry ──────────────────────────────────────────────

    /**
     * Returns the midpoint of the face of `bb` that faces toward (fromX, fromY),
     * pushed outward by `offset` px. Used for clean N/S/E/W connector exits.
     * @param {Float} fromX
     * @param {Float} fromY
     * @param {module:utilities.BBoxObject} bb
     * @param {Float} [offset]
     * @returns {module:math.XYObject}
     */
    const getCardinalPoint = (fromX, fromY, bb, offset = 0) => {
      const cx = bb.x + bb.width / 2
      const cy = bb.y + bb.height / 2
      const dx = fromX - cx
      const dy = fromY - cy
      // Normalize by half-dimensions so rectangular shapes pick the right face.
      const hw = bb.width / 2 || 1
      const hh = bb.height / 2 || 1
      if (Math.abs(dx) / hw >= Math.abs(dy) / hh) {
        // Horizontal dominant → exit left or right face
        return dx >= 0
          ? { x: bb.x + bb.width + offset, y: cy }
          : { x: bb.x - offset, y: cy }
      }
      // Vertical dominant → exit top or bottom face
      return dy >= 0
        ? { x: cx, y: bb.y + bb.height + offset }
        : { x: cx, y: bb.y - offset }
    }

    /** Euclidean distance between two points. */
    const ptDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

    // ── Proximity hit detection ──────────────────────────────────────────────

    /**
     * Returns the nearest connectable SVG element within a proximity zone around
     * (clientX, clientY). Scans a ring of offsets so the user does not need to
     * click exactly on a shape — up to ~12 screen px away still binds.
     * @param {Float} clientX  Page/screen X coordinate.
     * @param {Float} clientY  Page/screen Y coordinate.
     * @returns {Element|null}
     */
    const findConnectableAt = (clientX, clientY) => {
      const svgContent = svgCanvas.getSvgContent()

      const isConnectable = (el) => {
        if (!el || el === svgContent || el.tagName === 'svg') return false
        // Exclude our own overlay and connector lines.
        if (el.id?.startsWith('conn_') || el.id?.startsWith('se_conn_')) return false
        // Must be a descendant of svgcontent (possibly inside a layer <g>).
        let node = el.parentNode
        while (node) {
          if (node === svgContent) return true
          node = node.parentNode
        }
        return false
      }

      for (const [dx, dy] of SNAP_RING_OFFSETS) {
        for (const el of document.elementsFromPoint(clientX + dx, clientY + dy)) {
          if (isConnectable(el)) return el
        }
      }
      return null
    }

    // ── Hover highlight ──────────────────────────────────────────────────────

    /**
     * Creates the connector hover-highlight overlay in svgroot (above svgcontent).
     * Contains a shape outline rect and four cardinal snap-point circles.
     */
    const createHighlightLayer = () => {
      if ($id('se_conn_hover')) return

      const ns = 'http://www.w3.org/2000/svg'
      const g = document.createElementNS(ns, 'g')
      g.id = 'se_conn_hover'
      g.setAttribute('style', 'pointer-events:none')

      // Shape outline rect
      const rect = document.createElementNS(ns, 'rect')
      rect.id = 'se_conn_hrect'
      rect.setAttribute('fill', 'none')
      rect.setAttribute('stroke', '#6965db')
      rect.setAttribute('stroke-width', '2')
      rect.setAttribute('rx', '3')
      rect.setAttribute('opacity', '0.8')
      rect.style.display = 'none'
      g.appendChild(rect)
      highlightRect = rect

      // N / S / E / W snap dots
      for (const key of ['n', 's', 'e', 'w']) {
        const c = document.createElementNS(ns, 'circle')
        c.id = `se_conn_snap_${key}`
        c.setAttribute('r', '5')
        c.setAttribute('fill', '#6965db')
        c.setAttribute('stroke', '#fff')
        c.setAttribute('stroke-width', '1.5')
        c.style.display = 'none'
        g.appendChild(c)
        snapDots[key] = c
      }

      svgroot.appendChild(g)
    }

    /**
     * Converts a pair of screen (client) coordinates to svgroot user-space
     * coordinates using the root SVG element's CTM. This works regardless of
     * how zoom/pan is implemented (viewBox, transform, scroll, etc.) because
     * getScreenCTM() accounts for the full transformation chain.
     */
    const clientToSvgRoot = (clientX, clientY) => {
      const ctm = svgroot.getScreenCTM()
      if (!ctm) return { x: clientX, y: clientY }
      const pt = svgroot.createSVGPoint()
      pt.x = clientX
      pt.y = clientY
      const r = pt.matrixTransform(ctm.inverse())
      return { x: r.x, y: r.y }
    }

    /**
     * Shows the highlight outline and four snap dots for `elem`.
     * Positions everything using getBoundingClientRect → svgroot CTM so the
     * result is correct regardless of svgcontent's nested coordinate system.
     * @param {Element} elem  The connectable shape to highlight.
     * @param {Float} clientX  Cursor screen X (used to pick the nearest snap dot).
     * @param {Float} clientY  Cursor screen Y.
     */
    const showHoverHighlight = (elem, clientX, clientY) => {
      if (!highlightRect) return
      const domRect = elem.getBoundingClientRect()
      if (!domRect || !domRect.width) return

      // Convert the element's screen bbox corners to svgroot coordinates.
      const PAD = 5
      const tl = clientToSvgRoot(domRect.left - PAD, domRect.top - PAD)
      const br = clientToSvgRoot(domRect.right + PAD, domRect.bottom + PAD)
      const rx = tl.x
      const ry = tl.y
      const rw = br.x - tl.x
      const rh = br.y - tl.y

      highlightRect.setAttribute('x', rx)
      highlightRect.setAttribute('y', ry)
      highlightRect.setAttribute('width', rw)
      highlightRect.setAttribute('height', rh)
      highlightRect.style.display = ''

      // Cardinal midpoints in svgroot space (derived from the converted bbox).
      const pts = {
        n: { x: rx + rw / 2, y: ry },
        s: { x: rx + rw / 2, y: ry + rh },
        e: { x: rx + rw,     y: ry + rh / 2 },
        w: { x: rx,          y: ry + rh / 2 }
      }

      // Find the dot nearest to the cursor (cursor converted to svgroot space).
      const cur = clientToSvgRoot(clientX, clientY)
      let nearKey = null
      let nearDist = Infinity
      for (const [key, pt] of Object.entries(pts)) {
        const d = ptDist(cur, pt)
        if (d < nearDist) { nearDist = d; nearKey = key }
      }

      for (const [key, dot] of Object.entries(snapDots)) {
        dot.setAttribute('cx', pts[key].x)
        dot.setAttribute('cy', pts[key].y)
        dot.style.display = ''
        const isNearest = key === nearKey
        dot.setAttribute('r', isNearest ? '7' : '5')
        dot.setAttribute('fill-opacity', isNearest ? '1' : '0.55')
      }
    }

    /**
     * Updates only the "active nearest dot" highlight without repositioning.
     * @param {Float} clientX  Cursor screen X.
     * @param {Float} clientY  Cursor screen Y.
     * @param {Element} elem
     */
    const updateSnapHighlight = (clientX, clientY, elem) => {
      if (!highlightRect || highlightRect.style.display === 'none') return
      const domRect = elem.getBoundingClientRect()
      if (!domRect || !domRect.width) return

      const tl = clientToSvgRoot(domRect.left, domRect.top)
      const br = clientToSvgRoot(domRect.right, domRect.bottom)
      const rx = tl.x; const ry = tl.y
      const rw = br.x - tl.x; const rh = br.y - tl.y

      const pts = {
        n: { x: rx + rw / 2, y: ry },
        s: { x: rx + rw / 2, y: ry + rh },
        e: { x: rx + rw,     y: ry + rh / 2 },
        w: { x: rx,          y: ry + rh / 2 }
      }
      const cur = clientToSvgRoot(clientX, clientY)
      let nearKey = null; let nearDist = Infinity
      for (const [key, pt] of Object.entries(pts)) {
        const d = ptDist(cur, pt)
        if (d < nearDist) { nearDist = d; nearKey = key }
      }
      for (const [key, dot] of Object.entries(snapDots)) {
        const isNearest = key === nearKey
        dot.setAttribute('r', isNearest ? '7' : '5')
        dot.setAttribute('fill-opacity', isNearest ? '1' : '0.55')
      }
    }

    /** Hides the shape outline and all snap dots. */
    const hideHoverHighlight = () => {
      if (highlightRect) highlightRect.style.display = 'none'
      for (const dot of Object.values(snapDots)) dot.style.display = 'none'
      currentHoverElem = null
    }

    /**
     * Converts svgcontent coordinates (opts.mouse_x/zoom) to screen coordinates
     * via the svgroot CTM. Used so mouseMove can call findConnectableAt.
     */
    const svgContentToScreen = (svgX, svgY) => {
      // svgcontent may be offset within svgroot (x/y attrs on the nested <svg>).
      // The safest route: create a temporary SVG point on svgcontent and transform
      // it through the whole chain to screen space.
      const svgContent = svgCanvas.getSvgContent()
      const ctm = svgContent.getScreenCTM()
      if (!ctm) return { x: svgX, y: svgY }
      const pt = svgContent.createSVGPoint()
      pt.x = svgX
      pt.y = svgY
      const r = pt.matrixTransform(ctm)
      return { x: r.x, y: r.y }
    }


    // ── Legacy geometry (kept for elbow mode) ────────────────────────────────

    /**
     * getBBintersect — finds the intersection of the line from bb-center to (x,y)
     * with the bounding box perimeter. Still used by elbow mode.
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
     * Builds the full ordered point list for a connector based on its routing mode.
     *
     * Straight mode: exits from the cardinal face (N/S/E/W midpoint) of each shape,
     * giving clean orthogonal exits instead of arbitrary edge intersections.
     *
     * Elbow mode: 4-point orthogonal "Z" route between facing box sides (unchanged).
     *
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

      // Straight mode: use cardinal face midpoints for clean N/S/E/W exits.
      // The start exits from the face nearest to the end, and vice-versa.
      const sPt = getCardinalPoint(ec.x, ec.y, startBB, getOffset('start', line))
      const ePt = getCardinalPoint(sc.x, sc.y, endBB, getOffset('end', line))
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

      // Query all connector elements (id starts with conn_)
      const connectors = svgCanvas.$qa('[id^="conn_"]')
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
            part = svgCanvas.$id(
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
            part = svgCanvas.$id(part)
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

        // Create the SVG hover-highlight overlay (outline + snap dots).
        createHighlightLayer()

        // Pre-draw hover highlight: the extension's mouseMove hook only fires
        // while the mouse button is held, so we attach a direct DOM listener
        // on the workarea for idle hover detection.
        const workarea = document.querySelector('#workarea') || $id('svgcanvas')
        workarea?.addEventListener('mousemove', (e) => {
          if (svgCanvas.getMode() !== 'connector' || started) return
          const hovered = findConnectableAt(e.clientX, e.clientY)
          if (hovered === currentHoverElem) {
            if (hovered) updateSnapHighlight(e.clientX, e.clientY, hovered)
            return
          }
          currentHoverElem = hovered
          if (hovered) showHoverHighlight(hovered, e.clientX, e.clientY)
          else hideHoverHighlight()
        })
      },
      mouseDown (opts) {
        // Retrieve necessary data from the SVG canvas and the event object
        const dataStorage = svgCanvas.getDataStorage()
        const { event: e, start_x: sX, start_y: sY } = opts
        const mode = svgCanvas.getMode()
        const {
          curConfig: { initStroke }
        } = svgEditor.configObj

        if (mode === 'connector') {
          // Return if the line is already started
          if (started) return undefined

          // Use proximity detection instead of bare e.target so overlays don't
          // block binding. Scans a ring of offsets around the cursor.
          startElem = findConnectableAt(e.clientX, e.clientY)
          if (!startElem) return undefined

          // Retrieve the bounding box and calculate the center of the start element
          const bb = svgCanvas.getStrokedBBox([startElem])
          const x = bb.x + bb.width / 2
          const y = bb.y + bb.height / 2

          // Set the flag to indicate the line has started
          started = true

          // Hide hover highlight while drawing
          hideHoverHighlight()

          // Create a new polyline element
          curLine = addSVGElementsFromJson({
            element: 'polyline',
            attr: {
              id: 'conn_' + svgCanvas.getNextId(),
              points: `${x},${y} ${x},${y} ${sX},${sY}`,
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

          return {
            started: true
          }
        }

        if (mode === 'select') {
          // Record drag-start mouse position so mouseMove can compute the correct
          // delta (diffX = current - startX). Without this, startX/startY hold stale
          // values from the last connector draw and updateLine routes to the wrong place.
          startX = sX
          startY = sY
          findConnectors(opts.selectedElements)
        }

        return undefined
      },
      mouseMove (opts) {
        const dataStorage = svgCanvas.getDataStorage()
        const zoom = svgCanvas.getZoom()
        const x = opts.mouse_x / zoom
        const y = opts.mouse_y / zoom
        const mode = svgCanvas.getMode()

        if (mode === 'connector') {
          if (started && curLine) {
            // Live-update the connector endpoint so the line follows the cursor.
            // This was previously gated behind connections.length === 0 which
            // made the line invisible during drag.
            const startBB = dataStorage.get(curLine, 'start_bb')
            if (startBB) {
              const pt = getBBintersect(x, y, startBB, getOffset('start', curLine))
              startX = pt.x
              startY = pt.y
              setPoint(curLine, 0, pt.x, pt.y, true)
            }
            setPoint(curLine, 'end', x, y, true)

            // Show snap highlight on the potential end target (not the start shape).
            // Convert svgcontent coords to screen so findConnectableAt and the
            // highlight functions all work in the same coordinate space.
            const screenPt = svgContentToScreen(x, y)
            const candidate = findConnectableAt(screenPt.x, screenPt.y)
            const hovered = (candidate && candidate !== startElem) ? candidate : null
            if (hovered !== currentHoverElem) {
              currentHoverElem = hovered
              if (hovered) showHoverHighlight(hovered, screenPt.x, screenPt.y)
              else hideHoverHighlight()
            } else if (hovered) {
              updateSnapHighlight(screenPt.x, screenPt.y, hovered)
            }
          }
          // Pre-draw hover is handled by the direct DOM listener in callback().
          return
        }

        // SELECT mode: update connectors when bound elements are being dragged.
        // The guard is now scoped to this branch only so connector drawing is
        // never blocked by an empty connections array.
        if (!connections.length) return
        if (!startX || !startY) return

        const diffX = x - startX
        const diffY = y - startY

        for (const elem of svgCanvas.getSelectedElements()) {
          if (elem && dataStorage.has(elem, 'c_start')) {
            svgCanvas.removeFromSelection([elem])
            elem.transform.baseVal.clear()
          }
        }
        if (connections.length) {
          updateLine(diffX, diffY)
        }
      },
      mouseUp (opts) {
        // Get necessary data and initial setups
        const dataStorage = svgCanvas.getDataStorage()
        const { event: e } = opts

        // Early exit if not in connector mode
        if (svgCanvas.getMode() !== 'connector') return undefined

        // Use proximity detection for the end element.
        const endCandidate = findConnectableAt(e.clientX, e.clientY)

        if (endCandidate === startElem) {
          // Released on the start shape: stay in "started" state for two-click mode.
          started = true
          return {
            keep: true,
            element: null,
            started
          }
        }

        if (!endCandidate) {
          // Released on empty canvas: cancel the connector.
          curLine?.remove()
          started = false
          hideHoverHighlight()
          return {
            keep: false,
            element: null,
            started: false
          }
        }

        // Valid end element
        endElem = endCandidate

        const startId = startElem?.id || ''
        const endId = endElem?.id || ''
        const connStr = `${startId} ${endId}`
        const altStr = `${endId} ${startId}`

        // Prevent duplicate connectors
        const dupe = Array.from(
          svgCanvas.$qa('[id^="conn_"]')
        ).filter(
          conn =>
            conn.getAttributeNS(seNs, 'connector') === connStr ||
            conn.getAttributeNS(seNs, 'connector') === altStr
        )

        if (dupe.length) {
          curLine.remove()
          started = false
          hideHoverHighlight()
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
        hideHoverHighlight()
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

        // Always hide the hover overlay when selection changes
        hideHoverHighlight()

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

        // Update connectors based on selected elements.
        // Use opts.elems directly — getSelectedElements() may not yet reflect the
        // new selection state when this event fires.
        updateConnectors(selElems.filter(Boolean))
      },
      // Fires on every mousemove while elements are being dragged/resized.
      // This is the primary hook for keeping connectors in sync during interactive drag
      // because svgCanvas moves elements via SVG transforms (not attribute changes)
      // and does NOT fire 'changed' on mouseUp for move operations.
      elementTransition (opts) {
        if (started) return  // don't interfere during connector drawing
        const elems = opts.elems?.filter(Boolean) || []
        if (elems.length) updateConnectors(elems)
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

        // Update connectors based on the current element.
        // Use the element from opts.elems directly — getSelectedElements() may be empty
        // by the time this event fires (selection can be cleared before the 'changed' event).
        if (elem?.id.startsWith('conn_')) {
          const start = getElement(dataStorage.get(elem, 'c_start'))
          updateConnectors([start])
        } else {
          updateConnectors([elem])
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
        const button = svgCanvas.$id('tool_connect')
        if (opts.nostroke && button.pressed === true) {
          svgEditor.clickSelect()
        }
        button.disabled = opts.nostroke
      }
    }
  }
}
