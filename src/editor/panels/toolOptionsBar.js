/**
 * The options bar of the current tool: a tray in the top panel drawn from the tool's `options()` descriptors
 * (`ToolDef.options` / `setOption`, core/tool-registry.js). A tool never builds UI of its own for these.
 *
 * The controls are kept while the set of visible options stays the same (so a field being typed in keeps its
 * focus); only their values are refreshed. A change goes to `svgCanvas.setToolOption`, then the bar is read again,
 * because one option may show or hide another.
 */

const TRAY = 'tool_options_panel'

/**
 * @param {any} editor
 * @returns {void}
 */
export const refreshToolOptions = (editor) => {
  const { $id, svgCanvas } = editor
  const tray = $id(TRAY)
  if (!tray) return
  const options = svgCanvas.getToolOptions().filter((o) => !o.hidden)
  if (!options.length) {
    tray.style.display = 'none'
    tray.replaceChildren()
    tray.dataset.signature = ''
    return
  }
  const signature = `${svgCanvas.getMode()}|${options.map((o) => `${o.id}:${o.type}:${(o.choices ?? []).map((c) => c.value).join('/')}`).join(',')}`
  if (tray.dataset.signature !== signature) {
    tray.replaceChildren(...options.map((o) => buildControl(editor, o)))
    tray.dataset.signature = signature
  }
  tray.style.display = ''
  for (const o of options) {
    const control = tray.querySelector(`[data-option="${o.id}"]`)
    if (!control) continue
    if (o.type === 'checkbox') control.querySelector('input').checked = Boolean(o.value)
    else if (String(control.value) !== String(o.value) && document.activeElement !== control) control.value = o.value
  }
}

/**
 * @param {any} editor
 * @param {import('@svgedit/svgcanvas/svgcanvas-members.js').ToolOption} o
 * @returns {HTMLElement}
 */
const buildControl = (editor, o) => {
  const { svgCanvas } = editor
  const send = (value) => {
    svgCanvas.setToolOption(o.id, value)
    refreshToolOptions(editor)
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
    select.addEventListener('change', (e) => send(e.target.value))
    return select
  }
  const spin = document.createElement('se-spin-input')
  spin.dataset.option = o.id
  spin.setAttribute('label', o.label)
  if (o.title) spin.setAttribute('title', o.title)
  for (const [attr, v] of [['min', o.min], ['max', o.max], ['step', o.step], ['value', o.value]]) {
    if (v !== undefined) spin.setAttribute(attr, String(v))
  }
  spin.addEventListener('change', (e) => {
    const n = parseFloat(e.target.value)
    if (Number.isFinite(n)) send(n)
  })
  return spin
}
