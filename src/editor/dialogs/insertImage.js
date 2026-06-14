/* globals svgEditor */
import { getPathDFromElement } from '@svgedit/svgcanvas/core/utilities.js'

// Basic shapes that get converted to <path> on import, and the geometry
// attributes that become meaningless once they are paths.
const SHAPE_TO_PATH_TAGS = ['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']
const GEOMETRY_ATTRS = ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points']

/**
 * Replace a basic-shape element with an equivalent `<path>`, carrying over all
 * of its own attributes (fill/stroke/transform/id/data-*) so styling and
 * provenance survive. The element must already be in the live DOM — rect
 * conversion relies on `getBBox()`. No history command is recorded; the caller
 * owns the insert history.
 * @param {Element} el - The shape to convert (in the DOM).
 * @param {Document} doc - Owning document for createElementNS.
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @returns {Element} The new `<path>`, or the original element if not convertible.
 */
const shapeToPath = (el, doc, svgCanvas) => {
  const d = getPathDFromElement(el)
  if (!d) return el
  const path = doc.createElementNS(svgCanvas.NS.SVG, 'path')
  Array.from(el.attributes).forEach(({ name, value }) => path.setAttribute(name, value))
  GEOMETRY_ATTRS.forEach((n) => path.removeAttribute(n))
  path.setAttribute('d', d)
  el.replaceWith(path)
  return path
}

/**
 * Convert any basic shapes in an imported subtree to `<path>` elements so every
 * imported object is node-editable as a path. Top-level shapes are replaced (the
 * new path is returned); shapes nested inside groups are converted in place.
 * Non-shape nodes (`g`, `text`, `image`, `use`, existing `path`) pass through.
 * @param {Element} node - A top-level imported drawable, in the DOM.
 * @param {Document} doc
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @returns {Element} The node to keep referencing (a new path if it was a shape).
 */
const convertShapesToPaths = (node, doc, svgCanvas) => {
  if (SHAPE_TO_PATH_TAGS.includes(node.localName)) {
    return shapeToPath(node, doc, svgCanvas)
  }
  node.querySelectorAll(SHAPE_TO_PATH_TAGS.join(',')).forEach((el) => shapeToPath(el, doc, svgCanvas))
  return node
}

/**
 * Insert an image element on the canvas from an href (data URL or remote URL).
 *
 * The image is added at its natural pixel size and centered on the page, then
 * selected. If the href fails to load (bad URL / CORS), a 100×100 placeholder
 * is inserted so the user still gets an editable element.
 *
 * @param {string} href - A data URL or remote image URL to use as the source.
 * @param {{ vaultLink?: string, locked?: boolean }} [opts] - Optional extras.
 *   When `vaultLink` is set, the inserted `<image>` is stamped with
 *   `data-vault-link` so an embedding host can track the image's provenance.
 *   When `locked` is true, it is also stamped with `data-vault-locked` so the
 *   host can re-bake its content from the source rather than treat it as frozen.
 * @returns {void}
 */
export const insertImageFromHref = (href, opts = {}) => {
  const svgCanvas = svgEditor.svgCanvas

  /**
   * @param {Float} imageWidth
   * @param {Float} imageHeight
   * @returns {void}
   */
  const insertNewImage = (imageWidth, imageHeight) => {
    const newImage = svgCanvas.addSVGElementsFromJson({
      element: 'image',
      attr: {
        x: 0,
        y: 0,
        width: imageWidth,
        height: imageHeight,
        id: svgCanvas.getNextId(),
        style: 'pointer-events:inherit'
      }
    })
    svgCanvas.setHref(newImage, href)
    if (opts.vaultLink) newImage.setAttribute('data-vault-link', opts.vaultLink)
    if (opts.locked) newImage.setAttribute('data-vault-locked', '1')
    svgCanvas.selectOnly([newImage])
    svgCanvas.alignSelectedElements('m', 'page')
    svgCanvas.alignSelectedElements('c', 'page')
    svgEditor.topPanel.updateContextPanel()
  }

  // Probe the image to learn its natural dimensions before inserting.
  const img = new Image()
  img.style.opacity = 0
  img.addEventListener('load', () => {
    const imgWidth = img.offsetWidth || img.naturalWidth || img.width || 100
    const imgHeight = img.offsetHeight || img.naturalHeight || img.height || 100
    insertNewImage(imgWidth, imgHeight)
  })
  img.addEventListener('error', () => {
    insertNewImage(100, 100)
  })
  img.src = href
}

/**
 * Insert the contents of an SVG document onto the canvas as real, editable
 * elements, rather than a flattened `<image>` embed.
 *
 * This backs the host plugin's "Unlocked" import mode. The source's drawable
 * top-level elements are inserted into the current layer; a multi-element import
 * is wrapped in a single `<g>` so the drawing moves and selects as one unit
 * (double-click to enter the group and edit individual members), mirroring
 * Excalidraw's import grouping. A single-element import is inserted bare (no
 * wrapper). Locked imports keep using `insertImageFromHref`.
 *
 * When `opts.asPaths` is true (the dialog's "import as paths" toggle), basic
 * shapes (rect/circle/ellipse/line/polyline/polygon), including those nested in
 * groups, are converted to `<path>` (see `convertShapesToPaths`) so every
 * imported object is node-editable as a path. Default is off — shapes stay
 * native.
 *
 * @param {string} svgString - Full `<svg>…</svg>` source to insert.
 * @param {{ vaultLink?: string, asPaths?: boolean }} [opts] - Optional extras.
 *   When `vaultLink` is
 *   set, every inserted top-level element is stamped with `data-vault-link` so
 *   an embedding host can track provenance (the host's backlink reconciler
 *   dedupes by link value, so repeats collapse to one backlink). No
 *   `data-vault-locked` is set — editable imports are always unlocked and never
 *   re-baked from the source.
 * @returns {void}
 */
