/**
 * 3D Rotate live effect: the flat shape turned about its centre on the X, Y and Z axes and seen with an optional
 * perspective, like a card tilted in front of a camera. Turning flat art and projecting it is a projective map of the
 * plane, so straight lines stay straight; with no perspective it is affine.
 *
 * Params are degrees: `rotationX` (tilt, top towards or away from the viewer), `rotationY` (turn, a side towards or
 * away), `rotationZ` (spin in the page), each -180 to 180, applied in that order, and `perspective`, the camera's
 * field of view from 0 (none) to 160. The box it turns about is the source box or the shared frame of `distort.ts`
 * (a group turns as one piece). The on-canvas editor is `ext-rotate3d-tool`.
 *
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft), `crates/three-d/src/lib.rs` (`Revolve::rotate`,
 * `eye_distance`, `perspective_scale`), `crates/three-d/src/solid.rs` (`plane`, `Camera`) and the position presets of
 * `crates/effects/src/solids.rs`, MIT OR Apache-2.0. Divergence: no faces, shading or depth sort; the outline is mapped
 * point by point, so a shape turned past 90° shows its mirrored back.
 *
 * @module rotate3d
 * @license MIT
 */

import type { Pt, SubPath } from './anchor-path.ts'
import { registerLiveEffect } from './live-effects.ts'
import { FRAME_KEYS, NO_FRAME, mapInFrame } from './distort.ts'

type Box = { x: number, y: number, width: number, height: number }

export interface Rotate3dParams { rotationX: number, rotationY: number, rotationZ: number, perspective: number }

export const ROTATE3D_KEYS = ['rotationX', 'rotationY', 'rotationZ', 'perspective']

/** The widest field of view. */
export const MAX_PERSPECTIVE = 160

export const ROTATE3D_DEFAULTS: Rotate3dParams = { rotationX: 0, rotationY: 0, rotationZ: 0, perspective: 0 }

/**
 * Position presets: [id, [rotation X, Y, Z]]. Front … Bottom face the art that way; Off-Axis tilts it 20° down and 25°
 * aside; Isometric lays it on a plane of an isometric view.
 */
export const ROTATE3D_PRESETS: Array<[string, [number, number, number]]> = [
  ['front', [0, 0, 0]],
  ['back', [0, 180, 0]],
  ['left', [0, 90, 0]],
  ['right', [0, -90, 0]],
  ['top', [-90, 0, 0]],
  ['bottom', [90, 0, 0]],
  ['offAxisFront', [-21.88, -23.4, 9.06]],
  ['offAxisBack', [-158.12, 23.4, -170.94]],
  ['offAxisLeft', [-40.74, 58.39, -36.26]],
  ['offAxisRight', [-139.26, -58.39, 143.74]],
  ['offAxisTop', [-111.88, -23.4, 9.06]],
  ['offAxisBottom', [68.12, -23.4, 9.06]],
  ['isometricLeft', [-45, -35.26, 30]],
  ['isometricRight', [-45, 35.26, -30]],
  ['isometricTop', [45, -35.26, 30]],
  ['isometricBottom', [-45, -35.26, -30]]
]

const rad = (deg: number) => (deg * Math.PI) / 180

/** `v` turned on X, then Y, then Z (degrees). */
export const rotate3 = (p: Rotate3dParams, [x, y, z]: [number, number, number]): [number, number, number] => {
  const [sx, cx] = [Math.sin(rad(p.rotationX)), Math.cos(rad(p.rotationX))]
  const [sy, cy] = [Math.sin(rad(p.rotationY)), Math.cos(rad(p.rotationY))]
  const [sz, cz] = [Math.sin(rad(p.rotationZ)), Math.cos(rad(p.rotationZ))]
  ;[y, z] = [cx * y - sx * z, sx * y + cx * z]
  ;[x, z] = [cy * x + sy * z, -sy * x + cy * z]
  return [cz * x - sz * y, sz * x + cz * y, z]
}

/** The eye's distance in front of the centre for a field of view of `angle` degrees, or null without perspective. */
export const eyeDistance = (angle: number, size: number): number | null => {
  const a = Math.min(Math.max(Number.isFinite(angle) ? angle : 0, 0), MAX_PERSPECTIVE)
  return a > 0 ? (Math.sqrt(3) * size) / Math.sin(rad(a / 2)) : null
}

/**
 * The map of box coordinates (`0,0` to `w,h`) the effect applies: about the box's centre, out of the page and back
 * through the camera. A point at or behind the eye is held just in front of it.
 */
export const rotate3dMap = (p: Rotate3dParams, w: number, h: number): (q: Pt) => Pt => {
  const cx = w / 2
  const cy = h / 2
  const eye = eyeDistance(p.perspective, Math.max(cx, cy, 1))
  return (q) => {
    const [x, y, z] = rotate3(p, [q.x - cx, q.y - cy, 0])
    const f = eye == null ? 1 : eye / Math.max(eye - z, eye * 1e-3)
    return { x: cx + x * f, y: cy + y * f }
  }
}

export const rotate3dSubpaths = (subpaths: SubPath[], bbox: Box, params: Record<string, number>): SubPath[] => {
  const p = { ...ROTATE3D_DEFAULTS, ...params }
  return mapInFrame(subpaths, bbox, params, (q, w, h) => rotate3dMap(p, w, h)(q))
}

/** Register `rotate3d` (idempotent). */
export const registerRotate3dEffect = (): void => {
  const angle = { min: -180, max: 180, step: 1 }
  registerLiveEffect('rotate3d', {
    label: '3D rotate',
    defaults: { ...ROTATE3D_DEFAULTS, ...NO_FRAME },
    ranges: { rotationX: angle, rotationY: angle, rotationZ: angle, perspective: { min: 0, max: MAX_PERSPECTIVE, step: 1 } },
    hidden: FRAME_KEYS,
    apply: (subpaths, bbox, params) => rotate3dSubpaths(subpaths, bbox, params as Record<string, number>)
  })
}

export const init = () => registerRotate3dEffect()
