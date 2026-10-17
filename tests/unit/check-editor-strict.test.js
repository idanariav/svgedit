import { describe, expect, it } from 'vitest'
import { countsByFile, errorsInFiles } from '../../scripts/check-editor-strict.mjs'

// check-editor-strict is a ratchet: only the errors in the files listed in src/editor/strict-files.json count.

const out = [
  "src/editor/a.js(2,11): error TS2339: Property 'value' does not exist on type 'Element'.",
  "  The expected type comes from property 'x'.",
  "src/editor/b.js(4,1): error TS18047: 'el' is possibly 'null'.",
  "src/editor/b.js(9,3): error TS7006: Parameter 'e' implicitly has an 'any' type.",
  'Found 3 errors in 2 files.'
].join('\n')

describe('errorsInFiles', () => {
  it('keeps the errors in listed files only', () => {
    expect(errorsInFiles(out, ['src/editor/b.js'])).toEqual([
      "src/editor/b.js(4,1): error TS18047: 'el' is possibly 'null'.",
      "src/editor/b.js(9,3): error TS7006: Parameter 'e' implicitly has an 'any' type."
    ])
  })

  it('reports nothing for a clean list, and ignores continuation and summary lines', () => {
    expect(errorsInFiles(out, ['src/editor/clean.js'])).toEqual([])
    expect(errorsInFiles(out, [])).toEqual([])
  })
})

describe('countsByFile', () => {
  it('counts per file, fewest first', () => {
    expect(countsByFile(out)).toEqual([['src/editor/a.js', 1], ['src/editor/b.js', 2]])
  })
})
