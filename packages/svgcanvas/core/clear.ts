/**
 * Resets the `#svgcontent` element to a blank document.
 * @module clear
 * @license MIT
 * @copyright 2011 Jeff Schiller
 */
import type SvgCanvas from '../svgcanvas.js'
import { NS } from './namespaces.ts'

/** What the function reads from its canvas. */
type Host = Pick<SvgCanvas, 'getCurConfig' | 'getSvgContent' | 'getSvgRoot' | 'getDOMDocument'>

/** Empty the `#svgcontent` element, reset its attributes to a blank document's and leave the generator comment. */
export const clearSvgContentElement = (svgCanvas: Host): void => {
  const curConfig = svgCanvas.getCurConfig()
  const dimensions = curConfig.dimensions as [number, number] // always set: the config default
  const el = svgCanvas.getSvgContent()
  // empty
  while (el.firstChild) { el.removeChild(el.firstChild) }

  // Reset any stale attributes from the previous document.
  for (const attr of Array.from(el.attributes)) {
    if (attr.namespaceURI) {
      el.removeAttributeNS(attr.namespaceURI, attr.localName)
    } else {
      el.removeAttribute(attr.name)
    }
  }

  const pel = svgCanvas.getSvgRoot()
  el.setAttribute('id', 'svgcontent')
  el.setAttribute('width', String(dimensions[0]))
  el.setAttribute('height', String(dimensions[1]))
  el.setAttribute('x', String(dimensions[0]))
  el.setAttribute('y', String(dimensions[1]))
  el.setAttribute('overflow', curConfig.show_outside_canvas ? 'visible' : 'hidden')
  el.setAttribute('xmlns', NS.SVG)
  el.setAttribute('xmlns:se', NS.SE)
  el.setAttribute('xmlns:xlink', NS.XLINK)
  if (el.parentNode !== pel) {
    pel.appendChild(el)
  }

  // TODO: make this string optional and set by the client
  const comment = svgCanvas.getDOMDocument().createComment(' Created with SVG-edit - https://github.com/SVG-Edit/svgedit')
  el.append(comment)
}
