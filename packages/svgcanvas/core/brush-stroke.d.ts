/**
 * TypeScript definitions for @svgedit/svgcanvas/core/brush-stroke.js
 */

import type SvgCanvas from '../svgcanvas'

export interface BrushPoint {
  x: number
  y: number
  pressure?: number
}

export interface BrushOutlineParams {
  thickness: number
  angle: number
  roundness: number
  taperStart: number
  taperEnd: number
}

export const buildBrushOutline: (points: BrushPoint[], params: BrushOutlineParams) => string

export const finalizeBrushOutline: (d: string, svgCanvas: SvgCanvas) => string

export const createSmoother: (smoothness: number) => {
  push: (point: BrushPoint) => BrushPoint
}
