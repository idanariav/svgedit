import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage } from './helpers.js'

// Cmd/Ctrl+C in one drawing, Cmd/Ctrl+V in another: the Obsidian plugin mounts one editor per pane in one document. In
// Obsidian (Electron) keyboard paste failed between drawings while the menu's Paste worked: the system clipboard no longer
// held the copied shapes when Cmd+V came, and the native paste handler gave up on text it did not recognise. The copy now
// writes the shapes on the native copy event itself, and a paste of unrecognised text falls back to what was copied.
test.describe('Keyboard copy and paste between two editors', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer"><title>Layer 1</title>
        <rect id="src" x="100" y="100" width="80" height="60" fill="#f00"/>
      </g>
    </svg>`)
    await page.evaluate(async () => {
      const a = window.svgEditor
      window.editorA = a
      const note = document.createElement('p')
      note.id = 'note'
      note.textContent = 'some note text'
      document.body.append(note)
      const host = document.createElement('div')
      host.style.cssText = 'width:900px;height:700px'
      document.body.append(host)
      const b = new a.constructor(host)
      b.setConfig({ allowInitialUserOverride: true, extensions: [], noDefaultExtensions: false })
      await b.init()
      window.editorB = b
      window.svgEditor = a
    })
  })

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => { window.editorB?.destroy(); window.svgEditor = window.editorA })
  })

  const reds = (page, which) => page.evaluate((w) => window[w].svgCanvas.getSvgContent().querySelectorAll('rect[fill="#f00"]').length, which)
  const clipboardText = (page) => page.evaluate(() => navigator.clipboard.readText())
  /** a real click on an editor's canvas, as a user switching drawings does */
  const clickInto = async (page, which) => {
    const box = await page.evaluate((w) => {
      window[w].$container.scrollIntoView()
      const r = window[w].$container.querySelector('#workarea').getBoundingClientRect()
      return { x: r.left + 20, y: r.top + 20 }
    }, which)
    await page.mouse.click(box.x, box.y)
  }
  const copyInA = async (page) => {
    await page.evaluate(() => {
      const c = window.editorA.svgCanvas
      c.selectOnly([c.getElement('src')])
      window.editorA.$container.focus()
    })
    await page.keyboard.press(`${mod}+c`)
  }

  test('a shape copied in A pastes into B', async ({ page }) => {
    await copyInA(page)
    await clickInto(page, 'editorB')
    await page.keyboard.press(`${mod}+v`)
    await expect.poll(() => reds(page, 'editorB')).toBe(1)
    expect(await reds(page, 'editorA')).toBe(1)
  })

  test('the copy puts the shapes on the system clipboard even when the async clipboard write fails', async ({ page }) => {
    await page.evaluate(async () => {
      await navigator.clipboard.writeText('stale text') // what the clipboard held before
      navigator.clipboard.writeText = () => Promise.reject(new Error('blocked by host'))
    })
    await copyInA(page)
    expect(await clipboardText(page)).toMatch(/^\[\{"element":"rect"/)
  })

  test('Cmd+V pastes the copied shapes when the system clipboard holds something else', async ({ page }) => {
    await copyInA(page)
    // a host that took the clipboard back after the copy
    await page.evaluate(() => navigator.clipboard.writeText('unrelated text'))
    await clickInto(page, 'editorB')
    await page.keyboard.press(`${mod}+v`)
    await expect.poll(() => reds(page, 'editorB')).toBe(1)
  })

  /** dispatch a native-like copy event at the page; what the drawing's listener did with it */
  const nativeCopy = (page, { pageText }) => page.evaluate((withText) => {
    const c = window.editorA.svgCanvas
    c.selectOnly([c.getElement('src')])
    window.editorA.$container.focus()
    document.getSelection().removeAllRanges()
    if (withText) {
      const range = document.createRange()
      range.selectNodeContents(document.getElementById('note'))
      document.getSelection().addRange(range)
    }
    const clipboardData = new DataTransfer()
    const e = new ClipboardEvent('copy', { clipboardData, bubbles: true, cancelable: true })
    window.editorA.$container.dispatchEvent(e)
    return { prevented: e.defaultPrevented, text: clipboardData.getData('text/plain') }
  }, pageText)

  test('a native copy (a host menu Copy) in the drawing carries the selected shapes', async ({ page }) => {
    const r = await nativeCopy(page, { pageText: false })
    expect(r.prevented).toBe(true)
    expect(r.text).toMatch(/^\[\{"element":"rect"/)
  })

  test('a native copy with text selected in the page outside the drawing is left to the browser', async ({ page }) => {
    const r = await nativeCopy(page, { pageText: true })
    expect(r.prevented).toBe(false)
    expect(r.text).toBe('')
  })
})
