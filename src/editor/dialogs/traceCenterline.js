/**
 * Centerline tracing: thin strokes of a scanned or photographed drawing become
 * stroked open paths (with their mean width and colour) instead of the filled
 * outlines imagetracerjs makes.
 *
 * Pipeline, after VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/trace/src/centerline.rs`, MIT OR Apache-2.0:
 *  1. binarize (Otsu; ink is the minority class, so dark-on-light and
 *     light-on-dark both work);
 *  2. chamfer 3-4 distance transform; 8-connected ink components whose widest
 *     point is at most `maxWidth` are lines, wider ones (filled areas) are left
 *     to the outline tracer;
 *  3. Zhang-Suen thinning, then staircase cleanup;
 *  4. skeleton graph: runs between ends and junctions (junction pixels merged
 *     into one node), short spurs and specks pruned, runs re-joined across
 *     junctions that no longer branch;
 *  5. each run is fitted with `fitFreehand` (corners stay corners); its width is
 *     the ink area that belongs to it divided by its length, its colour the mean
 *     colour of that ink.
 *
 * Pure: `ImageData`-shaped input (`{data, width, height}`), no DOM. The heavy stages hand control back to the
 * event loop now and then (`tick`), so tracing a large scan keeps the UI alive instead of freezing it for a
 * second or two (measured: a dense 2000 x 2000 drawing takes about 1.6 s end to end, no stage over ~650 ms;
 * a Web Worker was not used because the editor ships as one inlined bundle that hosts re-bundle).
 *
 * @module traceCenterline
 * @license MIT
 */

import { fitFreehand } from '@svgedit/svgcanvas/core/path-fit.js'
import { anchorsToD } from '@svgedit/svgcanvas/core/anchor-path.js'
import { joinSubpaths } from '@svgedit/svgcanvas/core/path-edit.js'

/**
 * @typedef {object} CenterlineOptions
 * @property {number} [threshold] 0-255 luminance at or below which a pixel is ink (default: Otsu)
 * @property {number} [maxWidth] widest stroke, in pixels, that counts as a line (default 12)
 * @property {number} [minLength] shortest line, in pixels, that is kept (default 6)
 * @property {number} [minSpur] side branches shorter than this, in pixels, are dropped (default 6)
 * @property {number} [tolerance] how far, in pixels, the fitted curve may stray from the skeleton (default 1)
 */

/**
 * @typedef {object} CenterlineRun
 * @property {{x: number, y: number}[]} points the skeleton polyline, in pixel units
 * @property {boolean} closed
 * @property {number} width mean stroke width in pixels
 * @property {string} color `#rrggbb`, the mean colour of the ink
 */

export const DEFAULTS = Object.freeze({ maxWidth: 12, minLength: 6, minSpur: 6, tolerance: 1 })

/** Let the event loop run (paint, input) before carrying on. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

const DX8 = [0, 1, 1, 1, 0, -1, -1, -1]
const DY8 = [-1, -1, 0, 1, 1, 1, 0, -1]

// ---- 1. binarize -------------------------------------------------------------

/**
 * Otsu's threshold: the luminance `t` that best splits the histogram into `<= t` and `> t`.
 * @param {Uint32Array|number[]} hist 256 bins
 * @param {number} total
 * @returns {number} -1 when the image has a single luminance (nothing to split)
 */
export const otsu = (hist, total) => {
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]
  let wB = 0
  let sumB = 0
  let best = -1
  let bestVar = 0
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > bestVar) {
      bestVar = between
      best = t
    }
  }
  return best
}

/**
 * Ink mask of an image: the darker class of an Otsu split (or `threshold`), flipped when it turns out to be
 * more than half of the image (a light drawing on a dark ground). Transparent pixels count as white.
 * @param {{data: ArrayLike<number>, width: number, height: number}} image
 * @param {number} [threshold]
 * @returns {{ink: Uint8Array, rgb: Uint8Array}} `rgb` is the colour of every pixel over white (3 bytes each)
 */
