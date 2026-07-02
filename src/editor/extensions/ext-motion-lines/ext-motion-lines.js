/**
 * @file ext-motion-lines.js
 *
 * Parametric motion-line (speed-line) generator. Generates a group of
 * curved/straight trailing lines beside the selection — the classic
 * flat-illustration movement accent — as one undoable batch.
 *
 * Re-editable via the same stamp scheme as ext-repeat: the source elements
 * carry `se:motion-source="<uid>"` + the params as `se:motion`, the generated
 * `<g>` carries `se:motion-copy="<uid>"`. Re-opening the popover with the
 * source (or the group) selected pre-fills the params; applying again
 * replaces the group. `se:` attributes bypass sanitize, so this survives
 * save/load; the lines are plain paths and render identically anywhere.
 *
 * Line styling follows the source (stroke color/width, falling back to fill,
 * then to the current tool style), with round caps. The middle lines run the
 * longest and `curve` bows the outer lines apart for a hand-drawn feel.
 *
 * UI: `<se-motion-settings>` popover buttons (see
 * `components/seMotionSettings.js`) in the Object + Combine sections. Canvas
 * APIs provided here: `svgCanvas.applyMotionLines(params)` and
 * `svgCanvas.getMotionParams()`.
 *
 * @license Apache-2.0
 */

import '../../components/seMotionSettings.js'

const name = 'motion-lines'

const SOURCE_ATTR = 'se:motion-source'
const COPY_ATTR = 'se:motion-copy'
const PARAMS_ATTR = 'se:motion'

const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  const locales = import.meta.glob('./locale/*.js', { eager: true })
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

const serializeParams = (p) =>
  `dir=${p.dir};count=${p.count};len=${p.len};gap=${p.gap};curve=${p.curve}`

