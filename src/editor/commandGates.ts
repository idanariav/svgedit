// @ts-check
/**
 * commandGates.js — shared `enabled` checks for registry commands (see commands.js).
 * Each gate answers `true`, or the reason the command can't run right now; the reason
 * is shown in the button's tooltip and in `commands.list()`. A gate mirrors the
 * precondition the command's implementation already has (what it silently ignores),
 * so the registry, the buttons and the command sweep agree with what actually happens.
 * @module commandGates
 */

export type Gate = (editor: any) => true | string

/** @returns the selected elements (never holes) */
export const selectedOf = (editor: any): Element[] => editor.svgCanvas.getSelectedElements().filter(Boolean)

export const needsSelection: Gate = (editor) => selectedOf(editor).length ? true : 'Select something first'

export const needsOne: Gate = (editor) => selectedOf(editor).length === 1 ? true : 'Select one object'

export const needsTwo: Gate = (editor) => selectedOf(editor).length === 2 ? true : 'Select exactly two shapes'

/** switching the z-order swaps two siblings */
export const needsTwoSiblings: Gate = (editor) => {
  const list = selectedOf(editor)
  if (list.length !== 2) return 'Select exactly two objects'
  return list[0].parentNode === list[1].parentNode ? true : 'Both objects must be in the same layer or group'
}

/** boolean operations and clip / mask take two path-convertible shapes */
export const needsTwoShapes: Gate = (editor) => {
  const list = selectedOf(editor)
  if (list.length !== 2) return 'Select exactly two shapes'
  const bad = list.find((el) => ['text', 'image'].includes(el.tagName.toLowerCase()))
  return bad ? 'Text and images can’t be combined' : true
}

/** aligning to the selection needs something to align against; the page needs only one object */
export const canAlign: Gate = (editor) => {
  const n = selectedOf(editor).length
  if (!n) return 'Select something first'
  let relativeTo = ''
  try { relativeTo = editor.$id?.('tool_align_relative')?.value ?? '' } catch { /* no panel */ }
  return n > 1 || relativeTo === 'page' ? true : 'Select two or more objects (or align to the page)'
}

/** Release works on an element that has a clip path or a mask */
export const hasClipOrMask: Gate = (editor) => {
  const el = selectedOf(editor)
  return el.length === 1 && (el[0].getAttribute('clip-path') || el[0].getAttribute('mask'))
    ? true
    : 'Select a clipped or masked object'
}

/** Delete also removes nodes while a path is being edited */
export const canDelete: Gate = (editor) => {
  if (editor.svgCanvas.getMode() === 'pathedit') {
    return editor.svgCanvas.pathActions.canDeleteNodes ? true : 'A path needs at least two nodes'
  }
  return needsSelection(editor)
}

/** there is something to select in the current layer (or the open group) */
export const hasObjects: Gate = (editor) => {
  const canvas = editor.svgCanvas
  const scope = canvas.getCurrentGroup() || canvas.getCurrentDrawing().getCurrentLayer()
  return scope && canvas.getVisibleElements(scope).length ? true : 'Nothing to select in this layer'
}

/** Paste needs what a copy / cut left on the clipboard */
export const canPaste: Gate = (editor) => {
  try {
    return sessionStorage.getItem(editor.svgCanvas.getClipboardID()) ? true : 'Nothing to paste'
  } catch {
    return 'Nothing to paste'
  }
}

export const canDeleteLayer: Gate = (editor) =>
  editor.svgCanvas.getCurrentDrawing().getNumLayers() > 1 ? true : 'A drawing needs at least one layer'

/** Move Layer Up: the current layer isn't already on top (the last in the document) */
export const canMoveLayerUp: Gate = (editor) => {
  const canvas = editor.svgCanvas
  return canvas.indexCurrentLayer() < canvas.getCurrentDrawing().getNumLayers() - 1 ? true : 'Already the top layer'
}

/** Move Layer Down: the current layer isn't already at the bottom */
export const canMoveLayerDown: Gate = (editor) => editor.svgCanvas.indexCurrentLayer() > 0 ? true : 'Already the bottom layer'

/** rotating by key works on a single object, as the angle field does */
export const canRotate: Gate = (editor) => needsOne(editor) === true ? true : 'Select one object to rotate'
