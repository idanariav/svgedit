import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seZoom.js'
import '../../../src/editor/components/seFlyingButton.js'
import '../../../src/editor/components/seToolOverflow.js'
import '../../../src/editor/components/seListItem.js'
import '../../../src/editor/components/seList.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

// Components that listen on document/window must release those listeners when
// removed, otherwise every closed editor pane leaks handlers (and the DOM).
describe.each(['se-zoom', 'se-flyingbutton', 'se-tool-overflow', 'se-list'])('%s global listeners', (tag) => {
  beforeEach(() => installMockSvgEditor())
  afterEach(() => {
    vi.restoreAllMocks()
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('aborts its document/window listeners when disconnected', () => {
    const signals = []
    for (const target of [document, window]) {
      const orig = target.addEventListener.bind(target)
      vi.spyOn(target, 'addEventListener').mockImplementation((type, fn, opts) => {
        if (opts?.signal) signals.push(opts.signal)
        return orig(type, fn, opts)
      })
    }
    let el
    if (tag === 'se-list') {
      // se-list's constructor reads its light-DOM items, so build them together.
      const wrap = document.createElement('div')
      wrap.innerHTML = '<se-list><se-list-item value="a" option="a"></se-list-item></se-list>'
      document.body.append(wrap)
      el = wrap.querySelector('se-list')
    } else {
      el = mountElement(tag)
    }
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every(s => !s.aborted)).toBe(true)
    el.remove()
    expect(signals.every(s => s.aborted)).toBe(true)
  })
})
