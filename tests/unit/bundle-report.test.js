import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { groupModules } from '../../scripts/bundle-report.mjs'

const abs = (p) => path.resolve(process.cwd(), p)

describe('bundle-report groupModules', () => {
  it('groups by package, extension and source folder, largest first', () => {
    const groups = groupModules({
      [abs('node_modules/paper/dist/paper-core.js')]: 400,
      [abs('node_modules/@scope/pkg/index.js')]: 50,
      [abs('node_modules/.pnpm/x/node_modules/paper/other.js')]: 100,
      [abs('src/editor/extensions/ext-blend/ext-blend.js')]: 10,
      [abs('src/editor/extensions/ext-blend/panel.html')]: 5,
      [abs('src/editor/extensions/fx-filter.js')]: 7,
      [abs('src/editor/components/seButton.js')]: 20,
      [abs('src/editor/Editor.js')]: 30,
      [abs('packages/svgcanvas/core/math.ts')]: 40,
      [abs('packages/svgcanvas/svgcanvas.js')]: 60,
      '\0vite/preload-helper': 1,
      [`${abs('src/editor/components/seInput.js')}?raw`]: 3
    })
    const byName = Object.fromEntries(groups.map((g) => [g.name, g]))
    expect(byName['node_modules/paper']).toEqual({ name: 'node_modules/paper', bytes: 500, files: 2 })
    expect(byName['node_modules/@scope/pkg'].bytes).toBe(50)
    expect(byName['src/editor/extensions/ext-blend']).toMatchObject({ bytes: 15, files: 2 })
    expect(byName['src/editor/extensions/fx-filter.js'].bytes).toBe(7)
    expect(byName['src/editor/components']).toMatchObject({ bytes: 23, files: 2 })
    expect(byName['src/editor (top level)'].bytes).toBe(30)
    expect(byName['packages/svgcanvas/core'].bytes).toBe(40)
    expect(byName['packages/svgcanvas (top level)'].bytes).toBe(60)
    expect(byName['virtual / outside the repo'].bytes).toBe(1)
    expect(groups.map((g) => g.bytes)).toEqual([...groups.map((g) => g.bytes)].sort((a, b) => b - a))
  })
})
