/**
 * Grouping operations (group, ungroup, convert-to-group, push group properties
 * down to children), split out of selected-elem.js. Created per SvgCanvas
 * instance and attached to the canvas; selected-elem's `init()` calls this.
 * @module group-ops
 * @license MIT
 */

import { NS } from './namespaces.ts'
import { element } from './model/node.ts'
import { wrapIds } from './model/edit.ts'
import * as hstry from './history.js'
import { warn, error } from '../common/logger.ts'
import { getHref, getRotationAngle, walkTreePost, getFeGaussianBlur } from './dom-utils.ts'
import {
  requireBBox
} from './bbox-utils.ts'
import {
  transformPoint,
  matrixMultiply,
  transformListToTransform,
  getTransformList
} from './math.ts'
import { isGecko } from '../common/browser.ts'
import { getParents } from '../common/util.ts'
import type SvgCanvas from '../svgcanvas.ts'

const {
  Command,
  MoveElementCommand,
  BatchCommand,
  InsertElementCommand,
  RemoveElementCommand,
  ChangeElementCommand
} = hstry

/** The members `group-ops.ts` gives its canvas. */
export interface GroupOpsApi {
  groupSelectedElements(type?: string, urlArg?: string): void
  pushGroupProperties(g: SVGAElement | SVGGElement, undoable: boolean): void | import('./history.js').BatchCommand
  ungroupSelectedElement(): void
}