export const binarize = (image, threshold) => {
  const { data, width, height } = image
  const n = width * height
  const rgb = new Uint8Array(n * 3)
  const lum = new Uint8Array(n)
  const hist = new Uint32Array(256)
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3] / 255
    const r = Math.round(data[i * 4] * a + 255 * (1 - a))
    const g = Math.round(data[i * 4 + 1] * a + 255 * (1 - a))
    const b = Math.round(data[i * 4 + 2] * a + 255 * (1 - a))
    rgb[i * 3] = r
    rgb[i * 3 + 1] = g
    rgb[i * 3 + 2] = b
    lum[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    hist[lum[i]]++
  }
  const t = threshold ?? otsu(hist, n)
  const ink = new Uint8Array(n)
  if (t < 0) return { ink, rgb }
  let count = 0
  for (let i = 0; i < n; i++) {
    if (lum[i] <= t) {
      ink[i] = 1
      count++
    }
  }
  if (count * 2 > n && threshold === undefined) {
    for (let i = 0; i < n; i++) ink[i] ^= 1
  }
  return { ink, rgb }
}

// ---- 2. distance transform and line components --------------------------------

/**
 * Chamfer 3-4 distance of every ink pixel to the nearest background pixel (3 per pixel step, 4 per diagonal).
 * The image edge is not background.
 * @param {Uint8Array} ink
 * @param {number} w
 * @param {number} h
 * @returns {Uint16Array}
 */
export const distanceTransform = (ink, w, h) => {
  const INF = 65000
  const d = new Uint16Array(w * h)
  for (let i = 0; i < d.length; i++) d[i] = ink[i] ? INF : 0
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? INF : d[y * w + x])
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!d[i]) continue
      d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x - 1, y - 1) + 4, at(x, y - 1) + 3, at(x + 1, y - 1) + 4)
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (!d[i]) continue
      d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x + 1, y + 1) + 4, at(x, y + 1) + 3, at(x - 1, y + 1) + 4)
    }
  }
  return d
}

/** Width in pixels of a stroke whose centre pixel has chamfer distance `d` (exact for odd widths). */
const widthOfDistance = (d) => 2 * (d / 3) - 1

/**
 * The ink pixels of the components that are lines: 8-connected, widest point at most `maxWidth`, and at
 * least `minPixels` pixels.
 * @param {Uint8Array} ink
 * @param {Uint16Array} dist
 * @param {number} w
 * @param {number} h
 * @param {number} maxWidth
 * @param {number} minPixels
 * @returns {Uint8Array}
 */
export const lineComponents = (ink, dist, w, h, maxWidth, minPixels) => {
  const mask = new Uint8Array(w * h)
  const seen = new Uint8Array(w * h)
  const stack = new Int32Array(w * h)
  for (let start = 0; start < ink.length; start++) {
    if (!ink[start] || seen[start]) continue
    let top = 0
    let size = 0
    let maxD = 0
    const members = []
    stack[top++] = start
    seen[start] = 1
    while (top) {
      const i = stack[--top]
      members.push(i)
      size++
      if (dist[i] > maxD) maxD = dist[i]
      const x = i % w
      const y = (i - x) / w
      for (let k = 0; k < 8; k++) {
        const nx = x + DX8[k]
        const ny = y + DY8[k]
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (ink[j] && !seen[j]) {
          seen[j] = 1
          stack[top++] = j
        }
      }
    }
    if (size >= minPixels && widthOfDistance(maxD) <= maxWidth + 1e-9) {
      for (const i of members) mask[i] = 1
    }
  }
  return mask
}

// ---- 3. thinning -------------------------------------------------------------

/**
 * Zhang-Suen thinning, in place, then staircase cleanup (a pixel that links two neighbours which already
 * touch each other is redundant).
 * @param {Uint8Array} img 0/1, changed to the skeleton
 * @param {number} w
 * @param {number} h
 * @returns {Promise<void>}
 */
export const thin = async (img, w, h) => {
  let live = []
  for (let i = 0; i < img.length; i++) if (img[i]) live.push(i)
  const get = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img[y * w + x])
  const ring = new Array(8)
  const neighbours = (i) => {
    const x = i % w
    const y = (i - x) / w
    for (let k = 0; k < 8; k++) ring[k] = get(x + DX8[k], y + DY8[k]) // N, NE, E, SE, S, SW, W, NW
  }
  let changed = true
  while (changed) {
    changed = false
    for (let pass = 0; pass < 2; pass++) {
      const remove = []
      for (const i of live) {
        neighbours(i)
        let b = 0
        for (let k = 0; k < 8; k++) b += ring[k]
        if (b < 2 || b > 6) continue
        let a = 0
        for (let k = 0; k < 8; k++) if (!ring[k] && ring[(k + 1) % 8]) a++
        if (a !== 1) continue
        const [n, , e, , s, , wst] = ring
        if (pass === 0 ? (n * e * s || e * s * wst) : (n * e * wst || n * s * wst)) continue
        remove.push(i)
      }
      if (remove.length) {
        changed = true
        for (const i of remove) img[i] = 0
        live = live.filter((i) => img[i])
      }
    }
    await tick()
  }
  // Staircase cleanup.
  let again = true
  while (again) {
    again = false
    for (const i of live) {
      if (!img[i]) continue
      const x = i % w
      const y = (i - x) / w
      const near = []
      for (let k = 0; k < 8; k++) if (get(x + DX8[k], y + DY8[k])) near.push(k)
      if (near.length !== 2) continue
      const [p, q] = near
      const px = x + DX8[p]
      const py = y + DY8[p]
      const qx = x + DX8[q]
      const qy = y + DY8[q]
      if (Math.max(Math.abs(px - qx), Math.abs(py - qy)) === 1) {
        img[i] = 0
        again = true
      }
    }
    if (again) live = live.filter((i) => img[i])
  }
}

