import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Command sweep (VectorCraft: crates/engine/tests/command_sweep.rs): run every
// registry command that isn't interactive against every reference drawing, with
// a representative element of each kind selected, and assert that it
//   - throws nothing but a `disabled` CommandError and logs no error,
//   - leaves a structurally healthy drawing (core/drawing-invariants.js),
//   - is one clean undo step: undo restores the exact markup, redo the edited one.
// A run that changes the markup without recording any undo step is reported too
// (except for commands that only toggle persistent editor/view state: VIEW_STATE).
//
// CI runs a deterministic subset (2 elements per drawing); SWEEP=full runs up to 8.
const FIXTURES = path.resolve('tests/e2e/fixtures/roundtrip')
// Toggle editor/view state that is deliberately not an undo step (and persists across
// loads, which would leak between sweep iterations): layer lock/dim.
const VIEW_STATE = new Set(['tool_layerView'])
// Problems the sweep found that are real but not fixed yet (each is in techdebt.md).
// A listed problem is tolerated; one that stops reproducing fails the run so the entry gets deleted.
const KNOWN_ISSUES = [
  {
    file: 'text-on-path.svg',
    commands: ['tool_delete', 'tool_delete_multi', 'delete_selected', 'cut', 'tool_stroke_to_path'],
    match: /<textPath> href=\\?"#\S+?\\?" references a missing element/,
    why: 'deleting (or stroke-converting) a path leaves the <textPath> that runs along it pointing at nothing'
  },
  {
    file: 'mirror.svg',
    commands: ['tool_topath'],
    match: /redo did not reproduce the edit/,
    why: 'redoing Object-to-Path on a mirrored shape re-syncs its twin from a style-less path (ext-mirror)'
  }
]
const MAX_ELEMENTS = process.env.SWEEP === 'full' ? 8 : 2

test.describe.configure({ mode: 'parallel' })