export const insertSvgElements = (svgString, opts = {}) => {
  const svgCanvas = svgEditor.svgCanvas
  const doc = svgCanvas.getDOMDocument()

  const parsed = new DOMParser().parseFromString(svgString, 'image/svg+xml')
  const root = parsed.documentElement
  if (!root || root.getElementsByTagName('parsererror').length) return

  // Split the source into defs/paint-server content (goes to <defs>) and
  // drawable top-level elements (go to the layer). `<defs>` may sit at the root
  // or, rarely, inside a layer group — route its children to defs either way.
  const defsNodes = []
  const drawNodes = []
  const collectDefs = (container) => {
    Array.from(container.children).forEach((node) => {
      if (node.localName === 'defs') {
        Array.from(node.children).forEach((d) => defsNodes.push(d))
      }
    })
  }
  const collectDrawables = (container) => {
    Array.from(container.children).forEach((node) => {
      const tag = node.localName
      if (tag === 'title' || tag === 'metadata' || tag === 'defs') return
      drawNodes.push(node)
    })
  }
  const layers = Array.from(root.children).filter(
    (n) => n.localName === 'g' && n.classList.contains('layer')
  )
  // The root-level <defs> sits alongside the layers, so scan it regardless of
  // whether the drawables come from layers or the root.
  collectDefs(root)
  if (layers.length) {
    layers.forEach(collectDefs)
    layers.forEach(collectDrawables)
  } else {
    collectDrawables(root)
  }

  if (!drawNodes.length) return

  // Adopt everything into a detached temp <g> and uniquify there so ids and
  // url(#…)/href references remap together across both defs and drawables.
  const temp = doc.createElementNS(svgCanvas.NS.SVG, 'g')
  ;[...defsNodes, ...drawNodes].forEach((node) => {
    temp.appendChild(doc.adoptNode(node))
  })
  temp.querySelectorAll('*').forEach((el) => {
    if (!el.id) el.id = svgCanvas.getNextId()
  })
  temp.id = svgCanvas.getNextId()
  svgCanvas.uniquifyElems(temp)

  // Distribute: defs/paint-server elements into the canvas <defs>, drawable
  // elements into the current layer (stamped with the provenance link).
  const canvasDefs = svgCanvas.findDefs()
  defsNodes.forEach((node) => canvasDefs.appendChild(node))

  const layer = svgCanvas.getCurrentDrawing().getCurrentLayer()
  drawNodes.forEach((node) => {
    layer.appendChild(node)
    if (opts.vaultLink) node.setAttribute('data-vault-link', opts.vaultLink)
  })

  // When requested (the dialog's "import as paths" toggle), convert basic shapes
  // to <path> now that the nodes are in the DOM. Top-level shapes are replaced by
  // their new path (track the replacement); groups keep their identity. Default
  // is off — imports stay as native shapes (rect/circle/…).
  const finalNodes = opts.asPaths
    ? drawNodes.map((node) => convertShapesToPaths(node, doc, svgCanvas))
    : drawNodes

  const batchCmd = new svgCanvas.history.BatchCommand('Insert SVG elements')
  defsNodes.forEach((node) => {
    batchCmd.addSubCommand(new svgCanvas.history.InsertElementCommand(node))
  })

  // A multi-element import is wrapped in one <g> so the drawing moves/selects as
  // a unit (double-click to edit members), like Excalidraw's import grouping. A
  // single element needs no wrapper. The group's InsertElementCommand records the
  // whole subtree, so the import stays one undo step.
  let unit
  if (finalNodes.length > 1) {
    const group = svgCanvas.addSVGElementsFromJson({
      element: 'g',
      attr: { id: svgCanvas.getNextId() }
    })
    finalNodes.forEach((node) => group.appendChild(node))
    batchCmd.addSubCommand(new svgCanvas.history.InsertElementCommand(group))
    unit = [group]
  } else {
    finalNodes.forEach((node) => {
      batchCmd.addSubCommand(new svgCanvas.history.InsertElementCommand(node))
    })
    unit = finalNodes
  }

  svgCanvas.selectOnly(unit)

  // Center the whole import on the page (combined bbox), same idea as
  // insertImageFromHref's align('m'/'c','page'), bundled into the same history
  // entry as the insert.
  const bbox = svgCanvas.getStrokedBBox(unit)
  if (bbox) {
    const dx = svgCanvas.getContentW() / 2 - (bbox.x + bbox.width / 2)
    const dy = svgCanvas.getContentH() / 2 - (bbox.y + bbox.height / 2)
    const moveCmd = svgCanvas.moveSelectedElements(
      unit.map(() => dx),
      unit.map(() => dy),
      false
    )
    if (moveCmd && !moveCmd.isEmpty()) batchCmd.addSubCommand(moveCmd)
  }
  svgCanvas.addCommandToHistory(batchCmd)
  svgCanvas.call('changed', unit)

  svgEditor.topPanel.updateContextPanel()
}