// ---- 4. skeleton graph -------------------------------------------------------

/**
 * @typedef {object} Node
 * @property {number[]} pixels
 * @property {number} x centre, in pixel units
 * @property {number} y
 * @property {boolean} junction
 */
/**
 * @typedef {object} Edge
 * @property {number} a node index
 * @property {number} b node index (equal to `a` for a loop)
 * @property {{x: number, y: number}[]} inner skeleton points strictly between the two nodes
 * @property {number[]} seeds skeleton pixels of the run (indices)
 * @property {boolean} alive
 */

const center = (i, w) => ({ x: (i % w) + 0.5, y: Math.floor(i / w) + 0.5 })

/**
 * Break a skeleton into runs between ends and junctions.
 * @param {Uint8Array} skel
 * @param {number} w
 * @param {number} h
 * @returns {{nodes: Node[], edges: Edge[], rings: Array<{points: {x: number, y: number}[], seeds: number[]}>}}
 */
export const skeletonGraph = (skel, w, h) => {
  const neigh = (i) => {
    const x = i % w
    const y = (i - x) / w
    const out = []
    for (let k = 0; k < 8; k++) {
      const nx = x + DX8[k]
      const ny = y + DY8[k]
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && skel[ny * w + nx]) out.push(ny * w + nx)
    }
    return out
  }
  const pixels = []
  for (let i = 0; i < skel.length; i++) if (skel[i]) pixels.push(i)
  const degree = new Map()
  for (const i of pixels) degree.set(i, neigh(i).length)

  /** @type {Node[]} */
  const nodes = []
  const nodeOf = new Map()
  const addNode = (members, junction) => {
    const id = nodes.length
    let x = 0
    let y = 0
    for (const i of members) {
      nodeOf.set(i, id)
      x += (i % w) + 0.5
      y += Math.floor(i / w) + 0.5
    }
    nodes.push({ pixels: members, x: x / members.length, y: y / members.length, junction })
  }
  for (const i of pixels) {
    if (nodeOf.has(i)) continue
    const deg = degree.get(i)
    if (deg === 1) addNode([i], false)
    else if (deg >= 3) {
      const members = [i]
      nodeOf.set(i, -1)
      for (let m = 0; m < members.length; m++) {
        for (const j of neigh(members[m])) {
          if (degree.get(j) >= 3 && !nodeOf.has(j)) {
            nodeOf.set(j, -1)
            members.push(j)
          }
        }
      }
      addNode(members, true)
    }
  }

  /** @type {Edge[]} */
  const edges = []
  const visited = new Set()
  const direct = new Set()
  nodes.forEach((node, a) => {
    for (const p of node.pixels) {
      for (const s of neigh(p)) {
        if (nodeOf.get(s) === a) continue
        if (nodeOf.has(s)) {
          const b = nodeOf.get(s)
          const key = Math.min(a, b) + '|' + Math.max(a, b)
          if (direct.has(key)) continue
          direct.add(key)
          edges.push({ a, b, inner: [], seeds: [], alive: true })
          continue
        }
        if (visited.has(s)) continue
        const inner = []
        const seeds = []
        let prev = p
        let cur = s
        let b = -1
        for (;;) {
          visited.add(cur)
          inner.push(center(cur, w))
          seeds.push(cur)
          const next = neigh(cur).find((j) => j !== prev)
          if (next === undefined) break
          if (nodeOf.has(next)) {
            b = nodeOf.get(next)
            break
          }
          if (visited.has(next)) break
          prev = cur
          cur = next
        }
        if (b >= 0) edges.push({ a, b, inner, seeds, alive: true })
      }
    }
  })

  // Closed loops with no end or junction on them.
  const rings = []
  for (const i of pixels) {
    if (nodeOf.has(i) || visited.has(i)) continue
    const points = []
    const seeds = []
    let prev = -1
    let cur = i
    while (cur !== undefined && !visited.has(cur)) {
      visited.add(cur)
      points.push(center(cur, w))
      seeds.push(cur)
      const next = neigh(cur).find((j) => j !== prev && !visited.has(j))
      prev = cur
      cur = next
    }
    if (points.length >= 3) rings.push({ points, seeds })
  }
  return { nodes, edges, rings }
}

