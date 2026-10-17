/**
 * Tools for selection.
 * @module selection
 * @license MIT
 * @copyright 2011 Jeff Schiller
 */

import { NS } from './namespaces.ts'
import { requireBBox } from './bbox-utils.ts'
import {
  transformPoint,
  transformListToTransform,
  rectsIntersect,
  getTransformList,
  getMatrixToContent,
  transformBox,
  isIdentity
} from './math.ts'
import * as hstry from './history.js'
import { getClosest } from '../common/util.ts'
import Layer from './layer.ts'
import { isObjectLocked, isObjectHidden } from './object-state.ts'
import { isExtensionHook } from './extension-hooks.ts'
import { sanitizeSvg } from './sanitize.ts'
import { warn, error as logError } from '../common/logger.ts'
import type SvgCanvas from '../svgcanvas.ts'
import type { ExtensionResult } from '../svgcanvas-members.js'
import type { BBox } from '../svgcanvas.ts'
import type { BBoxObject } from './bbox-utils.ts'
import type { ElementAndBBox } from './canvas-state.ts'
import type { ExtensionHookPayloads } from './extension-hooks.ts'

type ExtensionHook = (vars: unknown) => unknown

const { BatchCommand } = hstry

/** The members `selection.ts` gives its canvas. */
export interface SelectionApi {
  /** The element a pointer event is on, as the selection logic sees it (the svg root for "nothing"). */
  getMouseTarget(evt: Event): Element
  getMouseTarget(evt: Event | null | undefined): Element | null
  getMouseTargetFromNode(node: Element): Element
  getMouseTargetFromNode(node: Element | null | undefined): Element | null
  clearSelection(noCall?: boolean): void
  /** Strip disallowed elements/attributes from `node` in place (per-instance). */
  addToSelection(elemsToAdd: ArrayLike<Element>, showGrips?: boolean): void
  getIntersectionList(rect?: BBox): Element[] | null
  runExtensions(action: keyof ExtensionHookPayloads, vars: unknown, returnArray: true): ExtensionResult[]
  runExtensions(action: keyof ExtensionHookPayloads, vars?: unknown, returnArray?: false): ExtensionResult | false
  groupSvgElem(elem: Element): void
  prepareSvg(newDoc: XMLDocument): void
  recalculateAllSelectedDimensions(): void
  setRotationAngle(val: number, preventUndo?: boolean): void
  updateGroupSelector(elem?: Element): void
}

