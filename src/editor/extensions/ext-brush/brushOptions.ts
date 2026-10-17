// @ts-check
/**
 * brushOptions.js — the Brush tool's options bar: the five saved brushes as a row of buttons (the one in use is
 * highlighted, one edited since it was loaded is dashed), the live brush parameters, and Save / Delete for the
 * current slot. Pure logic over injected dependencies so it is testable without an editor; `ext-brush` wires it to the
 * canvas and `customBrushes.js`.
 * @module brushOptions
 */

/** [param key (also the option id), scale between the stored value and the field, label, min, max, step]; the first two are always shown, the rest only under "More" (keeps the bar to one row) */
const FIELDS = [
  ['thickness', 1, 'Size', 1, 200, 1],
  ['opacity', 100, 'Opacity', 0, 100, 5],
  ['smoothness', 100, 'Smooth', 0, 100, 5],
  ['angle', 1, 'Angle', 0, 180, 5],
  ['roundness', 1, 'Round', 0, 100, 5],
  ['taperStart', 1, 'Taper in', 0, 100, 5],
  ['taperEnd', 1, 'Taper out', 0, 100, 5]
] as const
const KEYS = FIELDS.map(([key]) => key)

/** @returns whether both brushes have the same value for every parameter */
export const sameBrush = (a: Record<string, unknown> | null | undefined, b: Record<string, unknown> | null | undefined): boolean => Boolean(a) && Boolean(b) && KEYS.every((k) => Number(a?.[k]) === Number(b?.[k]))

export interface BrushDeps {
  slotCount: number
  /** the live brush */
  getParams: () => Record<string, unknown>
  setParams: (params: Record<string, unknown>) => void
  getSlot: (i: number) => Record<string, unknown> | null
  saveSlot: (i: number, params: Record<string, unknown>) => void
  deleteSlot: (i: number) => void
  renameSlot: (i: number, name: string) => void
  askName: (i: number, current: string) => Promise<string | null>
}

export const createBrushOptions = (deps: BrushDeps): { options: () => import('@svgedit/svgcanvas').ToolOption[], setOption: (id: string, value: number | string | boolean) => void } => {
  /** the slot last loaded or saved: kept so it can show as edited once the live brush drifts from it */
  let lastSlot = null as number | null
  let showMore = false

  const slotState = (i: number, live: Record<string, unknown>, anyActive: boolean) => {
    const saved = deps.getSlot(i)
    if (!saved) return 'empty'
    if (sameBrush(saved, live)) return 'active'
    return !anyActive && lastSlot === i ? 'modified' : 'filled'
  }

  const options = () => {
    const live = deps.getParams()
    const anyActive = Array.from({ length: deps.slotCount }, (_, i) => deps.getSlot(i)).some((s) => sameBrush(s, live))
    const choices = Array.from({ length: deps.slotCount }, (_, i) => {
      const state = slotState(i, live, anyActive)
      const name = deps.getSlot(i)?.name || `Brush ${i + 1}`
      const title = {
        empty: `Save the current brush to slot ${i + 1}`,
        active: `${name} (in use) — double-click to rename`,
        modified: `${name} (edited) — click to reload, double-click to rename`,
        filled: `${name} — double-click to rename`
      }[state]
      return { value: String(i), label: deps.getSlot(i)?.name || String(i + 1), title, state }
    })
    const current = lastSlot !== null ? slotState(lastSlot, live, anyActive) : 'empty'
    return ([
      { id: 'slot', type: 'buttons', label: 'Brushes', value: lastSlot === null ? '' : String(lastSlot), choices },
      { id: 'update', type: 'button', label: 'Save', value: false, title: `Save the edits into slot ${(lastSlot ?? 0) + 1}`, hidden: current !== 'modified' },
      { id: 'delete', type: 'button', label: '✕', value: false, title: `Delete slot ${(lastSlot ?? 0) + 1}`, hidden: current === 'empty' },
      ...FIELDS.slice(0, 2).map(([key, scale, label, min, max, step]) => ({ id: key, type: 'number', label, value: Number(live[key]) * scale, min, max, step })),
      { id: 'more', type: 'checkbox', label: 'More', value: showMore, title: 'Smoothing, angle, roundness and taper' },
      ...FIELDS.slice(2).map(([key, scale, label, min, max, step]) => ({ id: key, type: 'number', label, value: Number(live[key]) * scale, min, max, step, hidden: !showMore }))
    ] as import('@svgedit/svgcanvas').ToolOption[])
  }

  const loadSlot = (i: number): void => {
    const saved = deps.getSlot(i)
    if (!saved) {
      deps.saveSlot(i, pick(deps.getParams()))
    } else {
      deps.setParams(pick(saved))
    }
    lastSlot = i
  }

  /** @returns only the brush parameters (a slot also carries its name) */
  const pick = (from: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(KEYS.filter((k) => from[k] !== undefined).map((k) => [k, from[k]]))

  const setOption = (id: string, value: number | string | boolean) => {
    if (id === 'slot') {
      const text = String(value)
      if (text.startsWith('dblclick:')) {
        const i = Number(text.slice('dblclick:'.length))
        const existing = deps.getSlot(i)
        if (existing) {
          deps.askName(i, String(existing.name ?? '')).then((name) => { if (name !== null) deps.renameSlot(i, name.trim()) })
        }
        return
      }
      loadSlot(Number(text))
    } else if (id === 'update') {
      if (lastSlot === null) return
      const name = deps.getSlot(lastSlot)?.name
      deps.saveSlot(lastSlot, { ...pick(deps.getParams()), ...(name ? { name } : {}) })
    } else if (id === 'delete') {
      if (lastSlot === null) return
      deps.deleteSlot(lastSlot)
      lastSlot = null
    } else if (id === 'more') {
      showMore = Boolean(value)
    } else {
      const field = FIELDS.find(([key]) => key === id)
      const n = Number(value)
      if (field && Number.isFinite(n)) deps.setParams({ [id]: n / field[1] })
    }
  }

  return { options, setOption }
}