for (const file of fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.svg')).sort()) {
  test(`every command is safe and undoable on ${file}`, async ({ page }) => {
    test.setTimeout(240000)
    const svg = fs.readFileSync(path.join(FIXTURES, file), 'utf8')
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.configObj.pref('tabletMode', false, true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })

    const report = await page.evaluate(async ({ svg, maxElements, viewState }) => {
      const ed = window.svgEditor
      const c = ed.svgCanvas
      const logged = []
      ed.setLogSink((level, info) => { if (level === 'error') logged.push(`[${current.id}] ${info.message} ${info.data?.message ?? ''}`.trim()) }, 1)
      const problems = []
      const current = { id: null }
      const openedDialog = new Set()
      const ran = new Set()

      // Canonical markup of the drawing's content. Not getSvgString(): serialising purges
      // unused <defs> from the live DOM (svg-exec.js), which would itself break undo. Not
      // innerHTML either: undo re-sets attributes (so their order changes) and the layer
      // being "current" toggles its pointer-events style, neither of which is document state.
      // The root's own attributes are view state too (zoom sets x/y), so only children count.
      const snap = () => {
        const clone = c.getSvgContent().cloneNode(true)
        for (const el of [clone, ...clone.querySelectorAll('*')]) {
          if (el === clone) continue
          // Effect filters (data-fx) get their region recomputed from the shape's bbox on every
          // `changed` by the glow / outline extensions: derived numbers, not document state.
          if (el.localName === 'filter' && el.hasAttribute('data-fx')) for (const a of ['x', 'y', 'width', 'height']) el.removeAttribute(a)
          const attrs = [...el.attributes].map((a) => [a.name, a.value]).sort(([a], [b]) => (a < b ? -1 : 1))
          for (const [name] of attrs) el.removeAttribute(name)
          for (const [name, value] of attrs) {
            if (name === 'style') {
              const kept = value.split(';').map((d) => d.trim()).filter((d) => d && !d.startsWith('pointer-events'))
              if (kept.length) el.setAttribute('style', kept.join('; '))
            } else {
              el.setAttribute(name, value)
            }
          }
        }
        return clone.innerHTML
      }

      const reset = async () => {
        await ed.loadFromString(svg)
        c.setMode('select')
        c.clearSelection()
      }
      const closeDialogs = () => {
        const open = [...document.querySelectorAll('[dialog="open"]')]
        for (const d of open) d.setAttribute('dialog', 'close')
        return open.length > 0
      }
      const pickTargets = () => {
        const seen = new Set()
        const out = []
        for (const el of c.getSvgContent().querySelectorAll('g.layer *')) {
          if (!el.id || ['title', 'defs', 'tspan', 'stop', 'linearGradient', 'radialGradient', 'filter', 'marker', 'clipPath', 'mask', 'symbol', 'pattern', 'style', 'desc', 'metadata'].includes(el.localName)) continue
          if (el.closest('defs')) continue
          if (seen.has(el.localName)) continue
          seen.add(el.localName)
          out.push(el.id)
          if (out.length >= maxElements) break
        }
        return out
      }

      await reset()
      const targets = pickTargets()
      for (const target of targets) {
        await reset()
        c.selectOnly([document.getElementById(target)])
        const ids = ed.commands.list()
          .filter((cmd) => cmd.enabled && !cmd.interactive && !viewState.includes(cmd.id) && !Object.values(cmd.params ?? {}).some((p) => p.required))
          .map((cmd) => cmd.id)

        for (const id of ids) {
          await reset()
          const el = document.getElementById(target)
          if (!el) continue
          c.selectOnly([el])
          const pre = snap()
          const undoBefore = c.undoMgr.getUndoStackSize()
          let outcome = 'ran'
          current.id = id
          try {
            ed.commands.run(id)
          } catch (err) {
            if (err.code === 'disabled') outcome = 'disabled'
            else {
              outcome = 'failed'
              problems.push(`${target}: ${id} threw ${err.code ?? err.name}: ${err.message}`)
            }
          }
          if (closeDialogs()) {
            openedDialog.add(id)
            outcome = 'dialog'
          }
          c.cancelToolGesture?.()
          if (outcome !== 'ran') continue
          ran.add(id)
          c.setMode('select')

          const findings = c.checkDrawing()
          if (findings.length) problems.push(`${target}: ${id} left an unhealthy drawing: ${JSON.stringify(findings)}`)

          const post = snap()
          const steps = c.undoMgr.getUndoStackSize() - undoBefore
          if (steps === 0) {
            if (post !== pre) problems.push(`${target}: ${id} changed the drawing without recording an undo step`)
            continue
          }
          for (let i = 0; i < steps; i++) c.undoMgr.undo()
          if (snap() !== pre) problems.push(`${target}: ${id} undo did not restore the drawing`)
          for (let i = 0; i < steps; i++) c.undoMgr.redo()
          if (snap() !== post) problems.push(`${target}: ${id} redo did not reproduce the edit`)
          for (let i = 0; i < steps; i++) c.undoMgr.undo()
          if (snap() !== pre) problems.push(`${target}: ${id} second undo did not restore the drawing`)
        }
      }
      ed.setLogSink(null)
      return { problems, logged, targets, ran: [...ran], dialogs: [...openedDialog] }
    }, { svg, maxElements: MAX_ELEMENTS, viewState: [...VIEW_STATE] })

    // Known issues are tolerated; one that no longer reproduces must be removed from the list.
    const known = KNOWN_ISSUES.filter((k) => k.file === file)
    const tolerated = new Set()
    const isKnown = (problem) => known.some((k) => k.commands.some((id) => problem.includes(`: ${id} `)) && k.match.test(problem) && tolerated.add(k))
    report.problems = report.problems.filter((p) => !isKnown(p))
    for (const k of known) expect(tolerated.has(k), `known issue no longer reproduces -- delete it from KNOWN_ISSUES: ${k.why}`).toBe(true)

    console.log(`SWEEP ${file}: ${report.targets.length} elements, ${report.ran.length} commands ran, dialogs: ${report.dialogs.join(',')}`)
    if (report.problems.length || report.logged.length) {
      console.log(`SWEEPDETAIL ${file} ${JSON.stringify({ problems: report.problems, logged: [...new Set(report.logged)] })}`)
    }
    expect(report.logged, 'logger errors during the sweep').toEqual([])
    expect(report.problems).toEqual([])
    expect(report.ran.length).toBeGreaterThan(5)
  })
}
