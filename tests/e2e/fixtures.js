import { test as base, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

// Istanbul coverage from instrumented builds, merged per worker. The full coverage object is ~20 MB (statement, branch and
// function maps for every file), so a test sends the page's maps only the first time a file is seen in this worker and
// its counters (`s`, `f`, `b`) afterwards, and the worker writes one `.nyc_output/playwright-worker-N.json` at the end:
// per-test dumps cost ~3 s each and ~11 GB per run. `nyc report` merges the per-worker files.
const merged = {}
const mergeCoverage = (coverage) => {
  for (const [file, entry] of Object.entries(coverage)) {
    const acc = merged[file]
    if (!acc) { merged[file] = entry; continue }
    for (const k of Object.keys(entry.s)) acc.s[k] += entry.s[k]
    for (const k of Object.keys(entry.f)) acc.f[k] += entry.f[k]
    for (const k of Object.keys(entry.b)) entry.b[k].forEach((n, i) => { acc.b[k][i] += n })
  }
}

// Runs in the page: whole entries for files this worker has not merged yet, counters only for the others.
const collectCoverage = (known) => {
  const cov = globalThis.__coverage__
  if (!cov) return null
  return Object.fromEntries(Object.entries(cov).map(([file, e]) => [file, known.includes(file) ? { s: e.s, f: e.f, b: e.b } : e]))
}

// Playwright fixtures: the drawing health check and the coverage capture.
export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  _writeCoverage: [async ({}, use, workerInfo) => {
    await use()
    if (Object.keys(merged).length === 0) return
    const nycDir = path.join(process.cwd(), '.nyc_output')
    fs.mkdirSync(nycDir, { recursive: true })
    fs.writeFileSync(path.join(nycDir, `playwright-worker-${workerInfo.workerIndex}.json`), JSON.stringify(merged))
  }, { scope: 'worker', auto: true }],
  page: async ({ page }, use, testInfo) => {
    // Undo is by model snapshot (core/snapshot-history.ts); SE_COMMAND_UNDO=1 runs the suite on the commands' own (un)apply
    // instead, with the snapshot mirror checking every undo / redo against the snapshots (core/snapshot-mirror.ts)
    await page.addInitScript((commandUndo) => {
      globalThis.__SE_SNAPSHOT_MIRROR = commandUndo
      globalThis.__SE_SNAPSHOT_UNDO = !commandUndo
    }, process.env.SE_COMMAND_UNDO === '1')
    await use(page)

    if (testInfo.status === 'passed') {
      const problems = await page.evaluate(() => window.svgEditor?.svgCanvas?.snapshotMirror?.problems ?? []).catch(() => [])
      if (problems.length) {
        fs.mkdirSync('test-results', { recursive: true })
        fs.appendFileSync('test-results/snapshot-mirror.jsonl', JSON.stringify({ test: testInfo.titlePath.join(' › '), problems }) + '\n')
      }
    }

    // Drawing invariants (core/drawing-invariants.js): after every passing
    // test, the drawing in the page must still be structurally healthy. A test
    // that deliberately leaves a corrupt drawing behind opts out with
    //   test.info().annotations.push({ type: 'allow-corrupt-drawing', description: 'why' })
    if (testInfo.status === 'passed' && !testInfo.annotations.some((a) => a.type === 'allow-corrupt-drawing')) {
      // Only "page closed / not an editor page" may skip the check; an editor
      // page whose checker is missing or throws must fail, not pass silently.
      const result = await page
        .evaluate(() => {
          const canvas = window.svgEditor?.svgCanvas
          if (!canvas) return { editor: false, findings: [] }
          return { editor: true, findings: canvas.checkDrawing() }
        })
        .catch((err) => (page.isClosed() ? { editor: false, findings: [] } : { editor: true, findings: [{ code: 'check-failed', message: String(err) }] }))
      const findings = result.findings
      expect(findings, `drawing invariants violated after "${testInfo.title}"`).toEqual([])
    }

    const coverage = await page.evaluate(collectCoverage, Object.keys(merged))
    if (coverage) mergeCoverage(coverage)
  }
})

export { expect }
