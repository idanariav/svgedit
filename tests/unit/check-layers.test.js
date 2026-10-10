import { describe, it, expect } from 'vitest'
import { findLayerViolations } from '../../scripts/check-layers.mjs'

const F = 'packages/svgcanvas/core/example.js'
const check = (src, path = F) => findLayerViolations(path, src)

describe('check-layers matcher', () => {
  it('accepts a clean file, including imports within the canvas package', () => {
    expect(check("import { NS } from './namespaces.js'\nimport u from '../common/util.js'\nexport const a = 1\n")).toEqual([])
  })

  it('flags a relative import that resolves into src/editor', () => {
    const v = check("import { x } from '../../../src/editor/Hotkeys.js'\n")
    expect(v).toHaveLength(1)
    expect(v[0]).toContain(`${F}:1`)
  })

  it('flags dynamic import() into src/editor', () => {
    expect(check("const m = await import('../../../src/editor/themeUtil.js')\n")).toHaveLength(1)
  })

  it('does not flag a relative import that merely contains "editor" in its name', () => {
    expect(check("import x from './editor-utils.js'\n")).toEqual([])
  })

  it('flags window.svgEditor, svgEditor. and the globals header', () => {
    expect(check('const e = window.svgEditor\n')).toHaveLength(1)
    expect(check('svgEditor.updateContextPanel()\n')).toHaveLength(1)
    expect(check('/* globals svgEditor */\nexport {}\n')).toHaveLength(1)
  })

  it('ignores svgEditor in line, block and JSDoc comments', () => {
    const src = [
      '// reset by svgEditor.updateContextPanel()',
      '/**',
      ' * see window.svgEditor for the host',
      ' */',
      '/* svgEditor.foo() */',
      'const a = 1 // svgEditor.bar()',
      ''
    ].join('\n')
    expect(check(src)).toEqual([])
  })

  it('flags customElements.define and se-* element creation', () => {
    expect(check("customElements.define('se-foo', Foo)\n")).toHaveLength(1)
    expect(check("const b = document.createElement('se-button')\n")).toHaveLength(1)
    expect(check("document.createElement('div')\n")).toEqual([])
  })
})
