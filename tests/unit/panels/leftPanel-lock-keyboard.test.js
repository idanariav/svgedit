import { describe, expect, it, vi, beforeEach } from 'vitest'

// See topPanel-path-tools.test.js for why @svgedit/svgcanvas is mocked here.
// $click mirrors the real dom-utils.js implementation (a plain
// addEventListener wrapper) rather than a no-op, because this suite asserts
// on the *order* two listeners on the same 'click'/'keydown' events run in.
vi.mock('@svgedit/svgcanvas', () => ({
  default: {
    $click: (el, handler) => el.addEventListener('click', handler)
  }
}))

const { default: LeftPanel } = await import('../../../src/editor/panels/LeftPanel.js')

/**
 * Builds a real LeftPanel, running its actual init() (using the real
 * LeftPanel.html template) plus the extensions_added-triggered
 * finalizeToolOrder() — the function that wires the Shift+Enter lock
 * shortcut alongside toolDragReorder.js's own keyboard handling.
 */
const buildLeftPanel = () => {
  const root = document.createElement('div')
  document.body.append(root)
  const $id = (id) => root.querySelector(`[id="${id}"]`)
  const $qa = (sel) => Array.from(root.querySelectorAll(sel))

  // se-image-import-dialog lives outside LeftPanel's own partial template
  // (rendered elsewhere in the full editor shell) — init() only needs
  // something addEventListener-able at that id, not the real dialog.
  const imageImportDialog = document.createElement('div')
  imageImportDialog.id = 'se-image-import-dialog'
  root.append(imageImportDialog)

  const extensionsAddedHandlers = []
  const editor = {
    $svgEditor: root,
    $id,
    $qa,
    svgCanvas: {
      bind: (evt, cb) => { if (evt === 'extensions_added') extensionsAddedHandlers.push(cb) },
      setToolLocked: vi.fn(),
      setMode: vi.fn()
    }
  }

  const leftPanel = new LeftPanel(editor)
  leftPanel.init()
  extensionsAddedHandlers.forEach((cb) => cb())

  return { leftPanel, $id, editor }
}

const shiftEnter = (el) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }))
}

const plainEnter = (el) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
}

describe('LeftPanel keyboard lock (Shift+Enter)', () => {
  let $id, editor

  beforeEach(() => {
    ({ $id, editor } = buildLeftPanel())
  })

  it('locks a lockable tool and calls setToolLocked(true)', () => {
    const pathTool = $id('tool_path')

    shiftEnter(pathTool)

    expect(pathTool.getAttribute('locked')).toBe('true')
    expect(editor.svgCanvas.setToolLocked).toHaveBeenLastCalledWith(true)
  })

  it('does not lock on plain Enter (no shift)', () => {
    const pathTool = $id('tool_path')

    plainEnter(pathTool)

    expect(pathTool.hasAttribute('locked')).toBe(false)
  })

  it('ignores Shift+Enter on a non-lockable tool', () => {
    // tool_select has a real click binding (clickSelect -> updateLeftPanel),
    // and toolDragReorder.js's own keydown listener forwards *any* Enter
    // (shift or not) to el.click() — so setToolLocked(false) still fires as
    // that pre-existing, unrelated side effect. What this fix must not do is
    // ever request a lock for a non-lockable tool.
    const selectTool = $id('tool_select')

    expect(() => shiftEnter(selectTool)).not.toThrow()
    expect(selectTool.hasAttribute('locked')).toBe(false)
    expect(editor.svgCanvas.setToolLocked).not.toHaveBeenCalledWith(true)
  })

  it('lock wins over the click-triggered unlock in updateLeftPanel (registration-order regression)', () => {
    // Wire a real click handler that mirrors clickPath/updateLeftPanel's
    // unconditional `setToolLocked(false)` on every tool click — the same
    // event toolDragReorder.js's own keydown listener fires via `el.click()`
    // for *any* Enter (shift or not). If this fix's own keydown listener were
    // registered before toolDragReorder's (so it ran before that `click()`),
    // updateLeftPanel's unlock would fire last and silently undo the lock.
    const pathTool = $id('tool_path')
    pathTool.addEventListener('click', () => editor.svgCanvas.setToolLocked(false))

    shiftEnter(pathTool)

    expect(pathTool.getAttribute('locked')).toBe('true')
    expect(editor.svgCanvas.setToolLocked).toHaveBeenLastCalledWith(true)
  })

  it('double-click still locks (unchanged mouse gesture)', () => {
    const textTool = $id('tool_text')

    textTool.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    expect(textTool.getAttribute('locked')).toBe('true')
  })
})
