/**
 * Browser detection.
 * @module browser
 * @license MIT
 *
 * @copyright 2010 Jeff Schiller, 2010 Alexis Deveria
 */

const NSSVG = 'http://www.w3.org/2000/svg'

/**
 * Browser capabilities and detection object.
 * Uses modern feature detection and lazy evaluation patterns.
 */
class BrowserDetector {
  #userAgent = navigator.userAgent
  #cachedResults = new Map<string, boolean>()

  /** Detects if the browser is WebKit-based */
  get isWebkit (): boolean {
    if (!this.#cachedResults.has('isWebkit')) {
      this.#cachedResults.set('isWebkit', this.#userAgent.includes('AppleWebKit'))
    }
    return this.#cachedResults.get('isWebkit') as boolean
  }

  /** Detects if the browser is Gecko-based */
  get isGecko (): boolean {
    if (!this.#cachedResults.has('isGecko')) {
      this.#cachedResults.set('isGecko', this.#userAgent.includes('Gecko/'))
    }
    return this.#cachedResults.get('isGecko') as boolean
  }

  /** Detects if the browser is Chrome */
  get isChrome (): boolean {
    if (!this.#cachedResults.has('isChrome')) {
      this.#cachedResults.set('isChrome', this.#userAgent.includes('Chrome/'))
    }
    return this.#cachedResults.get('isChrome') as boolean
  }

  /** Detects if the platform is macOS */
  get isMac (): boolean {
    if (!this.#cachedResults.has('isMac')) {
      this.#cachedResults.set('isMac', this.#userAgent.includes('Macintosh'))
    }
    return this.#cachedResults.get('isMac') as boolean
  }

  /** Tests if the browser supports accurate text character positioning */
  get supportsGoodTextCharPos (): boolean {
    if (!this.#cachedResults.has('supportsGoodTextCharPos')) {
      this.#cachedResults.set('supportsGoodTextCharPos', this.#testTextCharPos())
    }
    return this.#cachedResults.get('supportsGoodTextCharPos') as boolean
  }

  /** Private method to test text character positioning support */
  #testTextCharPos (): boolean {
    const svgroot = document.createElementNS(NSSVG, 'svg')
    const svgContent = document.createElementNS(NSSVG, 'svg')
    document.documentElement.append(svgroot)
    svgContent.setAttribute('x', '5')
    svgroot.append(svgContent)
    const text = document.createElementNS(NSSVG, 'text')
    text.textContent = 'a'
    svgContent.append(text)

    try {
      const pos = text.getStartPositionOfChar(0).x
      return pos === 0
    } catch (err) {
      return false
    } finally {
      svgroot.remove()
    }
  }
}

// Create singleton instance
const browser = new BrowserDetector()

// Export as functions for backward compatibility
export const isWebkit = (): boolean => browser.isWebkit

export const isGecko = (): boolean => browser.isGecko

export const isChrome = (): boolean => browser.isChrome

export const isMac = (): boolean => browser.isMac

export const supportsGoodTextCharPos = (): boolean => browser.supportsGoodTextCharPos

// Export browser instance for direct access
export default browser
