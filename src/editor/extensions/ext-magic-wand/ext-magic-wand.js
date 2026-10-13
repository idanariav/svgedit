/**
 * @file ext-magic-wand.js
 *
 * Magic Wand tool: click a shape to select every shape that shares something with it (fill, stroke, both, stroke
 * weight, opacity or shape type, optionally within a colour tolerance). Shift adds what the click finds to the
 * selection, Alt takes it out (the *Click* option on the options bar sets the same for a screen with no Shift or Alt: Replace /
 * Add / Subtract; the modifiers still win), a click on empty canvas clears the selection. The matching is the same as Select
 * Same (`@svgedit/svgcanvas/core/select-same.js`, `svgCanvas.findSameAs`): the current group, else the visible
 * layers; locked shapes are not targets.
 *
 * What the shapes have to share is on the options bar. The tolerance is the Editor Preferences' "Select Same"
 * tolerance (one setting for both); the criterion and the click mode live in memory until reload.
 *
 * Selecting is not an undoable edit, so a click records no undo step.
 *
 * @license MIT
 */
import { combineSelection, selectionOpFor } from '@svgedit/svgcanvas/core/select-same.js'

const name = 'magic-wand'
const MODE = 'wand'
const TOLERANCE_PREF = 'select_same_tolerance'
const COLOUR_CRITERIA = new Set(['fill', 'stroke', 'fillstroke'])

const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  const locales = import.meta.glob('./locale/*.js', { eager: true })
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { $id } = svgCanvas
    await loadExtensionTranslation(svgEditor)
    const tr = (key) => svgEditor.i18next.t(`${name}:${key}`)

    let criterion = 'fill'
    let clickMode = 'replace'

    const tolerance = () => Math.max(0, parseFloat(svgEditor.configObj.pref(TOLERANCE_PREF)) || 0)

    /**
     * The shape under the pointer, or null for empty canvas. The selection box and its grips are skipped, so a
     * shape that is already selected can still be clicked (to subtract it); the canvas reports locked shapes as
     * empty canvas.
     */
    const targetOf = (ev) => {
      const { selectorParentGroup } = svgCanvas.selectorManager
      for (const node of document.elementsFromPoint(ev.screenX, ev.screenY)) {
        const target = svgCanvas.getMouseTargetFromNode(node)
        if (!target || target === selectorParentGroup) continue
        return target === svgCanvas.getSvgRoot() ? null : target
      }
      return null
    }

    svgCanvas.registerTool({
      id: MODE,
      undoLabel: 'Magic Wand',
      wantsHover: true,

      pointerDown () {},

      pointerMove (ctx, ev) {
        // Hover only (a drag does nothing): a click would pick this shape.
        svgCanvas.setCursorHint(targetOf(ev) ? 'pointer' : null)
      },

      pointerUp (ctx, ev) {
        const current = svgCanvas.getSelectedElements().filter(Boolean)
        const target = targetOf(ev)
        const op = selectionOpFor(ev.mods, clickMode)
        if (!target) {
          // Empty canvas: clear, unless the user is building a selection with a modifier.
          if (op === 'replace' && current.length) svgCanvas.clearSelection()
          return
        }
        const found = svgCanvas.findSameAs(target, criterion, { tolerance: COLOUR_CRITERIA.has(criterion) ? tolerance() : 0 })
        const next = combineSelection(op, current, found)
        if (next.length) svgCanvas.selectOnly(next, true)
        else svgCanvas.clearSelection()
      },

      options: () => [
        {
          id: 'criterion',
          type: 'select',
          label: tr('match'),
          title: tr('matchTitle'),
          value: criterion,
          choices: ['fill', 'stroke', 'fillstroke', 'strokeweight', 'opacity', 'type'].map((value) => ({ value, label: tr(value) }))
        },
        {
          id: 'click',
          type: 'select',
          label: tr('click'),
          title: tr('clickTitle'),
          value: clickMode,
          choices: ['replace', 'add', 'subtract'].map((value) => ({ value, label: tr(`click_${value}`) }))
        },
        {
          id: 'tolerance',
          type: 'number',
          label: tr('tolerance'),
          title: tr('toleranceTitle'),
          value: tolerance(),
          min: 0,
          max: 100,
          step: 1,
          hidden: !COLOUR_CRITERIA.has(criterion)
        }
      ],
      setOption: (id, value) => {
        if (id === 'criterion') criterion = String(value)
        else if (id === 'click') clickMode = selectionOpFor({}, String(value))
        else if (id === 'tolerance') svgEditor.configObj.pref(TOLERANCE_PREF, Math.max(0, Number(value) || 0), true)
      }
    })

    return {
      name: tr('name'),
      callback () {
        const title = `${name}:toolTitle`
        const button = `<se-button id="tool_wand" command="tool_wand" title="${title}" src="magic-wand.svg"></se-button>`
        const anchor = $id('tool_measure') ?? $id('tool_eyedropper')
        if (anchor) anchor.insertAdjacentHTML('afterend', button)
        else svgCanvas.insertChildAtIndex($id('tools_left'), button, 13)
        svgEditor.leftPanel.addModeCommand('tool_wand', MODE, { label: title })
      }
    }
  }
}
