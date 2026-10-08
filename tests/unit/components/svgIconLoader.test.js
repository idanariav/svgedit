import { describe, it, expect } from 'vitest'
import { fetchSvgEl } from '../../../src/editor/components/svgIconLoader.js'

describe('svgIconLoader outline conversion', () => {
  it('re-styles solid silhouette icons as screen-px outlines', async () => {
    for (const name of ['panning.svg', 'brush.svg', 'shapelib.svg', 'cutter.svg', 'pin.svg', 'go_up.svg', 'go_down.svg']) {
      const svg = await fetchSvgEl(name)
      expect(svg, name).not.toBeNull()
      const shapes = svg.querySelectorAll('path, polygon, polyline, rect, circle, ellipse')
      expect(shapes.length, name).toBeGreaterThan(0)
      shapes.forEach(el => {
        expect(el.getAttribute('fill'), name).toBe('none')
        expect(el.getAttribute('stroke'), name).toBe('currentColor')
        expect(el.getAttribute('vector-effect'), name).toBe('non-scaling-stroke')
      })
    }
  })

  it('keeps the shapes trigger icon solid (tiny shapes look bad hollow)', async () => {
    const svg = await fetchSvgEl('shapes.svg')
    expect(svg.querySelectorAll('path[fill="currentColor"]').length).toBeGreaterThan(0)
    expect(svg.querySelector('[vector-effect]')).toBeNull()
  })

  it('leaves other icons untouched', async () => {
    const svg = await fetchSvgEl('more_tools.svg')
    // its three dots stay solid
    expect(svg.querySelectorAll('[fill="currentColor"]').length).toBe(3)
    expect(svg.querySelector('[vector-effect]')).toBeNull()
  })
})
