/**
 * Load an image href into an `HTMLImageElement`, ready for `drawImage`. Setting
 * `crossOrigin` before `src` is assigned matters on Safari/mobile browsers
 * (attribute order is ignored on Chrome, but not universally).
 * `href` is a data URL or a remote image URL.
 */
export const loadImage = (href: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', () => reject(new Error('Could not load the image.')))
    img.src = href
  })
