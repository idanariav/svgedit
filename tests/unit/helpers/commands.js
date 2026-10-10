import { CommandRegistry } from '../../../src/editor/commands.js'
import { registerModeCommand } from '../../../src/editor/panelCommands.js'

let current = null
let installed = false

// What a rendered `<se-button command="<id>">` does on click (components/commandBinding.js).
// The unit tests run on bare elements, so emulate the binding once, document-wide.
const onClick = (ev) => {
  const id = ev.target?.closest?.('[command]')?.getAttribute('command')
  if (id && current) current.commands.tryRun(id)
}

/**
 * Give a hand-made `svgEditor` mock what extensions now expect: a real command
 * registry, `leftPanel.addModeCommand`, and clicks on `command="…"` elements
 * running their commands.
 * @param {any} svgEditor
 * @returns {any} the same mock
 */
export const mockCommands = (svgEditor) => {
  svgEditor.commands = new CommandRegistry(svgEditor)
  if (svgEditor.leftPanel) {
    const panel = svgEditor.leftPanel
    panel.addModeCommand = (id, mode, opts) => registerModeCommand(svgEditor, id, mode, opts)
  }
  current = svgEditor
  if (!installed) {
    document.addEventListener('click', onClick, true) // capture: some tests dispatch non-bubbling clicks
    installed = true
  }
  return svgEditor
}
