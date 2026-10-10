import { describe, it, expect } from 'vitest'
import {
  otsu, binarize, distanceTransform, lineComponents, thin, skeletonGraph, pruneGraph,
  centerlineRuns, traceCenterline, runToD
} from '../../../src/editor/dialogs/traceCenterline.js'

/** A white W x H image; `paint(set)` blacks (or colours) pixels. */
const image = (w, h, paint, bg = [255, 255, 255]) => {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) data.set([...bg, 255], i * 4)
  const set = (x, y, rgb = [0, 0, 0]) => {
    x = Math.round(x)
    y = Math.round(y)
    if (x >= 0 && y >= 0 && x < w && y < h) data.set([...rgb, 255], (y * w + x) * 4)
  }
  paint(set)
  return { data, width: w, height: h }
}
/** A stroke of `thickness` px from (x1,y1) to (x2,y2). */
const line = (set, x1, y1, x2, y2, thickness, rgb) => {
  const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2)
  const r = (thickness - 1) / 2
  for (let i = 0; i <= n; i++) {
    const x = x1 + (x2 - x1) * i / n
    const y = y1 + (y2 - y1) * i / n
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) if (Math.hypot(dx, dy) <= r + 0.01) set(x + dx, y + dy, rgb)
    }
  }
}
const length = (pts) => pts.slice(1).reduce((l, p, i) => l + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0)

describe('binarize', () => {
  it('otsu splits two clusters and reports a flat image as unsplittable', () => {
    const hist = new Uint32Array(256)
    hist[20] = 40
    hist[230] = 60
    const t = otsu(hist, 100)
    expect(t).toBeGreaterThanOrEqual(20)
    expect(t).toBeLessThan(230)
    const flat = new Uint32Array(256)
    flat[128] = 100
    expect(otsu(flat, 100)).toBe(-1)
  })

  it('ink is the dark minority, on a light or a dark ground', () => {
    const dark = image(20, 20, (set) => line(set, 3, 10, 16, 10, 3))
    const a = binarize(dark).ink
    expect(a.reduce((s, v) => s + v, 0)).toBeGreaterThan(30)
    expect(a[10 * 20 + 10]).toBe(1)
    expect(a[2 * 20 + 2]).toBe(0)
    const light = image(20, 20, (set) => line(set, 3, 10, 16, 10, 3, [255, 255, 255]), [0, 0, 0])
    const b = binarize(light).ink
    expect(Array.from(b)).toEqual(Array.from(a))
  })

  it('treats transparent pixels as white', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4) // all transparent black
    data.set([0, 0, 0, 255], 5 * 4)
    const { ink } = binarize({ data, width: 4, height: 4 })
    expect(ink[5]).toBe(1)
    expect(ink.reduce((s, v) => s + v, 0)).toBe(1)
  })
})

describe('distanceTransform and line components', () => {
  it('measures a 3 px bar as 2 px deep at its middle', () => {
    const img = image(30, 12, (set) => line(set, 3, 6, 26, 6, 3))
    const { ink } = binarize(img)
    const d = distanceTransform(ink, 30, 12)
    expect(d[6 * 30 + 15]).toBe(6)
    expect(d[0]).toBe(0)
  })

  it('keeps thin components and leaves wide areas out', () => {
    const img = image(80, 40, (set) => {
      line(set, 3, 5, 40, 5, 3)
      for (let y = 15; y < 35; y++) for (let x = 40; x < 70; x++) set(x, y)
    })
    const { ink } = binarize(img)
    const d = distanceTransform(ink, 80, 40)
    const mask = lineComponents(ink, d, 80, 40, 12, 3)
    expect(mask[5 * 80 + 20]).toBe(1)
    expect(mask[25 * 80 + 55]).toBe(0)
  })
})

describe('thin', () => {
  it('reduces a bar to a one pixel line along its middle', async () => {
    const w = 40
    const img = new Uint8Array(w * 12)
    for (let y = 4; y < 9; y++) for (let x = 3; x < 37; x++) img[y * w + x] = 1
    await thin(img, w, 12)
    const rows = new Set()
    for (let i = 0; i < img.length; i++) if (img[i]) rows.add(Math.floor(i / w))
    expect(rows.size).toBe(1)
    expect(rows.has(6)).toBe(true)
    expect(img.reduce((s, v) => s + v, 0)).toBeGreaterThan(28)
  })

  it('leaves a one pixel line alone', async () => {
    const w = 20
    const img = new Uint8Array(w * 5)
    for (let x = 2; x < 18; x++) img[2 * w + x] = 1
    await thin(img, w, 5)
    expect(img.reduce((s, v) => s + v, 0)).toBe(16)
  })
})

