/**
 * The options bar of the current tool: a tray in the top panel (and, in tablet mode, a strip in the shell) drawn from the tool's `options()` descriptors
 * (`ToolDef.options` / `setOption`, core/tool-registry.js). A tool never builds UI of its own for these.
 *
 * The controls are kept while the set of visible options stays the same (so a field being typed in keeps its
 * focus); only their values are refreshed. A change goes to `svgCanvas.setToolOption`, then the bar is read again,
 * because one option may show or hide another.
 */

/** The desktop top panel's tray, and the tablet shell's strip under its command bar. Each one that exists is filled. */
const TRAYS = ['tool_options_panel', 'ts_tool_options']

export const refreshToolOptions = (editor: EditorInstance): void => {
  const { $id, svgCanvas } = editor
  const options = svgCanvas.getToolOptions().filter((o) => !o.hidden)
  const signature = `${svgCanvas.getMode()}|${options.map((o) => `${o.id}:${o.type}:${o.type === 'button' ? o.label : ''}:${(o.choices ?? []).map((c) => c.value).join('/')}`).join(',')}`
  for (const id of TRAYS) {
    const tray = $id(id)
    if (tray) fillTray(editor, tray, options, signature)
  }
}

/**
 * @param options the visible options
 * @param signature changes when the set of controls has to be rebuilt
 */
const fillTray = (editor: any, tray: HTMLElement, options: import('@svgedit/svgcanvas').ToolOption[], signature: string): void => {
  if (!options.length) {
    tray.style.display = 'none'
    tray.replaceChildren()
    tray.dataset.signature = ''
    return
  }
  if (tray.dataset.signature !== signature) {
    tray.replaceChildren(...options.map((o) => buildControl(editor, o)))
    tray.dataset.signature = signature
  }
  tray.style.display = ''
  for (const o of options) {
    const control = tray.querySelector(`[data-option="${o.id}"]`) as HTMLInputElement
    if (!control) continue
    if (o.type === 'buttons') {
      o.choices?.forEach((c, i) => paintChoice((control.children[i] as HTMLButtonElement), c))
      continue
    }
    if (o.type === 'button') continue
    if (o.type === 'checkbox') (control.querySelector('input') as HTMLInputElement).checked = Boolean(o.value)
    else if (String(control.value) !== String(o.value) && document.activeElement !== control) control.value = String(o.value)
  }
}

const paintChoice = (btn: HTMLButtonElement, c: { value: string, label: string, title?: string, state?: string }): void => {
  btn.textContent = c.label
  btn.title = c.title ?? ''
  btn.dataset.state = c.state ?? ''
  btn.setAttribute('aria-pressed', String(c.state === 'active'))
}

const buildControl = (editor: any, o: import('@svgedit/svgcanvas').ToolOption): HTMLElement => {
  const { svgCanvas } = editor
  const send = (value: number | string | boolean) => {
    svgCanvas.setToolOption(o.id, value)
    refreshToolOptions(editor)
  }
  if (o.type === 'button') {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'tool-option-action'
    btn.dataset.option = o.id
    btn.textContent = o.label
    if (o.title) btn.title = o.title
    btn.addEventListener('click', () => send(true))
    return btn
  }
  if (o.type === 'buttons') {
    const row = document.createElement('div')
    row.className = 'tool-option-buttons'
    row.dataset.option = o.id
    row.setAttribute('role', 'group')
    row.setAttribute('aria-label', o.label)
    for (const c of o.choices ?? []) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'tool-option-choice'
      paintChoice(btn, c)
      btn.addEventListener('click', () => send(c.value))
      btn.addEventListener('dblclick', () => send(`dblclick:${c.value}`))
      row.append(btn)
    }
    return row
  }
  if (o.type === 'checkbox') {
    const label = document.createElement('label')
    label.className = 'tool-option-check'
    label.dataset.option = o.id
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.addEventListener('change', () => send(input.checked))
    label.append(input, ` ${o.label}`)
    if (o.title) label.title = o.title
    return label
  }
  if (o.type === 'select') {
    const select = document.createElement('se-select')
    select.dataset.option = o.id
    select.setAttribute('label', o.label)
    if (o.title) select.setAttribute('title', o.title)
    // Options go in once the element is upgraded, which is on insertion.
    queueMicrotask(() => {
      for (const c of o.choices ?? []) select.addOption(c.value, c.label)
      select.value = String(o.value)
    })
    select.addEventListener('change', (e) => send((e.target as HTMLInputElement).value))
    return select
  }
  const spin = document.createElement('se-spin-input')
  spin.dataset.option = o.id
  spin.setAttribute('label', o.label)
  if (o.title) spin.setAttribute('title', o.title)
  for (const [attr, v] of ([['min', o.min], ['max', o.max], ['step', o.step], ['value', o.value]] as Array<[string, unknown]>)) {
    if (v !== undefined) spin.setAttribute(attr, String(v))
  }
  spin.addEventListener('change', (e) => {
    const n = parseFloat((e.target as HTMLInputElement).value)
    if (Number.isFinite(n)) send(n)
  })
  return spin
}
