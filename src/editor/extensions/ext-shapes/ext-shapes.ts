// ext-shapes.ts — Pre-made shape library (incl. the stroke-based Accents decoration category — droplets, sparkles, motion arcs, speed lines, puffs — in `shapelib/accents.json`)
/**
 * @file ext-shapes.ts
 *
 * @license MIT
 *
 * @copyright 2010 Christian Tzurcanu, 2010 Alexis Deveria
 *
 */
const name = 'shapes'

const loadExtensionTranslation = function (svgEditor: EditorInstance) {
  const lang = svgEditor.configObj.pref('lang')
  // Locale files are inlined into the bundle (statically resolved glob).
  const locales = import.meta.glob('./locale/*.js', { eager: true }) as Record<string, { default: any }>
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

/** the `shape-insert` event detail */
export interface ShapeInsertDetail {
  /** path `d` of a built-in shape */
  draw?: string
  /** a saved user shape (the fields below) */
  isUserShape?: boolean
  svgContent?: string
  bbox?: { x: number, y: number, width: number, height: number }
  linkedFile?: string
}

export default {
  name,
  async init () {
    const svgEditor = (this as unknown) as import('../../Editor.ts').default
    const canv = svgEditor.svgCanvas
    const { $id, $req } = canv
    const svgroot = canv.getSvgRoot()
    let lastBBox: { x: number, y: number, width: number, height: number } = { x: 0, y: 0, width: 0, height: 0 }
    loadExtensionTranslation(svgEditor)

    const modeId = 'shapelib'

    let curShape: SVGGraphicsElement | null
    let startX: number
    let startY: number
    let _userShapeData: ShapeInsertDetail | null = null // non-null when a user shape is selected for insertion
    let _armedDraw: string | null = null // path `d` of the armed built-in shape (null for user shapes)

    /**
     * Arm the shape tool from a `shape-insert` event detail. This is the single
     * entry point for the insertion flow — decoupled from any specific DOM
     * element so multiple hosts (the desktop left-panel button AND, e.g., the
     * tablet command bar) can drive it. The next canvas mousedown places the
     * armed shape; geometry comes from the event detail, not a DOM dataset.
 * @param detail - `shape-insert` detail ({ draw } | user-shape data)
 * @param target - originating library element to mark pressed
     */
    const armShapeInsert = (detail: ShapeInsertDetail = {}, target?: Element): void => {
      canv.setMode(modeId)
      _userShapeData = detail.isUserShape ? detail : null
      _armedDraw = detail.isUserShape ? null : (detail.draw ?? null)
      // Keep the originating library button visually pressed while armed
      target?.setAttribute?.('pressed', 'true')
    }
    // Expose for programmatic callers (kept element-agnostic)
    svgEditor.armShapeInsert = armShapeInsert

    canv.registerTool({
      id: modeId,
      undoLabel: 'Insert shape',
      snap: true, // the press and the dragged corner snap to other objects
      pointerDown (ctx, ev) {
        startX = ev.x
        const x = startX
        startY = ev.y
        const y = startY

        if (_userShapeData) {
        // ── User shape (SVG group) insertion ────────────────────────────────
          const userShape = _userShapeData
          const { svgContent, bbox } = userShape as Required<Pick<ShapeInsertDetail, 'svgContent' | 'bbox'>>
          const parser = new DOMParser()
          const parsed = parser.parseFromString(
          `<svg xmlns="http://www.w3.org/2000/svg" xmlns:se="http://svg-edit.googlecode.com">${svgContent}</svg>`,
          'image/svg+xml'
          )
          // A saved shape may carry its referenced paint servers in a leading
          // <defs>. Split it from the shape, import both, then remap every id to
          // a fresh one as a unit so repeated insertions never collide (with
          // each other or with the canvas) while cross-references stay intact.
          const children = [...parsed.documentElement.children]
          const defsNode = children.find(c => c.tagName === 'defs')
          const shapeNode = children.find(c => c.tagName !== 'defs')
          const doc = canv.getDOMDocument()
          const imported = doc.importNode((shapeNode as Element), true) as SVGGraphicsElement
          const importedDefs = defsNode
            ? [...defsNode.children].map(c => doc.importNode(c, true))
            : []
          canv.remapElementIdsAndRefs([imported, ...importedDefs], () => canv.getNextId())
          if (!imported.id) imported.id = canv.getNextId()

          if (importedDefs.length) {
            const defs = canv.findDefs()
            importedDefs.forEach(d => defs.appendChild(d))
          }

          const layer = canv.getCurrentGroup() || canv.getCurrentDrawing().getCurrentLayer()
          layer?.appendChild(imported)

          // Apply tiny initial scale anchored at the click point, adjusted for the shape's own origin
          imported.setAttribute(
            'transform',
          `translate(${x},${y}) scale(0.005) translate(${-bbox.x},${-bbox.y})`
          )
          // NOTE: deliberately *no* recalculateDimensions here. For container
          // elements (`<g>`, `<image>`, …) recalc cannot bake a scale into
          // geometry, so `getBBox()` keeps reporting the un-scaled local bbox —
          // which made the drag-resize ratio in mouseMove off by the seed scale
          // (the shape stayed ~0 size). Instead, mouseMove sizes the shape
          // deterministically from the saved bbox, and mouseUp recalcs once.

          // Stamp a provenance link onto the imported root AND every descendant.
          // Stamping every element (not just the wrapper) keeps the link alive
          // through ungroup / partial deletion — the embedding host's save-time
          // scan only drops the link once the last stamped element is gone.
          const linkedFile = userShape.linkedFile
          if (linkedFile) {
            const stamp = (el: Element) => {
              el.setAttribute('data-vault-link', linkedFile)
              for (const child of el.children) stamp(child)
            }
            stamp(imported)
          }

          curShape = imported
        } else {
        // ── Built-in path-based shape (existing flow) ────────────────────────
          const currentD = _armedDraw
          const curStyle = canv.getStyle()

          const created = canv.addSVGElementsFromJson({
            element: 'path',
            curStyles: true,
            attr: {
              d: currentD ?? '',
              id: canv.getNextId(),
              opacity: Number(curStyle.opacity) / 2,
              style: 'pointer-events:none'
            }
          }) as SVGGraphicsElement
          curShape = created

          created.setAttribute('transform', 'translate(' + x + ',' + y + ') scale(0.005) translate(' + -x + ',' + -y + ')')
          canv.recalculateDimensions(created)
        }

        lastBBox = curShape.getBBox()
      },
      pointerMove (ctx, ev) {
        if (!curShape) return
        const evt = { shiftKey: ev.mods.shift }

        const x = ev.x
        const y = ev.y

        if (_userShapeData) {
        // ── User shape: size deterministically from the saved bbox ──────────
        // Drives placement straight off `bbox` (the content's own coordinate
        // space) instead of the path-shape's incremental getBBox()/transform
        // accumulation, which breaks for container elements whose transform
        // can't be flattened. The transform is rewritten from scratch each
        // move (no recalc until mouseUp), keeping the saved bbox valid.
          const bbox = _userShapeData.bbox as NonNullable<ShapeInsertDetail['bbox']>
          const newbox = {
            x: Math.min(startX, x),
            y: Math.min(startY, y),
            width: Math.abs(x - startX),
            height: Math.abs(y - startY)
          }
          let sx = (newbox.width / bbox.width) || 0
          let sy = (newbox.height / bbox.height) || 0
          if (evt.shiftKey) {
          // Shift: uniform scale (preserve original aspect ratio). Default = free resize.
            const min = Math.min(sx, sy)
            sx = min
            sy = min
          }
          curShape.setAttribute(
            'transform',
          `translate(${newbox.x},${newbox.y}) scale(${sx},${sy}) translate(${-bbox.x},${-bbox.y})`
          )
          return
        }

        const tlist = curShape.transform.baseVal
        const box = curShape.getBBox()
        const left = box.x; const top = box.y

        const newbox = {
          x: Math.min(startX, x),
          y: Math.min(startY, y),
          width: Math.abs(x - startX),
          height: Math.abs(y - startY)
        }

        let sx = (newbox.width / lastBBox.width) || 1
        let sy = (newbox.height / lastBBox.height) || 1

        // Not perfect, but mostly works...
        let tx = 0
        if (x < startX) {
          tx = lastBBox.width
        }
        let ty = 0
        if (y < startY) {
          ty = lastBBox.height
        }

        // update the transform list with translate,scale,translate
        const translateOrigin = svgroot.createSVGTransform()
        const scale = svgroot.createSVGTransform()
        const translateBack = svgroot.createSVGTransform()

        translateOrigin.setTranslate(-(left + tx), -(top + ty))
        if (evt.shiftKey) {
        // Shift: uniform scale (preserve original aspect ratio). Default = free resize.
          const max = Math.min(Math.abs(sx), Math.abs(sy))

          sx = max * (sx < 0 ? -1 : 1)
          sy = max * (sy < 0 ? -1 : 1)
        }
        scale.setScale(sx, sy)

        translateBack.setTranslate(left + tx, top + ty)
        tlist.appendItem(translateBack)
        tlist.appendItem(scale)
        tlist.appendItem(translateOrigin)

        canv.recalculateDimensions(curShape)

        lastBBox = curShape.getBBox()
      },
      pointerUp (ctx, ev) {
        const shape = curShape
        curShape = null
        if (!shape) return 'cancel'

        // a click without a drag on both axes places nothing
        const keepObject = ev.screenX !== ctx.start?.screenX && ev.screenY !== ctx.start?.screenY

        // Finalize the user shape's transform once (bakes primitives into
        // geometry, normalizes containers) now that resizing is done.
        if (_userShapeData && keepObject) {
          canv.recalculateDimensions(shape)
        }

        return keepObject ? { created: shape } : 'cancel'
      },
      cancel () { curShape = null }
    })

    return {
      callback () {
        if ($id('tool_shapelib') === null) {
          const extPath = svgEditor.configObj.curConfig.extPath
          const buttonTemplate = `
          <se-shape-library id="tool_shapelib" interactive
            title="${svgEditor.i18next.t(`${name}:buttons.0.title`)}"
            lib="${extPath}/ext-shapes/shapelib/"
            src="shapelib.svg"></se-shape-library>
          `
          canv.insertChildAtIndex($req('tools_left'), buttonTemplate, 9)

          // `shape-insert` bubbles + is composed, so a single document-level
          // listener catches every `se-shape-library` instance (desktop or
          // tablet). `e.target` is retargeted to the dispatching host element.
          document.addEventListener('shape-insert', (e) => {
            armShapeInsert((e as CustomEvent).detail, (e.target as Element))
          }, { signal: svgEditor.listenerAbort.signal })
        }
      }
    }
  }
}
