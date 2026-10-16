/**
 * The `svgroot` element (with the canvas drop-shadow filter) a canvas starts from.
 * @module svgroot
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */
import { NS } from './namespaces.ts'
import { text2xml } from './encoding-utils.ts'

/** The svg root node and its children; `dimensions` is width and height. */
export const svgRootElement = (svgdoc: Document, dimensions: ArrayLike<number | string>): SVGSVGElement => {
  return (svgdoc.importNode(
    text2xml(
      `<svg id="svgroot" xmlns="${NS.SVG}" xlinkns="${NS.XLINK}" width="${dimensions[0]}" 
        height="${dimensions[1]}" x="${dimensions[0]}" y="${dimensions[1]}" overflow="visible">
        <defs>
          <filter id="canvashadow" filterUnits="objectBoundingBox">
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur"/>
            <feOffset in="blur" dx="5" dy="5" result="offsetBlur"/>
            <feMerge>
              <feMergeNode in="offsetBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
      </svg>`
    ).documentElement,
    true
  ) as unknown) as SVGSVGElement
}
