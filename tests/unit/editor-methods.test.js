import { describe, expect, it, vi, beforeEach } from 'vitest'

import Editor from '../../src/editor/Editor.ts'

/** The methods under test only read a few members of `this`, so they run on a stand-in. */
const call = (name, self, ...args) => Editor.prototype[name].call(self, ...args)

describe('Editor.cancelOverlays (the source dialog\'s Done button)', () => {
  let self
  beforeEach(() => {
    const dialog = document.createElement('div')
    dialog.setAttribute('dialog', 'open')
    self = {
      $req: vi.fn(() => dialog),
      docprops: false,
      configObj: { preferences: false },
      i18next: { t: (key) => key },
      svgCanvas: { getSvgString: () => '<svg/>' },
      hideSourceEditor: vi.fn()
    }
  })

  it('closes at once when the source is unchanged', async () => {
    globalThis.seConfirm = vi.fn()
    await call('cancelOverlays', self, new CustomEvent('change', { detail: { value: '<svg/>' } }))
    expect(globalThis.seConfirm).not.toHaveBeenCalled()
    expect(self.hideSourceEditor).toHaveBeenCalledTimes(1)
  })

  it('waits for the answer when the source changed: Cancel keeps the dialog open', async () => {
    globalThis.seConfirm = vi.fn(() => Promise.resolve('Cancel'))
    await call('cancelOverlays', self, new CustomEvent('change', { detail: { value: '<svg>edited</svg>' } }))
    expect(globalThis.seConfirm).toHaveBeenCalledTimes(1)
    expect(self.hideSourceEditor).not.toHaveBeenCalled()
  })

  it('waits for the answer when the source changed: Ok closes it', async () => {
    globalThis.seConfirm = vi.fn(() => Promise.resolve('Ok'))
    await call('cancelOverlays', self, new CustomEvent('change', { detail: { value: '<svg>edited</svg>' } }))
    expect(self.hideSourceEditor).toHaveBeenCalledTimes(1)
  })
})

describe('Editor.loadFromDataURI', () => {
  const ready = (cb) => Promise.resolve().then(cb)

  it('decodes a base64 or a percent-encoded SVG data URI and loads it', async () => {
    const self = { ready, loadSvgString: vi.fn() }
    await call('loadFromDataURI', self, `data:image/svg+xml;base64,${btoa('<svg id="a"/>')}`)
    await call('loadFromDataURI', self, `data:image/svg+xml,${encodeURIComponent('<svg id="b"/>')}`)
    expect(self.loadSvgString.mock.calls.map((c) => c[0])).toEqual(['<svg id="a"/>', '<svg id="b"/>'])
  })

  it('rejects, with a message, for anything that is not an SVG data URI', async () => {
    const self = { ready, loadSvgString: vi.fn() }
    await expect(call('loadFromDataURI', self, 'data:text/plain,hello')).rejects.toThrow('Not an SVG data URI')
    expect(self.loadSvgString).not.toHaveBeenCalled()
  })
})

describe('Editor.zoomChanged', () => {
  it('hands a degenerate zoom to the bottom panel instead of calling a method that does not exist', () => {
    const self = {
      workarea: document.createElement('div'),
      svgCanvas: { setBBoxZoom: () => ({ zoom: 0.0001, bbox: { x: 0, y: 0, width: 1, height: 1 } }) },
      bottomPanel: { changeZoom: vi.fn() }
    }
    call('zoomChanged', self, window, { x: 0, y: 0, width: 1, height: 1 })
    expect(self.bottomPanel.changeZoom).toHaveBeenCalledWith(0.1)
  })
})

describe('Editor.loadFromURL', () => {
  const ready = (cb) => Promise.resolve().then(cb)
  const make = () => ({ ready, loadSvgString: vi.fn(), i18next: { t: (key) => key } })

  it('loads the fetched text', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve('<svg id="a"/>') }))
    const self = make()
    await call('loadFromURL', self, 'x.svg')
    expect(self.loadSvgString).toHaveBeenCalledWith('<svg id="a"/>', { noAlert: undefined })
  })

  it('alerts once and loads nothing when the response is not ok', async () => {
    globalThis.seAlert = vi.fn()
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, text: () => Promise.resolve('<html>404</html>') }))
    const self = make()
    await call('loadFromURL', self, 'missing.svg')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(globalThis.seAlert).toHaveBeenCalledTimes(1)
    expect(self.loadSvgString).not.toHaveBeenCalled()
  })
})
