import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { CLOSE_TOL, parseAnchors } from '../../packages/svgcanvas/core/anchor-path.ts'

// Roadmap R10: one close tolerance. Two sides of one comparison that fold "a path closing a hair short of its start" with
// different tolerances differ by an anchor (184f99ae). A caller that needs the loose fold uses CLOSE_TOL, not a number of its own.
const sources = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name)
  if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'dist' ? [] : sources(p)
  return /\.(ts|js)$/.test(e.name) ? [p] : []
})

describe('the close tolerance', () => {
  it('folds a closing anchor a hair short of its start, and not one further off', () => {
    expect(parseAnchors('M0,0 L10,0 L10,10 L0.05,0.04 Z', CLOSE_TOL)[0].anchors).toHaveLength(3)
    expect(parseAnchors('M0,0 L10,0 L10,10 L0.5,0 Z', CLOSE_TOL)[0].anchors).toHaveLength(4)
  })

  it('no caller passes parseAnchors a tolerance number of its own', () => {
    const offenders = ['packages/svgcanvas/core', 'src/editor'].flatMap(sources).flatMap((file) =>
      fs.readFileSync(file, 'utf8').split('\n')
        .map((line, i) => ({ file, line: i + 1, text: line }))
        .filter(({ text }) => /parseAnchors\(.*,\s*\d*\.?\d+\s*\)/.test(text)))
    expect(offenders).toEqual([])
  })
})
