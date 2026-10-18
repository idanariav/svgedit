// @ts-check
/**
 * Tools for undo.
 * @module undo
 * @license MIT
 * @copyright 2011 Jeff Schiller
 */
import type SvgCanvas from '../svgcanvas.ts'
import type { HistoryCommand } from '../svgcanvas.ts'
import * as hstry from './history.js'
import { BBOX_AFFECTING_ATTRS } from './history.js'
import {
  getRotationAngle, setHref
} from './dom-utils.ts'
import { getBBox as utilsGetBBox } from './bbox-utils.ts'
import { SnapshotHistory } from './snapshot-history.ts'
import { reflowAreaText, LAYOUT_ATTRS } from './text-rows.ts'
import {
  isGecko
} from '../common/browser.ts'
import {
  transformPoint, transformListToTransform, getTransformList
} from './math.ts'

const { UndoManager } = hstry

/** The members `undo.ts` gives its canvas. */
export interface UndoApi {
  changeSelectedAttributeNoUndo(attr: string, val: string | number, elems?: Element[]): void
  // Attribute manipulation
  changeSelectedAttribute(attr: string, val: string | number, elems?: Element[]): void
}

export const createUndo = (canvas: SvgCanvas): UndoApi => {
  const svgCanvas = canvas // per-instance; functions below are closed over it

  const getUndoManager = () => new UndoManager()

  /**
* Hack for Firefox bugs where text element features aren't updated or get
* messed up. See issue 136 and issue 137.
* This function clones the element and re-selects it.
* @todo Test for this bug on load and add it to "support" object instead of
* browser sniffing
* @param elem The (text) DOM element to clone
* @returns Cloned element
*/
  const ffClone = (elem: Element): Element => {
    if (!isGecko()) { return elem }
    const clone = elem.cloneNode(true) as Element
    elem.before(clone)
    elem.remove()
    svgCanvas.selectorManager.releaseSelector(elem)
    svgCanvas.setSelectedElements(0, clone)
    svgCanvas.selectorManager.requestSelector(clone).showGrips(true)
    return clone
  }

  /**
* This function makes the changes to the elements. It does not add the change
* to the history stack.
* @param attr Attribute name
* @param newValue String or number with the new attribute value
* @param elems The DOM elements to apply the change to
*/
  const changeSelectedAttributeNoUndoMethod = (attr: string, newValue: string | number, elems: Element[]): void => {
    if (attr === 'id') {
    // if the user is changing the id, then de-select the element first
    // change the ID, then re-select it with the new ID
    // as this change can impact other extensions, a 'renamedElement' event is thrown
      const elem = elems[0]
      const oldId = elem.id
      if (oldId !== newValue) {
        svgCanvas.clearSelection()
        elem.id = String(newValue)
        svgCanvas.addToSelection([elem], true)
        svgCanvas.call('elementRenamed', { elem, oldId, newId: newValue })
      }
      return
    }
    const selectedElements = svgCanvas.getSelectedElements()
    const zoom = svgCanvas.getZoom()
    if (svgCanvas.getCurrentMode() === 'pathedit') {
    // Editing node
      svgCanvas.pathActions.moveNode(attr, Number(newValue))
    }
    elems = elems ?? selectedElements
    let i = elems.length
    const noXYElems = ['g', 'polyline', 'path']

    while (i--) {
      let elem = elems[i]
      if (!elem) { continue }

      // Set x,y vals on elements that don't have them
      if ((attr === 'x' || attr === 'y') && noXYElems.includes(elem.tagName)) {
        const bbox = svgCanvas.getStrokedBBoxDefaultVisible([elem])
        const diffX = attr === 'x' ? parseFloat(String(newValue)) - bbox.x : 0
        const diffY = attr === 'y' ? parseFloat(String(newValue)) - bbox.y : 0
        svgCanvas.moveSelectedElements(diffX * zoom, diffY * zoom, true)
        continue
      }

      let oldval = attr === '#text' ? svgCanvas.getTextWithNewlines(elem) : elem.getAttribute(attr)
      if (!oldval) { oldval = '' }
      if (oldval !== String(newValue)) {
        if (attr === '#text') {
        // const oldW = utilsGetBBox(elem).width;
        // Multiline values (with `\n`) become tspans; single-line stays plain text.
          svgCanvas.setMultilineText(elem, String(newValue))

          // FF bug occurs on on rotated elements
          if ((/rotate/).test(elem.getAttribute('transform') ?? '')) {
            elem = ffClone(elem)
          }
        // Hoped to solve the issue of moving text with text-anchor="start",
        // but this doesn't actually fix it. Hopefully on the right track, though. -Fyrd
        } else if (attr === '#href') {
          setHref(elem, String(newValue))
        } else if (newValue) {
          elem.setAttribute(attr, String(isNaN(parseFloat(String(newValue))) ? newValue : parseFloat(String(newValue))))
        } else if (typeof newValue === 'number') {
          elem.setAttribute(attr, String(newValue))
        } else {
          elem.removeAttribute(attr)
        }

        // An area text wraps to its box: any attribute that changes the measure re-wraps it.
        if (attr !== '#text' && LAYOUT_ATTRS.has(attr)) reflowAreaText(elem)

        // Go into "select" mode for text changes
        // NOTE: Important that this happens AFTER elem.setAttribute() or else attributes like
        // font-size can get reset to their old value, ultimately by svgEditor.updateContextPanel(),
        // after calling textActions.toSelectMode() below
        if (svgCanvas.getCurrentMode() === 'textedit' && attr !== '#text' && elem.textContent.length) {
          svgCanvas.textActions.toSelectMode(elem)
        }

        // Use the Firefox ffClone hack for text elements with gradients or
        // where other text attributes are changed.
        if (isGecko() &&
        elem.nodeName === 'text' &&
        (/rotate/).test(elem.getAttribute('transform') ?? '') &&
        (String(newValue).startsWith('url') || (['font-size', 'font-family', 'x', 'y'].includes(attr) && elem.textContent))) {
          elem = ffClone(elem)
        }
        // Timeout needed for Opera & Firefox
        // codedread: it is now possible for this to be called with elements
        // that are not in the selectedElements array, we need to only request a
        // selector if the element is in that array
        if (selectedElements.includes(elem)) {
          setTimeout(function () {
          // Due to element replacement, this element may no longer
          // be part of the DOM
            if (!elem.parentNode) { return }
            // The user may have already changed the selection (e.g. clicked
            // away) before this deferred resize runs. requestSelector() locks
            // and re-shows whatever selector it returns, so calling it here
            // unconditionally would resurrect a selection box for an element
            // that isn't selected anymore, leaving it stuck on screen with
            // nothing left to release it.
            if (!svgCanvas.getSelectedElements().includes(elem)) { return }
            svgCanvas.selectorManager.requestSelector(elem).resize()
          }, 0)
        }
        // Only recalculate rotation center for attributes that change element geometry.
        // Non-geometric attributes (stroke-width, fill, opacity, etc.) don't affect
        // the bbox center, so the rotation is already correct and must not be touched.
        // BBOX_AFFECTING_ATTRS is imported from history.js to keep the list in one place.
        const angle = getRotationAngle(elem)
        if (angle !== 0 && attr !== 'transform' && BBOX_AFFECTING_ATTRS.has(attr)) {
          const tlist = getTransformList(elem) as SVGTransformList
          let n = tlist.numberOfItems
          while (n--) {
            const xform = tlist.getItem(n)
            if (xform.type === 4) {
            // Compute bbox BEFORE removing the rotation so we can bail out
            // safely if getBBox returns nothing (avoids losing the rotation).
              const box = utilsGetBBox(elem)
              if (!box) break

              tlist.removeItem(n)

              // Transform bbox center through only the transforms that come
              // AFTER the rotation in the list (not the pre-rotation transforms).
              // After removeItem(n), what was at n+1 is now at n.
              let centerMatrix
              if (n < tlist.numberOfItems) {
                centerMatrix = transformListToTransform(tlist, n, tlist.numberOfItems - 1).matrix
              } else {
                centerMatrix = svgCanvas.getSvgRoot().createSVGMatrix() // identity
              }
              const center = transformPoint(
                box.x + box.width / 2, box.y + box.height / 2, centerMatrix
              )

              const newrot = svgCanvas.getSvgRoot().createSVGTransform()
              newrot.setRotate(angle, center.x, center.y)
              tlist.insertItemBefore(newrot, n)
              break
            }
          }
        }
      } // if oldValue != newValue
    } // for each elem
  }

  /**
* Change the given/selected element and add the original value to the history stack.
* If you want to change all `selectedElements`, ignore the `elems` argument.
* If you want to change only a subset of `selectedElements`, then send the
* subset to this function in the `elems` argument.
* @param attr String with the attribute name
* @param val String or number with the new attribute value
* @param elems The DOM elements to apply the change to
*/
  const changeSelectedAttributeMethod = (attr: string, val: string | number, elems: Element[]): void => {
    const selectedElements = svgCanvas.getSelectedElements()
    elems = elems || selectedElements
    // A plain attribute is an edit of the model (core/model-commands.ts); what needs the DOM's help goes the old way below
    if (svgCanvas.changeSelectedAttributeByModel(attr, val, elems)) return
    svgCanvas.undoMgr.beginUndoableChange(attr, elems)

    changeSelectedAttributeNoUndoMethod(attr, val, elems)

    const batchCmd = svgCanvas.undoMgr.finishUndoableChange()
    if (!batchCmd.isEmpty()) {
      // (not `commitUndoableChange`: changing a text attribute lays the text out again, and that is more than this attribute)
      svgCanvas.undoMgr.addCommandToHistory(batchCmd)
    }
  }

  svgCanvas.undoMgr = getUndoManager()
  svgCanvas.undoMgr.onPush = (cmd: HistoryCommand) => {
    svgCanvas.logDebugEvent?.('history-push', {
      text: cmd.getText?.(),
      type: cmd.type?.() ?? cmd.constructor?.name,
      undoSize: svgCanvas.undoMgr.getUndoStackSize()
    })
  }

  // Undo and redo are model snapshots (R1 step d, core/snapshot-history.ts)
  {
    let layersBefore = ''
    const layerSignature = (content: Element): string[] =>
      Array.from(content.children).filter((el) => el.tagName === 'g').map((el, i) => `${i}:${el.getAttribute('id') ?? ''}:${el.querySelector(':scope > title')?.textContent ?? ''}`)
    const history = new SnapshotHistory({
      count: () => svgCanvas.undoMgr.getUndoStackSize(),
      held: () => svgCanvas.inTransaction(),
      record: (label) => svgCanvas.addCommandToHistory(new hstry.BatchCommand(label)),
      signal: () => svgCanvas.destroyAbort.signal,
      content: () => svgCanvas.getSvgContent(),
      before: () => {
        svgCanvas.clearSelection()
        layersBefore = layerSignature(svgCanvas.getSvgContent()).join('\n')
      },
      patched: (touched) => {
        const content = svgCanvas.getSvgContent()
        // The document size is the viewBox; the width / height follow the zoom
        const [, , w, h] = (content.getAttribute('viewBox') ?? '').split(/\s+/).map(Number)
        if (w > 0 && h > 0 && (w !== svgCanvas.contentW || h !== svgCanvas.contentH)) {
          svgCanvas.contentW = w
          svgCanvas.contentH = h
          const root = svgCanvas.getSvgRoot()
          svgCanvas.updateCanvas(Number(root.getAttribute('width')), Number(root.getAttribute('height')))
        }
        // Undoing a change to the path being node-edited keeps the session going; anything else ends it
        const editedPath = svgCanvas.getCurrentMode() === 'pathedit' ? svgCanvas.getPathObj() : null
        if (editedPath && touched.includes(editedPath.elem)) {
          editedPath.dragging = false
          editedPath.dragctrl = false
          editedPath.init().show(true)
        } else {
          svgCanvas.pathActions.clear()
        }
        // The layer list follows the layers themselves: one added, removed, moved or renamed
        if (layerSignature(content).join('\n') !== layersBefore) svgCanvas.identifyLayers()
        for (const el of touched) if (el.tagName === 'use') svgCanvas.setUseData(el)
        svgCanvas.logDebugEvent?.('history-apply', { direction: 'snapshot', elemIds: touched.map((el) => el.id || null), mode: svgCanvas.getCurrentMode() })
        if (touched.length) {
          svgCanvas.restoring = true
          try { svgCanvas.call('changed', touched) } finally { svgCanvas.restoring = false }
        }
      }
    })
    svgCanvas.snapshotHistory = history
    const mgr = svgCanvas.undoMgr
    const prevPush = mgr.onPush
    mgr.onPush = (cmd) => { prevPush?.(cmd); history.pushed(mgr.getUndoStackSize()) }
    mgr.onReset = () => history.reset()
    mgr.snapshots = history
  }

  return {
    changeSelectedAttributeNoUndo: changeSelectedAttributeNoUndoMethod,
    changeSelectedAttribute: changeSelectedAttributeMethod
  }
}
