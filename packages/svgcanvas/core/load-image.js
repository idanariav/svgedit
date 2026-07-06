/**
 * Load an image href into an `HTMLImageElement`, ready for `drawImage`. Setting
 * `crossOrigin` before `src` is assigned matters on Safari/mobile browsers
 * (attribute order is ignored on Chrome, but not universally).
 * @param {string} href - Data URL or remote image URL.
 * @returns {Promise<HTMLImageElement>}
 */
export const loadImage = (href) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', () => reject(new Error('Could not load the image.')))
    img.src = href
  })
