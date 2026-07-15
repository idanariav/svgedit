/**
 * @file ext-layer_view.js
 *
 * Layer mode. Toggling the toolbar button shows an on-canvas badge with two
 * sub-modes, switchable from a small control inside the badge:
 *   - "Layer" (default): Focus mode — isolates the current layer to make
 *     working on it easier:
 *       1. every other layer is locked (new/pasted objects can only land on
 *          the focused layer — same lock semantics as the per-layer padlock);
 *       2. every other layer is dimmed so the focused layer stands out;
 *       3. layer-navigation hotkeys are enabled:
 *            [ / ]              switch the focused layer down / up the stack
 *            PageUp / PageDown  move the selection to the adjacent layer and follow it
 *   - "All": All Layers mode — every layer becomes simultaneously selectable
 *     (via `svgCanvas.setAllLayersMode`), with no dimming/locking, so
 *     elements that live on different layers can be selected together (e.g.
 *     to group/save a compound shape) without merging layers. New content
 *     still lands on the current layer as usual.
 * The two sub-modes are mutually exclusive.
 *
 * All of this is a transient view state: the mode snapshots each layer's lock
 * state on entry and restores it on exit, and the dim is applied as an inline
 * style (never touching the persisted `opacity` attribute), so nothing here is
 * saved into the document.
 *
 * @license MIT
 */

import { isActiveEditor } from '../../domScope.js'

const name = 'layer_view'
// How much to fade the non-focused layers (inline style, so it survives the
// attribute-based hover highlight in the layers panel).
const DIM_OPACITY = 0.35

const loadExtensionTranslation = function (svgEditor) {
  const lang = svgEditor.configObj.pref('lang')
  // Locale files are inlined into the bundle (statically resolved glob).
  const locales = import.meta.glob('./locale/*.js', { eager: true })
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (translationModule) {
    svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
  }
}

