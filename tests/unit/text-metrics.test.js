import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { parseSvg, getAt } from '../../packages/svgcanvas/core/model/index.ts'
import { TextMetricsCache, estimateTextBounds, resolveTextStyle, textsIn } from '../../packages/svgcanvas/core/model/text-metrics.ts'

const root = (inner) => parseSvg(`<svg xmlns="http://www.w3.org/2000/svg"><g id="L" class="layer" font-size="20">${inner}</g></svg>`).root
const firstText = (r) => textsIn(r)[0]

describe('resolveTextStyle', () => {
  it('inherits from ancestors; a nearer attribute or style declaration wins', () => {
    const r = root('<g font-family="serif" style="font-size: 30px"><text id="t" x="0" y="0" text-anchor="middle" font-weight="bold">hi</text></g>')
    expect(resolveTextStyle(firstText(r).chain)).toMatchObject({ fontSize: 30, fontFamily: 'serif', fontWeight: 'bold', anchor: 'middle' })
    const own = root('<text id="t" font-size="12">hi</text>')
    expect(resolveTextStyle(firstText(own).chain).fontSize).toBe(12)
  })

  it('keeps the inherited size when a size has a unit it cannot resolve', () => {
    const r = root('<text id="t" font-size="2em">hi</text>')
    expect(resolveTextStyle(firstText(r).chain).fontSize).toBe(20)
  })
})

describe('estimateTextBounds', () => {
  it('uses the widest row, the anchor and the font size', () => {
    const r = root('<text id="t" x="100" y="50" font-size="10" text-anchor="middle">abcd\nab</text>')
    const { el, chain } = firstText(r)
    const box = estimateTextBounds(el, resolveTextStyle(chain))
    expect(box.width).toBeCloseTo(4 * 5.5)
    expect(box.x).toBeCloseTo(100 - box.width / 2)
    expect(box.y).toBeCloseTo(50 - 8)
    expect(box.height).toBeCloseTo(2 * 12)
  })

  it('takes a tspan per row', () => {
    const r = root('<text id="t" x="0" y="0" font-size="10"><tspan x="0" y="0">ab</tspan><tspan x="0" y="12">abcdef</tspan></text>')
    const { el, chain } = firstText(r)
    expect(estimateTextBounds(el, resolveTextStyle(chain)).width).toBeCloseTo(6 * 5.5)
  })
})

describe('TextMetricsCache', () => {
  const r = root('<text id="t" x="0" y="0">hello</text><text id="u" x="0" y="30">world</text>')
  const [t, u] = textsIn(r)
  const style = resolveTextStyle(t.chain)

  it('answers with the estimate until something is measured, then with the measurement', () => {
    const cache = new TextMetricsCache()
    expect(cache.bounds(t.el, style).measured).toBe(false)
    cache.put(t.el, style, { x: 1, y: 2, width: 3, height: 4 })
    expect(cache.bounds(t.el, style)).toEqual({ box: { x: 1, y: 2, width: 3, height: 4 }, measured: true })
    expect(cache.bounds(u.el, style).measured).toBe(false)
  })

  it('misses for a changed element, a changed inherited style, and after clear()', () => {
    const cache = new TextMetricsCache()
    cache.put(t.el, style, { x: 1, y: 2, width: 3, height: 4 })
    expect(cache.get({ ...t.el }, style)).toBeUndefined() // an edited text is a new object
    expect(cache.get(t.el, { ...style, fontSize: 99 })).toBeUndefined()
    cache.clear()
    expect(cache.get(t.el, style)).toBeUndefined()
  })

  it('keeps the entry of a text an edit did not touch (structural sharing)', () => {
    const cache = new TextMetricsCache()
    cache.put(t.el, style, { x: 1, y: 2, width: 3, height: 4 })
    const edited = { ...r, children: r.children.map((c, i) => (i === 0 ? { ...c, attrs: [...c.attrs] } : c)) }
    expect(firstText(edited).el).toBe(t.el)
    expect(cache.get(firstText(edited).el, resolveTextStyle(firstText(edited).chain))).toBeDefined()
    expect(getAt(r, [0, 0])).toBe(t.el)
  })

  it('runs in a bare Node process (no document, no window)', () => {
    const script = `
      import { parseSvg } from './packages/svgcanvas/core/model/index.ts'
      import { TextMetricsCache, resolveTextStyle, textsIn } from './packages/svgcanvas/core/model/text-metrics.ts'
      const r = parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><text id="t" font-size="10">abc</text></svg>').root
      const { el, chain } = textsIn(r)[0]
      console.log(JSON.stringify(new TextMetricsCache().bounds(el, resolveTextStyle(chain))))
    `
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', cwd: process.cwd() })
    expect(JSON.parse(out).measured).toBe(false)
  })
})
