import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { contextMenuCss } from '../../src/editor/dialogs/contextMenu.css.js'

const read = (p) => readFileSync(resolve(process.cwd(), 'src/editor', p), 'utf8')

describe('right-click menus look like the main menu', () => {
  it('the shared sheet draws the main menu\'s card and rows', () => {
    expect(contextMenuCss).toMatch(/font-family: var\(--ui-font/)
    expect(contextMenuCss).toMatch(/font-size: 13px/)
    expect(contextMenuCss).toMatch(/border-radius: 10px/) // the card, as #menuPopup
    expect(contextMenuCss).toMatch(/border-radius: 7px/) // the rows, as se-menu-item
    expect(contextMenuCss).toMatch(/a:hover[\s\S]*?background: var\(--icon-hover-bg/)
    expect(contextMenuCss).not.toMatch(/Lucida/)
  })

  it.each([
    ['dialogs/cmenuDialog.ts', 'dialogs/cmenuDialog.html'],
    ['dialogs/cmenuLayersDialog.ts', 'dialogs/cmenuLayersDialog.html']
  ])('%s prepends the shared sheet and keeps no card rules of its own', (ts, html) => {
    expect(read(ts)).toMatch(/template\.innerHTML = `<style>\$\{contextMenuCss\}<\/style>/)
    const own = read(html)
    expect(own).not.toMatch(/\.contextMenu\s*\{/)
    expect(own).not.toMatch(/Lucida|var\(--accent/)
  })
})
