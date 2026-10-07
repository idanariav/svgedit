/**
 * Defs / reference maintenance for the document: id uniquification, `<use>`
 * wiring, unused-def cleanup, and the load-time gradient and drop-shadow-filter
 * conversions. Split out of svg-exec.js; each function is still exposed on the
 * canvas under its original name.
 * @module svg-defs
 * @license MIT
 */

import { getHref, walkTree } from './dom-utils.js'
import { getBBox as utilsGetBBox } from './bbox-utils.js'
import {
  transformPoint,
  transformListToTransform,
  getTransformList
} from './math.js'
import { isWebkit } from '../common/browser.js'
import { NS } from './namespaces.js'

export const init = canvas => {
  const svgCanvas = canvas // per-instance; functions below are closed over it

  /**
 * Ensure each element has a unique ID.
 * @function module:svgcanvas.SvgCanvas#uniquifyElems
 * @param {Element} g - The parent element of the tree to give unique IDs
 * @returns {void}
 */
  const uniquifyElemsMethod = g => {
    const ids = {}
    // TODO: Handle markers and connectors. These are not yet re-identified properly
    // as their referring elements do not get remapped.
    //
    // <marker id='se_marker_end_svg_7'/>
    // <polyline id='svg_7' se:connector='svg_1 svg_6' marker-end='url(#se_marker_end_svg_7)'/>
    //
    // Problem #1: if svg_1 gets renamed, we do not update the polyline's se:connector attribute
    // Problem #2: if the polyline svg_7 gets renamed, we do not update the marker id nor the polyline's marker-end attribute
    const refElems = [
      'filter',
      'linearGradient',
      'pattern',
      'radialGradient',
      'symbol',
      'textPath',
      'use'
    ]

    walkTree(g, n => {
    // if it's an element node
      if (n.nodeType === 1) {
      // and the element has an ID
        if (n.id) {
        // and we haven't tracked this ID yet
          if (!(n.id in ids)) {
          // add this id to our map
            ids[n.id] = { elem: null, attrs: [], hrefs: [] }
          }
          ids[n.id].elem = n
        }

        // now search for all attributes on this element that might refer
        // to other elements
        svgCanvas.getrefAttrs().forEach(attr => {
          const attrnode = n.getAttributeNode(attr)
          if (attrnode) {
          // the incoming file has been sanitized, so we should be able to safely just strip off the leading #
            const url = svgCanvas.getUrlFromAttr(attrnode.value)
            const refid = url ? url.substr(1) : null
            if (refid) {
              if (!(refid in ids)) {
              // add this id to our map
                ids[refid] = { elem: null, attrs: [], hrefs: [] }
              }
              ids[refid].attrs.push(attrnode)
            }
          }
        })

        // check xlink:href now
        const href = svgCanvas.getHref(n)
        // TODO: what if an <image> or <a> element refers to an element internally?
        if (href && refElems.includes(n.nodeName)) {
          const refid = href.substr(1)
          if (refid) {
            if (!(refid in ids)) {
            // add this id to our map
              ids[refid] = { elem: null, attrs: [], hrefs: [] }
            }
            ids[refid].hrefs.push(n)
          }
        }
      }
    })

    // in ids, we now have a map of ids, elements and attributes, let's re-identify
    for (const oldid in ids) {
      if (!oldid) {
        continue
      }
      const { elem } = ids[oldid]
      if (elem) {
        const newid = svgCanvas.getNextId()

        // assign element its new id
        elem.id = newid

        // remap all url() attributes
        const { attrs } = ids[oldid]
        let j = attrs.length
        while (j--) {
          const attr = attrs[j]
          attr.ownerElement.setAttribute(attr.name, `url(#${newid})`)
        }

        // remap all href attributes
        const hreffers = ids[oldid].hrefs
        let k = hreffers.length
        while (k--) {
          const hreffer = hreffers[k]
          svgCanvas.setHref(hreffer, '#' + newid)
        }
      }
    }
  }

  /**
 * Assigns reference data for each use element.
 * @function module:svgcanvas.SvgCanvas#setUseData
 * @param {Element} parent
 * @returns {void}
 */
  const setUseDataMethod = parent => {
    let elems = parent

    if (parent.tagName !== 'use') {
    // elems = elems.find('use');
      elems = elems.querySelectorAll('use')
    }

    Array.prototype.forEach.call(elems, (el, _) => {
      const dataStorage = svgCanvas.getDataStorage()
      const href = svgCanvas.getHref(el)
      if (!href || !href.startsWith('#')) {
        return
      }
      const id = href.substr(1)
      const refElem = svgCanvas.getElement(id)
      if (!refElem) {
        return
      }
      dataStorage.put(el, 'ref', refElem)
      if (refElem.tagName === 'symbol' || refElem.tagName === 'svg') {
        dataStorage.put(el, 'symbol', refElem)
        dataStorage.put(el, 'ref', refElem)
      }
    })
  }

  /**
 * Looks at DOM elements inside the `<defs>` to see if they are referred to,
 * removes them from the DOM if they are not.
 * @function module:svgcanvas.SvgCanvas#removeUnusedDefElems
 * @returns {Integer} The number of elements that were removed
 */
  const removeUnusedDefElemsMethod = () => {
    const defs = svgCanvas.getSvgContent().getElementsByTagNameNS(NS.SVG, 'defs')
    if (!defs || !defs.length) {
      return 0
    }

    // if (!defs.firstChild) { return; }

    const defelemUses = []
    let numRemoved = 0
    const attrs = [
      'fill',
      'stroke',
      'filter',
      'marker-start',
      'marker-mid',
      'marker-end'
    ]
    const alen = attrs.length

    const allEls = svgCanvas.getSvgContent().getElementsByTagNameNS(NS.SVG, '*')
    const allLen = allEls.length

    let i
    let j
    for (i = 0; i < allLen; i++) {
      const el = allEls[i]
      for (j = 0; j < alen; j++) {
        const ref = svgCanvas.getUrlFromAttr(el.getAttribute(attrs[j]))
        if (ref) {
          defelemUses.push(ref.substr(1))
        }
      }

      // gradients can refer to other gradients
      const href = getHref(el)
      if (href && href.startsWith('#')) {
        defelemUses.push(href.substr(1))
      }
    }

    Array.prototype.forEach.call(defs, (def, i) => {
      const defelems = def.querySelectorAll(
        'linearGradient, radialGradient, filter, marker, svg, symbol'
      )
      i = defelems.length
      while (i--) {
        const defelem = defelems[i]
        const { id } = defelem
        if (!defelemUses.includes(id)) {
        // Not found, so remove (but remember)
          svgCanvas.setRemovedElements(id, defelem)
          defelem.remove()
          numRemoved++
        }
      }
    })

    return numRemoved
  }
  /**
 * Converts gradients from userSpaceOnUse to objectBoundingBox.
 * @function module:svgcanvas.SvgCanvas#convertGradients
 * @param {Element} elem
 * @returns {void}
 */
  const convertGradientsMethod = elem => {
    let elems = elem.querySelectorAll('linearGradient, radialGradient')
    if (!elems.length && isWebkit()) {
    // Bug in webkit prevents regular *Gradient selector search
      elems = Array.prototype.filter.call(elem.querySelectorAll('*'), curThis => {
        return curThis.tagName.includes('Gradient')
      })
    }
    Array.prototype.forEach.call(elems, grad => {
      if (grad.getAttribute('gradientUnits') === 'userSpaceOnUse') {
        const svgContent = svgCanvas.getSvgContent()
        // TODO: Support more than one element with this ref by duplicating parent grad
        let fillStrokeElems = svgContent.querySelectorAll(
          '[fill="url(#' + grad.id + ')"],[stroke="url(#' + grad.id + ')"]'
        )
        if (!fillStrokeElems.length) {
          const tmpFillStrokeElems = svgContent.querySelectorAll(
            '[*|href="#' + grad.id + '"]'
          )
          if (!tmpFillStrokeElems.length) {
            return
          } else {
            if (
              (tmpFillStrokeElems[0].tagName === 'linearGradient' ||
              tmpFillStrokeElems[0].tagName === 'radialGradient') &&
            tmpFillStrokeElems[0].getAttribute('gradientUnits') ===
              'userSpaceOnUse'
            ) {
              fillStrokeElems = svgContent.querySelectorAll(
                '[fill="url(#' +
                tmpFillStrokeElems[0].id +
                ')"],[stroke="url(#' +
                tmpFillStrokeElems[0].id +
                ')"]'
              )
            } else {
              return
            }
          }
        }
        // get object's bounding box
        const bb = utilsGetBBox(fillStrokeElems[0])

        // This will occur if the element is inside a <defs> or a <symbol>,
        // in which we shouldn't need to convert anyway.
        if (!bb) {
          return
        }
        if (grad.tagName === 'linearGradient') {
          const gCoords = {
            x1: grad.getAttribute('x1'),
            y1: grad.getAttribute('y1'),
            x2: grad.getAttribute('x2'),
            y2: grad.getAttribute('y2')
          }

          // If has transform, convert
          const tlist = getTransformList(grad)
          if (tlist?.numberOfItems > 0) {
            const m = transformListToTransform(tlist).matrix
            const pt1 = transformPoint(gCoords.x1, gCoords.y1, m)
            const pt2 = transformPoint(gCoords.x2, gCoords.y2, m)

            gCoords.x1 = pt1.x
            gCoords.y1 = pt1.y
            gCoords.x2 = pt2.x
            gCoords.y2 = pt2.y
            grad.removeAttribute('gradientTransform')
          }
          grad.setAttribute('x1', (gCoords.x1 - bb.x) / bb.width)
          grad.setAttribute('y1', (gCoords.y1 - bb.y) / bb.height)
          grad.setAttribute('x2', (gCoords.x2 - bb.x) / bb.width)
          grad.setAttribute('y2', (gCoords.y2 - bb.y) / bb.height)
          grad.removeAttribute('gradientUnits')
        } else if (grad.tagName === 'radialGradient') {
          const getNum = (value, fallback) => {
            const num = Number(value)
            return Number.isFinite(num) ? num : fallback
          }
          let cx = getNum(grad.getAttribute('cx'), 0.5)
          let cy = getNum(grad.getAttribute('cy'), 0.5)
          let r = getNum(grad.getAttribute('r'), 0.5)
          let fx = getNum(grad.getAttribute('fx'), cx)
          let fy = getNum(grad.getAttribute('fy'), cy)

          // If has transform, convert
          const tlist = getTransformList(grad)
          if (tlist?.numberOfItems > 0) {
            const m = transformListToTransform(tlist).matrix
            const cpt = transformPoint(cx, cy, m)
            const fpt = transformPoint(fx, fy, m)
            const rpt = transformPoint(cx + r, cy, m)
            cx = cpt.x
            cy = cpt.y
            fx = fpt.x
            fy = fpt.y
            r = Math.hypot(rpt.x - cpt.x, rpt.y - cpt.y)
            grad.removeAttribute('gradientTransform')
          }

          if (!bb.width || !bb.height) {
            return
          }
          grad.setAttribute('cx', (cx - bb.x) / bb.width)
          grad.setAttribute('cy', (cy - bb.y) / bb.height)
          grad.setAttribute('fx', (fx - bb.x) / bb.width)
          grad.setAttribute('fy', (fy - bb.y) / bb.height)
          grad.setAttribute('r', r / Math.max(bb.width, bb.height))
          grad.removeAttribute('gradientUnits')
        }
      }
    })
  }
  /**
 * Re-derive the region of every effect filter (built by fx-filter: an
 * `<feDropShadow>` for the shadow slice and/or an `<feMorphology>` for the
 * outline slice) from the referencing element's current bounding box, in
 * absolute `userSpaceOnUse` units. Effect filters use an absolute region (a
 * bbox-relative region collapses to nothing for axis-aligned lines, whose bbox
 * is zero in one dimension, hiding the line); re-deriving on load realigns a
 * filter to wherever its element now sits and migrates any legacy
 * `objectBoundingBox` shadow filter to the absolute scheme. Padding mirrors
 * fx-filter's setRegion (half the stroke plus whichever effect reaches
 * furthest).
 * @function module:svgcanvas.SvgCanvas#convertDropShadowFilters
 * @param {Element} elem
 * @returns {void}
 */
  const convertDropShadowFiltersMethod = elem => {
    const filters = elem.querySelectorAll('filter')
    Array.prototype.forEach.call(filters, filter => {
      const ds = filter.querySelector('feDropShadow')
      const morph = filter.querySelector('feMorphology')
      if (!ds && !morph) {
        return
      }
      // Locate the element wearing this filter so the region can be based on its
      // bbox. Each effect filter is referenced by exactly one element.
      const ref = elem.querySelector(`[filter="url(#${filter.id})"]`)
      if (!ref) { return }
      const bb = utilsGetBBox(ref)
      if (!bb) { return }
      // Pad for whichever effect reaches furthest (mirrors fx-filter setRegion).
      // A missing stroke-width means the SVG initial value of 1, not 0 — cleanupElement
      // strips the attribute at that value.
      const swAttr = ref.getAttribute('stroke-width')
      const sw = swAttr === null ? 1 : (Number(swAttr) || 0)
      let pad = 0
      if (ds) {
        const dx = Number(ds.getAttribute('dx')) || 0
        const dy = Number(ds.getAttribute('dy')) || 0
        const blur = Number(ds.getAttribute('stdDeviation')) || 0
        pad = Math.max(pad, Math.hypot(dx, dy) + blur * 3)
      }
      if (morph) {
        pad = Math.max(pad, Math.abs(Number(morph.getAttribute('radius')) || 0))
      }
      pad += sw / 2
      filter.setAttribute('filterUnits', 'userSpaceOnUse')
      filter.setAttribute('x', String(bb.x - pad))
      filter.setAttribute('y', String(bb.y - pad))
      filter.setAttribute('width', String(bb.width + pad * 2))
      filter.setAttribute('height', String(bb.height + pad * 2))
      // Stamp the ownership marker fx-filter's isOurFilter() looks for, so a
      // legacy filter saved before that marker existed is still recognized as
      // "ours" (and gets its region live-refreshed on move) without relying on
      // its id suffix, which a duplicate/paste may not preserve.
      filter.setAttribute('data-fx', '1')
    })
  }

  svgCanvas.uniquifyElems = uniquifyElemsMethod
  svgCanvas.setUseData = setUseDataMethod
  svgCanvas.convertGradients = convertGradientsMethod
  svgCanvas.convertDropShadowFilters = convertDropShadowFiltersMethod
  svgCanvas.removeUnusedDefElems = removeUnusedDefElemsMethod // remove DOM elements inside the `<defs>` if they are notreferred to,
}