export default {
  name,
  async init (_S) {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { $id, $click } = svgCanvas
    await loadExtensionTranslation(svgEditor)

    // Lock state of every layer captured when focus mode is enabled, so exiting
    // restores exactly what the user had rather than blanket-unlocking.
    let savedLocks = null
    // The document keydown listener installed only while the mode is active.
    let keyHandler = null
    // The on-canvas "current layer" badge (created lazily, reused thereafter).
    let badge = null
    // Which badge sub-mode is active: 'current' (Focus, default) or 'all'
    // (All Layers). Reset to 'current' every time the mode is (re-)entered.
    let subMode = 'current'

    const isPressed = () => $id('tool_layerView')?.pressed === true

    // Run fn(layerName, drawing) for every layer in the drawing.
    const eachLayer = (fn) => {
      const drawing = svgCanvas.getCurrentDrawing()
      let i = drawing.getNumLayers()
      while (i--) fn(drawing.getLayerName(i), drawing)
    }

    /* --------------------------------------------------------- name badge */

    const ensureBadge = () => {
      if (badge) return badge
      badge = document.createElement('div')
      badge.id = 'layer_focus_badge'

      const text = document.createElement('span')
      text.id = 'layer_focus_badge_text'

      const switchEl = document.createElement('span')
      switchEl.id = 'layer_focus_badge_switch'
      const makeSegment = (mode, labelKey, titleKey) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.dataset.mode = mode
        btn.textContent = svgEditor.i18next.t(`${name}:all.${labelKey}`)
        btn.title = svgEditor.i18next.t(`${name}:all.${titleKey}`)
        return btn
      }
      switchEl.append(
        makeSegment('current', 'switchCurrent', 'switchCurrentTitle'),
        makeSegment('all', 'switchAll', 'switchAllTitle')
      )
      switchEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-mode]')
        if (btn) setSubMode(btn.dataset.mode)
      })

      badge.append(text, switchEl)
      svgEditor.$svgEditor.append(badge)
      return badge
    }

    const updateBadge = () => {
      const el = ensureBadge()
      const cur = svgCanvas.getCurrentDrawing().getCurrentLayerName()
      el.querySelector('#layer_focus_badge_text').textContent = subMode === 'all'
        ? svgEditor.i18next.t(`${name}:all.badge`)
        : svgEditor.i18next.t(`${name}:focus.badge`, { name: cur })
      el.querySelectorAll('#layer_focus_badge_switch button').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.mode === subMode)
      })
      el.classList.toggle('visible', isPressed())
    }

    // Switch the badge's sub-mode ('current' Focus vs. 'all' All Layers).
    // applyFocus() below is the single place that reflects whichever
    // sub-mode is active, so switching just re-runs it.
    const setSubMode = (mode) => {
      if (subMode === mode) return
      subMode = mode
      applyFocus()
    }

    /* ------------------------------------------------------- focus visuals */

    // Reflect the active sub-mode onto every layer. Idempotent, so it can be
    // re-run on every layer switch / layers change / sub-mode switch.
    //   'current' (Focus): dim + lock everything but the current layer.
    //   'all' (All Layers): no dim, real lock state restored (nothing forced),
    //     and every layer becomes selectable via setAllLayersMode.
    const applyFocus = () => {
      if (subMode === 'all') {
        eachLayer((lname, drawing) => {
          const group = drawing.getLayerByName(lname)
          if (group) group.style.opacity = ''
          svgCanvas.setLayerLocked(lname, savedLocks?.[lname] ?? false)
        })
        svgCanvas.setAllLayersMode(true)
        updateBadge()
        return
      }
      svgCanvas.setAllLayersMode(false)
      const cur = svgCanvas.getCurrentDrawing().getCurrentLayerName()
      eachLayer((lname, drawing) => {
        const isCur = lname === cur
        const group = drawing.getLayerByName(lname)
        if (group) group.style.opacity = isCur ? '' : String(DIM_OPACITY)
        // Focused layer stays unlocked so new objects land on it; others locked.
        svgCanvas.setLayerLocked(lname, !isCur)
      })
      updateBadge()
    }

    const enterFocus = () => {
      subMode = 'current'
      savedLocks = {}
      eachLayer((lname, drawing) => { savedLocks[lname] = drawing.getLayerLocked(lname) })
      applyFocus()
      addKeys()
    }

    const exitFocus = () => {
      eachLayer((lname, drawing) => {
        const group = drawing.getLayerByName(lname)
        if (group) group.style.opacity = ''
        svgCanvas.setLayerLocked(lname, savedLocks?.[lname] ?? false)
      })
      svgCanvas.setAllLayersMode(false)
      savedLocks = null
      subMode = 'current'
      updateBadge()
      removeKeys()
    }

    const clickLayerView = () => {
      const btn = $id('tool_layerView')
      btn.pressed = !btn.pressed
      if (btn.pressed) enterFocus()
      else exitFocus()
    }

    /* ------------------------------------------------- layer-nav hotkeys */

    // Highlight the current layer's row in the panel without repopulating it
    // (repopulating would clear the selection).
    const syncPanelHighlight = () => {
      const cur = svgCanvas.getCurrentDrawing().getCurrentLayerName()
      $id('layerlist')?.querySelectorAll('tr.layer').forEach((tr) => {
        const nm = tr.querySelector('td.layername')?.textContent
        tr.classList.toggle('layersel', nm === cur)
      })
    }

    // Switch the focused layer by a z-order delta (+1 = up toward the top).
    const switchLayer = (delta) => {
      const drawing = svgCanvas.getCurrentDrawing()
      const target = svgCanvas.indexCurrentLayer() + delta
      if (target < 0 || target >= drawing.getNumLayers()) return
      svgCanvas.setCurrentLayer(drawing.getLayerName(target))
      applyFocus()
      syncPanelHighlight()
    }

    // Move the current selection to the adjacent layer, then follow the focus
    // there so the moved objects stay lit and editable.
    const moveSelection = (delta) => {
      const drawing = svgCanvas.getCurrentDrawing()
      const target = svgCanvas.indexCurrentLayer() + delta
      if (target < 0 || target >= drawing.getNumLayers()) return
      const sel = svgCanvas.getSelectedElements().filter(Boolean)
      if (!sel.length) return
      const targetName = drawing.getLayerName(target)
      svgCanvas.moveSelectedToLayer(targetName)
      svgCanvas.setCurrentLayer(targetName)
      applyFocus()
      svgCanvas.selectOnly(sel) // refresh the selector box at the new position
      syncPanelHighlight()
    }

    // The deepest focused element (piercing shadow roots) is a text field, so
    // navigation keys belong to the field, not to us.
    const isTyping = () => {
      let el = document.activeElement
      while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
      const tag = el?.nodeName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable === true
    }

    const onKey = (e) => {
      // Focused-layer navigation doesn't apply in All Layers mode — there's
      // no single focused layer to switch away from.
      if (!isActiveEditor(svgEditor) || isTyping() || subMode === 'all') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case ']': switchLayer(1); break
        case '[': switchLayer(-1); break
        case 'PageUp': moveSelection(1); break
        case 'PageDown': moveSelection(-1); break
        default: return
      }
      e.preventDefault()
    }

    const addKeys = () => {
      if (keyHandler) return
      keyHandler = onKey
      document.addEventListener('keydown', keyHandler)
    }

    const removeKeys = () => {
      if (!keyHandler) return
      document.removeEventListener('keydown', keyHandler)
      keyHandler = null
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      layersChanged () {
        // Honour a host config that asks the editor to start in focus mode.
        if (svgEditor.configObj.curConfig.layerView && !isPressed()) {
          svgEditor.configObj.curConfig.layerView = false
          $id('tool_layerView').pressed = true
          enterFocus()
          return
        }
        // Re-derive the focus visuals after layers are added/removed/reordered.
        if (isPressed()) applyFocus()
      },
      layerVisChanged () {
        // Manually toggling a layer's visibility means the user is taking control
        // of what's shown, so drop out of focus mode.
        if (isPressed()) {
          $id('tool_layerView').pressed = false
          exitFocus()
        }
      },
      callback () {
        const buttonTemplate = document.createElement('template')
        const title = `${name}:buttons.0.title`
        const key = `${name}:buttons.0.key`
        buttonTemplate.innerHTML = `
      <se-button id="tool_layerView" title="${title}" shortcut="${key}" src="layer_view.svg"></se-button>`
        $id('editor_panel').append(buttonTemplate.content.cloneNode(true))
        $click($id('tool_layerView'), clickLayerView.bind(this))
      }
    }
  }
}
