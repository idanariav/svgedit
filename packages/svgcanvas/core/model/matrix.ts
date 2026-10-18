/**
 * 2D affine matrices for the document model: parse a `transform` attribute into one, compose, apply, and tell whether it keeps
 * shapes (a rotation, a flip and a uniform scale). Pure numbers, no browser matrix.
 *
 * No DOM and no `window` here: this runs in Node (the headless engine) as well as in the browser.
 * @module model/matrix
 * @license MIT
 */

/** A full 2D matrix [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f. */
export type Matrix6 = [number, number, number, number, number, number]

export const IDENTITY_MATRIX: Readonly<Matrix6> = [1, 0, 0, 1, 0, 0]

/** `m` applied after `n`. */
export const multiply = (m: Readonly<Matrix6>, n: Readonly<Matrix6>): Matrix6 => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
]

/** The matrix a transform attribute makes (`translate`, `scale`, `rotate`, `skewX`, `skewY`, `matrix`), or null if it does not parse. */
export const parseMatrix = (transform: string | null | undefined): Matrix6 | null => {
  let rest = (transform ?? '').trim()
  let out: Matrix6 = [1, 0, 0, 1, 0, 0]
  while (rest) {
    const term = /^(translate|scale|rotate|skewX|skewY|matrix)\(([^)]*)\)[\s,]*/.exec(rest)
    if (!term) return null
    const v = term[2].split(/[\s,]+/).filter(Boolean).map(Number)
    if (!v.length || !v.every(Number.isFinite)) return null
    const rad = (deg: number): number => deg * Math.PI / 180
    let m: Matrix6
    switch (term[1]) {
      case 'translate': m = [1, 0, 0, 1, v[0], v[1] ?? 0]; break
      case 'scale': m = [v[0], 0, 0, v[1] ?? v[0], 0, 0]; break
      case 'rotate': {
        const c = Math.cos(rad(v[0]))
        const sn = Math.sin(rad(v[0]))
        const [cx, cy] = [v[1] ?? 0, v[2] ?? 0]
        m = [c, sn, -sn, c, cx - c * cx + sn * cy, cy - sn * cx - c * cy]
        break
      }
      case 'skewX': m = [1, 0, Math.tan(rad(v[0])), 1, 0, 0]; break
      case 'skewY': m = [1, Math.tan(rad(v[0])), 0, 1, 0, 0]; break
      default:
        if (v.length !== 6) return null
        m = v as Matrix6
    }
    out = multiply(out, m)
    rest = rest.slice(term[0].length)
  }
  return out
}

export const isIdentityMatrix = (m: Readonly<Matrix6>): boolean => m.every((v, i) => v === IDENTITY_MATRIX[i])

export const applyToPoint = (m: Readonly<Matrix6>, p: readonly [number, number]): [number, number] =>
  [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]

/**
 * The factor `m` scales lengths by when it keeps shapes (a rotation, optionally flipped, and a uniform scale), else undefined.
 * Only then does a stroke's width transform like the geometry: a skew or an uneven scale turns it into an uneven band.
 */
export const similarityScale = (m: Readonly<Matrix6>): number | undefined => {
  const [a, b, c, d] = m
  const s2 = a * a + b * b
  const tol = 1e-9 * Math.max(1, s2)
  if (s2 <= 0 || Math.abs(c * c + d * d - s2) > tol || Math.abs(a * c + b * d) > tol) return undefined
  return Math.sqrt(s2)
}