/** Length of a polyline. */
const lengthOf = (pts) => {
  let l = 0
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return l
}

/** The polyline of an edge, node centres included. */
const edgePoints = (nodes, e) => [{ x: nodes[e.a].x, y: nodes[e.a].y }, ...e.inner, { x: nodes[e.b].x, y: nodes[e.b].y }]

/**
 * Drop specks and short side branches, then join the runs on either side of a junction that no longer
 * branches. Mutates `edges` (`alive`), may add merged edges.
 * @param {Node[]} nodes
 * @param {Edge[]} edges
 * @param {{minLength: number, minSpur: number}} opts
 * @returns {Edge[]} the surviving edges
 */
export const pruneGraph = (nodes, edges, opts) => {
  const deg = new Array(nodes.length).fill(0)
  const incident = nodes.map(() => new Set())
  const add = (e) => {
    deg[e.a]++
    deg[e.b]++
    incident[e.a].add(e)
    incident[e.b].add(e)
  }
  const kill = (e) => {
    e.alive = false
    deg[e.a]--
    deg[e.b]--
    incident[e.a].delete(e)
    incident[e.b].delete(e)
  }
  edges.forEach(add)
  for (let round = 0; round < 4; round++) {
    let changed = false
    for (const e of edges.filter((x) => x.alive)) {
      if (e.a === e.b) continue
      const len = lengthOf(edgePoints(nodes, e))
      const spur = ((deg[e.a] === 1 && deg[e.b] >= 3) || (deg[e.b] === 1 && deg[e.a] >= 3)) && len < opts.minSpur
      const speck = deg[e.a] === 1 && deg[e.b] === 1 && len < opts.minLength
      if (spur || speck) {
        kill(e)
        changed = true
      }
    }
    // Join across junctions with exactly two runs left.
    nodes.forEach((node, n) => {
      if (!node.junction || deg[n] !== 2 || incident[n].size !== 2) return
      const [e1, e2] = [...incident[n]]
      /** The run, turned so that it ends at `n`. */
      const toward = (e) => (e.b === n
        ? { from: e.a, inner: e.inner, seeds: e.seeds }
        : { from: e.b, inner: [...e.inner].reverse(), seeds: [...e.seeds].reverse() })
      const first = toward(e1)
      const second = toward(e2)
      const merged = {
        a: first.from,
        b: second.from,
        inner: [...first.inner, { x: node.x, y: node.y }, ...[...second.inner].reverse()],
        seeds: [...first.seeds, ...[...second.seeds].reverse()],
        alive: true
      }
      kill(e1)
      kill(e2)
      add(merged)
      edges.push(merged)
      changed = true
    })
    if (!changed) break
  }
  return edges.filter((e) => e.alive)
}

// ---- 5. runs, widths, colours --------------------------------------------------

/**
 * Give every run the ink that is closest to it: its pixel count over its length is the stroke width, the mean of
 * the colour of its own skeleton pixels (the middle of the stroke, not the anti-aliased fringe) its colour. A
 * breadth-first flood from the runs' skeleton pixels over the line ink.
 * @param {Uint8Array} lineInk the ink of the line components
 * @param {Uint8Array} rgb
 * @param {number} w
 * @param {number} h
 * @param {number[][]} seeds per run, skeleton pixels
 * @returns {{count: number[], color: string[]}}
 */
