/* globals svgEditor */

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
 * top-level elements are inserted as **individual, directly-selectable**
 * elements in the current layer (NOT wrapped in one group — that would make a
 * multi-object drawing select as a single giant group with grips floating in
 * empty canvas and individual shapes unselectable). They are multi-selected
 * right after import so they still move together, but each is independently
 * clickable afterwards. Locked imports keep using `insertImageFromHref`.
 *
 * @param {string} svgString - Full `<svg>…</svg>` source to insert.
 * @param {{ vaultLink?: string }} [opts] - Optional extras. When `vaultLink` is
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

  svgCanvas.selectOnly(drawNodes)

  // Center the whole import on the page (combined bbox), same idea as
  // insertImageFromHref's align('m'/'c','page'), as a single non-undoable move
  // so it bundles into one history entry.
  const batchCmd = new svgCanvas.history.BatchCommand('Insert SVG elements')
  ;[...defsNodes, ...drawNodes].forEach((node) => {
    batchCmd.addSubCommand(new svgCanvas.history.InsertElementCommand(node))
  })
  const bbox = svgCanvas.getStrokedBBox(drawNodes)
  if (bbox) {
    const dx = svgCanvas.getContentW() / 2 - (bbox.x + bbox.width / 2)
    const dy = svgCanvas.getContentH() / 2 - (bbox.y + bbox.height / 2)
    const moveCmd = svgCanvas.moveSelectedElements(
      drawNodes.map(() => dx),
      drawNodes.map(() => dy),
      false
    )
    if (moveCmd && !moveCmd.isEmpty()) batchCmd.addSubCommand(moveCmd)
  }
  svgCanvas.addCommandToHistory(batchCmd)
  svgCanvas.call('changed', drawNodes)

  svgEditor.topPanel.updateContextPanel()
}