export const createSelection = (canvas: SvgCanvas): SelectionApi => {
  const svgCanvas = canvas // per-instance; functions below are closed over it

  /**
 * Shows or hides the multi-selection group box + resize grips depending on how
 * many elements are currently selected. With 2+ elements selected it draws one
 * union bounding box (uniform group-scale); otherwise it hides it so the normal
 * single-element selector takes over.
 */
  const updateGroupSelectorMethod = (): void => {
    const elems = svgCanvas.getSelectedElements().filter(Boolean)
    if (elems.length > 1) {
      svgCanvas.selectorManager.showGroupSelector(svgCanvas.getStrokedBBoxDefaultVisible(elems))
    } else {
      svgCanvas.selectorManager.hideGroupSelector()
    }
  }

  /**
 * Clears the selection. The 'selected' handler is then optionally called.
 * This should really be an intersection applying to all types rather than a union.
 */
  const clearSelectionMethod = (noCall?: boolean): void => {
    const selectedElements = svgCanvas.getSelectedElements()
    selectedElements.forEach((elem) => {
      if (!elem) {
        return
      }

      svgCanvas.selectorManager.releaseSelector(elem)
    })
    svgCanvas?.setEmptySelectedElements()
    svgCanvas.updateGroupSelector()

    if (!noCall) {
      svgCanvas.call('selected', svgCanvas.getSelectedElements())
    }
  }

  /**
 * Adds a list of elements to the selection. The 'selected' handler is then called.
 */
  const addToSelectionMethod = (elemsToAdd: ArrayLike<Element>, showGrips?: boolean): void => {
    const selectedElements = svgCanvas.getSelectedElements()
    if (!elemsToAdd.length) {
      return
    }
    // find the first null in our selectedElements array

    let firstNull = 0
    while (firstNull < selectedElements.length) {
      if (selectedElements[firstNull] === null) {
        break
      }
      ++firstNull
    }

    // now add each element consecutively
    let i = elemsToAdd.length
    while (i--) {
      let elem = elemsToAdd[i] as Element & Partial<SVGGraphicsElement>
      if (!elem || !elem.getBBox) {
        continue
      }

      if (elem.tagName === 'a' && elem.childNodes.length === 1) {
      // Make "a" element's child be the selected element
        elem = elem.firstChild as Element & Partial<SVGGraphicsElement>
      }

      // Locked objects (and everything in a locked group) cannot be selected
      if (isObjectLocked(elem)) {
        continue
      }

      // if it's not already there, add it
      if (!selectedElements.includes(elem)) {
        selectedElements[firstNull] = elem

        // only the first selectedBBoxes element is ever used in the codebase these days
        // if (j === 0) selectedBBoxes[0] = utilsGetBBox(elem);
        firstNull++
        const sel = svgCanvas.selectorManager.requestSelector(elem)

        if (selectedElements.length > 1) {
          sel.showGrips(false)
        }
      }
    }
    if (!selectedElements.length) {
      return
    }
    svgCanvas.call('selected', selectedElements)

    if (selectedElements.length === 1) {
      svgCanvas.selectorManager
        .requestSelector(selectedElements[0])
        .showGrips(Boolean(showGrips))
    }

    // make sure the elements are in the correct order
    // See: https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-compareDocumentPosition

    selectedElements.sort((a, b) => {
      if (a && b && typeof a.compareDocumentPosition === 'function') {
        return 3 - (b.compareDocumentPosition(a) & 6)
      }
      if (!a) {
        return 1
      }
      return 0
    })

    // Make sure first elements are not null
    while (!selectedElements[0]) {
      selectedElements.shift()
    }

    // draw/refresh the group box when 2+ elements are selected
    svgCanvas.updateGroupSelector()
  }
  /**
 */
  const getMouseTargetMethod = (evt: Event | null | undefined): Element | null => {
    if (!evt) {
      return null
    }
    return getMouseTargetFromNode(evt.target as Element)
  }
  /**
 * Resolve a raw DOM node (e.g. the literal element under the cursor) to the
 * selectable element it represents, honoring the current group-isolation
 * context. Shared by `getMouseTarget` (which passes `evt.target`) and the
 * proximity hit-testing in `event.js` (which passes nodes from
 * `elementsFromPoint`).
 */
  const getMouseTargetFromNode = (node: Element | null | undefined): Element | null => {
    if (!node) {
      return null
    }
    // (walks up the tree: a step past the top is null, which the checks below catch)
    type Target = Element & { correspondingUseElement?: Element }
    let mouseTarget = node as Target

    // if it was a <use>, Opera and WebKit return the SVGElementInstance
    if (mouseTarget.correspondingUseElement) {
      mouseTarget = mouseTarget.correspondingUseElement
    }

    // for foreign content, go up until we find the foreignObject
    // WebKit browsers set the mouse target to the svgcanvas div
    if (
      ([NS.MATH, NS.HTML] as string[]).includes(mouseTarget.namespaceURI as string) &&
    mouseTarget.id !== 'svgcanvas'
    ) {
      while (mouseTarget.nodeName !== 'foreignObject') {
        mouseTarget = mouseTarget.parentNode as Target
        if (!mouseTarget) {
          return svgCanvas.getSvgRoot()
        }
      }
    }

    // Get the desired mouseTarget with jQuery selector-fu
    // If it's root-like, select the root
    const currentLayer = svgCanvas.getCurrentDrawing().getCurrentLayer()
    const currentGroup = svgCanvas.getCurrentGroup()
    const svgRoot = svgCanvas.getSvgRoot()
    const container = svgCanvas.getDOMContainer()
    const content = svgCanvas.getSvgContent()
    // In All Layers mode (and not isolated inside a group), any layer is a
    // valid selection boundary, not just the current one.
    const anyLayer = svgCanvas.getAllLayersMode() && !currentGroup
    if (
      ([svgRoot, container, content, currentLayer] as Element[]).includes(mouseTarget) ||
    (anyLayer && Layer.isLayer(mouseTarget))
    ) {
      return svgCanvas.getSvgRoot()
    }

    // If it's a selection grip, return the grip parent
    if (getClosest(mouseTarget.parentNode as Element, '#selectorParentGroup')) {
    // While we could instead have just returned mouseTarget,
    // this makes it easier to indentify as being a selector grip
      return svgCanvas.selectorManager.selectorParentGroup
    }

    // anyLayer is a deliberately loop-invariant guard; mouseTarget (the other
    // operand) is what actually advances the loop each iteration.
    /* eslint-disable-next-line no-unmodified-loop-condition */
    while (
      !mouseTarget?.parentNode?.isSameNode(currentGroup || currentLayer) &&
    /* eslint-disable-next-line no-unmodified-loop-condition */
    !(anyLayer && Layer.isLayer(mouseTarget?.parentNode as Element))
    ) {
      mouseTarget = mouseTarget.parentNode as Target
      // The node isn't inside the drawing at all (interactive overlays like
      // the ruler guides, editor chrome) — treat it like empty canvas instead
      // of walking off the top of the document.
      if (!mouseTarget) return svgCanvas.getSvgRoot()
    }

    // A locked object is not a target: the press falls through to the canvas
    if (isObjectLocked(mouseTarget)) return svgCanvas.getSvgRoot()

    return mouseTarget
  }
  /**
 * Run a hook on every extension that has it.
 * @todo Consider: Should this return an array by default, so extension results aren't overwritten?
 * @param action - A registered hook name (see core/extension-hooks.ts)
 * @param vars - The hook's payload, typed by `ExtensionHookPayloads` (or a function of the extension name returning it)
 * @returns each extension's result (an array with `returnArray`, else the last one; `false` when none ran)
 */
  const runExtensionsMethod = ((
    action: keyof ExtensionHookPayloads,
    vars?: unknown,
    returnArray?: boolean
  ): unknown => {
    if (!isExtensionHook(action)) {
      warn(`runExtensions: unknown hook "${action}"; add it to extension-hooks.ts`, undefined, 'extensions')
    }
    let result: unknown = false
    const results: unknown[] = []
    for (const [name, ext] of Object.entries(svgCanvas.getExtensions())) {
      if (typeof vars === 'function') {
        vars = (vars as (name: string) => unknown)(name) // ext, action
      }
      if (ext.eventBased) {
        const event = new CustomEvent('svgedit', {
          detail: {
            action,
            vars
          }
        })
        document.dispatchEvent(event)
      } else if (ext[action]) {
        try {
          if (returnArray) {
            results.push((ext[action] as ExtensionHook)(vars))
          } else {
            result = (ext[action] as ExtensionHook)(vars)
          }
        } catch (err) {
          logError(`Extension "${name}" threw during "${action}":`, err, 'selection')
        }
      }
    }
    return returnArray ? results : result
  }) as SvgCanvas['runExtensions']

  /**
 * Get all elements that have a BBox (excludes `<defs>`, `<title>`, etc).
 * Note that 0-opacity, off-screen etc elements are still considered "visible"
 * for this function.
 * @param parent - The parent DOM element to search within
 */
  const getVisibleElementsAndBBoxes = (parent: Element): ElementAndBBox[] => {
    if (!parent) {
      const svgContent = svgCanvas.getSvgContent()
      parent = svgContent
    }
    const contentElems: ElementAndBBox[] = []
    const elements = parent.children
    // When the parent is a transformed container (e.g. rubber-band selecting
    // while editing inside a group), child bboxes are returned in the parent's
    // local space. Map them to content space so intersection testing matches the
    // rubber band, which is tracked in content coords. No-op for an untransformed
    // parent such as a layer.
    const toContent = parent.nodeType === 1 ? getMatrixToContent(parent) : null
    const mapBox = (bb: BBoxObject | null): BBoxObject | null => {
      if (!bb || !toContent || isIdentity(toContent)) { return bb }
      return transformBox(bb.x, bb.y, bb.width, bb.height, toContent).aabox
    }
    Array.from(elements).forEach((elem) => {
      if ((elem as SVGGraphicsElement).getBBox && !isObjectLocked(elem) && !isObjectHidden(elem)) {
        contentElems.push({ elem, bbox: mapBox(svgCanvas.getStrokedBBoxDefaultVisible([elem])) })
      }
    })
    return contentElems.reverse()
  }

  /**
 * This method sends back an array or a NodeList full of elements that
 * intersect the multi-select rubber-band-box on the currentLayer only.
 *
 * We brute-force `getIntersectionList` for browsers that do not support it (Firefox).
 *
 * Reference:
 * Firefox does not implement `getIntersectionList()`, see {@link https://bugzilla.mozilla.org/show_bug.cgi?id=501421}.
 * @returns Bbox elements
 */
  const getIntersectionListMethod = (rect?: BBox): Element[] | null => {
    const zoom = svgCanvas.getZoom()
    if (!svgCanvas.getRubberBox()) {
      return null
    }

    const parent =
    svgCanvas.getCurrentGroup() ||
    svgCanvas.getCurrentDrawing().getCurrentLayer()

    // the rubber band in content units (from the rubber-band element's own box, or the caller's)
    let rubberBBox: BBox
    if (!rect) {
      const box = requireBBox(svgCanvas.getRubberBox())
      rubberBBox = { x: box.x / zoom, y: box.y / zoom, width: box.width / zoom, height: box.height / zoom }
    } else {
      rubberBBox = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }

    const resultList: Element[] = []
    if (svgCanvas.getCurBBoxes().length === 0) {
    // Cache all bboxes. In All Layers mode (and not isolated inside a
    // group), gather bboxes from every visible layer instead of just
    // the current one, so the rubber band can pick up elements anywhere.
      if (svgCanvas.getAllLayersMode() && !svgCanvas.getCurrentGroup()) {
        const drawing = svgCanvas.getCurrentDrawing()
        let boxes: ElementAndBBox[] = []
        for (let li = 0; li < drawing.getNumLayers(); li++) {
          const layerName = drawing.getLayerName(li)
          if (!drawing.getLayerVisibility(layerName)) { continue }
          boxes = boxes.concat(getVisibleElementsAndBBoxes(drawing.getLayerByName(layerName) as Element))
        }
        svgCanvas.setCurBBoxes(boxes)
      } else {
        svgCanvas.setCurBBoxes(getVisibleElementsAndBBoxes(parent as Element))
      }
    }
    let i = svgCanvas.getCurBBoxes().length
    while (i--) {
      const curBBoxes = svgCanvas.getCurBBoxes()
      if (!rubberBBox.width) {
        continue
      }
      const { bbox, elem } = curBBoxes[i]
      if (bbox && rectsIntersect(rubberBBox, bbox)) {
        resultList.push(elem)
      }
    }

    // addToSelection expects an array, but it's ok to pass a NodeList
    // because using square-bracket notation is allowed:
    // https://www.w3.org/TR/DOM-Level-2-Core/ecma-script-binding.html
    return resultList
  }

  /**
 * Wrap an SVG element into a group element, mark the group as 'gsvg'.
 * @param elem - SVG element to wrap
 */
  const groupSvgElem = (elem: Element): void => {
    const dataStorage = svgCanvas.getDataStorage()
    const g = document.createElementNS(NS.SVG, 'g')
    elem.replaceWith(g)
    g.appendChild(elem)
    dataStorage.put(g, 'gsvg', elem)
    g.id = svgCanvas.getNextId('g')
  }

  /**
 * Runs the SVG Document through the sanitizer and then updates its paths.
 * @param newDoc - The SVG DOM document
 */
  const prepareSvg = (newDoc: XMLDocument): void => {
    sanitizeSvg(svgCanvas, newDoc.documentElement)

    // convert paths into absolute commands
    const paths = [...newDoc.getElementsByTagNameNS(NS.SVG, 'path')]
    paths.forEach((path) => {
      const convertedPath = svgCanvas.pathActions.convertPath(path as SVGPathElement, false)
      path.setAttribute('d', convertedPath)
      svgCanvas.pathActions.fixEnd(path)
    })
  }

  /**
 * Removes any old rotations if present, prepends a new rotation at the
 * transformed center.
 * @param angle - The new rotation angle in degrees
 * @param preventUndo - Indicates whether the action should be undoable or not
 */
  const setRotationAngle = (angle: string | number, preventUndo: boolean): void => {
    const selectedElements = svgCanvas.getSelectedElements()
    // ensure val is the proper type
    const val = Number.parseFloat(String(angle))
    const elem = selectedElements[0]
    const oldTransform = elem.getAttribute('transform')
    const bbox = requireBBox(elem)
    const cx = bbox.x + bbox.width / 2
    const cy = bbox.y + bbox.height / 2
    const tlist = getTransformList(elem) as SVGTransformList

    // only remove the real rotational transform if present (i.e. at index=0)
    if (tlist.numberOfItems > 0) {
      const xform = tlist.getItem(0)
      if (xform.type === 4) {
        tlist.removeItem(0)
      }
    }
    // find Rnc and insert it
    if (val !== 0) {
      const center = transformPoint(
        cx,
        cy,
        transformListToTransform(tlist).matrix
      )
      // Safety check: if center coordinates are invalid (NaN), fall back to untransformed bbox center
      const centerX = Number.isFinite(center.x) ? center.x : cx
      const centerY = Number.isFinite(center.y) ? center.y : cy
      const Rnc = svgCanvas.getSvgRoot().createSVGTransform()
      Rnc.setRotate(val, centerX, centerY)
      if (tlist.numberOfItems) {
        tlist.insertItemBefore(Rnc, 0)
      } else {
        tlist.appendItem(Rnc)
      }
    } else if (tlist.numberOfItems === 0) {
      elem.removeAttribute('transform')
    }

    if (!preventUndo) {
    // we need to undo it, then redo it so it can be undo-able! :)
    // TODO: figure out how to make changes to transform list undo-able cross-browser?
      let newTransform = elem.getAttribute('transform')

      // new transform is something like: 'rotate(5 1.39625e-8 -11)'
      // we round the x so it becomes 'rotate(5 0 -11)'
      // Only do this manipulation if the first transform is actually a rotation
      if (newTransform && newTransform.startsWith('rotate(')) {
        const match = newTransform.match(/^rotate\(([\d.\-e]+)\s+([\d.\-e]+)\s+([\d.\-e]+)\)(.*)/)
        if (match) {
          const angle = Number.parseFloat(match[1])
          const round = (num: string | number): number => Math.round(Number(num) + Number.EPSILON)
          const x = round(match[2])
          const y = round(match[3])
          const restOfTransform = match[4] || '' // Preserve any transforms after the rotate
          newTransform = `rotate(${angle} ${x} ${y})${restOfTransform}`
        }
      }

      if (oldTransform) {
        elem.setAttribute('transform', oldTransform)
      } else {
        elem.removeAttribute('transform')
      }
      svgCanvas.changeSelectedAttribute(
        'transform',
        newTransform as string,
        selectedElements
      )
      svgCanvas.call('changed', selectedElements)
    }
    // const pointGripContainer = svgCanvas.getElement('pathpointgrip_container');
    // if (elem.nodeName === 'path' && pointGripContainer) {
    //   pathActions.setPointContainerTransform(elem.getAttribute('transform'));
    // }
    const selector = svgCanvas.selectorManager.requestSelector(
      selectedElements[0]
    )
    selector.resize()
    svgCanvas.getSelector().updateGripCursors(val)
  }

  /**
 * Runs `recalculateDimensions` on the selected elements,
 * adding the changes to a single batch command.
 */
  const recalculateAllSelectedDimensions = (): void => {
    const text =
    svgCanvas.getCurrentResizeMode() === 'none' ? 'position' : 'size'
    const batchCmd = new BatchCommand(text)
    const selectedElements = svgCanvas.getSelectedElements()

    selectedElements.forEach((elem) => {
      const cmd = svgCanvas.recalculateDimensions(elem)
      if (cmd) {
        batchCmd.addSubCommand(cmd)
      }
    })

    if (!batchCmd.isEmpty()) {
      svgCanvas.addCommandToHistory(batchCmd)
      svgCanvas.call('changed', selectedElements)
    }
  }

  return {
    // null only for a missing event / node; the declaration overloads that (members.d.ts)
    getMouseTarget: getMouseTargetMethod as SvgCanvas['getMouseTarget'],
    getMouseTargetFromNode: getMouseTargetFromNode as SvgCanvas['getMouseTargetFromNode'],
    clearSelection: clearSelectionMethod,
    addToSelection: addToSelectionMethod,
    getIntersectionList: getIntersectionListMethod,
    runExtensions: runExtensionsMethod,
    groupSvgElem,
    prepareSvg,
    recalculateAllSelectedDimensions,
    setRotationAngle,
    updateGroupSelector: updateGroupSelectorMethod
  }
}
