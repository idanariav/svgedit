/**
 * The host harness's page half (roadmap R13): a fake Obsidian plugin that mounts one editor per leaf in one document, and
 * an opt-in clipboard double that behaves as a host's can. Installed with `page.addInitScript` before the page loads (see
 * `tests/e2e/host-harness.js`); a plain script, not a module.
 *
 * `window.host` mirrors `obsidian-svgedit-plugin/src/view/SvgView.ts`:
 *  - `open(id, svg)` mounts a leaf's editor as `initEditor` does (its config, a user-data store shared by every leaf,
 *    `documentChanged` → the leaf's dirty flag, `activate()` once it is the active leaf), then loads the drawing.
 *  - `load(id, svg)` is a same-leaf file switch: `clear()` then `setViewData()`, the load guarded as `isLoading` is.
 *  - `activate(id)` is `active-leaf-change`: the leaf's editor is told it is active, without a click.
 *  - `hide(id)` / `show(id)` are a background tab in the same pane (mounted, `display: none`).
 *  - `close(id)` fires `onClose()` and `onunload()` in one tick; without the plugin's guard, the editor's `destroy()` runs
 *    twice, as it can from a host that has none.
 *  - `adopt(id)` makes the page's own editor (`index.html`) the first leaf.
 *
 * `window.host.clipboard` is off until `install(opts)`: until then the browser's clipboard is used, so a test does not
 * drift from the real one. Installed, it owns `navigator.clipboard` and the copy / cut / paste events: Cmd/Ctrl+C / X / V
 * dispatch them (after the editor's own keydown has run, as a browser does), and
 *  - `writes: 'ok' | 'reject' | 'drop'` — `writeText` rejects (NotAllowedError), or resolves without writing; `drop` loses
 *    the native copy's data too (the host overwrote the clipboard)
 *  - `reads: 'ok' | 'reject'` — `readText` rejects
 *  - `nativePaste: false` — no `paste` event reaches a non-editable target (Electron); the editor's keydown fallback must
 *  - `text` — the clipboard's content; setting it is another app copying
 *  - `menuCopy()` — a host's Edit › Copy: a native copy with no keydown (Electron's menu role)
 * `log` records each event and call, for a failing test to show.
 */
