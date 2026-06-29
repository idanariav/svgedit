/**
 * @file ext-connector.js
 *
 * Line-binding engine. Powers the **Line tool**: a line drawn in `line` mode can
 * have either endpoint independently bound to a shape (auto-binds when released
 * near one; hold Alt to keep an endpoint free). Bound endpoints track their shape
 * as it moves/resizes and snap to the shape's edge.
 *
 * Binding is stored per-endpoint on the `<line>`:
 *   se:bind-start = elemId   (start point x1,y1 is bound; absent = free)
 *   se:bind-end   = elemId   (end point x2,y2 is bound; absent = free)
 *
 * Legacy `<polyline>` connectors (se:connector="startId endId", both ends bound,
 * cardinal/elbow routing) are still recognised so older saved diagrams keep
 * tracking. New lines use the simpler two-point `<line>` + se:bind-* model.
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
    const { getElement, $id, addSVGElementsFromJson } = svgCanvas
    const { svgroot, selectorManager } = S
    const seNs = svgCanvas.getEditorNS()
    await loadExtensionTranslation(svgEditor)

    let startX
    let startY
    let startElem            // shape under the cursor when a line draw began (pending start binding)

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

    // ── Binding identity helpers ─────────────────────────────────────────────

    /**
     * Returns the bound element ids for a connector, normalising the new
     * per-endpoint `se:bind-*` scheme and the legacy `se:connector` scheme.
     * @param {Element} el
     * @returns {{start: string|null, end: string|null}}
     */
    const getBindIds = (el) => {
      const legacy = el.getAttributeNS(seNs, 'connector')
      if (legacy) {
        const [s, e] = legacy.split(' ')
        return { start: s || null, end: e || null }
      }
      return {
        start: el.getAttributeNS(seNs, 'bind-start') || null,
        end: el.getAttributeNS(seNs, 'bind-end') || null
      }
    }

    /** All elements that carry a binding (new lines + legacy polylines). */
    const getBoundConnectors = () => {
      const svgContent = svgCanvas.getSvgContent()
      return Array.from(svgContent.querySelectorAll('line, polyline')).filter((el) => {
        const { start, end } = getBindIds(el)
        return start || end
      })
    }

    // Save the original groupSelectedElements method
    const originalGroupSelectedElements = svgCanvas.groupSelectedElements

    // Override the original groupSelectedElements to exclude bound connectors —
    // grouping a bound line with its target would double-transform it.
    svgCanvas.groupSelectedElements = function (...args) {
      svgCanvas.removeFromSelection(getBoundConnectors())
      return originalGroupSelectedElements.apply(this, args)
    }

    // Save the original moveSelectedElements method
    const originalMoveSelectedElements = svgCanvas.moveSelectedElements

    // Override the original moveSelectedElements to keep bound lines in sync.
    svgCanvas.moveSelectedElements = function (...args) {
      const cmd = originalMoveSelectedElements.apply(this, args)
      updateConnectors(svgCanvas.getSelectedElements())
      return cmd
    }

    // ── Cardinal-point geometry (legacy polyline connectors) ─────────────────

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
        // Lines/polylines are strokes, not bindable shapes — never a target.
        if (el.tagName === 'line' || el.tagName === 'polyline') return false
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
     * Creates the hover-highlight overlay in svgroot (above svgcontent).
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
      const svgContent = svgCanvas.getSvgContent()
      const ctm = svgContent.getScreenCTM()
      if (!ctm) return { x: svgX, y: svgY }
      const pt = svgContent.createSVGPoint()
      pt.x = svgX
      pt.y = svgY
      const r = pt.matrixTransform(ctm)
      return { x: r.x, y: r.y }
    }

    // ── Edge-intersection geometry ───────────────────────────────────────────

    /**
     * getBBintersect — finds the intersection of the line from bb-center to (x,y)
     * with the bounding box perimeter, optionally inflated by `offset`.
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
     * @param {"start"|"end"} side - The side of the line where a marker may be present.
     * @param {Element} line - The line element to check for a marker.
     * @returns {Float} - The endpoint offset if a marker is present, else 0.
     */
    const getOffset = (side, line) => {
      const hasMarker = line.getAttribute('marker-' + side)
      // TODO: This factor should ideally be based on the actual marker size.
      const size = line.getAttribute('stroke-width') * 5
      return hasMarker ? size : 0
    }

    /**
     * getConnMode — reads the routing mode stored on a legacy connector.
     * @param {Element} line - The connector polyline.
     * @returns {"straight"|"elbow"} Defaults to "straight".
     */
    const getConnMode = (line) => {
      return line.getAttributeNS(seNs, 'conn_mode') === 'elbow' ? 'elbow' : 'straight'
    }

    /**
     * computeConnectorPoints — point list for a legacy `<polyline>` connector.
     * @param {module:utilities.BBoxObject} startBB
     * @param {module:utilities.BBoxObject} endBB
     * @param {Element} line - The connector polyline (for mode + marker offsets).
     * @returns {module:math.XYObject[]}
     */
    const computeConnectorPoints = (startBB, endBB, line) => {
      const sc = { x: startBB.x + startBB.width / 2, y: startBB.y + startBB.height / 2 }
      const ec = { x: endBB.x + endBB.width / 2, y: endBB.y + endBB.height / 2 }

      if (getConnMode(line) === 'elbow') {
        const offS = getOffset('start', line) / 2
        const offE = getOffset('end', line) / 2
        const dx = ec.x - sc.x
        const dy = ec.y - sc.y
        let sPt, ePt
        if (Math.abs(dx) >= Math.abs(dy)) {
          if (dx >= 0) {
            sPt = { x: startBB.x + startBB.width + offS, y: sc.y }
            ePt = { x: endBB.x - offE, y: ec.y }
          } else {
            sPt = { x: startBB.x - offS, y: sc.y }
            ePt = { x: endBB.x + endBB.width + offE, y: ec.y }
          }
          const midX = (sPt.x + ePt.x) / 2
          return [sPt, { x: midX, y: sPt.y }, { x: midX, y: ePt.y }, ePt]
        }
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

      // Straight mode: cardinal face midpoints for clean N/S/E/W exits.
      const sPt = getCardinalPoint(ec.x, ec.y, startBB, getOffset('start', line))
      const ePt = getCardinalPoint(sc.x, sc.y, endBB, getOffset('end', line))
      return [sPt, { x: (sPt.x + ePt.x) / 2, y: (sPt.y + ePt.y) / 2 }, ePt]
    }

    /**
     * routeConnector — recompute a legacy polyline's geometry from both bboxes.
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
     * routeLineBinding — snaps a two-point `<line>`'s bound endpoint(s) to the
     * edge of their target shape. A bound endpoint aims at the opposite endpoint
     * (or, if that end is also bound, at the opposite shape's centre). Free
     * endpoints are left untouched.
     * @param {Element} line
     * @returns {void}
     */
    const routeLineBinding = (line) => {
      const dataStorage = svgCanvas.getDataStorage()
      const { start: sId, end: eId } = getBindIds(line)
      const startBB = sId ? dataStorage.get(line, 'start_bb') : null
      const endBB = eId ? dataStorage.get(line, 'end_bb') : null
      if (!startBB && !endBB) return

      let x1 = Number(line.getAttribute('x1'))
      let y1 = Number(line.getAttribute('y1'))
      let x2 = Number(line.getAttribute('x2'))
      let y2 = Number(line.getAttribute('y2'))

      // Aim each bound endpoint toward the opposite end.
      const startAim = endBB
        ? { x: endBB.x + endBB.width / 2, y: endBB.y + endBB.height / 2 }
        : { x: x2, y: y2 }
      const endAim = startBB
        ? { x: startBB.x + startBB.width / 2, y: startBB.y + startBB.height / 2 }
        : { x: x1, y: y1 }

      if (startBB) {
        const p = getBBintersect(startAim.x, startAim.y, startBB, getOffset('start', line))
        x1 = p.x; y1 = p.y
        line.setAttribute('x1', x1)
        line.setAttribute('y1', y1)
      }
      if (endBB) {
        const p = getBBintersect(endAim.x, endAim.y, endBB, getOffset('end', line))
        x2 = p.x; y2 = p.y
        line.setAttribute('x2', x2)
        line.setAttribute('y2', y2)
      }
    }

    /** Re-routes any connector (new line or legacy polyline) from cached bboxes. */
    const routeAny = (line) => {
      if (line.tagName === 'line') {
        routeLineBinding(line)
      } else {
        const dataStorage = svgCanvas.getDataStorage()
        routeConnector(line, dataStorage.get(line, 'start_bb'), dataStorage.get(line, 'end_bb'))
      }
    }

    /**
     * updateLine — live-drag update (select mode). Shifts each tracked endpoint's
     * cached bbox by the drag delta and re-routes.
     * @param {Float} diffX
     * @param {Float} diffY
     * @returns {void}
     */
    const updateLine = (diffX, diffY) => {
      const dataStorage = svgCanvas.getDataStorage()
      for (const conn of connections) {
        const { connector: line, is_start: isStart, start_x: sx, start_y: sy } = conn
        const pre = isStart ? 'start' : 'end'
        const bb = { ...dataStorage.get(line, `${pre}_bb`) }
        bb.x = sx + diffX
        bb.y = sy + diffY
        dataStorage.put(line, `${pre}_bb`, bb)
        if (line.tagName === 'line') {
          routeLineBinding(line)
        } else {
          const altPre = isStart ? 'end' : 'start'
          const altBB = dataStorage.get(line, `${altPre}_bb`)
          routeConnector(line, isStart ? bb : altBB, isStart ? altBB : bb)
        }
      }
    }

    /**
     * findConnectors — collects { connector, bound element, is_start } records
     * for every connector whose bound element is in (or a descendant of) `elems`.
     * Free endpoints are skipped. Caches c_start/c_end + bboxes in dataStorage.
     * @param {Element[]} [elems]
     * @returns {void}
     */
    const findConnectors = (elems = []) => {
      const dataStorage = svgCanvas.getDataStorage()
      const connectors = getBoundConnectors()
      connections = []

      for (const connector of connectors) {
        const ids = getBindIds(connector)
        const idArr = [ids.start, ids.end]
        const parts = []

        for (const [i, pos] of ['start', 'end'].entries()) {
          const boundId = idArr[i]
          if (!boundId) { parts.push(null); continue } // free end

          let part = dataStorage.get(connector, `c_${pos}`)
          if (!part) {
            part = svgCanvas.$id(boundId)
            if (part) {
              dataStorage.put(connector, `c_${pos}`, part.id)
              dataStorage.put(connector, `${pos}_bb`, svgCanvas.getStrokedBBox([part]))
            }
          } else {
            part = svgCanvas.$id(part)
          }
          parts.push(part)
        }

        for (let i = 0; i < 2; i++) {
          const cElem = parts[i]
          if (!cElem || !cElem.parentNode) continue // free or removed end

          let addThis = false
          const parents = svgCanvas.getParents(cElem.parentNode)
          for (const el of parents) {
            if (elems.includes(el)) { addThis = true; break }
          }

          if (elems.includes(cElem) || addThis) {
            const bb = svgCanvas.getStrokedBBox([cElem])
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
     * updateConnectors — re-route every connector bound to one of `elems`.
     * @param {Element[]} [elems]
     * @returns {void}
     */
    const updateConnectors = (elems) => {
      const dataStorage = svgCanvas.getDataStorage()
      findConnectors(elems)
      if (!connections.length) return

      for (const conn of connections) {
        const { elem, connector: line, is_start: isStart, start_x: sx, start_y: sy } = conn
        const pre = isStart ? 'start' : 'end'
        const bb = svgCanvas.getStrokedBBox([elem])
        bb.x = sx
        bb.y = sy
        dataStorage.put(line, `${pre}_bb`, bb)

        if (line.tagName === 'line') {
          routeLineBinding(line)
        } else {
          const altPre = isStart ? 'end' : 'start'
          const bb2 = dataStorage.get(line, `${altPre}_bb`)
          routeConnector(line, isStart ? bb : bb2, isStart ? bb2 : bb)
        }
      }
    }

    /**
     * reset — populate dataStorage for every bound connector after a load/reset
     * so tracking works immediately on a reopened document.
     * @returns {void}
     */
    const reset = () => {
      const dataStorage = svgCanvas.getDataStorage()
      for (const connector of getBoundConnectors()) {
        const { start, end } = getBindIds(connector)
        if (start) {
          const el = getElement(start)
          if (el) {
            dataStorage.put(connector, 'c_start', start)
            dataStorage.put(connector, 'start_bb', svgCanvas.getStrokedBBox([el]))
          }
        }
        if (end) {
          const el = getElement(end)
          if (el) {
            dataStorage.put(connector, 'c_end', end)
            dataStorage.put(connector, 'end_bb', svgCanvas.getStrokedBBox([el]))
          }
        }
      }
    }

    reset()

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        // Create the SVG hover-highlight overlay (outline + snap dots).
        createHighlightLayer()

        // Pre-draw hover highlight: the extension's mouseMove hook only fires
        // while the mouse button is held, so we attach a direct DOM listener
        // on the workarea for idle hover detection in line mode.
        const workarea = document.querySelector('#workarea') || $id('svgcanvas')
        workarea?.addEventListener('mousemove', (e) => {
          if (svgCanvas.getMode() !== 'line' || started) return
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
        const { event: e } = opts
        const mode = svgCanvas.getMode()

        if (mode === 'line') {
          // Core creates the <line>; we only record which shape (if any) the
          // start point landed on, for binding at mouseUp.
          started = true
          startElem = findConnectableAt(e.clientX, e.clientY)
          hideHoverHighlight()
          return undefined
        }

        if (mode === 'select') {
          // Record drag-start so the select-mode mouseMove computes the right delta.
          startX = opts.start_x
          startY = opts.start_y
          findConnectors(opts.selectedElements)
        }
        return undefined
      },
      mouseMove (opts) {
        const zoom = svgCanvas.getZoom()
        const x = opts.mouse_x / zoom
        const y = opts.mouse_y / zoom
        const mode = svgCanvas.getMode()

        if (mode === 'line') {
          if (started) {
            // Highlight the shape the end point would bind to.
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
          return
        }

        // SELECT mode: update bound lines while their shapes are dragged.
        if (!connections.length) return
        if (!startX || !startY) return

        const dataStorage = svgCanvas.getDataStorage()
        const diffX = x - startX
        const diffY = y - startY

        for (const elem of svgCanvas.getSelectedElements()) {
          if (elem && dataStorage.has(elem, 'c_start')) {
            svgCanvas.removeFromSelection([elem])
            elem.transform.baseVal.clear()
          }
        }
        if (connections.length) updateLine(diffX, diffY)
      },
      mouseUp (opts) {
        const { event: e, element: line } = opts
        if (svgCanvas.getMode() !== 'line') return undefined

        started = false
        hideHoverHighlight()

        if (!line || line.tagName !== 'line') { startElem = null; return undefined }

        // Alt held → keep both endpoints free regardless of nearby shapes.
        if (e.altKey) { startElem = null; return undefined }

        const dataStorage = svgCanvas.getDataStorage()
        const endElem = findConnectableAt(e.clientX, e.clientY)
        const startBind = (startElem && startElem.parentNode) ? startElem : null
        const endBind = (endElem && endElem.parentNode && endElem !== startBind) ? endElem : null
        startElem = null

        let bound = false
        if (startBind) {
          line.setAttributeNS(seNs, 'se:bind-start', startBind.id)
          dataStorage.put(line, 'c_start', startBind.id)
          dataStorage.put(line, 'start_bb', svgCanvas.getStrokedBBox([startBind]))
          bound = true
        }
        if (endBind) {
          line.setAttributeNS(seNs, 'se:bind-end', endBind.id)
          dataStorage.put(line, 'c_end', endBind.id)
          dataStorage.put(line, 'end_bb', svgCanvas.getStrokedBBox([endBind]))
          bound = true
        }
        if (bound) routeLineBinding(line)

        // Leave keep/element to core (a non-zero line is already kept).
        return undefined
      },
      selectedChanged (opts) {
        hideHoverHighlight()
        if (!getBoundConnectors().length) return

        const dataStorage = svgCanvas.getDataStorage()
        const { elems: selElems } = opts

        // Legacy polyline connectors keep their endpoint grips hidden (their
        // shape is driven by binding). New <line>s behave like normal lines.
        for (const elem of selElems) {
          if (elem?.id?.startsWith('conn_') && dataStorage.has(elem, 'c_start')) {
            selectorManager.requestSelector(elem).showGrips(false)
          }
        }

        updateConnectors(selElems.filter(Boolean))
      },
      // Fires on every mousemove while elements are being dragged/resized.
      // Primary hook for keeping bound lines in sync during interactive drag,
      // because svgCanvas moves elements via SVG transforms (not attribute
      // changes) and does NOT fire 'changed' on mouseUp for move operations.
      elementTransition (opts) {
        if (started) return // don't interfere during line drawing
        const elems = opts.elems?.filter(Boolean) || []
        if (elems.length) updateConnectors(elems)
      },
      elementChanged (opts) {
        const dataStorage = svgCanvas.getDataStorage()
        let [elem] = opts.elems
        if (!elem) return

        // Reinitialize on document (re)load.
        if (elem.tagName === 'svg' && elem.id === 'svgcontent') {
          reset()
        }

        // Track marker presence for endpoint offsets; convert a line to a
        // polyline when a mid-marker is applied (SVG <line> has no mid vertex).
        const { markerStart, markerMid, markerEnd } = elem.attributes
        if (markerStart || markerMid || markerEnd) {
          dataStorage.put(elem, 'start_off', Boolean(markerStart))
          dataStorage.put(elem, 'end_off', Boolean(markerEnd))

          if (elem.tagName === 'line' && markerMid) {
            const { x1, x2, y1, y2, id } = elem.attributes
            const bindStart = elem.getAttributeNS(seNs, 'bind-start')
            const bindEnd = elem.getAttributeNS(seNs, 'bind-end')

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
            // Preserve per-endpoint bindings across the conversion.
            if (bindStart) pline.setAttributeNS(seNs, 'se:bind-start', bindStart)
            if (bindEnd) pline.setAttributeNS(seNs, 'se:bind-end', bindEnd)

            elem.insertAdjacentElement('afterend', pline)
            elem.remove()
            svgCanvas.clearSelection()
            pline.id = id.value
            svgCanvas.addToSelection([pline])
            elem = pline
          }
        }

        // If the changed element is itself a connector, re-route it (e.g. a new
        // marker changed its endpoint offset). Otherwise re-route lines bound to it.
        const ids = getBindIds(elem)
        if (ids.start || ids.end) {
          // Ensure bboxes are cached, then route.
          if (ids.start && !dataStorage.get(elem, 'start_bb')) {
            const el = getElement(ids.start)
            if (el) dataStorage.put(elem, 'start_bb', svgCanvas.getStrokedBBox([el]))
          }
          if (ids.end && !dataStorage.get(elem, 'end_bb')) {
            const el = getElement(ids.end)
            if (el) dataStorage.put(elem, 'end_bb', svgCanvas.getStrokedBBox([el]))
          }
          routeAny(elem)
        } else {
          updateConnectors([elem])
        }
      },
      IDsUpdated (input) {
        const remove = []
        input.elems.forEach(function (elem) {
          // Legacy both-ends connector attribute.
          if ('se:connector' in elem.attr) {
            elem.attr['se:connector'] = elem.attr['se:connector']
              .split(' ')
              .map(function (oldID) {
                return input.changes[oldID]
              })
              .join(' ')
            // Drop the connector if one end failed to remap (e.g. 'svg_21 ').
            if (!/. ./.test(elem.attr['se:connector'])) {
              remove.push(elem.attr.id)
            }
          }
          // New per-endpoint bindings: remap each independently; leave free ends.
          for (const a of ['se:bind-start', 'se:bind-end']) {
            if (a in elem.attr && input.changes[elem.attr[a]]) {
              elem.attr[a] = input.changes[elem.attr[a]]
            }
          }
        })
        return { remove }
      }
    }
  }
}
