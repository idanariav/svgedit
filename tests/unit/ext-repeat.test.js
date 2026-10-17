import { describe, it, expect, beforeEach, vi } from 'vitest'
import extRepeat from '../../src/editor/extensions/ext-repeat/ext-repeat.ts'

describe('ext-repeat: picking a custom radial centre', () => {
  let svgCanvas
  let svgEditor
  let tool

  const ctx = {}
  const ev = (x, y) => ({ x, y, rawX: x, rawY: y, mods: {} })

  beforeEach(async () => {
    vi.useFakeTimers()
    svgCanvas = {
      $id: vi.fn(),
      $req: vi.fn(),
      setMode: vi.fn(),
      registerTool: vi.fn((def) => { tool = def })
    }
    svgEditor = {
      svgCanvas,
      leftPanel: { clickSelect: vi.fn() },
      configObj: { pref: () => 'en' },
      i18next: { t: (key) => key, addResourceBundle: vi.fn() }
    }
    await extRepeat.init(svgEditor)
  })

  it('registers the pick as a tool of its own and switches to it when armed', () => {
    expect(tool.id).toBe('repeat-pick-center')
    svgCanvas.armRepeatCenterPick(() => {})
    expect(svgCanvas.setMode).toHaveBeenCalledWith('repeat-pick-center')
  })

  it('hands the pressed point over after the release, and leaves the tool first', () => {
    const picked = vi.fn()
    svgCanvas.armRepeatCenterPick(picked)
    tool.pointerDown(ctx, ev(30, 40))
    expect(picked).not.toHaveBeenCalled()
    tool.pointerUp(ctx, ev(31, 41))
    expect(svgEditor.leftPanel.clickSelect).toHaveBeenCalledTimes(1)
    expect(picked).not.toHaveBeenCalled() // deferred past the release's own light-dismiss pass
    vi.runAllTimers()
    expect(picked).toHaveBeenCalledWith(30, 40)
  })

  it('forgets the callback when the gesture is cancelled or the tool is left', () => {
    const picked = vi.fn()
    svgCanvas.armRepeatCenterPick(picked)
    tool.pointerDown(ctx, ev(1, 2))
    tool.cancel(ctx)
    tool.pointerUp(ctx, ev(1, 2))
    vi.runAllTimers()
    expect(picked).not.toHaveBeenCalled()

    svgCanvas.armRepeatCenterPick(picked)
    tool.deactivate(ctx)
    tool.pointerDown(ctx, ev(3, 4))
    tool.pointerUp(ctx, ev(3, 4))
    vi.runAllTimers()
    expect(picked).not.toHaveBeenCalled()
  })
})
