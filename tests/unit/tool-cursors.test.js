import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { cursorForMode as cursorOf } from '../../src/editor/toolCursors.js'

const cursorDir = path.resolve(__dirname, '../../src/editor/images/cursors')
const read = (mode) => fs.readFileSync(path.join(cursorDir, `${mode}_cursor.svg`), 'utf8')
const hotspotOf = (css) => /\) (\d+) (\d+), crosshair$/.exec(css).slice(1).map(Number)

describe('tool cursors (cursorForMode)', () => {
  const files = fs.readdirSync(cursorDir).filter((f) => f.endsWith('_cursor.svg')).map((f) => f.replace('_cursor.svg', ''))
  // `<mode>_<hint>` files are cursors by position (a pen end to continue); the rest belong to a mode
  const modes = files.filter((m) => !m.includes('_'))
  const hinted = files.filter((m) => m.includes('_'))
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

  it('a hint swaps in the cursor of <mode>_<hint>, with the tool tip as hotspot; no hint, or an unknown one, is the mode\'s own', () => {
    expect(hinted.sort()).toEqual(['fhpath_continue', 'path_continue', 'path_join', 'select_move', 'width_add'])
    for (const name of hinted) {
      const [mode, hint] = name.split('_')
      expect(cursorOf(mode, hint), name).not.toBe(cursorOf(mode))
      expect(cursorOf(mode, hint), name).toBe(cursorOf(name))
      // a tool's variants keep its working tip; the select tool's move cursor has the default arrow to replace
      if (mode !== 'select') expect(hotspotOf(cursorOf(mode, hint)), name).toEqual(hotspotOf(cursorOf(mode)))
    }
    expect(cursorOf('path', 'nonsense')).toBe(cursorOf('path'))
    expect(cursorOf('path', null)).toBe(cursorOf('path'))
  })

  it('the select tool\'s move cursor is four arrows centred on the pointer, in the same family as the others', () => {
    expect(hotspotOf(cursorOf('select', 'move'))).toEqual([16, 16])
    const svg = read('select_move')
    expect(svg).toMatch(/width="32" height="32"/)
    expect(svg).toContain('stroke="#ffffff"') // the halo that keeps it visible on the dark canvas
    expect(cursorOf('select')).toBe('auto')
  })

  it('a hint can name a system cursor (the Width tool\'s grab)', () => {
    expect(cursorOf('width', 'grab')).toBe('grab')
    expect(cursorOf('width', 'grabbing')).toBe('grabbing')
    expect(cursorOf('width', 'handle')).toBe('pointer')
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
