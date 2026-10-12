import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { cursorForMode as cursorOf } from '../../src/editor/toolCursors.js'

const cursorDir = path.resolve(__dirname, '../../src/editor/images/cursors')
const read = (mode) => fs.readFileSync(path.join(cursorDir, `${mode}_cursor.svg`), 'utf8')
const hotspotOf = (css) => /\) (\d+) (\d+), crosshair$/.exec(css).slice(1).map(Number)

describe('tool cursors (cursorForMode)', () => {
  const modes = fs.readdirSync(cursorDir).filter((f) => f.endsWith('_cursor.svg')).map((f) => f.replace('_cursor.svg', ''))
  // a tool with a working tip is drawn as the tool, tip at the hotspot; the rest are a crosshair plus a glyph
  const TIP_TOOLS = ['fhpath', 'path', 'curvature', 'brush', 'smooth', 'eyedropper', 'cutter']

  it('every cursor file is used by the mode of the same name', () => {
    expect(modes.length).toBeGreaterThanOrEqual(25)
    for (const mode of modes) {
      expect(cursorOf(mode), mode).toMatch(/^url\("data:image\/svg\+xml;utf8,.+"\) \d+ \d+, crosshair$/)
    }
  })

  it('covers the drawing tools, old and new', () => {
    for (const mode of ['rect', 'ellipse', 'circle', 'square', 'star', 'polygon', 'fhpath', 'path', 'line', 'curvature', 'brush',
      'cutter', 'eyedropper', 'gradient', 'distort', 'corners', 'width', 'blend', 'shaper', 'smooth', 'shapebuilder',
      'arc', 'spiral', 'rectgrid', 'polargrid']) {
      expect(modes, mode).toContain(mode)
    }
  })

  it('the hotspot is the one the file names, inside the 32px image', () => {
    for (const mode of modes) {
      const [, hx, hy] = /data-hotspot="(\d+) (\d+)"/.exec(read(mode))
      expect(hotspotOf(cursorOf(mode)), mode).toEqual([Number(hx), Number(hy)])
      expect(Number(hx)).toBeLessThan(32)
      expect(Number(hy)).toBeLessThan(32)
    }
  })

  it('a tool with a working tip points from its tip (bottom left); shape and effect tools are centred on a crosshair', () => {
    for (const mode of TIP_TOOLS) {
      const [x, y] = hotspotOf(cursorOf(mode))
      expect(x, mode).toBeLessThan(8)
      expect(y, mode).toBeGreaterThan(24)
    }
    for (const mode of modes.filter((m) => !TIP_TOOLS.includes(m))) {
      expect(hotspotOf(cursorOf(mode)), mode).toEqual([8, 8])
    }
  })

  it('no cursor still draws the default arrow beside the tool', () => {
    for (const mode of modes) expect(read(mode), mode).not.toContain('L0.6 9.4')
  })

  it('keeps the system cursors and the default for the select mode', () => {
    expect(cursorOf('select')).toBe('auto')
    expect(cursorOf('text')).toBe('text')
    expect(cursorOf('ext-panning')).toBe('grab')
    for (const mode of ['zoom', 'shapelib', 'repeat-pick-center', 'puppetwarp']) expect(cursorOf(mode), mode).toBe('crosshair')
  })

  it('every cursor is 32px, the size browsers allow', () => {
    for (const mode of modes) expect(read(mode), mode).toMatch(/width="32" height="32"/)
  })
})
