/**
 * @file ext-layer_view.js
 *
 * Layer Focus mode. Toggling the toolbar button isolates the current layer to
 * make working on it easier:
 *   1. every other layer is locked (new/pasted objects can only land on the
 *      focused layer — same lock semantics as the per-layer padlock);
 *   2. the current layer's name is shown as an on-canvas badge;
 *   3. every other layer is dimmed so the focused layer stands out;
 *   4. while the mode is on, layer-navigation hotkeys are enabled:
 *        [ / ]           switch the focused layer down / up the stack
 *        PageUp / PageDown  move the selection to the adjacent layer and follow it
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
      svgEditor.$svgEditor.append(badge)
      return badge
    }

    const updateBadge = () => {
      const el = ensureBadge()
      const cur = svgCanvas.getCurrentDrawing().getCurrentLayerName()
      el.textContent = svgEditor.i18next.t(`${name}:focus.badge`, { name: cur })
      el.classList.toggle('visible', isPressed())
    }

    /* ------------------------------------------------------- focus visuals */

    // Reflect the focused (current) layer: dim + lock everything else. Idempotent,
    // so it can be re-run on every layer switch / layers change.
    const applyFocus = () => {
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
      savedLocks = null
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
      if (!isActiveEditor(svgEditor) || isTyping()) return
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
