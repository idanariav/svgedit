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
 * elements wrapped in a single `<g>` (a movable/resizable group of
 * paths/shapes/text), rather than a flattened `<image>` embed.
 *
 * This backs the host plugin's "Unlocked" import mode: the user gets one
 * selected group that resizes/moves as a unit and can be entered (double-click)
 * or ungrouped to edit individual shapes. Locked imports keep using
 * `insertImageFromHref`.
 *
 * @param {string} svgString - Full `<svg>…</svg>` source to insert.
 * @param {{ vaultLink?: string }} [opts] - Optional extras. When `vaultLink` is
 *   set, the wrapper `<g>` is stamped with `data-vault-link` so an embedding
 *   host can track provenance. No `data-vault-locked` is set — editable
 *   imports are always unlocked and never re-baked from the source.
 * @returns {void}
 */
export const insertSvgElements = (svgString, opts = {}) => {
  const svgCanvas = svgEditor.svgCanvas
  const doc = svgCanvas.getDOMDocument()

  const parsed = new DOMParser().parseFromString(svgString, 'image/svg+xml')
  const root = parsed.documentElement
  if (!root || root.getElementsByTagName('parsererror').length) return

  const wrapper = doc.createElementNS(svgCanvas.NS.SVG, 'g')

  // Move the source's <defs> content in first so gradient/filter/marker/<use>
  // references survive (uniquifyElems remaps url(#…)/href within the subtree).
  root.querySelectorAll(':scope > defs').forEach((defs) => {
    Array.from(defs.children).forEach((node) => {
      wrapper.appendChild(doc.adoptNode(node))
    })
  })

  // Collect the visible content. Prefer the children of each top-level layer
  // group; fall back to the root's element children when there are no layers.
  const layers = Array.from(root.children).filter(
    (n) => n.tagName === 'g' && n.classList.contains('layer')
  )
  const skip = new Set(['title', 'defs', 'metadata'])
  if (layers.length) {
    layers.forEach((layer) => {
      Array.from(layer.children).forEach((node) => {
        if (node.tagName !== 'title') wrapper.appendChild(doc.adoptNode(node))
      })
    })
  } else {
    Array.from(root.children).forEach((node) => {
      if (!skip.has(node.tagName)) wrapper.appendChild(doc.adoptNode(node))
    })
  }

  wrapper.id = svgCanvas.getNextId()
  svgCanvas.getCurrentDrawing().getCurrentLayer().appendChild(wrapper)

  // Every visible descendant needs an id so uniquifyElems can reassign it a
  // fresh one (and keep internal references consistent).
  wrapper.querySelectorAll('*').forEach((el) => {
    if (!el.id) el.id = svgCanvas.getNextId()
  })
  svgCanvas.uniquifyElems(wrapper)

  if (opts.vaultLink) wrapper.setAttribute('data-vault-link', opts.vaultLink)

  svgCanvas.selectOnly([wrapper])

  // Center on the page, same as insertImageFromHref's align('m','page') +
  // align('c','page'), but as a single non-undoable move so it can be bundled
  // with the insert into one history entry (one undo reverses the whole import).
  const batchCmd = new svgCanvas.history.BatchCommand('Insert SVG elements')
  batchCmd.addSubCommand(new svgCanvas.history.InsertElementCommand(wrapper))
  const bbox = svgCanvas.getStrokedBBox([wrapper])
  if (bbox) {
    const dx = svgCanvas.getContentW() / 2 - (bbox.x + bbox.width / 2)
    const dy = svgCanvas.getContentH() / 2 - (bbox.y + bbox.height / 2)
    const moveCmd = svgCanvas.moveSelectedElements([dx], [dy], false)
    if (moveCmd && !moveCmd.isEmpty()) batchCmd.addSubCommand(moveCmd)
  }
  svgCanvas.addCommandToHistory(batchCmd)
  svgCanvas.call('changed', [wrapper])

  svgEditor.topPanel.updateContextPanel()
}
