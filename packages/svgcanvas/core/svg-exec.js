/**
 * Tools for svg.
 * @module svg
 * @license MIT
 * @copyright 2011 Jeff Schiller
 */

import * as history from './history.js'
import { error, warn as logWarn } from '../common/logger.js'
import { text2xml, toXml, hashCode } from './encoding-utils.js'
import { hasUnnamespacedSeAttr, declareMissingSeNamespace } from './se-namespace.js'
import { sanitizeLegacyUndefinedDefs, sanitizeStackedTranslateTransforms } from './legacy-repairs.js'
import {
  cleanupElement,
  setHref,
  preventClickDefault
} from './dom-utils.js'
import { convertUnit, shortFloat, convertToNum } from './units.js'
import { isGecko } from '../common/browser.js'
import { NS } from './namespaces.js'
import * as draw from './draw.js'
import { getParents, getClosest } from '../common/util.js'

const {
  InsertElementCommand,
  RemoveElementCommand,
  ChangeElementCommand,
  BatchCommand
} = history

/**
 * @function module:svg-exec.init
 * @param {module:svg-exec.SvgCanvas#init} svgContext
 * @returns {void}
 */
export const init = canvas => {
  const svgCanvas = canvas // per-instance; functions below are closed over it

  /**
 * Main function to set up the SVG content for output.
 * @function module:svgcanvas.SvgCanvas#svgCanvasToString
 * @returns {string} The SVG image for output
 */
  const svgCanvasToString = () => {
  // keep calling it until there are none to remove
    while (svgCanvas.removeUnusedDefElems() > 0) {} // eslint-disable-line no-empty

    const currentMode = svgCanvas.getCurrentMode()

    // An actively in-progress path draw (mode 'path' with a real, not-yet-
    // committed element already placed) must not be torn down just because
    // something is serializing the drawing in the background — e.g. a host's
    // periodic autosave calling getSvgString() while the user is mid-click on
    // their next point. pathActions.clear() would remove that element but
    // leave currentMode stuck on 'path' with drawnPath now null, so the very
    // next click silently starts a brand-new path instead of continuing the
    // one already in progress — discarding the user's clicks so far with no
    // warning. Exclude just that element from the output instead: detach it
    // before serializing and reattach it right after, so the saved file has
    // no half-finished path but the live drawing session is left untouched.
    const drawnPath = currentMode === 'path' ? svgCanvas.getDrawnPath() : null
    const drawnPathParent = drawnPath?.parentNode
    const drawnPathNextSibling = drawnPath?.nextSibling
    if (drawnPath && drawnPathParent) {
      drawnPathParent.removeChild(drawnPath)
    } else if (currentMode === 'pathedit') {
      // Editing an *existing* path's nodes has the same hazard as drawing a
      // new one above: pathActions.clear() unconditionally calls
      // toSelectMode() while in this mode, silently exiting node-edit —
      // hiding the grips and clearing the selection — mid-drag, just because
      // a background save landed. Unlike a fresh drawnPath there's nothing to
      // exclude from the output: node moves already write straight into the
      // path's live `d` attribute, so the saved SVG is correct as-is. Simply
      // not tearing the session down is enough.
    } else {
      // Tear down any in-progress path-edit session before serializing. Every
      // save/export (getSvgString) funnels through here, so a throw in this
      // teardown must never abort output the way it's isolated in setMode()
      // (see the matching try/catch there) — otherwise a path-edit session left
      // in a bad state makes the drawing permanently unsaveable until reload,
      // not just stuck on a tool.
      try {
        svgCanvas.pathActions.clear(true)
      } catch (e) {
        logWarn('svgedit: pathActions.clear() failed during svgCanvasToString; continuing', e, 'svg-exec')
      }
    }

    try {
      sanitizeLegacyUndefinedDefs(svgCanvas.getSvgContent())
      sanitizeStackedTranslateTransforms(svgCanvas.getSvgContent())

      // Keep SVG-Edit comment on top
      const childNodesElems = svgCanvas.getSvgContent().childNodes
      childNodesElems.forEach((node, i) => {
        if (i && node.nodeType === 8 && node.data.includes('Created with')) {
          svgCanvas.getSvgContent().firstChild.before(node)
        }
      })

      // Serializing must not disturb in-group editing: a host that saves on
      // every change (or an autosave timer) would otherwise drop the user out
      // of the group, clear the dimming and swap the selection to the group
      // mid-edit, so the *next* edit/nudge/undo targets the wrong level. The
      // dimmed siblings' synthetic `opacity="0.33"` is the only part of the
      // context that must not reach the output; it is un-dimmed just for the
      // svgToString() call below (see withContextUndimmed()).
      const keepContext = !!svgCanvas.getCurrentGroup()

      const nakedSvgs = []

      // Unwrap gsvg if it has no special attributes (only id and style)
      const gsvgElems = svgCanvas.getSvgContent().querySelectorAll('g[data-gsvg]')
      Array.prototype.forEach.call(gsvgElems, element => {
        const attrs = element.attributes
        let len = attrs.length
        for (let i = 0; i < len; i++) {
          if (attrs[i].nodeName === 'id' || attrs[i].nodeName === 'style') {
            len--
          }
        }
        // No significant attributes, so ungroup
        if (len <= 0) {
          const svg = element.firstChild
          nakedSvgs.push(svg)
          element.replaceWith(svg)
        }
      })
      // Embed used custom fonts as @font-face in <defs> so the exported SVG is
      // self-contained. Only fonts actually referenced by text are embedded.
      const fontStyleElem = svgCanvas.getSvgOptionApply()
        ? embedUsedFonts()
        : null

      const serialize = () => svgCanvas.svgToString(svgCanvas.getSvgContent(), 0)
      const output = keepContext ? svgCanvas.withContextUndimmed(serialize) : serialize()

      // Remove the temporary <style> so the live document is left untouched
      if (fontStyleElem) {
        fontStyleElem.remove()
      }

      // Rewrap gsvg
      if (nakedSvgs.length) {
        Array.prototype.forEach.call(nakedSvgs, el => {
          svgCanvas.groupSvgElem(el)
        })
      }

      return output
    } finally {
      if (drawnPath && drawnPathParent) {
        drawnPathParent.insertBefore(drawnPath, drawnPathNextSibling)
      }
    }
  }

  /**
 * Build an @font-face <style> element for every embeddable font actually used by
 * text in the given SVG root and insert it into that root's <defs>. Returns the
 * inserted element (so it can be removed after serialization) or null if nothing
 * was embedded.
 *
 * Works on any root — the live document (SVG export) or a detached clone (raster
 * export, where text rendered by an <img> has no access to the document's
 * fonts and would otherwise fall back to a default family).
 * @param {SVGSVGElement} [svgContent=svgCanvas.getSvgContent()] - The SVG root to embed into
 * @returns {SVGStyleElement|null}
 */
  const embedUsedFonts = (svgContent = svgCanvas.getSvgContent()) => {
    const fonts = svgCanvas.getEncodableFonts()
    if (!fonts || !Object.keys(fonts).length) return null

    // Collect the set of font-family values referenced by text/tspan elements
    const used = new Set()
    svgContent.querySelectorAll('text, tspan').forEach(el => {
      const fam = el.getAttribute('font-family') || el.style.fontFamily
      if (fam) used.add(fam.replace(/^['"]|['"]$/g, ''))
    })

    const faces = []
    used.forEach(family => {
      const base64 = fonts[family]
      if (base64) {
      // Unquoted family name + no format() keeps the payload free of XML-special
      // characters (', ", <, >, &), so it survives serialization without entity
      // escaping and renders whether the SVG is opened standalone or inlined.
      // CSS permits multi-word unquoted family names and an optional format().
        faces.push(
        `@font-face{font-family:${family};font-style:normal;font-weight:normal;` +
        `src:url(data:font/woff2;base64,${base64});}`
        )
      }
    })
    if (!faces.length) return null

    // Find (or create) the <defs> within the supplied root, not the live document.
    let defs = svgContent.getElementsByTagNameNS(NS.SVG, 'defs')[0]
    if (!defs) {
      defs = svgContent.ownerDocument.createElementNS(NS.SVG, 'defs')
      svgContent.insertBefore(defs, svgContent.firstChild)
    }
    const style = svgContent.ownerDocument.createElementNS(NS.SVG, 'style')
    style.setAttribute('type', 'text/css')
    // base64 + CSS punctuation contain no XML-special chars, so a text node
    // serializes intact (createCDATASection is unsupported in HTML documents)
    style.textContent = faces.join('')
    defs.appendChild(style)
    return style
  }

  /**
 * Sub function ran on each SVG element to convert it to a string as desired.
 * @function module:svgcanvas.SvgCanvas#svgToString
 * @param {Element} elem - The SVG element to convert
 * @param {Integer} indent - Number of spaces to indent this tag
 * @returns {string} The given element as an SVG tag
 */
  const svgToString = (elem, indent) => {
    const curConfig = svgCanvas.getCurConfig()
    const nsMap = svgCanvas.getNsMap()
    const out = []
    const unit = curConfig.baseUnit
    const unitRe = new RegExp(`^-?[\\d\\.]+${unit}$`)

    if (elem) {
      cleanupElement(elem)
      const attrs = [...elem.attributes]
      const childs = elem.childNodes
      attrs.sort((a, b) => {
        return a.name > b.name ? -1 : 1
      })

      for (let i = 0; i < indent; i++) {
        out.push(' ')
      }
      out.push('<')
      out.push(elem.localName)
      if (elem.id === 'svgcontent') {
      // Process root element separately
        const res = svgCanvas.getResolution()

        let vb = ''
        // TODO: Allow this by dividing all values by current baseVal
        // Note that this also means we should properly deal with this on import
        // if (curConfig.baseUnit !== 'px') {
        //   const unit = curConfig.baseUnit;
        //   const unitM = getTypeMap()[unit];
        //   res.w = shortFloat(res.w / unitM);
        //   res.h = shortFloat(res.h / unitM);
        //   vb = ' viewBox="' + [0, 0, res.w, res.h].join(' ') + '"';
        //   res.w += unit;
        //   res.h += unit;
        // }
        if (curConfig.dynamicOutput) {
          vb = elem.getAttribute('viewBox')
          if (!vb) {
            vb = [0, 0, res.w, res.h].join(' ')
          }
          out.push(` viewBox="${vb}" xmlns="${NS.SVG}"`)
        } else {
          if (unit !== 'px') {
            res.w = convertUnit(res.w, unit) + unit
            res.h = convertUnit(res.h, unit) + unit
          }
          out.push(
            ' width="' + res.w + '" height="' + res.h + '" xmlns="' + NS.SVG + '"'
          )
        }

        const nsuris = {}

        // Check elements for namespaces, add if found
        const csElements = elem.querySelectorAll('*')
        const cElements = Array.prototype.slice.call(csElements)
        cElements.push(elem)
        Array.prototype.forEach.call(cElements, el => {
        // const el = this;
        // for some elements have no attribute
          const uri = el.namespaceURI
          if (
            uri &&
          !nsuris[uri] &&
          nsMap[uri] &&
          nsMap[uri] !== 'xmlns' &&
          nsMap[uri] !== 'xml'
          ) {
            nsuris[uri] = true
            out.push(` xmlns:${nsMap[uri]}="${uri}"`)
          }
          if (el.attributes.length > 0) {
            for (const [, attr] of Object.entries(el.attributes)) {
              const u = attr.namespaceURI
              if (u && !nsuris[u] && nsMap[u] !== 'xmlns' && nsMap[u] !== 'xml') {
                nsuris[u] = true
                out.push(` xmlns:${nsMap[u]}="${u}"`)
              }
            }
          }
        })

        // `se:` attributes set without a namespace (corner radius, taper, …)
        // carry no namespaceURI, so the loop above can't see them — declare the
        // prefix anyway or the saved file uses an undeclared prefix and can't
        // be loaded again (see se-namespace.js).
        if (!nsuris[NS.SE] && hasUnnamespacedSeAttr(cElements)) {
          out.push(` xmlns:se="${NS.SE}"`)
        }

        let i = attrs.length
        const attrNames = [
          'width',
          'height',
          'xmlns',
          'x',
          'y',
          'viewBox',
          'id',
          'overflow'
        ]
        while (i--) {
          const attr = attrs[i]
          const attrVal = toXml(attr.value)

          // Namespaces have already been dealt with, so skip
          if (attr.nodeName.startsWith('xmlns:')) {
            continue
          }

          // only serialize attributes we don't use internally
          if (
            attrVal !== '' &&
          !attrNames.includes(attr.localName) &&
          (!attr.namespaceURI || nsMap[attr.namespaceURI])
          ) {
            out.push(' ')
            out.push(attr.nodeName)
            out.push('="')
            out.push(attrVal)
            out.push('"')
          }
        }
      } else {
      // Skip empty defs
        if (elem.nodeName === 'defs' && !elem.firstChild) {
          return ''
        }

        const mozAttrs = ['-moz-math-font-style', '_moz-math-font-style']
        for (let i = attrs.length - 1; i >= 0; i--) {
          const attr = attrs[i]
          let attrVal = toXml(attr.value)
          // remove bogus attributes added by Gecko
          if (mozAttrs.includes(attr.localName)) {
            continue
          }
          if (attrVal === 'null') {
            const styleName = attr.localName.replace(/-[a-z]/g, s =>
              s[1].toUpperCase()
            )
            if (Object.prototype.hasOwnProperty.call(elem.style, styleName)) {
              continue
            }
          }
          if (attrVal !== '') {
            if (attrVal.startsWith('pointer-events')) {
              continue
            }
            if (attr.localName === 'class' && attrVal.startsWith('se_')) {
              continue
            }
            out.push(' ')
            if (attr.localName === 'd') {
              attrVal = svgCanvas.pathActions.convertPath(elem, true)
            }
            if (!isNaN(attrVal)) {
              attrVal = shortFloat(attrVal)
            } else if (unitRe.test(attrVal)) {
              attrVal = shortFloat(attrVal) + unit
            }

            // Embed images when saving
            if (
              svgCanvas.getSvgOptionApply() &&
            elem.nodeName === 'image' &&
            attr.localName === 'href' &&
            svgCanvas.getSvgOptionImages() &&
            svgCanvas.getSvgOptionImages() === 'embed'
            ) {
              const img = svgCanvas.getEncodableImages(attrVal)
              if (img) {
                attrVal = img
              }
            }

            // map various namespaces to our fixed namespace prefixes
            // (the default xmlns attribute itself does not get a prefix)
            if (
              !attr.namespaceURI ||
            attr.namespaceURI === NS.SVG ||
            nsMap[attr.namespaceURI]
            ) {
              out.push(attr.nodeName)
              out.push('="')
              out.push(attrVal)
              out.push('"')
            }
          }
        }
      }

      if (elem.hasChildNodes()) {
        out.push('>')
        indent++
        let bOneLine = false

        for (let i = 0; i < childs.length; i++) {
          const child = childs.item(i)
          switch (child.nodeType) {
            case 1: // element node
              out.push('\n')
              out.push(svgCanvas.svgToString(child, indent))
              break
            case 3: {
            // text node
              const str = child.nodeValue.replace(/^\s+|\s+$/g, '')
              if (str !== '') {
                bOneLine = true
                out.push(String(toXml(str)))
              }
              break
            }
            case 4: // cdata node
              out.push('\n')
              out.push(new Array(indent + 1).join(' '))
              out.push('<![CDATA[')
              out.push(child.nodeValue)
              out.push(']]>')
              break
            case 8: // comment
              out.push('\n')
              out.push(new Array(indent + 1).join(' '))
              out.push('<!--')
              out.push(child.data)
              out.push('-->')
              break
          } // switch on node type
        }
        indent--
        if (!bOneLine) {
          out.push('\n')
          for (let i = 0; i < indent; i++) {
            out.push(' ')
          }
        }
        out.push('</')
        out.push(elem.localName)
        out.push('>')
      } else {
        out.push('/>')
      }
    }
    return out.join('')
  } // end svgToString()

  /**
   * Undo the document swap done by setSvgString() after it failed part-way:
   * drop the half-processed content and put the old one back.
   * @param {{content: Element, nextSibling: ?Node, drawing: any, contentW: number, contentH: number}} previous
   * @returns {void}
   */
  const restorePreviousDocument = (previous) => {
    try {
      const failed = svgCanvas.getSvgContent()
      if (failed !== previous.content) failed.remove()
      svgCanvas.setSvgContent(previous.content)
      svgCanvas.getSvgRoot().insertBefore(previous.content, previous.nextSibling)
      svgCanvas.current_drawing_ = previous.drawing
      svgCanvas.contentW = previous.contentW
      svgCanvas.contentH = previous.contentH
    } catch (restoreErr) {
      error('Could not restore the previous drawing after a failed load', restoreErr, 'svg-exec')
    }
  }

  /**
 * This function sets the current drawing as the input SVG XML.
 * @function module:svgcanvas.SvgCanvas#setSvgString
 * @param {string} xmlString - The SVG as XML text.
 * @param {boolean} [preventUndo=false] - Indicates if we want to do the
 * changes without adding them to the undo stack - e.g. for initializing a
 * drawing on page load.
 * @fires module:svgcanvas.SvgCanvas#event:setnonce
 * @fires module:svgcanvas.SvgCanvas#event:unsetnonce
 * @fires module:svgcanvas.SvgCanvas#event:changed
 * @returns {boolean} This function returns `false` if the set was
 *     unsuccessful, `true` otherwise.
 */
  const setSvgString = (xmlString, preventUndo) => {
    const curConfig = svgCanvas.getCurConfig()
    const dataStorage = svgCanvas.getDataStorage()
    // The old document is swapped out before the repair/fixup passes below
    // run, so keep what's needed to put it back if any of them throws —
    // otherwise a failed load would leave a half-processed drawing on the canvas.
    let previous = null
    try {
    // convert string into XML document. Drawings saved by earlier versions can
      // use `se:` attributes without declaring the prefix, which doesn't parse.
      const newDoc = text2xml(declareMissingSeNamespace(xmlString))
      if (
        newDoc.firstElementChild &&
      newDoc.firstElementChild.namespaceURI !== NS.SVG
      ) {
        return false
      }

      svgCanvas.prepareSvg(newDoc)

      const batchCmd = new BatchCommand('Change Source')

      // remove old svg document
      const { nextSibling } = svgCanvas.getSvgContent()

      svgCanvas.getSvgContent().remove()
      const oldzoom = svgCanvas.getSvgContent()
      previous = {
        content: oldzoom,
        nextSibling,
        drawing: svgCanvas.current_drawing_,
        contentW: svgCanvas.contentW,
        contentH: svgCanvas.contentH
      }
      batchCmd.addSubCommand(
        new RemoveElementCommand(oldzoom, nextSibling, svgCanvas.getSvgRoot())
      )

      // set new svg document
      // If DOM3 adoptNode() available, use it. Otherwise fall back to DOM2 importNode()
      if (svgCanvas.getDOMDocument().adoptNode) {
        svgCanvas.setSvgContent(
          svgCanvas.getDOMDocument().adoptNode(newDoc.documentElement)
        )
      } else {
        svgCanvas.setSvgContent(
          svgCanvas.getDOMDocument().importNode(newDoc.documentElement, true)
        )
      }

      svgCanvas.getSvgRoot().append(svgCanvas.getSvgContent())
      const content = svgCanvas.getSvgContent()

      // Repair legacy corruption up front, on load — not just on the next
      // save. A drawing opened read-only, or opened and closed without
      // editing, should still self-heal rather than carry the scar forward
      // indefinitely. See sanitizeLegacyUndefinedDefs(),
      // sanitizeStackedTranslateTransforms() and techdebt.md.
      sanitizeLegacyUndefinedDefs(content)
      sanitizeStackedTranslateTransforms(content)

      svgCanvas.current_drawing_ = new draw.Drawing(
        svgCanvas.getSvgContent(),
        svgCanvas.getIdPrefix()
      )

      // retrieve or set the nonce
      const nonce = svgCanvas.getCurrentDrawing().getNonce()
      if (nonce) {
        svgCanvas.call('setnonce', nonce)
      } else {
        svgCanvas.call('unsetnonce')
      }

      // change image href vals if possible
      const elements = content.querySelectorAll('image')
      Array.prototype.forEach.call(elements, image => {
        preventClickDefault(image)
        const val = svgCanvas.getHref(image)
        if (val) {
          if (val.startsWith('data:')) {
          // Check if an SVG-edit data URI
            const m = val.match(/svgedit_url=(.*?);/)
            // const m = val.match(/svgedit_url=(?<url>.*?);/);
            if (m) {
              const url = decodeURIComponent(m[1])
              // const url = decodeURIComponent(m.groups.url);
              const iimg = new Image()
              iimg.addEventListener('load', () => {
              // Set the href attribute to the data URL
                setHref(image, val)
              })
              iimg.src = url
            }
          }
          // Add to encodableImages if it loads
          svgCanvas.embedImage(val)
        }
      })
      // Duplicate id replace changes
      const nodes = content.querySelectorAll('[id]')
      const ids = {}
      const totalNodes = nodes.length

      for (let i = 0; i < totalNodes; i++) {
        const currentId = nodes[i].id ? nodes[i].id : 'undefined'
        if (isNaN(ids[currentId])) {
          ids[currentId] = 0
        }
        ids[currentId]++
      }

      Object.entries(ids).forEach(([key, value]) => {
        if (value > 1) {
          const nodes = content.querySelectorAll(`[id="${key}"]`)
          for (let i = 1; i < nodes.length; i++) {
            nodes[i].setAttribute('id', svgCanvas.getNextId())
          }
        }
      })

      // Wrap child SVGs in group elements
      const svgElements = content.querySelectorAll('svg')
      Array.prototype.forEach.call(svgElements, element => {
      // Skip if it's in a <defs>
        if (getClosest(element.parentNode, 'defs')) {
          return
        }

        svgCanvas.uniquifyElems(element)

        // Check if it already has a gsvg group
        const pa = element.parentNode
        if (pa.childNodes.length === 1 && pa.nodeName === 'g') {
          dataStorage.put(pa, 'gsvg', element)
          pa.id = pa.id || svgCanvas.getNextId()
        } else {
          svgCanvas.groupSvgElem(element)
        }
      })

      // For Firefox: Put all paint elems in defs
      if (isGecko()) {
        const svgDefs = svgCanvas.findDefs()
        const findElems = content.querySelectorAll(
          'linearGradient, radialGradient, pattern'
        )
        Array.prototype.forEach.call(findElems, ele => {
          svgDefs.appendChild(ele)
        })
      }

      // Set ref element for <use> elements

      // TODO: This should also be done if the object is re-added through "redo"
      svgCanvas.setUseData(content)

      svgCanvas.convertGradients(content)
      svgCanvas.convertDropShadowFilters(content)

      const attrs = {
        id: 'svgcontent',
        overflow: curConfig.show_outside_canvas ? 'visible' : 'hidden'
      }

      let percs = false

      // determine proper size
      if (content.getAttribute('viewBox')) {
        const viBox = content.getAttribute('viewBox')
        const vb = viBox.split(/[ ,]+/)
        const vbWidth = Number(vb[2])
        const vbHeight = Number(vb[3])
        if (Number.isFinite(vbWidth)) {
          attrs.width = vbWidth
        }
        if (Number.isFinite(vbHeight)) {
          attrs.height = vbHeight
        }
      // handle content that doesn't have a viewBox
      } else {
        ;['width', 'height'].forEach(dim => {
        // Set to 100 if not given
          const val = content.getAttribute(dim) || '100%'
          if (String(val).slice(-1) === '%') {
          // Use user units if percentage given
            percs = true
          } else {
            attrs[dim] = convertToNum(dim, val)
          }
        })
      }

      // identify layers
      svgCanvas.identifyLayers()

      // Give ID for any visible layer children missing one. Skip <defs> —
      // it holds silhouette clones (e.g. a clipPath/mask's clone made by
      // clip-mask.js's setClip()/setMask()) that are deliberately left
      // id-less since nothing is meant to reference them; this pass isn't
      // meant to reach into <defs> at all.
      const chiElems = content.children
      Array.prototype.forEach.call(chiElems, chiElem => {
        if (chiElem.tagName === 'defs') return
        const visElems = chiElem.querySelectorAll(svgCanvas.getVisElems())
        Array.prototype.forEach.call(visElems, elem => {
          if (!elem.id) {
            elem.id = svgCanvas.getNextId()
          }
        })
      })

      // Percentage width/height, so let's base it on visible elements
      if (percs) {
        const bb = svgCanvas.getStrokedBBoxDefaultVisible()
        if (bb && typeof bb === 'object') {
          attrs.width = bb.width + bb.x
          attrs.height = bb.height + bb.y
        } else {
          if (attrs.width === null || attrs.width === undefined) {
            attrs.width = 100
          }
          if (attrs.height === null || attrs.height === undefined) {
            attrs.height = 100
          }
        }
      }

      // Just in case negative numbers are given or
      // result from the percs calculation
      if (!Number.isFinite(attrs.width) || attrs.width <= 0) {
        attrs.width = 100
      }
      if (!Number.isFinite(attrs.height) || attrs.height <= 0) {
        attrs.height = 100
      }

      for (const [key, value] of Object.entries(attrs)) {
        content.setAttribute(key, value)
      }
      svgCanvas.contentW = attrs.width
      svgCanvas.contentH = attrs.height

      batchCmd.addSubCommand(new InsertElementCommand(svgCanvas.getSvgContent()))
      // update root to the correct size
      const width = content.getAttribute('width')
      const height = content.getAttribute('height')
      const changes = { width, height }
      batchCmd.addSubCommand(
        new ChangeElementCommand(svgCanvas.getSvgRoot(), changes)
      )

      // reset zoom
      svgCanvas.setZoom(1)

      svgCanvas.clearSelection()
      svgCanvas.clearData()
      svgCanvas.getSvgRoot().append(svgCanvas.selectorManager.selectorParentGroup)

      if (!preventUndo) svgCanvas.addCommandToHistory(batchCmd)
      svgCanvas.call('sourcechanged', [svgCanvas.getSvgContent()])
    } catch (e) {
      error('Error setting SVG string', e, 'svg-exec')
      if (previous) restorePreviousDocument(previous)
      return false
    }

    return true
  }

  /**
 * This function imports the input SVG XML as a `<symbol>` in the `<defs>`, then adds a
 * `<use>` to the current layer.
 * @function module:svgcanvas.SvgCanvas#importSvgString
 * @param {string} xmlString - The SVG as XML text.
 * @param {boolean} preserveDimension - A boolean to force to preserve initial dimension of the imported svg (force svgEdit don't apply a transformation on the imported svg)
 * @fires module:svgcanvas.SvgCanvas#event:changed
 * @returns {null|Element} This function returns null if the import was unsuccessful, or the element otherwise.
 * @todo
 * - properly handle if namespace is introduced by imported content (must add to svgcontent
 * and update all prefixes in the imported node)
 * - properly handle recalculating dimensions, `recalculateDimensions()` doesn't handle
 * arbitrary transform lists, but makes some assumptions about how the transform list
 * was obtained
 */
  const importSvgString = (xmlString, preserveDimension) => {
    const dataStorage = svgCanvas.getDataStorage()
    let j
    let ts
    let useEl
    try {
    // Get unique ID
      const uid = hashCode(xmlString)

      let useExisting = false
      // Look for symbol and make sure symbol exists in image
      if (svgCanvas.getImportIds(uid) && svgCanvas.getImportIds(uid).symbol) {
        const parents = getParents(svgCanvas.getImportIds(uid).symbol, '#svgroot')
        if (parents?.length) {
          useExisting = true
        }
      }

      const batchCmd = new BatchCommand('Import Image')
      let symbol
      if (useExisting) {
        symbol = svgCanvas.getImportIds(uid).symbol
        ts = svgCanvas.getImportIds(uid).xform
      } else {
      // convert string into XML document
        const newDoc = text2xml(xmlString)

        svgCanvas.prepareSvg(newDoc)

        // import new svg document into our document
        // If DOM3 adoptNode() available, use it. Otherwise fall back to DOM2 importNode()
        const svg = svgCanvas.getDOMDocument().adoptNode
          ? svgCanvas.getDOMDocument().adoptNode(newDoc.documentElement)
          : svgCanvas.getDOMDocument().importNode(newDoc.documentElement, true)

        svgCanvas.uniquifyElems(svg)

        const innerw = convertToNum('width', svg.getAttribute('width'))
        const innerh = convertToNum('height', svg.getAttribute('height'))
        const innervb = svg.getAttribute('viewBox')
        // if no explicit viewbox, create one out of the width and height
        const vb = innervb ? innervb.split(/[ ,]+/) : [0, 0, innerw, innerh]
        for (j = 0; j < 4; ++j) {
          vb[j] = Number(vb[j])
        }

        // TODO: properly handle preserveAspectRatio
        const // canvasw = +svgContent.getAttribute('width'),
          rawCanvash = Number(svgCanvas.getSvgContent().getAttribute('height'))
        const canvash =
        Number.isFinite(rawCanvash) && rawCanvash > 0
          ? rawCanvash
          : (Number(svgCanvas.getCurConfig().dimensions?.[1]) || 100)
        // imported content should be 1/3 of the canvas on its largest dimension

        const vbWidth = vb[2]
        const vbHeight = vb[3]
        const importW = Number.isFinite(vbWidth) && vbWidth > 0 ? vbWidth : (innerw > 0 ? innerw : 100)
        const importH = Number.isFinite(vbHeight) && vbHeight > 0 ? vbHeight : (innerh > 0 ? innerh : 100)
        const safeImportW = Number.isFinite(importW) && importW > 0 ? importW : 100
        const safeImportH = Number.isFinite(importH) && importH > 0 ? importH : 100
        ts =
        safeImportH > safeImportW
          ? 'scale(' + canvash / 3 / safeImportH + ')'
          : 'scale(' + canvash / 3 / safeImportW + ')'

        // Hack to make recalculateDimensions understand how to scale
        ts = `translate(0) ${ts} translate(0)`

        symbol = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'symbol')
        const defs = svgCanvas.findDefs()

        if (isGecko()) {
        // Move all gradients into root for Firefox, workaround for this bug:
        // https://bugzilla.mozilla.org/show_bug.cgi?id=353575
        // TODO: Make this properly undo-able.
          const elements = svg.querySelectorAll(
            'linearGradient, radialGradient, pattern'
          )
          Array.prototype.forEach.call(elements, el => {
            defs.appendChild(el)
          })
        }

        while (svg.firstChild) {
          const first = svg.firstChild
          symbol.append(first)
        }
        const attrs = svg.attributes
        for (const attr of attrs) {
        // Ok for `NamedNodeMap`
          symbol.setAttribute(attr.nodeName, attr.value)
        }
        symbol.id = svgCanvas.getNextId()

        // Store data
        svgCanvas.setImportIds(uid, {
          symbol,
          xform: ts
        })

        svgCanvas.findDefs().append(symbol)
        batchCmd.addSubCommand(new InsertElementCommand(symbol))
      }

      useEl = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'use')
      useEl.id = svgCanvas.getNextId()
      svgCanvas.setHref(useEl, '#' + symbol.id)
      ;(
        svgCanvas.getCurrentGroup() ||
      svgCanvas.getCurrentDrawing().getCurrentLayer()
      ).append(useEl)
      batchCmd.addSubCommand(new InsertElementCommand(useEl))
      svgCanvas.clearSelection()

      if (!preserveDimension) {
        useEl.setAttribute('transform', ts)
        svgCanvas.recalculateDimensions(useEl)
      }
      dataStorage.put(useEl, 'symbol', symbol)
      dataStorage.put(useEl, 'ref', symbol)
      svgCanvas.addToSelection([useEl])

      // TODO: Find way to add this in a recalculateDimensions-parsable way
      // if (vb[0] !== 0 || vb[1] !== 0) {
      //   ts = 'translate(' + (-vb[0]) + ',' + (-vb[1]) + ') ' + ts;
      // }
      svgCanvas.addCommandToHistory(batchCmd)
      svgCanvas.call('changed', [svgCanvas.getSvgContent()])
    } catch (e) {
      error('Error importing SVG string', e, 'svg-exec')
      return null
    }

    // we want to return the element so we can automatically select it
    return useEl
  }
  /**
 * Insert raw SVG child markup (e.g. `<image .../>`, `<text>...</text>`) into
 * the current group/layer as a single undoable step, and select it. Unlike
 * `setSvgString` this is an incremental edit (selection, group context, zoom
 * and the rest of the history are left alone), and unlike `importSvgString` the
 * markup is inserted as-is, not wrapped in a `<symbol>` + `<use>` or rescaled.
 * The markup goes through the same sanitizer as any loaded document.
 * @function module:svgcanvas.SvgCanvas#insertSvgFragment
 * @param {string} xmlFragment - One or more SVG elements, no `<svg>` wrapper.
 * @fires module:svgcanvas.SvgCanvas#event:changed
 * @returns {null|Element[]} The inserted elements, or null if the markup could
 *   not be parsed or insertion failed (nothing is changed in that case).
 */
  const insertSvgFragment = (xmlFragment) => {
    try {
      const newDoc = text2xml(
        `<svg xmlns="${NS.SVG}" xmlns:xlink="${NS.XLINK}">${xmlFragment}</svg>`
      )
      if (newDoc.getElementsByTagName('parsererror').length) {
        return null
      }
      svgCanvas.prepareSvg(newDoc)
      const wrapper = svgCanvas.getDOMDocument().adoptNode
        ? svgCanvas.getDOMDocument().adoptNode(newDoc.documentElement)
        : svgCanvas.getDOMDocument().importNode(newDoc.documentElement, true)
      svgCanvas.uniquifyElems(wrapper)

      const parent =
        svgCanvas.getCurrentGroup() ||
        svgCanvas.getCurrentDrawing().getCurrentLayer()
      const batchCmd = new BatchCommand('Insert Elements')
      const inserted = []
      for (const child of [...wrapper.children]) {
        child.id = child.id || svgCanvas.getNextId()
        parent.append(child)
        batchCmd.addSubCommand(new InsertElementCommand(child))
        inserted.push(child)
      }
      if (!inserted.length) {
        return inserted
      }

      svgCanvas.clearSelection()
      svgCanvas.addToSelection(inserted)
      svgCanvas.addCommandToHistory(batchCmd)
      svgCanvas.call('changed', inserted)
      return inserted
    } catch (e) {
      error('Error inserting SVG fragment', e, 'svg-exec')
      return null
    }
  }

  /**
 * Function to run when image data is found.
 * @callback module:svgcanvas.ImageEmbeddedCallback
 * @param {string|false} result Data URL
 * @returns {void}
 */
  /**
 * Converts a given image file to a data URL when possible, then runs a given callback.
 * @function module:svgcanvas.SvgCanvas#embedImage
 * @param {string} src - The path/URL of the image
 * @returns {Promise<string|false>} Resolves to a Data URL (string|false)
 */
  const embedImage = src => {
  // Todo: Remove this Promise in favor of making an async/await `Image.load` utility
    return new Promise((resolve, reject) => {
    // load in the image and once it's loaded, get the dimensions
      const imgI = new Image()
      imgI.addEventListener('load', e => {
      // create a canvas the same size as the raster image
        const cvs = document.createElement('canvas')
        cvs.width = e.currentTarget.width
        cvs.height = e.currentTarget.height
        // load the raster image into the canvas
        cvs.getContext('2d').drawImage(e.currentTarget, 0, 0)
        // retrieve the data: URL
        try {
          let urldata = ';svgedit_url=' + encodeURIComponent(src)
          urldata = cvs.toDataURL().replace(';base64', urldata + ';base64')
          svgCanvas.setEncodableImages(src, urldata)
        } catch (e) {
          svgCanvas.setEncodableImages(src, false)
        }
        svgCanvas.setGoodImage(src)
        resolve(svgCanvas.getEncodableImages(src))
      })
      imgI.addEventListener('error', e => {
        reject(
          new Error(
          `error loading image: ${e.currentTarget.attributes.src.value}`
          )
        )
      })
      imgI.setAttribute('src', src)
    })
  }

  /**
 * @typedef {PlainObject} module:svgcanvas.IssuesAndCodes
 * @property {string[]} issueCodes The locale-independent code names
 * @property {string[]} issues The localized descriptions
 */

  /**
 * Codes only is useful for locale-independent detection.
 * @returns {module:svgcanvas.IssuesAndCodes}
 */
  const getIssues = () => {
    const uiStrings = svgCanvas.getUIStrings()
    // remove the selected outline before serializing
    svgCanvas.clearSelection()

    // Check for known CanVG issues
    const issues = []
    const issueCodes = []

    // Selector and notice
    const issueList = {
      feGaussianBlur: uiStrings.NoBlur,
      foreignObject: uiStrings.NoforeignObject,
      '[stroke-dasharray]': uiStrings.NoDashArray
    }
    const content = svgCanvas.getSvgContent()

    // Add font/text check if Canvas Text API is not implemented
    if (!('font' in document.querySelector('CANVAS').getContext('2d'))) {
      issueList.text = uiStrings.NoText
    }

    for (const [sel, descr] of Object.entries(issueList)) {
      if (content.querySelectorAll(sel).length) {
        issueCodes.push(sel)
        issues.push(descr)
      }
    }
    return { issues, issueCodes }
  }
  /**
 * @typedef {PlainObject} module:svgcanvas.ImageedResults
 * @property {string} datauri Contents as a Data URL
 * @property {string} bloburl May be the empty string
 * @property {string} svg The SVG contents as a string
 * @property {string[]} issues The localization messages of `issueCodes`
 * @property {module:svgcanvas.IssueCode[]} issueCodes CanVG issues found with the SVG
 * @property {"PNG"|"JPEG"|"BMP"|"WEBP"|"ICO"} type The chosen image type
 * @property {"image/png"|"image/jpeg"|"image/bmp"|"image/webp"} mimeType The image MIME type
 * @property {Float} quality A decimal between 0 and 1 (for use with JPEG or WEBP)
 * @property {string} WindowName A convenience for passing along a `window.name` to target a window on which the  could be added
 */

  /**
 * Utility function to convert all external image links in an SVG element to Base64 data URLs.
 * @param {SVGElement} svgElement - The SVG element to process.
 * @returns {Promise<void>}
 */
  const convertImagesToBase64 = async svgElement => {
    const imageElements = svgElement.querySelectorAll('image')
    const promises = Array.from(imageElements).map(async img => {
      const href = img.getAttribute('xlink:href') || img.getAttribute('href')
      if (href && !href.startsWith('data:')) {
        try {
          const response = await fetch(href)
          const blob = await response.blob()
          const reader = new FileReader()
          return new Promise(resolve => {
            reader.onload = () => {
              setHref(img, reader.result)
              resolve()
            }
            reader.readAsDataURL(blob)
          })
        } catch (err) {
          error('Failed to fetch image', err, 'svg-exec')
        }
      }
    })
    await Promise.all(promises)
  }

  /**
 * Generates a raster image (PNG, JPEG, etc.) from the SVG content.
 * @param {string} [imgType='PNG'] - The image type to generate.
 * @param {number} [quality=1.0] - The image quality (for JPEG).
 * @param {string} [windowName='Exported Image'] - The window name.
 * @param {Object} [opts={}] - Additional options.
 * @returns {Promise<Object>} Resolves to an object containing export data.
 */
  const rasterExport = (
    imgType = 'PNG',
    quality = 1.0,
    windowName = 'Exported Image',
    opts = {}
  ) => {
    return new Promise((resolve, reject) => {
      const type = imgType === 'ICO' ? 'BMP' : imgType
      const mimeType = `image/${type.toLowerCase()}`
      const { issues, issueCodes } = getIssues()
      const svgElement = svgCanvas.getSvgContent()

      const svgClone = svgElement.cloneNode(true)

      // Frames mark export regions and must never appear in an exported image.
      svgClone.querySelectorAll('[data-frame]').forEach(f => f.remove())

      // Inline used custom fonts as base64 @font-face. The clone is rendered via an
      // <img>, which has no access to the document's fonts, so without this the
      // text would rasterize with a default font instead of the chosen one.
      embedUsedFonts(svgClone)

      // When a crop region (a frame's bounds) is supplied, narrow the clone's
      // viewBox to it and set an explicit intrinsic size (Firefox renders nothing
      // from an SVG <img> without width/height) so only that region is rasterized.
      const res = svgCanvas.getResolution()
      let width = res.w
      let height = res.h
      if (opts.crop) {
        const { x, y, w, h } = opts.crop
        svgClone.setAttribute('viewBox', `${x} ${y} ${w} ${h}`)
        svgClone.setAttribute('width', w)
        svgClone.setAttribute('height', h)
        width = w
        height = h
      }

      // When the background is a gradient, inject it into the SVG clone so the
      // gradient renders as part of the SVG image rather than via ctx.fillStyle
      // (which only accepts valid CSS colors, not the sentinel string 'gradient').
      if (opts.includeBg && opts.bgcolor === 'gradient') {
        const bgEl = svgCanvas.getElement('canvasBackground')
        // The bg gradient carries a per-application id (background_gradient_N), so
        // match it by tag rather than a fixed id.
        const gradEl = bgEl?.querySelector('defs > linearGradient, defs > radialGradient')
        if (gradEl) {
          let defs = svgClone.querySelector('defs')
          if (!defs) {
            defs = svgClone.ownerDocument.createElementNS(NS.SVG, 'defs')
            svgClone.insertBefore(defs, svgClone.firstChild)
          }
          const gradClone = gradEl.cloneNode(true)
          gradClone.id = 'export_bg_gradient'
          defs.appendChild(gradClone)
          const bgRect = svgClone.ownerDocument.createElementNS(NS.SVG, 'rect')
          bgRect.setAttribute('width', '100%')
          bgRect.setAttribute('height', '100%')
          bgRect.setAttribute('fill', 'url(#export_bg_gradient)')
          bgRect.setAttribute('style', 'pointer-events:none')
          defs.after(bgRect)
        }
      }

      convertImagesToBase64(svgClone)
        .then(() => {
          const svgData = new XMLSerializer().serializeToString(svgClone)
          const svgBlob = new Blob([svgData], {
            type: 'image/svg+xml;charset=utf-8'
          })
          const url = URL.createObjectURL(svgBlob)

          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('Canvas 2D context not available'))
            return
          }

          canvas.width = width
          canvas.height = height

          const img = new Image()
          img.onload = () => {
            if (opts.includeBg && opts.bgcolor && opts.bgcolor !== 'chessboard' && opts.bgcolor !== 'gradient') {
              ctx.fillStyle = opts.bgcolor
              ctx.fillRect(0, 0, width, height)
            }
            ctx.drawImage(img, 0, 0, width, height)
            URL.revokeObjectURL(url)

            const datauri = canvas.toDataURL(mimeType, quality)
            let blobUrl

            const onExportComplete = blobUrl => {
              const exportObj = {
                datauri,
                bloburl: blobUrl,
                svg: svgData,
                issues,
                issueCodes,
                type: imgType,
                mimeType,
                quality,
                windowName
              }
              if (!opts.avoidEvent) {
                svgCanvas.call('exported', exportObj)
              }
              resolve(exportObj)
            }

            canvas.toBlob(
              blob => {
                blobUrl = URL.createObjectURL(blob)
                onExportComplete(blobUrl)
              },
              mimeType,
              quality
            )
          }

          img.onerror = err => {
            error('Failed to load SVG into image element:', err, 'svg-exec')
            reject(err)
          }

          img.src = url
        })
        .catch(reject)
    })
  }

  svgCanvas.setSvgString = setSvgString
  svgCanvas.importSvgString = importSvgString
  svgCanvas.insertSvgFragment = insertSvgFragment
  svgCanvas.svgCanvasToString = svgCanvasToString // Main function to set up the SVG content for output.
  svgCanvas.svgToString = svgToString // Sub function ran on each SVG element to convert it to a string as desired.
  svgCanvas.embedImage = embedImage // Converts a given image file to a data URL when possibl
  svgCanvas.rasterExport = rasterExport // Generates a PNG (or JPG, BMP, WEBP) Data URL based on the current image
}
