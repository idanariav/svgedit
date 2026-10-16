/**
 * Path-node alignment guides — node-to-node alignment math for pathedit mode.
 *
 * Pure geometry helpers, mirroring `smart-guides.js`'s object-to-object model
 * but for a single dragged anchor node against the other anchor nodes of the
 * *same* path: while dragging a node grip, its candidate position is compared
 * against every other node's x/y to find an in-tolerance match, so
 * horizontal/vertical alignment (e.g. a path-tool-drawn rectangle's corners)
 * no longer has to be eyeballed. This is informational only -- the match is
 * used to draw a guide line, not to alter the dragged node's position, since
 * path nodes are too small a target to fight a hard snap free of once
 * alignment is found. Bezier control-point handles are not included as
 * targets or draggable subjects.
 *
 * Consumed by the pathedit-drag branch in `path-actions.js`'s `mouseMove`;
 * rendering of the guide line is delegated to `svgCanvas.showPathNodeGuides`
 * (implemented by the `ext-smart-guides` extension), gated behind the same
 * `smartSnapping` config flag object-to-object guides use.
 *
 * @module path-node-guides
 * @license MIT
 */

export interface NodeTarget { x: number, y: number, index: number }

export interface AxisSnap {
  pos: number
  delta: number
  target: NodeTarget
}

/** What `showPathNodeGuides` draws while a path node is dragged (`null` clears it). */
export interface PathNodeGuidesPayload { x: AxisSnap | null, y: AxisSnap | null, from: { x: number, y: number } }

/** The edited path: only the segment list is read. */
interface EditedPath {
  segs?: Array<{ item?: { x?: unknown, y?: unknown } } | null | undefined>
}

/**
 * Collect the snap targets for a node drag: every anchor node of the path
 * other than the ones being dragged.
 * @param path - The currently-edited Path instance.
 * @param excludeIndices - Segment indices to leave out (the dragged node(s) themselves).
 */
export const collectPathNodeTargets = (path: EditedPath | null | undefined, excludeIndices: number[]): NodeTarget[] => {
  const targets: NodeTarget[] = []
  if (!path?.segs) return targets
  path.segs.forEach((seg, index) => {
    if (excludeIndices.includes(index)) return
    const pt = seg?.item
    if (!pt || typeof pt.x !== 'number' || typeof pt.y !== 'number') return
    targets.push({ x: pt.x, y: pt.y, index })
  })
  return targets
}

/**
 * Find the best per-axis snap for a candidate node position.
 * @param x - Candidate x (current position + drag delta).
 * @param y - Candidate y (current position + drag delta).
 * @param tol - Snap tolerance in content units.
 * @returns Per-axis `{pos, delta, target}` or null.
 */
export const snapPathNodeToTargets = (
  x: number, y: number, targets: NodeTarget[], tol: number
): { x: AxisSnap | null, y: AxisSnap | null } => {
  let bestX: AxisSnap | null = null
  let bestY: AxisSnap | null = null
  for (const t of targets) {
    const dx = Math.abs(t.x - x)
    if (dx <= tol && (!bestX || dx < Math.abs(bestX.delta))) {
      bestX = { pos: t.x, delta: t.x - x, target: t }
    }
    const dy = Math.abs(t.y - y)
    if (dy <= tol && (!bestY || dy < Math.abs(bestY.delta))) {
      bestY = { pos: t.y, delta: t.y - y, target: t }
    }
  }
  return { x: bestX, y: bestY }
}