const assignInk = (lineInk, rgb, w, h, seeds) => {
  const owner = new Int32Array(w * h).fill(-1)
  const core = new Uint8Array(w * h)
  const queue = []
  seeds.forEach((list, id) => {
    for (const i of list) {
      if (owner[i] === -1) {
        owner[i] = id
        core[i] = 1
        queue.push(i)
      }
    }
  })
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]
    const x = i % w
    const y = (i - x) / w
    for (let k = 0; k < 8; k++) {
      const nx = x + DX8[k]
      const ny = y + DY8[k]
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const j = ny * w + nx
      if (lineInk[j] && owner[j] === -1) {
        owner[j] = owner[i]
        queue.push(j)
      }
    }
  }
  const count = new Array(seeds.length).fill(0)
  const sum = seeds.map(() => [0, 0, 0, 0])
  for (const i of queue) {
    const id = owner[i]
    count[id]++
    if (!core[i]) continue
    sum[id][0] += rgb[i * 3]
    sum[id][1] += rgb[i * 3 + 1]
    sum[id][2] += rgb[i * 3 + 2]
    sum[id][3]++
  }
  const hex = (v) => Math.round(v).toString(16).padStart(2, '0')
  return {
    count,
    color: sum.map(([r, g, b, n]) => `#${hex(r / (n || 1))}${hex(g / (n || 1))}${hex(b / (n || 1))}`)
  }
}

/**
 * Find the centerlines of the strokes of an image.
 * @param {{data: ArrayLike<number>, width: number, height: number}} image
 * @param {CenterlineOptions} [options]
 * @returns {Promise<CenterlineRun[]>}
 */
export const centerlineRuns = async (image, options = {}) => {
  const opts = { ...DEFAULTS, ...options }
  const { width: w, height: h } = image
  const { ink, rgb } = binarize(image, options.threshold)
  await tick()
  const dist = distanceTransform(ink, w, h)
  await tick()
  const lineInk = lineComponents(ink, dist, w, h, opts.maxWidth, 3)
  await tick()
  const skel = Uint8Array.from(lineInk)
  await thin(skel, w, h)
  const graph = skeletonGraph(skel, w, h)
  await tick()
  const edges = pruneGraph(graph.nodes, graph.edges, opts)

  /** @type {Array<{points: {x: number, y: number}[], closed: boolean, seeds: number[]}>} */
  const found = []
  for (const e of edges) {
    const closed = e.a === e.b
    const points = edgePoints(graph.nodes, e)
    if (!closed && lengthOf(points) < opts.minLength) continue
    if (closed && points.length < 4) continue
    found.push({ points, closed, seeds: e.seeds.length ? e.seeds : graph.nodes[e.a].pixels })
  }
  for (const r of graph.rings) {
    if (lengthOf(r.points) >= opts.minLength) found.push({ points: [...r.points, r.points[0]], closed: true, seeds: r.seeds })
  }
  const { count, color } = assignInk(lineInk, rgb, w, h, found.map((f) => f.seeds))
  return found.map((f, id) => ({
    points: f.points,
    closed: f.closed,
    width: Math.max(1, count[id] / Math.max(1, lengthOf(f.points))),
    color: color[id]
  }))
}

/**
 * Path data for a run: a corner-keeping Bézier fit of its skeleton.
 * @param {CenterlineRun} run
 * @param {number} [tolerance]
 * @returns {string} '' when the run has too few points to fit
 */
export const runToD = (run, tolerance = DEFAULTS.tolerance) => {
  const fitted = fitFreehand(run.points, tolerance)
  if (fitted.anchors.length < 2) return ''
  return anchorsToD(run.closed ? joinSubpaths([fitted], Math.max(2, tolerance * 2)) : [fitted])
}

const round = (v) => Math.round(v * 100) / 100

/**
 * Trace an image's strokes into an SVG document (one stroked `<path>` per run, in pixel units).
 * @param {{data: ArrayLike<number>, width: number, height: number}} image
 * @param {CenterlineOptions} [options]
 * @returns {Promise<string>} The SVG source (an `<svg>` with no paths when nothing was found).
 */
export const traceCenterline = async (image, options = {}) => {
  const tolerance = options.tolerance ?? DEFAULTS.tolerance
  const paths = []
  let sliceStart = performance.now()
  for (const run of await centerlineRuns(image, options)) {
    const d = runToD(run, tolerance)
    if (d) {
      paths.push(`<path d="${d}" fill="none" stroke="${run.color}" stroke-width="${round(run.width)}" stroke-linecap="round" stroke-linejoin="round"/>`)
    }
    if (performance.now() - sliceStart > 50) {
      await tick()
      sliceStart = performance.now()
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${image.width}" height="${image.height}" viewBox="0 0 ${image.width} ${image.height}">${paths.join('')}</svg>`
}
