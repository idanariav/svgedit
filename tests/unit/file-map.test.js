import { describeFile, listFiles, build } from '../../scripts/file-map.mjs'

describe('file-map header extraction', () => {
  it('takes the first sentence of a block-comment header and drops the leading file name', () => {
    expect(describeFile('// @ts-check\n/**\n * commands.js — the editor\'s command registry.\n *\n * More detail here.\n */\nimport x from "y"\n'))
      .toBe('The editor\'s command registry')
  })

  it('joins a wrapped first paragraph and stops at a sentence end', () => {
    expect(describeFile('/**\n * Fitted dashes: stretch or squeeze a dash\n * pattern so a whole number fits. A second sentence.\n */\n'))
      .toBe('Fitted dashes: stretch or squeeze a dash pattern so a whole number fits')
  })

  it('reads a line-comment header after a shebang and ts-check', () => {
    expect(describeFile('#!/usr/bin/env node\n// @ts-check\n// Keeps the engine independent of the editor UI.\n// More.\n\nimport fs from "fs"\n'))
      .toBe('Keeps the engine independent of the editor UI')
  })

  it('does not take an e.g. or a version number for a sentence end', () => {
    expect(describeFile('// themeUtil.js — applies the theme (e.g. dark) to a root.\n')).toBe('Applies the theme (e.g. dark) to a root')
  })

  it('returns null when code comes first or the comment has only tags', () => {
    expect(describeFile('import x from "y"\n/** the function */\n')).toBeNull()
    expect(describeFile('/**\n * @module foo\n */\nexport {}\n')).toBeNull()
    expect(describeFile('export const a = 1\n')).toBeNull()
  })

  it('caps a long first sentence', () => {
    const long = 'word '.repeat(100)
    expect(describeFile(`// ${long}\n`).length).toBeLessThanOrEqual(221)
  })
})

describe('file-map coverage', () => {
  it('every listed source file has a header comment', () => {
    const { missing } = build()
    expect(missing).toEqual([])
  })

  it('lists files from the editor, the canvas and the scripts', () => {
    const files = listFiles()
    expect(files).toContain('src/editor/commands.ts')
    expect(files).toContain('packages/svgcanvas/core/transaction.ts')
    expect(files).toContain('scripts/file-map.mjs')
    expect(files.some(f => f.includes('node_modules') || f.includes('/dist/'))).toBe(false)
    // TypeScript sources are listed, declaration files are not
    expect(files).toContain('packages/svgcanvas/core/proportions.ts')
    expect(files.some(f => f.endsWith('.d.ts'))).toBe(false)
  })
})
