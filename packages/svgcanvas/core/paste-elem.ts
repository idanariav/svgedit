// paste-elem.js — Paste handler
import { getUrlFromAttr } from './dom-utils.ts'
import { getGroupDetachTarget, applyGroupDetachTransform } from './group-detach.ts'
import type SvgCanvas from '../svgcanvas.ts'
import type { SVGElementJSON } from '../svgcanvas.ts'

/** The members `paste-elem.ts` gives its canvas. */
export interface PasteElemApi {
  pasteElements(type?: string, x?: number, y?: number, data?: unknown[]): void
}

/**
* Reentrant init: `pasteElements` is created per-instance, closed over this
* canvas, so several editors can coexist in one realm.
*/
export const createPasteElem = (canvas: SvgCanvas): PasteElemApi => {
  const svgCanvas = canvas

  // Tracks consecutive pastes of the same clipboard content so repeated
  // Ctrl/Cmd+V presses cascade down-right like the Duplicate button instead
  // of stacking every copy on the exact same point. Reset whenever the
  // clipboard content changes (a fresh copy) or a "paste in place" occurs.
  let lastPasteSignature: string | null = null
  let pasteStreak = 0
  const PASTE_STREAK_STEP = 20

  /**
* @param type `'point'` pastes at (`x`, `y`); `'in_place'` where it was copied; omitted at the last click
* @param x Expected if type is "point"
* @param y Expected if type is "point"
* @param data Already-parsed clipboard contents (e.g. from a native `paste` event's `e.clipboardData`). When
*   omitted, falls back to the sessionStorage snapshot written by the last `copySelectedElements()` call
*   — used by paths with no `ClipboardEvent` in hand (context-menu Paste, favorite-action Paste).
*/
  const pasteElementsMethod = (type?: string, x?: number, y?: number, data?: unknown[]): void => {
    let clipb = data as SVGElementJSON[] | undefined
    if (!Array.isArray(clipb)) {
      const rawClipboard = sessionStorage.getItem(svgCanvas.getClipboardID())
      try {
        clipb = JSON.parse(rawClipboard as string)
      } catch {
        return
      }
    }
    if (!Array.isArray(clipb) || !clipb.length) return

    const signature = JSON.stringify(clipb)
    if (type === 'in_place') {
      pasteStreak = 0
    } else if (signature === lastPasteSignature) {
      pasteStreak++
    } else {
      pasteStreak = 0
    }
    lastPasteSignature = signature

    const pasted: Element[] = []
    // const drawing = getCurrentDrawing();
    /** Maps past ID (on attribute) to current ID. */
    const changedIDs: Record<string, string> = {}

    // Recursively replace IDs and record the changes
    const checkIDs = (elem: SVGElementJSON): void => {
      if (elem.attr?.id) {
      // Keep the copied element's own id prefix (e.g. `ellipse_1` → `ellipse_2`)
      // rather than forcing the default `svg_`; the trailing number is bumped to
      // the next free value so no duplicate id is ever produced.
        const prefix = String(elem.attr.id).replace(/\d+$/, '') || 'svg_'
        changedIDs[elem.attr.id] = svgCanvas.getNextIdWithPrefix(prefix)
        elem.attr.id = changedIDs[elem.attr.id]
      }
      if (elem.children) elem.children.forEach((child) => checkIDs(child))
    }
    clipb.forEach((elem) => checkIDs(elem))

    // Update any internal references in the clipboard to match the new IDs.
    const remapReferences = (elem: SVGElementJSON): void => {
      const attrs = elem?.attr
      if (attrs) {
        for (const [attrName, attrVal] of Object.entries(attrs)) {
          if (typeof attrVal !== 'string' || !attrVal) continue
          if ((attrName === 'href' || attrName === 'xlink:href') && attrVal.startsWith('#')) {
            const refId = attrVal.slice(1)
            if (refId in changedIDs) {
              attrs[attrName] = `#${changedIDs[refId]}`
            }
          }
          const url = getUrlFromAttr(attrVal)
          if (url) {
            const refId = url.slice(1)
            if (refId in changedIDs) {
              attrs[attrName] = attrVal.replace(url, `#${changedIDs[refId]}`)
            }
          }
        }
      }
      if (elem.children) elem.children.forEach((child) => remapReferences(child))
    }
    clipb.forEach((elem) => remapReferences(elem))

    // Give extensions like the connector extension a chance to reflect new IDs and remove invalid elements
    // Triggered when `pasteElements` is called from a paste action (context menu or key).
    svgCanvas.runExtensions(
      'IDsUpdated',
      { elems: clipb, changes: changedIDs },
      true
    ).forEach(function (extChanges) {
      if (!extChanges || !('remove' in extChanges)) return

      ;(extChanges.remove as string[]).forEach(function (removeID) {
        clipb = (clipb as SVGElementJSON[]).filter(function (clipBoardItem) {
          return clipBoardItem?.attr?.id !== removeID
        })
      })
    })

    // Referenced paint servers (gradients/filters/…) carried alongside the copy.
    // Recreate them in <defs> *first* so the pasted shapes' url(#…) references
    // resolve immediately (otherwise restoreRefElements would see them missing).
    const defsEntries = clipb.filter((e) => e?._defs)
    const elemEntries = clipb.filter((e) => e && !e._defs)

    // Everything below is built detached and handed to the model: one step, and the renderer puts it in the DOM
    const tx = svgCanvas.beginTransaction('Paste elements')
    const withId = (elem: SVGElementJSON): SVGElementJSON => ({ ...elem, attr: { ...elem.attr, id: elem.attr?.id ?? svgCanvas.getNextId() } })
    const looseDefs = defsEntries.map((elem) => svgCanvas.buildElementFromJson(withId(elem))).filter((el): el is Element => Boolean(el))
    if (looseDefs.length) svgCanvas.insertLooseElements(looseDefs.map((el) => ({ parent: svgCanvas.findDefs(), el })), 'Paste elements')

    // If pasting while isolated inside a group, addSVGElementsFromJson drops the
    // new content straight into that group (matching draw-a-new-shape
    // behavior). A paste — unlike drawing — should always produce independent
    // top-level content, so detach it from the group nesting here, baking in
    // the group's combined transform so it lands in the same visual spot.
    const currentGroup = svgCanvas.getCurrentGroup()
    const detachTarget = currentGroup ? getGroupDetachTarget(currentGroup) : null

    // Move elements to lastClickPoint
    if (!elemEntries.length) { tx.cancel(); return }
    const container = detachTarget ? detachTarget.targetParent : (currentGroup || svgCanvas.getDrawing().getTargetLayerGroup())
    const loose = [...elemEntries].reverse()
      .map((elem) => svgCanvas.buildElementFromJson(withId(elem)))
      .filter((el): el is Element => Boolean(el))
    const inserted = svgCanvas.insertLooseElements(loose.map((el) => ({ parent: container as Element, el })), 'Paste elements')
    for (const copy of inserted) {
      if (detachTarget) applyGroupDetachTransform(copy, detachTarget.matrix) // baking in needs the element in the drawing
      pasted.push(copy)
      svgCanvas.restoreRefElements(copy)
    }

    if (!pasted.length) { tx.cancel(); return }
    svgCanvas.selectOnly(pasted, true) // show grips so the pasted element is ready to resize

    if (type !== 'in_place') {
      let ctrX: number | undefined
      let ctrY: number | undefined

      if (!type) {
        ctrX = svgCanvas.getLastClickPoint('x')
        ctrY = svgCanvas.getLastClickPoint('y')
      } else if (type === 'point') {
        ctrX = x
        ctrY = y
      }

      const bbox = svgCanvas.getStrokedBBoxDefaultVisible(pasted)
      if (bbox && typeof ctrX === 'number' && Number.isFinite(ctrX) && typeof ctrY === 'number' && Number.isFinite(ctrY)) {
        const streakOffset = pasteStreak * PASTE_STREAK_STEP
        const cx = ctrX - (bbox.x + bbox.width / 2) + streakOffset
        const cy = ctrY - (bbox.y + bbox.height / 2) + streakOffset
        const dx: number[] = []
        const dy: number[] = []

        pasted.forEach(function (_item) {
          dx.push(cx)
          dy.push(cy)
        })

        svgCanvas.moveSelectedElements(dx, dy, false)
      }
    }

    tx.commit()
    svgCanvas.call('changed', pasted)
  }

  return {
    pasteElements: pasteElementsMethod
  }
}
