import {
  getStrokedBBoxDefaultVisible,
  getUrlFromAttr
} from './utilities.js'
import * as hstry from './history.js'

const {
  InsertElementCommand, BatchCommand
} = hstry

/**
* Reentrant init: `pasteElements` is created per-instance, closed over this
* canvas, so several editors can coexist in one realm.
* @function module:paste-elem.init
* @param {module:paste-elem.pasteContext} canvas
* @returns {void}
*/
export const init = (canvas) => {
  const svgCanvas = canvas

/**
* @function module:svgcanvas.SvgCanvas#pasteElements
* @param {"in_place"|"point"|void} type
* @param {Integer|void} x Expected if type is "point"
* @param {Integer|void} y Expected if type is "point"
* @fires module:svgcanvas.SvgCanvas#event:changed
* @fires module:svgcanvas.SvgCanvas#event:ext_IDsUpdated
* @returns {void}
*/
  const pasteElementsMethod = (type, x, y) => {
  const rawClipboard = sessionStorage.getItem(svgCanvas.getClipboardID())
  let clipb
  try {
    clipb = JSON.parse(rawClipboard)
  } catch {
    return
  }
  if (!Array.isArray(clipb) || !clipb.length) return

  const pasted = []
  const batchCmd = new BatchCommand('Paste elements')
  // const drawing = getCurrentDrawing();
  /**
* @typedef {PlainObject<string, string>} module:svgcanvas.ChangedIDs
*/
  /**
* @type {module:svgcanvas.ChangedIDs}
*/
  const changedIDs = {}

  // Recursively replace IDs and record the changes
  /**
*
* @param {module:svgcanvas.SVGAsJSON} elem
* @returns {void}
*/
  const checkIDs = (elem) => {
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
  /**
  * @param {module:svgcanvas.SVGAsJSON} elem
  * @returns {void}
  */
  const remapReferences = (elem) => {
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
  /**
* Triggered when `pasteElements` is called from a paste action (context menu or key).
* @event module:svgcanvas.SvgCanvas#event:ext_IDsUpdated
* @type {PlainObject}
* @property {module:svgcanvas.SVGAsJSON[]} elems
* @property {module:svgcanvas.ChangedIDs} changes Maps past ID (on attribute) to current ID
*/
  svgCanvas.runExtensions(
    'IDsUpdated',
    /** @type {module:svgcanvas.SvgCanvas#event:ext_IDsUpdated} */
    { elems: clipb, changes: changedIDs },
    true
  ).forEach(function (extChanges) {
    if (!extChanges || !('remove' in extChanges)) return

    extChanges.remove.forEach(function (removeID) {
      clipb = clipb.filter(function (clipBoardItem) {
        return clipBoardItem?.attr?.id !== removeID
      })
    })
  })

  // Referenced paint servers (gradients/filters/…) carried alongside the copy.
  // Recreate them in <defs> *first* so the pasted shapes' url(#…) references
  // resolve immediately (otherwise restoreRefElements would see them missing).
  const defsEntries = clipb.filter(e => e?._defs)
  const elemEntries = clipb.filter(e => e && !e._defs)

  defsEntries.forEach((elem) => {
    const defEl = svgCanvas.addSVGElementsFromJson(elem)
    if (defEl) {
      svgCanvas.findDefs().appendChild(defEl) // move out of the layer into <defs>
      batchCmd.addSubCommand(new InsertElementCommand(defEl))
    }
  })

  // Move elements to lastClickPoint
  let len = elemEntries.length
  if (!len) return
  while (len--) {
    const elem = elemEntries[len]
    if (!elem) { continue }

    const copy = svgCanvas.addSVGElementsFromJson(elem)
    pasted.push(copy)
    batchCmd.addSubCommand(new InsertElementCommand(copy))

    svgCanvas.restoreRefElements(copy)
  }

  if (!pasted.length) return
  svgCanvas.selectOnly(pasted, true) // show grips so the pasted element is ready to resize

  if (type !== 'in_place') {
    let ctrX; let ctrY

    if (!type) {
      ctrX = svgCanvas.getLastClickPoint('x')
      ctrY = svgCanvas.getLastClickPoint('y')
    } else if (type === 'point') {
      ctrX = x
      ctrY = y
    }

    const bbox = getStrokedBBoxDefaultVisible(pasted)
    if (bbox && Number.isFinite(ctrX) && Number.isFinite(ctrY)) {
      const cx = ctrX - (bbox.x + bbox.width / 2)
      const cy = ctrY - (bbox.y + bbox.height / 2)
      const dx = []
      const dy = []

      pasted.forEach(function (_item) {
        dx.push(cx)
        dy.push(cy)
      })

      const cmd = svgCanvas.moveSelectedElements(dx, dy, false)
      if (cmd) batchCmd.addSubCommand(cmd)
    }
  }

  svgCanvas.addCommandToHistory(batchCmd)
  svgCanvas.call('changed', pasted)
  }

  svgCanvas.pasteElements = pasteElementsMethod
}