const parseParams = (str) => {
  if (!str) return null
  const vals = Object.fromEntries(str.split(';').map((kv) => kv.split('=')))
  return {
    dir: ['left', 'right', 'up', 'down'].includes(vals.dir) ? vals.dir : 'left',
    count: parseInt(vals.count) || 3,
    len: parseFloat(vals.len) || 80,
    gap: parseFloat(vals.gap) || 15,
    curve: parseFloat(vals.curve) || 0
  }
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
     * Resolve the motion unit for the current selection: its uid (if any)
     * and the source elements (redirecting from a selected line group).
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

    const getMotionParams = () => {
      const { uid, sources } = resolveUnit()
      if (!uid || !sources.length) return null
      return parseParams(sources[0].getAttribute(PARAMS_ATTR))
    }

    /** Resolve the line paint from the first source element. */
    const lineStyle = (src) => {
      const attr = (a) => {
        const v = src.getAttribute(a)
        return v && v !== 'none' ? v : null
      }
      return {
        stroke: attr('stroke') || attr('fill') || svgCanvas.getColor('stroke') || '#000000',
        width: parseFloat(src.getAttribute('stroke-width')) || svgCanvas.getStrokeWidth() || 4
      }
    }

    /**
     * Build the `d` strings for the trailing lines beside `bb`.
     * @param {{x,y,width,height}} bb - Selection bbox (content units).
     * @param {Object} p - Params (`dir`,`count`,`len`,`gap`,`curve`).
     * @returns {string[]}
     */
    const buildLines = (bb, p) => {
      const ds = []
      const horizontal = p.dir === 'left' || p.dir === 'right'
      const span = horizontal ? bb.height : bb.width
      const pad = span * 0.12
      for (let i = 0; i < p.count; i++) {
        const f = p.count === 1 ? 0.5 : i / (p.count - 1)
        // Middle lines run the longest, outer ones shorter.
        const len = p.len * (1 - 0.4 * Math.abs(2 * f - 1))
        // Outer lines bow apart; the middle one stays straight.
        const bow = p.curve * (2 * f - 1)
        if (horizontal) {
          const y = bb.y + pad + f * (span - 2 * pad)
          const xNear = p.dir === 'left' ? bb.x - p.gap : bb.x + bb.width + p.gap
          const xFar = p.dir === 'left' ? xNear - len : xNear + len
          ds.push(`M${xFar} ${y} Q${(xFar + xNear) / 2} ${y + bow} ${xNear} ${y}`)
        } else {
          const x = bb.x + pad + f * (span - 2 * pad)
          const yNear = p.dir === 'up' ? bb.y - p.gap : bb.y + bb.height + p.gap
          const yFar = p.dir === 'up' ? yNear - len : yNear + len
          ds.push(`M${x} ${yFar} Q${x + bow} ${(yFar + yNear) / 2} ${x} ${yNear}`)
        }
      }
      return ds
    }

    /**
     * Apply (or re-apply) motion lines to the current selection as one undo
     * step.
     * @param {Object} params - `{dir,count,len,gap,curve}`.
     * @returns {void}
     */
    const applyMotionLines = (params) => {
      let { uid, sources } = resolveUnit()
      sources = sources.filter((el) =>
        !el.hasAttribute('data-frame') && !el.hasAttribute(COPY_ATTR))
      if (!sources.length) return

      const { BatchCommand, InsertElementCommand, RemoveElementCommand, ChangeElementCommand } = svgCanvas.history
      const batchCmd = new BatchCommand('Motion lines')

      if (uid) {
        for (const copy of findByAttr(COPY_ATTR, uid)) {
          batchCmd.addSubCommand(new RemoveElementCommand(copy, copy.nextSibling, copy.parentNode))
          copy.remove()
        }
      } else {
        uid = `mtn_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`
      }

      for (const src of sources) {
        const oldValues = {
          [SOURCE_ATTR]: src.getAttribute(SOURCE_ATTR),
          [PARAMS_ATTR]: src.getAttribute(PARAMS_ATTR)
        }
        src.setAttribute(SOURCE_ATTR, uid)
        src.setAttribute(PARAMS_ATTR, serializeParams(params))
        batchCmd.addSubCommand(new ChangeElementCommand(src, oldValues))
      }

      const bb = svgCanvas.getStrokedBBox(sources)
      if (!bb) return
      const style = lineStyle(sources[0])
      const svgdoc = $id('svgcanvas').ownerDocument
      const group = svgdoc.createElementNS(svgCanvas.NS.SVG, 'g')
      group.setAttribute('id', svgCanvas.getNextId())
      group.setAttribute(COPY_ATTR, uid)
      for (const d of buildLines(bb, params)) {
        const path = svgdoc.createElementNS(svgCanvas.NS.SVG, 'path')
        svgCanvas.assignAttributes(path, {
          id: svgCanvas.getNextId(),
          d,
          fill: 'none',
          stroke: style.stroke,
          'stroke-width': style.width,
          'stroke-linecap': 'round'
        })
        group.append(path)
      }
      sources[0].parentNode.append(group)
      batchCmd.addSubCommand(new InsertElementCommand(group))

      svgCanvas.addCommandToHistory(batchCmd)
      svgCanvas.call('changed', sources)
    }

    svgCanvas.applyMotionLines = applyMotionLines
    svgCanvas.getMotionParams = getMotionParams

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        const title = svgEditor.i18next.t(`${name}:title`)
        const addBtn = (id, anchor, after) => {
          if (!anchor) return
          const btn = document.createElement('se-motion-settings')
          btn.id = id
          btn.setAttribute('title', title)
          btn.setAttribute('src', 'motion_lines.svg')
          if (after) anchor.after(btn)
          else anchor.append(btn)
        }
        addBtn('tool_motion_lines', $id('tool_mirror_copy') || $id('tool_repeat') || $id('tool_path_offset'), true)
        addBtn('tool_motion_lines_multi', $id('tool_bool_union')?.parentElement, false)
      }
    }
  }
}
