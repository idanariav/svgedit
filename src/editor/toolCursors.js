/**
 * toolCursors.js — the canvas cursor of each tool (mode).
 *
 * A tool has its own cursor when `images/cursors/<mode>_cursor.svg` exists (32px, white halo so it reads on the
 * dark canvas). It *replaces* the pointer: a tool with a working tip (pencil, pen, brush, eyedropper, knife) is
 * drawn as that tool, its tip at the hotspot; a shape / effect tool is a crosshair with a small glyph of the tool
 * beside it. The file names its hotspot in `data-hotspot="x y"` on the root (default 0 0). Modes with no such file
 * keep the default cursor; the few below use a system cursor.
 * @module toolCursors
 */
import { getIconDataUri, getRawIcon } from './images/iconRegistry.js'

/** Modes whose cursor is a plain system one. */
const SYSTEM_CURSORS = {
  'ext-panning': 'grab',
  zoom: 'crosshair',
  shapelib: 'crosshair',
  'repeat-pick-center': 'crosshair',
  puppetwarp: 'crosshair',
  // #TODO: Cursor should be changed back to default after text element was created
  text: 'text'
}

/**
 * @param {string} mode the canvas mode
 * @returns {string} a CSS `cursor` value
 */
export const cursorForMode = (mode) => {
  if (Object.prototype.hasOwnProperty.call(SYSTEM_CURSORS, mode)) return SYSTEM_CURSORS[mode]
  const file = `cursors/${mode}_cursor.svg`
  const uri = getIconDataUri(file)
  if (!uri) return 'auto'
  const [, x = 0, y = 0] = /data-hotspot="(\d+) (\d+)"/.exec(getRawIcon(file)) ?? []
  return `url("${uri}") ${x} ${y}, crosshair`
}
