import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// The key that activates a tool is drawn at the bottom right of its icon in the left panel and on the top panel's buttons; a
// tool without a key has no badge, and a rebinding in the Hotkey Manager shows at once.
test.describe('Tool shortcut badges', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate(() => {
      window.svgEditor.configObj.pref('uiMode', 'desktop', true)
      document.querySelector('.svg_editor')?.classList.remove('ui-tablet')
    })
  })

  /** The badge a tool shows: its attribute and what the browser paints. */
  const badge = (page, id) => page.evaluate((i) => {
    const el = document.getElementById(i)
    const painted = getComputedStyle(el, '::after').content
    return { attr: el.getAttribute('data-shortcut'), painted: painted === 'none' || painted === 'normal' ? null : painted.replace(/^"|"$/g, '') }
  }, id)

  test('tools with a key show it, and tools without one stay empty', async ({ page }) => {
    expect(await badge(page, 'tool_select')).toEqual({ attr: 'V', painted: 'V' })
    expect(await badge(page, 'tool_text')).toEqual({ attr: 'T', painted: 'T' })
    expect(await badge(page, 'tool_shaper')).toEqual({ attr: '⇧N', painted: '⇧N' })
    expect((await badge(page, 'ext-panning')).attr).toBeNull()
    expect((await badge(page, 'tool_shapelib')).attr).toBeNull()
    expect((await badge(page, 'ext-panning')).painted).toBeNull()
  })

  test('the badge sits at the bottom right of the button', async ({ page }) => {
    const pos = await page.evaluate(() => {
      const el = document.getElementById('tool_select')
      const s = getComputedStyle(el, '::after')
      return { position: s.position, right: s.right, bottom: s.bottom, host: getComputedStyle(el).position }
    })
    expect(pos).toMatchObject({ position: 'absolute', host: 'relative' })
    expect(parseFloat(pos.right)).toBeLessThan(8)
    expect(parseFloat(pos.bottom)).toBeLessThan(8)
  })

  test('a rebinding changes the badge at once; removing the key removes it', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.hotkeys.addKey('tool_shapelib', 'alt+s'))
    await expect.poll(() => badge(page, 'tool_shapelib').then((b) => b.attr)).toBe('⌥S')
    await page.evaluate(() => window.svgEditor.hotkeys.removeKey('tool_select', 'v'))
    await expect.poll(() => badge(page, 'tool_select').then((b) => b.attr)).toBeNull()
    await page.evaluate(() => window.svgEditor.hotkeys.resetAll())
    await expect.poll(() => badge(page, 'tool_select').then((b) => b.attr)).toBe('V')
    await expect.poll(() => badge(page, 'tool_shapelib').then((b) => b.attr)).toBeNull()
  })

  test('the Shapes flyout shows the key of the shape it will activate', async ({ page }) => {
    expect((await badge(page, 'tools_shapes')).attr).toBe('R')
    await page.evaluate(() => window.svgEditor.hotkeys.addKey('tools_shapes', 'alt+1'))
    await expect.poll(() => badge(page, 'tools_shapes').then((b) => b.attr)).toBe('⌥1')
  })

  test('the top panel\'s buttons show their keys too, painted like the tools\'', async ({ page }) => {
    expect(await badge(page, 'tool_frame')).toEqual({ attr: 'U', painted: 'U' })
    expect(await badge(page, 'tool_wireframe')).toEqual({ attr: 'F', painted: 'F' })
    // Cmd on macOS, Ctrl elsewhere (CI runs on Linux)
    expect((await badge(page, 'tool_undo')).attr).toMatch(/^[⌘⌃]Z$/)
    // no key, no badge
    expect((await badge(page, 'tool_smart_snap')).attr).toBeNull()
    const pos = await page.evaluate(() => {
      const el = document.getElementById('tool_wireframe')
      const s = getComputedStyle(el, '::after')
      return { position: s.position, host: getComputedStyle(el).position }
    })
    expect(pos).toEqual({ position: 'absolute', host: 'relative' })
  })

  test('a rebinding of a top-panel button shows at once', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.hotkeys.addKey('tool_smart_snap', 'alt+g'))
    await expect.poll(() => badge(page, 'tool_smart_snap').then((b) => b.attr)).toBe('⌥G')
    await page.evaluate(() => window.svgEditor.hotkeys.removeKey('tool_wireframe', 'f'))
    await expect.poll(() => badge(page, 'tool_wireframe').then((b) => b.attr)).toBeNull()
    await page.evaluate(() => window.svgEditor.hotkeys.resetAll())
    await expect.poll(() => badge(page, 'tool_wireframe').then((b) => b.attr)).toBe('F')
    await expect.poll(() => badge(page, 'tool_smart_snap').then((b) => b.attr)).toBeNull()
  })
})
