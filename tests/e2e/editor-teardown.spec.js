import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Every closed Obsidian tab destroys its editor. Any document/window listener
// that survives Editor.destroy() keeps the dead editor's DOM alive, so the live
// listener count must be flat across mount/destroy cycles.
test('mounting and destroying editors does not accumulate document/window listeners', async ({ page }) => {
  await page.addInitScript(() => {
    const tracked = []
    const add = EventTarget.prototype.addEventListener
    const remove = EventTarget.prototype.removeEventListener
    const capOf = (o) => (typeof o === 'boolean' ? o : Boolean(o?.capture))
    EventTarget.prototype.addEventListener = function (type, fn, opts) {
      if ((this === document || this === window) && fn) {
        tracked.push({ target: this, type, fn, capture: capOf(opts), signal: opts?.signal, removed: false, stack: new Error().stack })
      }
      return add.call(this, type, fn, opts)
    }
    EventTarget.prototype.removeEventListener = function (type, fn, opts) {
      for (const t of tracked) {
        if (!t.removed && t.target === this && t.type === type && t.fn === fn && t.capture === capOf(opts)) t.removed = true
      }
      return remove.call(this, type, fn, opts)
    }
    // Live listeners registered after `mark` (an index into `tracked`), with the
    // registering stack, to make a failing diff actionable.
    window.__liveSince = (mark) => tracked.slice(mark)
      .filter(t => !t.removed && !t.signal?.aborted)
      .map(t => `${t.type}: ${t.stack.split('\n').slice(2, 6).join(' | ')}`)
    window.__mark = () => tracked.length
    window.__liveListeners = () => {
      const counts = {}
      for (const t of tracked) {
        if (t.removed || t.signal?.aborted) continue
        const key = `${t.target === window ? 'window' : 'document'}:${t.type}`
        counts[key] = (counts[key] || 0) + 1
      }
      return counts
    }
  })

  await visitAndApproveStorage(page)

  const cycle = () => page.evaluate(async () => {
    const Ctor = window.svgEditor.constructor
    const primary = window.svgEditor
    const host = document.createElement('div')
    host.style.cssText = 'width:800px;height:600px'
    document.body.append(host)
    const ed = new Ctor(host)
    ed.setConfig({ allowInitialUserOverride: true, extensions: [], noDefaultExtensions: false })
    await ed.init()
    ed.destroy()
    host.remove()
    window.svgEditor = primary
  })

  await cycle() // warm-up: one-time module-level listeners
  const baseline = await page.evaluate(() => window.__liveListeners())
  const mark = await page.evaluate(() => window.__mark())
  for (let i = 0; i < 3; i++) await cycle()
  const after = await page.evaluate(() => window.__liveListeners())

  const leaked = await page.evaluate((m) => window.__liveSince(m), mark)
  expect(after, `leaked listeners:\n${leaked.join('\n')}`).toEqual(baseline)
})
