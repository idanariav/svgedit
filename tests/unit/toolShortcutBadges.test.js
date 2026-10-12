import { describe, it, expect, beforeEach, vi } from 'vitest'
import { badgeFor, initToolShortcutBadges } from '../../src/editor/toolShortcutBadges.js'

// A stand-in for the hotkey manager: effective keys by action id, and the change hook.
const makeHotkeys = (keys) => {
  const listeners = new Set()
  return {
    keys,
    effectiveKeys: (id) => keys[id] ?? [],
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    changed: () => listeners.forEach((fn) => fn())
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('tool shortcut badges', () => {
  let panel
  beforeEach(() => {
    document.body.innerHTML = ''
    panel = document.createElement('div')
    panel.innerHTML = `
      <se-button id="tool_select"></se-button>
      <se-button id="ext-panning"></se-button>
      <se-button id="tool_shaper"></se-button>
      <se-flyingbutton id="tools_shapes"><se-button id="tool_rect"></se-button><se-button id="tool_star"></se-button></se-flyingbutton>
      <se-shape-library id="tool_shapelib"></se-shape-library>
      <div id="not_a_tool"></div>`
    document.body.append(panel)
  })
  const badge = (id) => panel.querySelector(`#${id}`).getAttribute('data-shortcut')

  it('writes the first effective key of each tool, and nothing for a tool without one', () => {
    const hk = makeHotkeys({ tool_select: ['v'], tool_shaper: ['shift+n'], tool_rect: ['r'] })
    initToolShortcutBadges(panel, hk)
    expect(badge('tool_select')).toBe('V')
    expect(badge('tool_shaper')).toBe('⇧N')
    expect(panel.querySelector('#ext-panning').hasAttribute('data-shortcut')).toBe(false)
    expect(panel.querySelector('#tool_shapelib').hasAttribute('data-shortcut')).toBe(false)
    expect(panel.querySelector('#not_a_tool').hasAttribute('data-shortcut')).toBe(false)
  })

  it('a flyout shows the key of the tool it will activate until it has one of its own', () => {
    const hk = makeHotkeys({ tool_rect: ['r'] })
    const flyout = panel.querySelector('#tools_shapes')
    flyout.activeSlot = panel.querySelector('#tool_rect')
    expect(badgeFor(hk, flyout)).toBe('R')
    flyout.activeSlot = panel.querySelector('#tool_star') // no key
    expect(badgeFor(hk, flyout)).toBe('')
    hk.keys.tools_shapes = ['alt+1']
    expect(badgeFor(hk, flyout)).toBe('⌥1')
  })

  it('follows a rebinding: added, changed and removed keys', async () => {
    const hk = makeHotkeys({ tool_select: ['v'] })
    initToolShortcutBadges(panel, hk)
    hk.keys.tool_select = ['s']
    hk.keys.tool_shapelib = ['alt+s']
    hk.changed()
    await tick()
    expect(badge('tool_select')).toBe('S')
    expect(badge('tool_shapelib')).toBe('⌥S')
    hk.keys.tool_select = []
    hk.changed()
    await tick()
    expect(panel.querySelector('#tool_select').hasAttribute('data-shortcut')).toBe(false)
  })

  it('picks up tools added later and a flyout whose active tool changed', async () => {
    const hk = makeHotkeys({ tool_text: ['t'], tool_rect: ['r'] })
    const flyout = panel.querySelector('#tools_shapes')
    flyout.activeSlot = panel.querySelector('#tool_star')
    initToolShortcutBadges(panel, hk)
    expect(flyout.hasAttribute('data-shortcut')).toBe(false)
    panel.insertAdjacentHTML('beforeend', '<se-button id="tool_text"></se-button>')
    await tick()
    expect(badge('tool_text')).toBe('T')
    flyout.activeSlot = panel.querySelector('#tool_rect')
    flyout.setAttribute('pressed', 'pressed')
    await tick()
    expect(badge('tools_shapes')).toBe('R')
  })

  it('does not loop on its own attribute writes and stops after destroy', async () => {
    const hk = makeHotkeys({ tool_select: ['v'] })
    const spy = vi.spyOn(hk, 'effectiveKeys')
    const badges = initToolShortcutBadges(panel, hk)
    await tick()
    await tick()
    const calls = spy.mock.calls.length
    await tick()
    expect(spy.mock.calls.length).toBe(calls) // settled: our own writes did not queue another pass
    badges.destroy()
    hk.keys.tool_select = ['q']
    hk.changed()
    await tick()
    expect(badge('tool_select')).toBe('V')
  })
})
