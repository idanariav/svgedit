// @ts-check
/**
 * Lets a component act as a *view* of a registry command: with
 * `command="<id>"` a click runs `editor.commands.run(id)` instead of whatever
 * the host panel would otherwise bind, and the editor keeps the component's
 * `disabled` state in sync with the command (`CommandRegistry.refreshEnablement`).
 * @module commandBinding
 */
import { ownerEditor } from '../domScope.js'

/**
 * @param {HTMLElement} el
 * @returns {void}
 */
export const onCommandClick = (el) => {
  const id = el.getAttribute('command')
  if (!id) return
  const commands = ownerEditor(el)?.commands
  const rec = commands?.get(id)
  // Never dispatch an adapter back to its own element (would loop).
  if (!rec || (rec.adapter && rec.el === el)) return
  commands.tryRun(id)
}