/* eslint-disable no-var */
(() => {
  const leaves = new Map()
  let activeId = null
  // the plugin's settings: one store for every leaf (palette, shapes, hotkeys, …)
  const userData = {}
  const pair = (key) => [() => userData[key], (v) => { userData[key] = v }]
  const adapter = (() => {
    const a = { getFonts: async () => [], saveFont: async () => {} }
    for (const [name, key] of [['Palette', 'palette'], ['UserShapes', 'shapes'], ['Hotkeys', 'hotkeys'], ['Favorites', 'favorites'],
      ['Classes', 'classes'], ['DefaultClasses', 'defaultClasses'], ['Brushes', 'brushes'], ['CanvasPresets', 'presets'],
      ['CanvasLayouts', 'layouts']]) {
      const [get, set] = pair(key)
      a[`get${name}`] = get
      a[`set${name}`] = set
    }
    return a
  })()

  const pluginConfig = () => ({
    no_save_warning: true,
    initTool: 'select',
    hideTitle: true,
    hideTabletToggle: true,
    userDataAdapter: adapter,
    showlayers: false,
    disabledFeatures: ['opensave']
  })

  const leaf = (id) => {
    const l = leaves.get(id)
    if (!l) throw new Error(`host: no leaf "${id}"`)
    return l
  }

  /** what SvgView does once its editor's init() resolved */
  const wire = (l) => {
    l.editor.svgCanvas.bind('documentChanged', (_win, detail) => {
      if (l.loading) return
      l.changes.push(detail?.cause ?? null)
      l.dirty = true
    })
    l.editor.setDebugLogger?.((event, detail) => { l.log.push({ event, detail }) })
  }

  const setViewData = async (l, svg) => {
    // clear(): nothing to persist until the load lands
    l.dirty = false
    l.loading = true
    try {
      await l.editor.loadFromString(svg)
    } finally {
      l.loading = false
    }
  }

  const host = {
    leaves,
    get activeId () { return activeId },
    /** the page's own editor becomes leaf `id` */
    adopt (id) {
      const editor = window.svgEditor
      const l = { id, editor, container: editor.$container, dirty: false, loading: false, changes: [], log: [], adopted: true }
      leaves.set(id, l)
      wire(l)
      activeId = id
      editor.activate?.()
      return id
    },
    async open (id, svg, { active = true } = {}) {
      const Ctor = (leaves.values().next().value?.editor ?? window.svgEditor).constructor
      const container = document.createElement('div')
      container.className = 'host-leaf'
      container.dataset.leaf = id
      container.style.cssText = 'width:900px;height:700px;position:relative'
      document.body.append(container)
      const editor = new Ctor(container)
      editor.setConfig(pluginConfig())
      const l = { id, editor, container, dirty: false, loading: false, changes: [], log: [] }
      leaves.set(id, l)
      await editor.init()
      wire(l)
      if (svg) await setViewData(l, svg)
      if (active) host.activate(id)
      return id
    },
    load (id, svg) { return setViewData(leaf(id), svg) },
    activate (id) {
      activeId = id
      leaf(id).editor.activate?.()
    },
    hide (id) { leaf(id).container.style.display = 'none' },
    show (id) {
      const l = leaf(id)
      l.container.style.display = ''
      // Obsidian fires a resize on the leaf it shows; the editor has none to watch but the window's
      window.dispatchEvent(new Event('resize'))
    },
    /** onClose() and onunload() in one tick, with no guard between them */
    async close (id) {
      const l = leaf(id)
      const teardown = async () => { l.editor.destroy() }
      const errors = []
      await Promise.all([teardown(), teardown()].map((p) => p.catch((e) => errors.push(String(e?.stack ?? e)))))
      leaves.delete(id)
      if (!l.adopted) l.container.remove()
      if (activeId === id) activeId = null
      if (window.svgEditor === l.editor) window.svgEditor = leaves.values().next().value?.editor ?? l.editor
      return errors
    },
    editor (id) { return leaf(id).editor },
    canvas (id) { return leaf(id).editor.svgCanvas },
    /** the live leaves' editors, for the fixture's rest checks */
    editors () { return [...leaves.values()].map((l) => l.editor) },
    clipboard: null
  }

  // ── the clipboard double ──────────────────────────────────────────────────
  const clip = {
    installed: false,
    text: '',
    writes: 'ok',
    reads: 'ok',
    nativePaste: true,
    log: [],
    install (opts = {}) {
      Object.assign(clip, { writes: 'ok', reads: 'ok', nativePaste: true }, opts)
      if (clip.installed) return
      clip.installed = true
      const fake = {
        writeText: async (t) => {
          clip.log.push(`writeText:${clip.writes}`)
          if (clip.writes === 'reject') throw new DOMException('Write permission denied.', 'NotAllowedError')
          if (clip.writes === 'drop') return
          clip.text = String(t)
        },
        readText: async () => {
          clip.log.push(`readText:${clip.reads}`)
          if (clip.reads === 'reject') throw new DOMException('Read permission denied.', 'NotAllowedError')
          return clip.text
        }
      }
      Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => fake })
      // The browser's own clipboard events never reach the page: the double raises them.
      for (const type of ['copy', 'cut', 'paste']) {
        window.addEventListener(type, (e) => {
          if (e.isTrusted) { e.stopImmediatePropagation(); e.preventDefault() }
        }, true)
      }
      window.addEventListener('keydown', (e) => {
        if (!(e.metaKey || e.ctrlKey) || e.altKey) return
        const k = e.key.toLowerCase()
        const type = k === 'c' ? 'copy' : k === 'x' ? 'cut' : k === 'v' ? 'paste' : null
        // after the editor's own keydown (document, bubble), as a browser raises the clipboard event after the key
        if (type) setTimeout(() => clip.dispatch(type), 0)
      }, true)
    },
    target () { return document.activeElement || document.body },
    dispatch (type) {
      const dt = new DataTransfer()
      if (type === 'paste') {
        const t = clip.target()
        const editable = t.isContentEditable || t.nodeName === 'INPUT' || t.nodeName === 'TEXTAREA'
        if (!clip.nativePaste && !editable) { clip.log.push('paste:withheld'); return }
        dt.setData('text/plain', clip.text)
        clip.log.push('paste:native')
        t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true }))
        return
      }
      const ev = new ClipboardEvent(type, { clipboardData: dt, bubbles: true, cancelable: true, composed: true })
      clip.target().dispatchEvent(ev)
      // a handler that took the event wrote the clipboard; otherwise the browser copies the page's selected text
      const data = ev.defaultPrevented ? dt.getData('text/plain') : String(document.getSelection() ?? '')
      clip.log.push(`${type}:${ev.defaultPrevented ? 'handled' : 'browser'}:${clip.writes}`)
      if (data && clip.writes !== 'drop') clip.text = data
    },
    menuCopy () { clip.dispatch('copy') }
  }
  host.clipboard = clip
  window.host = host
})()