describe('skeleton graph', () => {
  it('finds two ends and one run for a line, and a junction for a T', () => {
    const w = 40
    const bar = new Uint8Array(w * 10)
    for (let x = 4; x < 30; x++) bar[5 * w + x] = 1
    const g = skeletonGraph(bar, w, 10)
    expect(g.nodes).toHaveLength(2)
    expect(g.edges).toHaveLength(1)
    const t = new Uint8Array(w * 20)
    for (let x = 4; x < 30; x++) t[5 * w + x] = 1
    for (let y = 6; y < 18; y++) t[y * w + 17] = 1
    const gt = skeletonGraph(t, w, 20)
    expect(gt.nodes.filter((n) => n.junction)).toHaveLength(1)
    expect(gt.edges).toHaveLength(3)
  })

  it('finds a loop that has no ends', async () => {
    const w = 30
    const ring = new Uint8Array(w * 30)
    for (let i = 0; i < 64; i++) {
      const a = 2 * Math.PI * i / 64
      ring[Math.round(15 + 10 * Math.sin(a)) * w + Math.round(15 + 10 * Math.cos(a))] = 1
    }
    await thin(ring, w, 30)
    const g = skeletonGraph(ring, w, 30)
    expect(g.nodes).toHaveLength(0)
    expect(g.rings).toHaveLength(1)
  })

  it('prunes a short side branch and joins the runs it leaves', () => {
    const w = 60
    const t = new Uint8Array(w * 20)
    for (let x = 4; x < 50; x++) t[10 * w + x] = 1
    for (let y = 7; y < 10; y++) t[y * w + 25] = 1 // a 3 px spur
    const g = skeletonGraph(t, w, 20)
    expect(g.edges).toHaveLength(3)
    const kept = pruneGraph(g.nodes, g.edges, { minLength: 6, minSpur: 6 })
    expect(kept).toHaveLength(1)
  })
})

