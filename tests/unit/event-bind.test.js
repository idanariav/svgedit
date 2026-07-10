import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

// `bind`/`call` used to be backed by a single-slot `events` object, so a
// second `bind()` for the same name silently replaced the first handler
// (svgedit's TabletShell and the Obsidian plugin both worked around this by
// monkey-patching / manually chaining the previous handler). They're now
// backed by the native EventTarget SvgCanvas extends, so every bound handler
// fires.
describe('SvgCanvas#bind / #call', function () {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
    const container = document.createElement('div')
    document.body.append(container)
    svgCanvas = new SvgCanvas(container, {
      dimensions: [640, 480],
      initFill: { color: 'FF0000', opacity: 1 },
      initStroke: { width: 5, color: '000000', opacity: 1 },
      initOpacity: 1
    })
  })

  it('invokes every handler bound to the same event name, in order', () => {
    const calls = []
    svgCanvas.bind('changed', (win, arg) => calls.push(['first', win, arg]))
    svgCanvas.bind('changed', (win, arg) => calls.push(['second', win, arg]))

    svgCanvas.call('changed', ['elem'])

    expect(calls).toEqual([
      ['first', window, ['elem']],
      ['second', window, ['elem']]
    ])
  })

  it('is a no-op when nothing is bound to the event name', () => {
    expect(() => svgCanvas.call('unbound_event', 42)).not.toThrow()
  })
})
