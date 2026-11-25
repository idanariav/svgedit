/**
 * The host harness (roadmap R13): e2e tests under the conditions the Obsidian plugin runs the editor in — one editor per
 * leaf in one document, the view lifecycle firing as Obsidian fires it, a clipboard that can fail as a host's can. The
 * page half is `harness/host-page.js` (`window.host`); the fixture's rest checks run on every leaf's editor.
 */
import path from 'node:path'
import { visitAndApproveStorage } from './helpers.js'

// the suite runs from the repo root (playwright.config.mjs, as fixtures.js's coverage path assumes)
const HOST_PAGE = path.join(process.cwd(), 'tests', 'e2e', 'harness', 'host-page.js')

export const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

/** A minimal drawing with one shape of `fill`, ids namespaced by `ns` (as the plugin namespaces each drawing's ids). */
export const drawing = (ns, fill = '#f00', { x = 100, y = 100 } = {}) => `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
  <g class="layer"><title>Layer 1</title><rect id="${ns}_r" x="${x}" y="${y}" width="80" height="60" fill="${fill}"/></g>
</svg>`

/**
 * Load the editor page with the harness installed, the page's editor adopted as leaf `a` (holding `drawing('a')`), and
 * the clipboard double installed with `clipboard` when given (otherwise the browser's own clipboard is used).
 */
export async function mountHost (page, { clipboard } = {}) {
  await page.addInitScript({ path: HOST_PAGE })
  await visitAndApproveStorage(page)
  await page.evaluate(async ({ svg, clipboard }) => {
    if (clipboard) window.host.clipboard.install(clipboard)
    window.host.adopt('a')
    await window.host.load('a', svg)
  }, { svg: drawing('a'), clipboard })
}

/** Open leaf `id` holding `svg`, as Obsidian opens a drawing in a new pane (it becomes the active leaf unless `active: false`). */
export const openLeaf = (page, id, svg, opts) => page.evaluate(({ id, svg, opts }) => window.host.open(id, svg, opts), { id, svg, opts })

/** A real click inside leaf `id`'s canvas, away from its shapes (a user moving into that drawing). */
export async function clickInto (page, id) {
  const box = await page.evaluate((id) => {
    const c = window.host.leaves.get(id).container
    c.scrollIntoView()
    const r = c.querySelector('#workarea').getBoundingClientRect()
    return { x: r.left + 15, y: r.top + 15 }
  }, id)
  await page.mouse.click(box.x, box.y)
}

/** How many shapes of `fill` leaf `id`'s drawing holds. */
export const countFill = (page, id, fill = '#f00') =>
  page.evaluate(({ id, fill }) => window.host.canvas(id).getSvgContent().querySelectorAll(`[fill="${fill}"]`).length, { id, fill })

/** Select the shape `elId` in leaf `id`, by the canvas API. */
export const selectIn = (page, id, elId) =>
  page.evaluate(({ id, elId }) => { const c = window.host.canvas(id); c.selectOnly([c.getElement(elId)]) }, { id, elId })
