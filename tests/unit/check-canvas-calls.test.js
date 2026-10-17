import { describe, expect, it } from 'vitest'
import { canvasCallErrors } from '../../scripts/check-canvas-calls.mjs'

// check-canvas-calls keeps the few errors that are about the canvas out of the ~1,700 DOM-typing errors
// `checkJs` reports on the editor, so a member moved off the canvas (R2) fails `npm test`.

const sources = {
  'src/editor/a.js': [
    'const { svgCanvas } = ed',
    'svgCanvas.removedMember()',
    'svgCanvas.zoom(1, 2)',
    'panel.style.display = svgCanvas.getZoom() ? "" : "none"',
    'el.value = 1',
    'const x = svgCanvas.getZoom(); other.textContent = 1'
  ]
}
const lineOf = (file, line) => sources[file]?.[line - 1] ?? ''

describe('canvasCallErrors', () => {
  it('keeps an error that names the canvas type', () => {
    const out = "src/editor/a.js(2,11): error TS2339: Property 'removedMember' does not exist on type 'SvgCanvas'."
    expect(canvasCallErrors(out, lineOf)).toEqual([out])
  })

  it('keeps an argument error on a line that calls svgCanvas', () => {
    const out = 'src/editor/a.js(3,19): error TS2554: Expected 0 arguments, but got 2.'
    expect(canvasCallErrors(out, lineOf)).toEqual([out])
  })

  it('drops DOM-typing errors, even on a line that mentions svgCanvas', () => {
    const out = [
      "src/editor/a.js(4,7): error TS2339: Property 'style' does not exist on type 'Element'.",
      "src/editor/a.js(5,4): error TS2339: Property 'value' does not exist on type 'Element'.",
      "src/editor/a.js(6,47): error TS2339: Property 'textContent' does not exist on type 'Foo'."
    ].join('\n')
    expect(canvasCallErrors(out, lineOf)).toEqual([])
  })

  it('drops an argument error on a line without svgCanvas, and ignores continuation lines', () => {
    const out = [
      'src/editor/a.js(5,4): error TS2345: Argument of type string is not assignable to parameter of type number.',
      "  Type 'string' is not assignable to type 'number'."
    ].join('\n')
    expect(canvasCallErrors(out, lineOf)).toEqual([])
  })
})
