/**
 * @file ext-path-edit.js
 *
 * UI for the path edits that live in `@svgedit/svgcanvas/core/path-edit.js` /
 * `path-join.js` (geometry, undo and eligibility are the canvas's job):
 *
 * - **Average** and **Add anchor points** buttons in the top bar's node-editing
 *   tray (`.path_node_panel`, visible in pathedit mode) →
 *   `svgCanvas.pathActions.averageSelectedNodes(axis)` / `addAnchorPoints()`.
 * - **Join** in the Design tab: a "Close" button in the Object → Path cluster
 *   for one selected open path, and a "Join" button in the Combine row for two
 *   selected open paths → `svgCanvas.joinSelectedPaths()`. Shown only when the
 *   selection is eligible (`svgCanvas.canJoinPaths`).
 *
 * @license Apache-2.0
 */

const name = 'path-edit'

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
    await loadExtensionTranslation(svgEditor)
    const { svgCanvas } = svgEditor
    const { $id } = svgCanvas
    const t = (key) => svgEditor.i18next.t(`${name}:${key}`)

    /** Whether the selection is `count` paths that can be joined (or closed, for one). */
    const joinable = (count) => {
      const list = svgCanvas.getSelectedElements().filter(Boolean)
      return list.length === count && svgCanvas.canJoinPaths(list)
    }

    const updateJoin = (elems) => {
      const list = (elems || svgCanvas.getSelectedElements()).filter(Boolean)
      const ok = svgCanvas.canJoinPaths(list)
      const single = $id('tool_join_paths')
      const multi = $id('tool_join_paths_multi')
      if (single) single.style.display = ok && list.length === 1 ? '' : 'none'
      if (multi) multi.style.display = ok && list.length === 2 ? '' : 'none'
    }

    return {
      name: t('name'),

      callback () {
        // Node-editing tray: Average (action menu) and Add anchor points.
        const tray = svgEditor.$container.querySelector('.path_node_panel') // this editor's own tray (several can be mounted)
        const after = $id('tool_node_delete')
        if (tray) {
          const average = document.createElement('se-select')
          average.id = 'tool_node_average'
          average.setAttribute('title', t('average'))
          average.addOption('', t('averagePlaceholder'))
          average.addOption('h', t('averageH'))
          average.addOption('v', t('averageV'))
          average.addOption('both', t('averageBoth'))
          const addAnchors = document.createElement('se-button')
          addAnchors.id = 'tool_node_add_anchors'
          addAnchors.setAttribute('command', 'tool_node_add_anchors')
          addAnchors.setAttribute('title', t('addAnchors'))
          addAnchors.setAttribute('src', 'node_add_anchors.svg')
          if (after) after.after(average, addAnchors)
          else tray.append(average, addAnchors)

          average.addEventListener('change', (e) => {
            const axis = e.target.value
            if (!axis) return
            // se-select assigns its own value after dispatching 'change'; reset
            // to the placeholder once that has happened.
            setTimeout(() => { const el = $id('tool_node_average'); if (el) el.value = '' }, 0)
            svgCanvas.pathActions.averageSelectedNodes(axis)
          })
          svgEditor.commands.register({
            id: 'tool_node_add_anchors',
            label: t('addAnchors'),
            group: 'Tools',
            pd: true,
            enabled: () => svgCanvas.getMode() === 'pathedit' ? true : 'Edit a path’s nodes first',
            run: () => svgCanvas.pathActions.addAnchorPoints()
          })
        }

        // Join: "Close" for one open path (Object → Path), "Join" for two (Combine).
        const join = () => svgCanvas.joinSelectedPaths()
        const pathAnchor = $id('tool_stroke_to_path')
        if (pathAnchor) {
          const btn = document.createElement('se-button')
          btn.id = 'tool_join_paths'
          btn.setAttribute('command', 'tool_join_paths')
          btn.setAttribute('title', t('close'))
          btn.setAttribute('src', 'join_paths.svg')
          btn.setAttribute('size', 'small')
          btn.setAttribute('data-caption', t('closeCaption'))
          btn.style.display = 'none'
          pathAnchor.after(btn)
          svgEditor.commands.register({
            id: 'tool_join_paths',
            label: t('close'),
            group: 'Tools',
            pd: true,
            enabled: () => joinable(1) ? true : 'Select one open path',
            run: join
          })
        }
        const multiAnchor = $id('tool_match_strokes')
        if (multiAnchor) {
          const btn = document.createElement('se-button')
          btn.id = 'tool_join_paths_multi'
          btn.setAttribute('command', 'tool_join_paths_multi')
          btn.setAttribute('title', t('join'))
          btn.setAttribute('src', 'join_paths.svg')
          btn.setAttribute('size', 'small')
          btn.style.display = 'none'
          multiAnchor.after(btn)
          svgEditor.commands.register({
            id: 'tool_join_paths_multi',
            label: t('join'),
            group: 'Tools',
            pd: true,
            enabled: () => joinable(2) ? true : 'Select two paths',
            run: join
          })
        }
      },

      selectedChanged (opts) {
        updateJoin(opts.elems?.filter(Boolean))
      },

      elementChanged () {
        updateJoin()
      }
    }
  }
}
