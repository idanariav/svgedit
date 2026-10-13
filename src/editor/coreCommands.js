// @ts-check
/**
 * coreCommands.js — the pilot commands that live in the command registry as
 * real commands (one implementation shared by hotkey, toolbar button,
 * favorites / quick-action menu, tablet shell and the host API). Every other
 * button is still an *adapter* command (see commands.js) until it is migrated
 * here. Ids are persisted user data: they are the buttons' existing ids and
 * must never be renamed.
 * @module coreCommands
 */

import { canPaste, needsSelection } from './commandGates.js'

/** @param {any} editor @returns {true|string} */
const hasSelection = (editor) => (editor.selectedElement || editor.multiselected) ? true : 'No selection'

/**
 * @param {import('./commands.js').CommandRegistry} commands
 * @returns {void}
 */
export const registerCoreCommands = (commands) => {
  commands.register({
    id: 'tool_clone',
    label: 'tools.clone',
    group: 'Edit',
    enabled: hasSelection,
    atomic: true,
    run: (editor) => editor.svgCanvas.cloneSelectedElements(20, 20)
  })
  commands.register({
    id: 'tool_delete',
    label: 'tools.del',
    group: 'Edit',
    enabled: hasSelection,
    atomic: true,
    run: (editor) => editor.topPanel.deleteSelected()
  })
  // `G` has always toggled: it groups a multi-selection and ungroups a single
  // selected group, so this keeps `clickGroup`'s behaviour for the shared hotkey.
  commands.register({
    id: 'tool_group_elements',
    label: 'tools.group_elements',
    group: 'Group',
    enabled: hasSelection,
    atomic: true,
    run: (editor) => editor.topPanel.clickGroup()
  })
  commands.register({
    id: 'tool_ungroup',
    label: 'tools.ungroup',
    group: 'Group',
    enabled: (editor) => editor.selectedElement ? true : 'Select a group',
    atomic: true,
    run: (editor) => editor.svgCanvas.ungroupSelectedElement()
  })
  // Layers-panel object state, from the canvas (Illustrator's Cmd+2 / Cmd+3 family).
  /** @type {Array<[string, string, string, (editor: any) => true|string, (editor: any) => any]>} */
  const objectState = [
    ['object_lock_selection', 'mod+2', 'tools.lock_selection', needsSelection,
      (editor) => editor.svgCanvas.setObjectsLocked(editor.svgCanvas.getSelectedElements().filter(Boolean), true)],
    ['object_unlock_all', 'mod+alt+2', 'tools.unlock_all',
      (editor) => editor.svgCanvas.hasLockedObjects() ? true : 'Nothing is locked',
      (editor) => editor.svgCanvas.unlockAllObjects()],
    ['object_hide_selection', 'mod+3', 'tools.hide_selection', needsSelection,
      (editor) => editor.svgCanvas.setObjectsHidden(editor.svgCanvas.getSelectedElements().filter(Boolean), true)],
    ['object_show_all', 'mod+alt+3', 'tools.show_all',
      (editor) => editor.svgCanvas.hasHiddenObjects() ? true : 'Nothing is hidden',
      (editor) => editor.svgCanvas.showAllObjects()]
  ]
  for (const [id, keys, label, enabled, run] of objectState) {
    commands.register({ id, label, group: 'Edit', keys, enabled, run })
  }
  commands.register({
    id: 'tool_undo',
    label: 'tools.undo',
    group: 'Edit',
    enabled: (editor) => editor.svgCanvas.undoMgr.getUndoStackSize() > 0 ? true : 'Nothing to undo',
    run: (editor) => editor.topPanel.clickUndo()
  })
  commands.register({
    id: 'tool_redo',
    label: 'tools.redo',
    group: 'Edit',
    enabled: (editor) => editor.svgCanvas.undoMgr.getRedoStackSize() > 0 ? true : 'Nothing to redo',
    run: (editor) => editor.topPanel.clickRedo()
  })
  // Context-menu staples that have no toolbar button (formerly `EXTRA_TRIGGERS`
  // in favoriteActions.js).
  commands.register({
    id: 'paste',
    label: 'tools.paste',
    group: 'Edit',
    icon: 'paste.svg',
    enabled: canPaste,
    run: (editor) => editor.svgCanvas.pasteElements()
  })
  commands.register({
    id: 'paste_in_place',
    label: 'tools.paste_in_place',
    group: 'Edit',
    icon: 'paste_in_place.svg',
    enabled: canPaste,
    run: (editor) => editor.svgCanvas.pasteElements('in_place')
  })
  commands.register({
    id: 'zoom_fit',
    label: 'tools.fit_to_canvas',
    group: 'View',
    icon: 'zoom_fit.svg',
    run: (editor) => editor.bottomPanel.changeZoom('canvas')
  })
}
