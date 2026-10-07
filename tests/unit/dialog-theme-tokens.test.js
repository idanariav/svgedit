import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

const read = (p) => readFileSync(resolve(process.cwd(), 'src/editor', p), 'utf8')

// Dialogs are mounted beside `.svg_editor`, not inside it, so they only get the
// design tokens if svgedit.css lists them in its light + dark token blocks.
const DIALOGS = {
  'se-color-dialog': 'components/colorPicker/ColorDialog.css.js',
  'se-palette-dialog': 'components/palette/PaletteDialog.css.js',
  'se-text-prompt-dialog': 'dialogs/seTextPromptDialog.html',
  'se-image-import-dialog': 'dialogs/imageImportDialog.html',
  'se-trace-dialog': 'dialogs/seTraceDialog.html',
  'se-edit-prefs-dialog': 'dialogs/editorPreferencesDialog.html',
  'se-export-dialog': 'dialogs/exportDialog.html',
  'se-svg-source-editor-dialog': 'dialogs/svgSourceDialog.html',
  'se-img-prop-dialog': 'dialogs/imagePropertiesDialog.html',
  'se-plain-alert-dialog': 'dialogs/SePlainAlertDialog.js',
  'se-cmenu_canvas-dialog': 'dialogs/cmenuDialog.html',
  'se-cmenu-layers': 'dialogs/cmenuLayersDialog.html',
  'se-hotkey-dialog': 'dialogs/hotkeyDialog.html',
  'se-favorites-dialog': 'dialogs/favoritesDialog.html',
  'se-command-search-dialog': 'dialogs/commandSearchDialog.html'
}

// Elements in dialogs/ that are not themed surfaces themselves.
const NOT_A_SURFACE = new Set(['se-prompt-dialog']) // wraps se-plain-alert-dialog

const selectorOf = (css, marker) => {
  const at = css.indexOf(marker)
  return css.slice(at, css.indexOf('{', at))
}

describe('dialog theme tokens', () => {
  const css = read('svgedit.css')
  const light = selectorOf(css, ':root,\n.svg_editor,')
  const dark = selectorOf(css, '.svg_editor.theme-dark')

  it.each(Object.keys(DIALOGS))('%s gets light and dark tokens from svgedit.css', (tag) => {
    expect(light).toMatch(new RegExp(`(^|\\s)${tag}(,|\\s*$)`))
    expect(dark).toContain(`${tag}.theme-dark`)
  })

  it('lists every custom element defined in dialogs/ (so a new dialog cannot ship unthemed)', () => {
    const dir = resolve(process.cwd(), 'src/editor/dialogs')
    const defined = readdirSync(dir).filter((f) => f.endsWith('.js')).flatMap((f) =>
      [...readFileSync(join(dir, f), 'utf8').matchAll(/customElements\.define\('([a-z0-9_-]+)'/g)].map((m) => m[1]))
    expect(defined.length).toBeGreaterThan(10)
    expect(defined.filter((t) => !NOT_A_SURFACE.has(t) && !(t in DIALOGS))).toEqual([])
  })

  it('does not bring back the legacy grey dialog skin', () => {
    const skin = /#5a6162|#c5c5c5|border: 1px outset|#CCC;|#DDD;/i
    const hits = Object.values(DIALOGS).filter((f) => skin.test(read(f)))
    expect(hits).toEqual([])
  })

  it('keeps ":root," directly before ".svg_editor" (the Obsidian plugin scopes it by regex)', () => {
    expect(css).toMatch(/:root,\s*\.svg_editor/)
  })

  it.each(Object.entries(DIALOGS))('%s does not redefine the shared design tokens (%s)', (tag, file) => {
    const src = read(file)
    const redefined = [...src.matchAll(/^\s*(--(?!cp-|pd-)[a-z0-9-]+)\s*:/gm)].map((m) => m[1])
    expect(redefined).toEqual([])
  })

  it('does not reference the retired legacy alias variables', () => {
    const retired = /--(main-bg-color|text-color|input-color|border-color|icon-bg-color-hover|hover-highlight|dropdown-bg|dropdown-pressed-bg|canvas-bg-color|layer-bg|layer-selected-bg|link-color|orange-color|workarea-bg|ruler-color|bevel-light|main-menu-bg)\b/
    const walk = (dir) => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n)
      return statSync(p).isDirectory() ? walk(p) : /\.(js|html|css)$/.test(n) ? [p] : []
    })
    const hits = walk(resolve(process.cwd(), 'src/editor')).filter((f) => retired.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })
})
