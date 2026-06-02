/* globals svgEditor */

/**
 * Insert an image element on the canvas from an href (data URL or remote URL).
 *
 * The image is added at its natural pixel size and centered on the page, then
 * selected. If the href fails to load (bad URL / CORS), a 100×100 placeholder
 * is inserted so the user still gets an editable element.
 *
 * @param {string} href - A data URL or remote image URL to use as the source.
 * @returns {void}
 */
export const insertImageFromHref = (href) => {
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
