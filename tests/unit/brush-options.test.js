import { describe, it, expect } from 'vitest'
import { createBrushOptions, sameBrush } from '../../src/editor/extensions/ext-brush/brushOptions.ts'

const DEFAULT = { thickness: 6, angle: 45, roundness: 1 * 100, taperStart: 100, taperEnd: 100, opacity: 1, smoothness: 0.3 }

const setup = (live = {}) => {
  const state = { params: { ...DEFAULT, ...live }, slots: {}, asked: [] }
  const deps = {
    slotCount: 5,
    getParams: () => state.params,
    setParams: (p) => { state.params = { ...state.params, ...p } },
    getSlot: (i) => state.slots[i] ?? null,
    saveSlot: (i, p) => { state.slots[i] = { ...p } },
    deleteSlot: (i) => { delete state.slots[i] },
    renameSlot: (i, name) => { state.slots[i] = { ...state.slots[i], name } },
    askName: async (i, current) => { state.asked.push([i, current]); return '  Ink  ' }
  }
  const bar = createBrushOptions(deps)
  const opt = (id) => bar.options().find((o) => o.id === id)
  const states = () => opt('slot').choices.map((c) => c.state)
  return { state, bar, opt, states }
}

describe('brush options bar', () => {
  it('lists five empty slots, the common fields, and hides smoothness, angle, roundness and taper behind More', () => {
    const { opt, bar, states } = setup()
    expect(states()).toEqual(['empty', 'empty', 'empty', 'empty', 'empty'])
    expect(opt('thickness').value).toBe(6)
    expect(opt('opacity').value).toBe(100) // stored 0..1, shown as a percentage
    expect(opt('smoothness').value).toBe(30)
    const advanced = ['smoothness', 'angle', 'roundness', 'taperStart', 'taperEnd']
    expect(['thickness', 'opacity'].map((id) => opt(id).hidden)).toEqual([undefined, undefined])
    expect(advanced.map((id) => opt(id).hidden)).toEqual([true, true, true, true, true])
    bar.setOption('more', true)
    expect(advanced.map((id) => opt(id).hidden)).toEqual([false, false, false, false, false])
  })

  it('clicking an empty slot saves the live brush there and marks it active', () => {
    const { bar, state, states } = setup()
    bar.setOption('slot', '2')
    expect(state.slots[2].thickness).toBe(6)
    expect(states()).toEqual(['empty', 'empty', 'active', 'empty', 'empty'])
  })

  it('only the slot equal to the live brush is active; loading another moves the highlight', () => {
    const { bar, state, states } = setup()
    bar.setOption('slot', '0')
    bar.setOption('thickness', 30)
    bar.setOption('slot', '1')
    expect(state.params.thickness).toBe(30)
    expect(states()).toEqual(['filled', 'active', 'empty', 'empty', 'empty'])
    bar.setOption('slot', '0')
    expect(state.params.thickness).toBe(6)
    expect(states()).toEqual(['active', 'filled', 'empty', 'empty', 'empty'])
  })

  it('a loaded slot edited since shows as modified, offers Update, and is active again on an exact match', () => {
    const { bar, state, opt, states } = setup()
    bar.setOption('slot', '0')
    expect(opt('update').hidden).toBe(true)
    bar.setOption('thickness', 42)
    expect(states()[0]).toBe('modified')
    expect(opt('update').hidden).toBe(false)
    bar.setOption('thickness', 6)
    expect(states()[0]).toBe('active')
    bar.setOption('thickness', 42)
    bar.setOption('update', true)
    expect(state.slots[0].thickness).toBe(42)
    expect(states()[0]).toBe('active')
  })

  it('writes percentage fields back as fractions', () => {
    const { bar, state } = setup()
    bar.setOption('opacity', 50)
    bar.setOption('smoothness', 80)
    expect(state.params.opacity).toBe(0.5)
    expect(state.params.smoothness).toBe(0.8)
  })

  it('Delete clears the current slot and then goes away; it is hidden with no slot', () => {
    const { bar, state, opt, states } = setup()
    expect(opt('delete').hidden).toBe(true)
    bar.setOption('slot', '3')
    expect(opt('delete').hidden).toBe(false)
    bar.setOption('delete', true)
    expect(state.slots[3]).toBeUndefined()
    expect(states()[3]).toBe('empty')
    expect(opt('delete').hidden).toBe(true)
  })

  it('double-click renames a filled slot (trimmed) and ignores an empty one; Update keeps the name', async () => {
    const { bar, state } = setup()
    bar.setOption('slot', 'dblclick:1')
    expect(state.asked).toEqual([])
    bar.setOption('slot', '1')
    bar.setOption('slot', 'dblclick:1')
    await Promise.resolve()
    await Promise.resolve()
    expect(state.slots[1].name).toBe('Ink')
    bar.setOption('thickness', 9)
    bar.setOption('update', true)
    expect(state.slots[1]).toMatchObject({ name: 'Ink', thickness: 9 })
  })

  it('loading a slot never copies its name into the live brush', () => {
    const { bar, state } = setup()
    bar.setOption('slot', '0')
    state.slots[0].name = 'Ink'
    bar.setOption('slot', '0')
    expect(state.params).not.toHaveProperty('name')
  })

  it('sameBrush compares only brush parameters', () => {
    expect(sameBrush({ ...DEFAULT, name: 'x' }, DEFAULT)).toBe(true)
    expect(sameBrush({ ...DEFAULT, angle: 0 }, DEFAULT)).toBe(false)
    expect(sameBrush(null, DEFAULT)).toBe(false)
  })
})
