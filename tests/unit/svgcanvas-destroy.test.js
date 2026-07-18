import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

// Regression guard: SvgCanvas registered a window 'storage' listener in its
// constructor with no removal path. Every closed drawing view kept its
// entire SvgCanvas (and DOM subtree) reachable via that listener closure for
// the life of the window, and dead instances kept reacting to storage
// events indefinitely. destroy() must remove it.
describe('SvgCanvas#destroy', function () {
  const CLIPBOARD_KEY = 'svgedit_clipboard'
  let liveCanvases

  const canvasOptions = {
    canvas_expansion: 3,
    dimensions: [640, 480],
    initFill: { color: 'FF0000', opacity: 1 },
    initStroke: { width: 5, color: '000000', opacity: 1 },
    initOpacity: 1,
    imgPath: '../editor/images',
    langPath: 'locale/',
    extPath: 'extensions/',
    extensions: [],
    initTool: 'select',
    wireframe: false
  }

  const makeCanvas = (container) => {
    const canvas = new SvgCanvas(container, canvasOptions)
    liveCanvases.push(canvas)
    return canvas
  }

  beforeEach(() => {
    document.body.textContent = ''
    const svgEditor = document.createElement('div')
    svgEditor.id = 'svg_editor'
    const svgcanvas = document.createElement('div')
    svgcanvas.style.visibility = 'hidden'
    svgcanvas.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(svgcanvas)
    const toolsLeft = document.createElement('div')
    toolsLeft.id = 'tools_left'
    svgEditor.append(workarea, toolsLeft)
    document.body.append(svgEditor)

    liveCanvases = []
    sessionStorage.removeItem(CLIPBOARD_KEY)
  })

  afterEach(() => {
    // Each test's SvgCanvas registers a real window 'storage' listener;
    // without cleanup a leftover instance from one test would keep reacting
    // to storage events dispatched by the next test.
    liveCanvases.forEach((c) => c.destroy())
  })

  it('mirrors another tab\'s clipboard into sessionStorage while alive', () => {
    makeCanvas(document.getElementById('svgcanvas'))

    window.dispatchEvent(new StorageEvent('storage', { key: CLIPBOARD_KEY, newValue: 'from-other-tab' }))

    expect(sessionStorage.getItem(CLIPBOARD_KEY)).toBe('from-other-tab')
  })

  it('stops reacting to storage events once destroyed', () => {
    const svgCanvas = makeCanvas(document.getElementById('svgcanvas'))
    svgCanvas.destroy()

    window.dispatchEvent(new StorageEvent('storage', { key: CLIPBOARD_KEY, newValue: 'from-other-tab' }))

    expect(sessionStorage.getItem(CLIPBOARD_KEY)).toBeNull()
  })

  it('does not affect a second, still-live instance sharing the window', () => {
    const first = makeCanvas(document.getElementById('svgcanvas'))
    // A second instance mounted in the same window/document (multi-drawing host).
    const secondContainer = document.createElement('div')
    secondContainer.id = 'svgcanvas2'
    document.body.append(secondContainer)
    makeCanvas(secondContainer)

    first.destroy()

    window.dispatchEvent(new StorageEvent('storage', { key: CLIPBOARD_KEY, newValue: 'still-alive' }))

    expect(sessionStorage.getItem(CLIPBOARD_KEY)).toBe('still-alive')
  })
})
