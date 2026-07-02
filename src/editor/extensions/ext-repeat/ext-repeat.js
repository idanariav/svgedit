/**
 * @file ext-repeat.js
 *
 * Radial / grid repeat (array) tool. Clones the current selection N times
 * around a center (radial) or in a rows×cols grid, as one undoable batch.
 *
 * Re-editable without a live dependency graph: the source element(s) are
 * stamped with `se:repeat-source="<uid>"` + the params as `se:repeat`, and
 * every copy carries `se:repeat-copy="<uid>"`. Re-opening the popover with
 * the source (or any copy) selected pre-fills the params; applying again
 * deletes the old copies by uid and regenerates. `se:` attributes bypass the
 * sanitize whitelist so all of this survives save/load; the copies are plain
 * elements, so the file renders identically anywhere.
 *
 * UI: `<se-repeat-settings>` popover buttons (see
 * `components/seRepeatSettings.js`) injected into the Design tab's Object
 * section (single selection) and the Combine section (multi-selection).
 * Canvas APIs provided here: `svgCanvas.repeatSelection(params)` and
 * `svgCanvas.getRepeatParams()`.
 *
 * @license Apache-2.0
 */

const name = 'repeat'

const SOURCE_ATTR = 'se:repeat-source'
const COPY_ATTR = 'se:repeat-copy'
const PARAMS_ATTR = 'se:repeat'

const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  const locales = import.meta.glob('./locale/*.js', { eager: true })
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

const serializeParams = (p) => p.mode === 'radial'
  ? `radial;count=${p.count};sweep=${p.sweep};center=${p.center}`
  : `grid;rows=${p.rows};cols=${p.cols};gapX=${p.gapX};gapY=${p.gapY}`

const parseParams = (str) => {
  if (!str) return null
  const [mode, ...pairs] = str.split(';')
  const vals = Object.fromEntries(pairs.map((kv) => kv.split('=')))
  if (mode === 'radial') {
    return {
      mode,
      count: parseInt(vals.count) || 6,
      sweep: parseFloat(vals.sweep) || 360,
      center: vals.center === 'selection' ? 'selection' : 'canvas'
    }
  }
  if (mode === 'grid') {
    return {
      mode,
      rows: parseInt(vals.rows) || 2,
      cols: parseInt(vals.cols) || 3,
      gapX: parseFloat(vals.gapX) || 0,
      gapY: parseFloat(vals.gapY) || 0
    }
  }
  return null
}

