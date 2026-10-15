// @ts-check
/**
 * canvasCommands.js — the canvas page itself (size, background colour, saved
 * layouts) as commands, so the Canvas Settings popover, the bottom panel's
 * background swatch, a host and a debug log / LLM all go through one named,
 * typed, logged entry point. The drawing's *contents* are untouched here.
 * @module canvasCommands
 */

import { CommandError } from './commands.js'
import { loadLayouts, saveLayouts, captureCurrentLayout, applyLayout } from './canvasLayouts.js'

/** `#rgb`, `#rrggbb`, `#rrggbbaa`, `none` (transparent) or `chessboard`. */
const BACKGROUND_RE = /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|none|chessboard)$/i

/**
 * @param {import('./commands.js').CommandRegistry} commands
 * @returns {void}
 */
export const registerCanvasCommands = (commands) => {
  commands.register({
    id: 'canvas_set_size',
    label: 'Set canvas size',
    group: 'Canvas',
    params: {
      width: { type: 'number', required: true, min: 1, max: 20000 },
      height: { type: 'number', required: true, min: 1, max: 20000 }
    },
    run: (editor, { width, height }) => {
      editor.svgCanvas.setResolution(Math.round(width), Math.round(height))
      editor.updateCanvas()
    }
  })
  commands.register({
    id: 'canvas_set_background',
    label: 'Set canvas background colour',
    group: 'Canvas',
    params: {
      color: { type: 'string', required: true }
    },
    run: (editor, { color }) => {
      if (!BACKGROUND_RE.test(color)) {
        throw new CommandError('badParams', 'canvas_set_background', `canvas_set_background: parameter "color" must be #rgb, #rrggbb, #rrggbbaa, "none" or "chessboard", got "${color}"`)
      }
      editor.setBackground(color, '', undefined, true)
    }
  })
  commands.register({
    id: 'canvas_apply_layout',
    label: 'Apply canvas layout',
    group: 'Canvas',
    enabled: () => loadLayouts().length ? true : 'No saved layouts',
    params: {
      name: { type: 'enum', required: true, values: () => loadLayouts().map((l) => l.name) }
    },
    run: (editor, { name }) => applyLayout(editor, /** @type {any} */ (loadLayouts().find((l) => l.name === name)))
  })
  commands.register({
    id: 'canvas_save_layout',
    label: 'Save canvas as layout',
    group: 'Canvas',
    params: {
      name: { type: 'string', required: true }
    },
    run: (editor, { name }) => {
      const trimmed = name.trim()
      if (!trimmed) throw new CommandError('badParams', 'canvas_save_layout', 'canvas_save_layout: parameter "name" must not be empty')
      const layouts = loadLayouts()
      const layout = captureCurrentLayout(editor, trimmed)
      const at = layouts.findIndex((l) => l.name === trimmed)
      if (at >= 0) layouts[at] = layout
      else layouts.push(layout)
      saveLayouts(layouts)
    }
  })
  commands.register({
    id: 'canvas_delete_layout',
    label: 'Delete canvas layout',
    group: 'Canvas',
    enabled: () => loadLayouts().length ? true : 'No saved layouts',
    params: {
      name: { type: 'enum', required: true, values: () => loadLayouts().map((l) => l.name) }
    },
    run: (editor, { name }) => saveLayouts(loadLayouts().filter((l) => l.name !== name))
  })
}