describe('centerlineRuns', async () => {
  it('a 3 px bar is one open run of its length and width', async () => {
    const runs = await centerlineRuns(image(80, 30, (set) => line(set, 10, 15, 69, 15, 3)))
    expect(runs).toHaveLength(1)
    const [run] = runs
    expect(run.closed).toBe(false)
    expect(run.width).toBeGreaterThan(2.6)
    expect(run.width).toBeLessThan(3.4)
    expect(length(run.points)).toBeGreaterThan(55)
    expect(length(run.points)).toBeLessThan(62)
    for (const p of run.points) expect(p.y).toBeCloseTo(15.5, 0)
  })

  it('an even width is measured too', async () => {
    const [run] = await centerlineRuns(image(80, 30, (set) => {
      for (let y = 14; y < 18; y++) for (let x = 10; x < 70; x++) set(x, y) // four rows
    }))
    expect(run.width).toBeGreaterThan(3.5)
    expect(run.width).toBeLessThan(4.5)
  })

  it('a one pixel line is traced', async () => {
    const runs = await centerlineRuns(image(60, 20, (set) => line(set, 5, 10, 54, 10, 1)))
    expect(runs).toHaveLength(1)
    expect(runs[0].width).toBeLessThan(1.5)
  })

  it('an X is four runs meeting at one point', async () => {
    const runs = await centerlineRuns(image(80, 80, (set) => {
      line(set, 10, 10, 69, 69, 3)
      line(set, 69, 10, 10, 69, 3)
    }))
    expect(runs).toHaveLength(4)
    for (const r of runs) {
      const ends = [r.points[0], r.points[r.points.length - 1]]
      expect(ends.some((p) => Math.hypot(p.x - 40, p.y - 40) < 4)).toBe(true)
    }
  })

  it('a ring is one closed run', async () => {
    const runs = await centerlineRuns(image(80, 80, (set) => {
      for (let i = 0; i < 400; i++) {
        const a = 2 * Math.PI * i / 400
        for (let r = -1; r <= 1; r++) set(40 + (22 + r) * Math.cos(a), 40 + (22 + r) * Math.sin(a))
      }
    }))
    expect(runs).toHaveLength(1)
    expect(runs[0].closed).toBe(true)
    expect(runs[0].width).toBeGreaterThan(2.4)
    expect(runs[0].width).toBeLessThan(3.6)
    expect(length(runs[0].points)).toBeGreaterThan(125)
  })

  it('a small nick on a stroke is pruned, a long branch is kept', async () => {
    const nick = await centerlineRuns(image(80, 40, (set) => {
      line(set, 5, 20, 74, 20, 3)
      line(set, 40, 20, 40, 16, 3)
    }))
    expect(nick).toHaveLength(1)
    const branch = await centerlineRuns(image(80, 60, (set) => {
      line(set, 5, 40, 74, 40, 3)
      line(set, 40, 40, 40, 8, 3)
    }))
    expect(branch).toHaveLength(3)
  })

  it('specks are dropped, filled areas are left to the outline tracer', async () => {
    const runs = await centerlineRuns(image(100, 60, (set) => {
      set(5, 5)
      set(6, 5)
      line(set, 10, 10, 18, 10, 1) // 9 px: a short stroke is kept
      for (let y = 20; y < 50; y++) for (let x = 40; x < 90; x++) set(x, y) // a filled block
    }))
    expect(runs).toHaveLength(1)
    expect(length(runs[0].points)).toBeLessThan(12)
  })

  it('strokes of different colours keep their own', async () => {
    const runs = await centerlineRuns(image(80, 40, (set) => {
      line(set, 5, 10, 74, 10, 3, [200, 20, 20])
      line(set, 5, 30, 74, 30, 3, [20, 20, 20])
    }), { threshold: 150 })
    expect(runs).toHaveLength(2)
    const byY = [...runs].sort((a, b) => a.points[0].y - b.points[0].y)
    expect(byY[0].color).toBe('#c81414')
    expect(byY[1].color).toBe('#141414')
  })

  it('an empty page gives no runs', async () => {
    expect(await centerlineRuns(image(30, 30, () => {}))).toEqual([])
  })

  it('a light drawing on a dark ground traces the same', async () => {
    const dark = await centerlineRuns(image(80, 30, (set) => line(set, 10, 15, 69, 15, 3)))
    const light = await centerlineRuns(image(80, 30, (set) => line(set, 10, 15, 69, 15, 3, [255, 255, 255]), [0, 0, 0]))
    expect(light).toHaveLength(1)
    expect(length(light[0].points)).toBeCloseTo(length(dark[0].points), 0)
  })

  it('a longer minLength drops short strokes', async () => {
    const img = image(80, 30, (set) => line(set, 10, 15, 24, 15, 3))
    expect(await centerlineRuns(img)).toHaveLength(1)
    expect(await centerlineRuns(img, { minLength: 30 })).toHaveLength(0)
  })
})

describe('traceCenterline', async () => {
  it('writes one stroked path per run, in pixel units', async () => {
    const svg = await traceCenterline(image(80, 30, (set) => line(set, 10, 15, 69, 15, 3)))
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(doc.documentElement.getAttribute('width')).toBe('80')
    expect(doc.documentElement.getAttribute('viewBox')).toBe('0 0 80 30')
    const paths = doc.querySelectorAll('path')
    expect(paths).toHaveLength(1)
    expect(paths[0].getAttribute('fill')).toBe('none')
    expect(paths[0].getAttribute('stroke')).toBe('#000000')
    expect(parseFloat(paths[0].getAttribute('stroke-width'))).toBeGreaterThan(2.6)
    expect(paths[0].getAttribute('d')).toMatch(/^M/)
  })

  it('fits a curved stroke with a few cubics', async () => {
    const runs = await centerlineRuns(image(100, 60, (set) => {
      for (let i = 0; i <= 300; i++) {
        const t = i / 300
        for (let dy = -1; dy <= 1; dy++) set(10 + 80 * t, 30 - 20 * Math.sin(Math.PI * t) + dy)
      }
    }))
    expect(runs).toHaveLength(1)
    const d = runToD(runs[0])
    expect((d.match(/C/g) || []).length).toBeLessThanOrEqual(4)
    expect(d).not.toMatch(/Z/)
  })

  it('closes the path of a ring', async () => {
    const [run] = await centerlineRuns(image(80, 80, (set) => {
      for (let i = 0; i < 400; i++) {
        const a = 2 * Math.PI * i / 400
        for (let r = -1; r <= 1; r++) set(40 + (22 + r) * Math.cos(a), 40 + (22 + r) * Math.sin(a))
      }
    }))
    expect(runToD(run)).toMatch(/Z$/)
  })

  it('an empty page is an svg with no paths', async () => {
    expect(await traceCenterline(image(10, 10, () => {}))).not.toContain('<path')
  })
})