export default {
  name,
  async init () {
    const svgEditor = this
    await loadExtensionTranslation(svgEditor)
    const { svgCanvas } = svgEditor
    const { $id } = svgCanvas

    const allContentElems = () =>
      Array.from(svgCanvas.getSvgContent().querySelectorAll('*'))

    const findByAttr = (attr, uid) =>
      allContentElems().filter((el) => el.getAttribute(attr) === uid)

    /**
     * Resolve the repeat unit for the current selection: its uid (if any)
     * and the source elements (redirecting from a selected copy).
     * @returns {{uid: ?string, sources: Element[]}}
     */
    const resolveUnit = () => {
      const selected = svgCanvas.getSelectedElements().filter(Boolean)
      const srcUid = selected.map((el) => el.getAttribute(SOURCE_ATTR)).find(Boolean)
      if (srcUid) return { uid: srcUid, sources: findByAttr(SOURCE_ATTR, srcUid) }
      const copyUid = selected.map((el) => el.getAttribute(COPY_ATTR)).find(Boolean)
      if (copyUid) return { uid: copyUid, sources: findByAttr(SOURCE_ATTR, copyUid) }
      return { uid: null, sources: selected }
    }

    /**
     * Seed params for the popover from an existing repeat on the selection.
     * @returns {?Object}
     */
    const getRepeatParams = () => {
      const { uid, sources } = resolveUnit()
      if (!uid || !sources.length) return null
      return parseParams(sources[0].getAttribute(PARAMS_ATTR))
    }

    /**
     * Apply (or re-apply) a repeat to the current selection as one undo step.
     * @param {Object} params - `{mode:'radial',count,sweep,center}` or
     *   `{mode:'grid',rows,cols,gapX,gapY}`.
     * @returns {void}
     */
    const repeatSelection = (params) => {
      let { uid, sources } = resolveUnit()
      sources = sources.filter((el) => !el.hasAttribute('data-frame'))
      if (!sources.length) return

      const { BatchCommand, InsertElementCommand, RemoveElementCommand, ChangeElementCommand } = svgCanvas.history
      const batchCmd = new BatchCommand('Repeat')

      // Update: drop the previous copies first.
      if (uid) {
        for (const copy of findByAttr(COPY_ATTR, uid)) {
          batchCmd.addSubCommand(new RemoveElementCommand(copy, copy.nextSibling, copy.parentNode))
          copy.remove()
        }
      } else {
        uid = `rpt_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
      }

      // Stamp the sources with the unit id + params.
      for (const src of sources) {
        const oldValues = {
          [SOURCE_ATTR]: src.getAttribute(SOURCE_ATTR),
          [PARAMS_ATTR]: src.getAttribute(PARAMS_ATTR)
        }
        src.setAttribute(SOURCE_ATTR, uid)
        src.setAttribute(PARAMS_ATTR, serializeParams(params))
        batchCmd.addSubCommand(new ChangeElementCommand(src, oldValues))
      }

      // Per-copy transforms.
      const transforms = []
      if (params.mode === 'radial') {
        const total = Math.max(2, params.count)
        let cx
        let cy
        if (params.center === 'selection') {
          const bb = svgCanvas.getStrokedBBox(sources)
          cx = bb.x + bb.width / 2
          cy = bb.y + bb.height / 2
        } else {
          const res = svgCanvas.getResolution()
          cx = res.w / 2
          cy = res.h / 2
        }
        const full = params.sweep >= 360
        const step = full ? params.sweep / total : params.sweep / (total - 1)
        for (let k = 1; k < total; ++k) {
          transforms.push(`rotate(${k * step} ${cx} ${cy})`)
        }
      } else {
        const bb = svgCanvas.getStrokedBBox(sources)
        const stepX = bb.width + params.gapX
        const stepY = bb.height + params.gapY
        for (let i = 0; i < params.rows; ++i) {
          for (let j = 0; j < params.cols; ++j) {
            if (i === 0 && j === 0) continue
            transforms.push(`translate(${j * stepX} ${i * stepY})`)
          }
        }
      }

      // Clone each source once per transform (world-space transform prepended
      // to the clone's own transform list; never recalculated/baked — baking
      // would decompose the rotates).
      for (const tf of transforms) {
        for (const src of sources) {
          const clone = src.cloneNode(true)
          clone.removeAttribute(SOURCE_ATTR)
          clone.removeAttribute(PARAMS_ATTR)
          svgCanvas.remapElementIdsAndRefs([clone], () => svgCanvas.getNextId())
          clone.setAttribute(COPY_ATTR, uid)
          const own = clone.getAttribute('transform')
          clone.setAttribute('transform', own ? `${tf} ${own}` : tf)
          src.parentNode.append(clone)
          batchCmd.addSubCommand(new InsertElementCommand(clone))
        }
      }

      svgCanvas.addCommandToHistory(batchCmd)
      svgCanvas.call('changed', sources)
    }

    svgCanvas.repeatSelection = repeatSelection
    svgCanvas.getRepeatParams = getRepeatParams

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        const title = svgEditor.i18next.t(`${name}:title`)
        // Single-selection Object section (Design tab), after the offset popover.
        const single = $id('tool_path_offset')?.parentElement
        if (single) {
          const btn = document.createElement('se-repeat-settings')
          btn.id = 'tool_repeat'
          btn.setAttribute('title', title)
          btn.setAttribute('src', 'repeat.svg')
          $id('tool_path_offset').after(btn)
        }
        // Multi-selection Combine section.
        const multi = $id('tool_bool_union')?.parentElement
        if (multi) {
          const btn = document.createElement('se-repeat-settings')
          btn.id = 'tool_repeat_multi'
          btn.setAttribute('title', title)
          btn.setAttribute('src', 'repeat.svg')
          multi.append(btn)
        }
      }
    }
  }
}