export const createGroupOps = (canvas: SvgCanvas): GroupOpsApi => {
  const svgCanvas = canvas // per-instance; functions below are closed over it

  /**
 * Wraps all the selected elements in a group (`g`) element.
 * @param type - type of element to group into, defaults to `<g>`
 */
  const groupSelectedElements = (type?: string, urlArg?: string): void => {
    const selectedElements = svgCanvas.getSelectedElements()
    if (!type) {
      type = 'g'
    }
    let cmdStr = ''
    let url: string | undefined

    switch (type) {
      case 'a': {
        cmdStr = 'Make hyperlink'
        url = urlArg || ''
        break
      }
      default: {
        type = 'g'
        cmdStr = 'Group Elements'
        break
      }
    }

    // The container the group goes into (the current layer or group) and the elements it takes, bottom-most last in the list
    const container = svgCanvas.getCurrentGroup() || svgCanvas.getDrawing().getTargetLayerGroup()
    const ids: string[] = []
    for (let i = selectedElements.length - 1; i >= 0; i--) {
      let elem = selectedElements[i]
      if (!elem) continue
      const elemParent = elem.parentNode as Element
      if (elemParent.tagName === 'a' && elemParent.childNodes.length === 1) elem = elemParent
      ids.push(elem.id)
    }
    const groupId = svgCanvas.getNextId(type)
    const attrs = [{ name: 'id', value: groupId }]
    if (type === 'a') attrs.push({ name: 'href', value: url as string })
    const model = element(type, attrs, [])
    svgCanvas.snapshotHistory.edit(cmdStr, (root) => wrapIds(root, container?.id ?? '', model, ids))
    const g = svgCanvas.getElement(groupId) as Element

    // update selection
    svgCanvas.selectOnly([g], true)
  }

  /**
 * Pushes all appropriate parent group properties down to its children, then
 * removes them from the group.
 */
  const pushGroupProperty = (g: SVGAElement | SVGGElement, undoable: boolean): hstry.BatchCommand | void => {
    const children = g.childNodes
    const len = children.length
    const xform = g.getAttribute('transform')

    const glist = getTransformList(g) as SVGTransformList
    const m = transformListToTransform(glist).matrix

    const batchCmd = new BatchCommand('Push group properties')

    // TODO: get all fill/stroke properties from the group that we are about to destroy
    // "fill", "fill-opacity", "fill-rule", "stroke", "stroke-dasharray", "stroke-dashoffset",
    // "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity",
    // "stroke-width"
    // and then for each child, if they do not have the attribute (or the value is 'inherit')
    // then set the child's attribute

    const gangle = getRotationAngle(g)

    const gattrs: { filter: string | null, opacity: string | null } = {
      filter: g.getAttribute('filter'),
      opacity: g.getAttribute('opacity')
    }
    let gfilter: Element | null | undefined
    let gblur: number | string | undefined
    let changes: Record<string, string>
    const drawing = svgCanvas.getDrawing()

    for (let i = 0; i < len; i++) {
      const elem = children[i] as Element

      if (elem.nodeType !== 1) {
        continue
      }

      if (gattrs.opacity !== null) { // (the attribute is a string, so it was never equal to 1)
      // const c_opac = elem.getAttribute('opacity') || 1;
        const newOpac =
        Math.round(Number(elem.getAttribute('opacity') || 1) * Number(gattrs.opacity) * 100) /
        100
        svgCanvas.changeSelectedAttribute('opacity', newOpac, [elem])
      }

      if (gattrs.filter) {
        let cblur: number | string = svgCanvas.getBlur(elem)
        const origCblur = cblur
        if (!gblur) {
          gblur = svgCanvas.getBlur(g)
        }
        if (cblur) {
        // Is this formula correct?
          cblur = Number(gblur) + Number(cblur)
        } else if (cblur === 0) {
          cblur = gblur
        }

        // If child has no current filter, get group's filter or clone it.
        if (!origCblur) {
        // Set group's filter to use first child's ID
          if (!gfilter) {
            gfilter = svgCanvas.getRefElem(gattrs.filter)
          } else {
          // Clone the group's filter
            gfilter = drawing.copyElem(gfilter)
            // copyElem() always returns a real Element today, but this call
            // (Ungroup cloning a shared blur/filter onto each child) is exactly
            // the historical shape of a legacy bug where a filter clone that
            // came back falsy got appended into <defs> anyway, silently
            // inserting a literal "undefined" text node (Element.append()
            // coerces non-Node args via ToString() instead of throwing). Guard
            // explicitly so a future change to copyElem's contract can't
            // reintroduce that silently. `continue`, not `return`: this is the
            // body of pushGroupProperty's own child loop, and one child failing
            // to clone a filter shouldn't abort processing the rest.
            if (!gfilter) continue
            svgCanvas.findDefs().append(gfilter)

            // const filterElem = getRefElem(gfilter);
            const blurElem = getFeGaussianBlur(gfilter)
            // Change this in future for different filters
            const suffix =
            blurElem?.tagName === 'feGaussianBlur' ? 'blur' : 'filter'
            gfilter.id = `${elem.id}_${suffix}`
            svgCanvas.changeSelectedAttribute(
              'filter',
            `url(#${gfilter.id})`,
            [elem]
            )
          }
        } else {
          gfilter = svgCanvas.getRefElem(elem.getAttribute('filter'))
        }
        // const filterElem = getRefElem(gfilter);
        const blurElem = getFeGaussianBlur(gfilter)

        // Update blur value
        if (cblur) {
          svgCanvas.changeSelectedAttribute('stdDeviation', cblur, [blurElem as Element])
          svgCanvas.setBlurOffsets(gfilter as Element, Number(cblur))
        }
      }

      let chtlist: SVGTransformList | null | undefined = getTransformList(elem)

      // Don't process gradient transforms
      if (elem.tagName.includes('Gradient')) {
        chtlist = null
      }

      // Hopefully not a problem to add this. Necessary for elements like <desc/>
      if (!chtlist) {
        continue
      }

      // Apparently <defs> can get get a transformlist, but we don't want it to have one!
      if (elem.tagName === 'defs') {
        continue
      }

      if (glist.numberOfItems) {
      // TODO: if the group's transform is just a rotate, we can always transfer the
      // rotate() down to the children (collapsing consecutive rotates and factoring
      // out any translates)
        if (gangle && glist.numberOfItems === 1) {
        // [Rg] [Rc] [Mc]
        // we want [Tr] [Rc2] [Mc] where:
        //  - [Rc2] is at the child's current center but has the
        // sum of the group and child's rotation angles
        //  - [Tr] is the equivalent translation that this child
        // undergoes if the group wasn't there

          // [Tr] = [Rg] [Rc] [Rc2_inv]

          // Capture the child's pre-bake transform so the change is undoable.
          // Without this, undo restores the group's rotation but leaves the
          // baked rotation on the children, producing a double transform.
          const oldChildXform = elem.getAttribute('transform') || ''

          // get group's rotation matrix (Rg)
          const rgm = glist.getItem(0).matrix

          // get child's rotation matrix (Rc)
          let rcm = svgCanvas.getSvgRoot().createSVGMatrix()
          const cangle = getRotationAngle(elem)
          if (cangle) {
            rcm = chtlist.getItem(0).matrix
          }

          // get child's old center of rotation
          const cbox = requireBBox(elem)
          const ceqm = transformListToTransform(chtlist).matrix
          const coldc = transformPoint(
            cbox.x + cbox.width / 2,
            cbox.y + cbox.height / 2,
            ceqm
          )

          // sum group and child's angles
          const sangle = gangle + cangle

          // get child's rotation at the old center (Rc2_inv)
          const r2 = svgCanvas.getSvgRoot().createSVGTransform()
          r2.setRotate(sangle, coldc.x, coldc.y)

          // calculate equivalent translate
          const trm = matrixMultiply(rgm, rcm, r2.matrix.inverse())

          // set up tlist
          if (cangle) {
            chtlist.removeItem(0)
          }

          if (sangle) {
            if (chtlist.numberOfItems) {
              chtlist.insertItemBefore(r2, 0)
            } else {
              chtlist.appendItem(r2)
            }
          }

          if (trm.e || trm.f) {
            const tr = svgCanvas.getSvgRoot().createSVGTransform()
            tr.setTranslate(trm.e, trm.f)
            if (chtlist.numberOfItems) {
              chtlist.insertItemBefore(tr, 0)
            } else {
              chtlist.appendItem(tr)
            }
          }

          // Record the child's transform change for undo/redo
          if (undoable) {
            batchCmd.addSubCommand(
              new ChangeElementCommand(elem, { transform: oldChildXform })
            )
          }
        } else {
        // more complicated than just a rotate
        // transfer the group's transform down to each child and then
        // call recalculateDimensions()
          const oldxform = elem.getAttribute('transform')
          changes = {}
          changes.transform = oldxform || ''

          // Simply prepend the group's transform to the child's transform list
          // New transform = [group transform] [child transform]
          // This preserves the correct application order
          const newxform = svgCanvas.getSvgRoot().createSVGTransform()
          newxform.setMatrix(m)

          // Insert group's transform at the beginning of child's transform list
          if (chtlist.numberOfItems) {
            chtlist.insertItemBefore(newxform, 0)
          } else {
            chtlist.appendItem(newxform)
          }

          // Record the transform change for undo/redo
          if (undoable) {
            batchCmd.addSubCommand(new ChangeElementCommand(elem, changes))
          }
        }
      // NOTE: We intentionally do NOT call recalculateDimensions here because:
      // 1. It reorders transforms (moves rotate before translate), changing the visual result
      // 2. It recalculates rotation centers, causing elements to jump
      // 3. The prepended group transform is already in the correct position
      // Just leave the transforms as-is after prepending the group's transform
      }
    }

    // remove transform and make it undo-able
    if (xform) {
      changes = {}
      changes.transform = xform
      g.setAttribute('transform', '')
      g.removeAttribute('transform')
      batchCmd.addSubCommand(new ChangeElementCommand(g, changes))
    }

    if (undoable && !batchCmd.isEmpty()) {
      return batchCmd
    }
    return undefined
  }

  /**
 * Converts selected/given `<use>` or child SVG element to a group.
 */
  const convertToGroup = (elem: Element): void => {
    const selectedElements = svgCanvas.getSelectedElements()
    if (!elem) {
      elem = selectedElements[0]
    }
    const $elem = elem
    const batchCmd = new BatchCommand()
    let ts: string
    const dataStorage = svgCanvas.getDataStorage()
    if (dataStorage.has($elem, 'gsvg')) {
    // Use the gsvg as the new group
      const svg = elem.firstChild as Element
      const pt = {
        x: Number(svg.getAttribute('x')),
        y: Number(svg.getAttribute('y'))
      }

      // $(elem.firstChild.firstChild).unwrap();
      const firstChild = (elem.firstChild as ChildNode).firstChild as Element | null
      if (firstChild) {
        const container = svg
        // Snapshot before/after as detached clones (rather than innerHTML
        // strings) so apply/unapply only ever use plain DOM node ops — some
        // DOM implementations mishandle innerHTML/outerHTML round-trips for
        // foreign-namespace (SVG-in-SVG) content.
        const beforeNodes = Array.from(container.childNodes).map(n => n.cloneNode(true))
        firstChild.outerHTML = firstChild.innerHTML
        const afterNodes = Array.from(container.childNodes).map(n => n.cloneNode(true))
        const replaceChildren = (nodes: Node[]): void => {
          while (container.firstChild) { container.removeChild(container.firstChild) }
          nodes.forEach(n => container.appendChild(n.cloneNode(true)))
        }
        const unwrapCmd = new Command()
        ;(unwrapCmd as unknown as { text: string }).text = 'Unwrap SVG'
        unwrapCmd.elements = () => [elem]
        unwrapCmd.apply = handler => {
          Command.prototype.apply.call(unwrapCmd, handler, () => {
            replaceChildren(afterNodes)
          })
        }
        unwrapCmd.unapply = handler => {
          Command.prototype.unapply.call(unwrapCmd, handler, () => {
            replaceChildren(beforeNodes)
          })
        }
        batchCmd.addSubCommand(unwrapCmd)
      }
      dataStorage.remove(elem, 'gsvg')

      const oldTransform = elem.getAttribute('transform') || ''
      const tlist = getTransformList(elem) as SVGTransformList
      const xform = svgCanvas.getSvgRoot().createSVGTransform()
      xform.setTranslate(pt.x, pt.y)
      tlist.appendItem(xform)
      const newTransform = elem.getAttribute('transform') || ''
      if (newTransform !== oldTransform) {
        batchCmd.addSubCommand(new ChangeElementCommand(elem, { transform: oldTransform }))
      }
      svgCanvas.recalculateDimensions(elem)
      svgCanvas.call('selected', [elem])
      if (!batchCmd.isEmpty()) {
        svgCanvas.addCommandToHistory(batchCmd)
      }
    } else if (dataStorage.has($elem, 'symbol')) {
      elem = dataStorage.get($elem, 'symbol')
      if (!elem) {
        warn('Unable to convert <use>: missing symbol reference', null, 'selected-elem')
        return
      }

      ts = $elem.getAttribute('transform') || ''
      const pos = {
        x: Number($elem.getAttribute('x')),
        y: Number($elem.getAttribute('y'))
      }

      const vb = elem.getAttribute('viewBox')

      if (vb) {
        const nums = vb.split(/[ ,]+/)
        pos.x -= Number(nums[0])
        pos.y -= Number(nums[1])
      }

      // Not ideal, but works
      ts += ' translate(' + (pos.x || 0) + ',' + (pos.y || 0) + ')'

      const useParent = $elem.parentNode as Element
      const useNextSibling = $elem.nextSibling

      // Remove <use> element
      batchCmd.addSubCommand(
        new RemoveElementCommand(
          $elem,
          useNextSibling,
          useParent
        )
      )
      $elem.remove()

      // See if other elements reference this symbol
      const svgContent = svgCanvas.getSvgContent()
      // const hasMore = svgContent.querySelectorAll('use:data(symbol)').length;
      // @todo review this logic
      const hasMore = svgContent.querySelectorAll('use').length

      const g = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'g')
      const childs = elem.childNodes

      let i: number
      for (i = 0; i < childs.length; i++) {
        g.append(childs[i].cloneNode(true))
      }

      // Duplicate the gradients for Gecko, since they weren't included in the <symbol>
      if (isGecko()) {
        const svgElement = svgCanvas.findDefs()
        const gradients = svgElement.querySelectorAll(
          'linearGradient,radialGradient,pattern'
        )
        for (let i = 0, im = gradients.length; im > i; i++) {
          g.appendChild(gradients[i].cloneNode(true))
        }
      }

      if (ts) {
        g.setAttribute('transform', ts)
      }

      const parent = elem.parentNode as Element

      svgCanvas.uniquifyElems(g)

      // Put the dupe gradients back into <defs> (after uniquifying them)
      if (isGecko()) {
        const svgElement = svgCanvas.findDefs()
        const elements = g.querySelectorAll(
          'linearGradient,radialGradient,pattern'
        )
        for (let i = 0, im = elements.length; im > i; i++) {
          svgElement.appendChild(elements[i])
        }
      }

      // now give the g itself a new id
      g.id = svgCanvas.getNextId()

      if (useParent) {
        useParent.insertBefore(g, useNextSibling)
      }

      if (parent) {
        if (!hasMore) {
        // remove symbol/svg element
          const { nextSibling } = elem
          elem.remove()
          batchCmd.addSubCommand(
            new RemoveElementCommand(elem, nextSibling, parent)
          )
        }
        batchCmd.addSubCommand(new InsertElementCommand(g))
      }

      svgCanvas.setUseData(g)

      if (isGecko()) {
        svgCanvas.convertGradients(svgCanvas.findDefs())
      } else {
        svgCanvas.convertGradients(g)
      }

      // recalculate dimensions on the top-level children so that unnecessary transforms
      // are removed
      walkTreePost(g, n => {
        try {
          svgCanvas.recalculateDimensions(n)
        } catch (e) {
          error('Error recalculating dimensions', e, 'selected-elem')
        }
      })

      // Give ID for any visible element missing one
      const visElems = g.querySelectorAll(svgCanvas.getVisElems())
      visElems.forEach((el) => {
        if (!el.id) {
          el.id = svgCanvas.getNextId()
        }
      })

      svgCanvas.selectOnly([g])

      const cm = pushGroupProperty(g, true)
      if (cm) {
        batchCmd.addSubCommand(cm)
      }

      svgCanvas.addCommandToHistory(batchCmd)
    } else {
      warn('Unexpected element to ungroup:', elem, 'selected-elem')
    }
  }

  /**
 * Unwraps all the elements in a selected group (`g`) element. This requires
 * significant recalculations to apply group's transforms, etc. to its children.
 */
  const ungroupSelectedElement = (): void => {
    const selectedElements = svgCanvas.getSelectedElements()
    const dataStorage = svgCanvas.getDataStorage()
    let g = selectedElements[0]
    if (!g) {
      return
    }
    if (dataStorage.has(g, 'gsvg') || dataStorage.has(g, 'symbol')) {
    // Is svg, so actually convert to group
      convertToGroup(g)
      return
    }
    if (g.tagName === 'use') {
    // Somehow doesn't have data set, so retrieve
      const href = getHref(g)
      if (!href || !href.startsWith('#')) {
        warn('Unexpected <use> without local reference:', g, 'selected-elem')
        return
      }
      const symbol = svgCanvas.getElement(href.slice(1))
      if (!symbol) {
        warn('Unexpected <use> without resolved reference:', g, 'selected-elem')
        return
      }
      dataStorage.put(g, 'symbol', symbol)
      dataStorage.put(g, 'ref', symbol)
      convertToGroup(g)
      return
    }
    const parentsA = getParents(g.parentNode as Node, 'a')
    if (parentsA?.length) {
      g = parentsA[0]
    }

    // Look for parent "a"
    if (g.tagName === 'g' || g.tagName === 'a') {
      const batchCmd = new BatchCommand('Ungroup Elements')
      const cmd = pushGroupProperty(g as SVGGElement, true)
      if (cmd) {
        batchCmd.addSubCommand(cmd)
      }

      const parent = g.parentNode as Element
      const anchor = g.nextSibling
      const children = new Array(g.childNodes.length)

      let i = 0
      while (g.firstChild) {
        const elem = g.firstChild as Element
        const oldNextSibling = elem.nextSibling as Element | null
        const oldParent = elem.parentNode as Element

        // Remove child title elements
        if (elem.tagName === 'title') {
          const { nextSibling } = elem
          batchCmd.addSubCommand(
            new RemoveElementCommand(elem, nextSibling, oldParent)
          )
          elem.remove()
          continue
        }

        children[i++] = parent.insertBefore(elem, anchor)
        batchCmd.addSubCommand(
          new MoveElementCommand(elem, oldNextSibling, oldParent)
        )
      }

      // remove the group from the selection
      svgCanvas.clearSelection()

      // delete the group element (but make undo-able)
      const gNextSibling = g.nextSibling
      g.remove()
      batchCmd.addSubCommand(new RemoveElementCommand(g, gNextSibling, parent))

      if (!batchCmd.isEmpty()) {
        svgCanvas.addCommandToHistory(batchCmd)
      }

      // update selection
      svgCanvas.addToSelection(children)
    }
  }

  return {
    groupSelectedElements, // Wraps all the selected elements in a group (`g`) element.
    pushGroupProperties: pushGroupProperty, // Pushes all appropriate parent group properties down to its children
    ungroupSelectedElement // Unwraps all the elements in a selected group (`g`) element
  }
}
