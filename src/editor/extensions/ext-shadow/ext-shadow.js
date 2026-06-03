/**
 * @file ext-shadow.js
 *
 * @license Apache-2.0
 *
 * Adds a drop shadow to any selected shape via a composed SVG filter.
 * Controls: angle (direction), length (stretch), blur radius, opacity, color.
 *
 * Angle 0° = 12 o'clock (shadow points up), increases clockwise.
 * Internally the filter stores dx/dy on feDropShadow; angle/length are the UI
 * representation only — no SVG format change for saved files.
 *
 * The filter is stored in <defs> with id "{elemId}_shadow" and uses
 * a single <feDropShadow> primitive (Baseline Widely Available since 2020).
 */

const name = 'shadow'

const loadExtensionTranslation = async function (svgEditor) {
  let translationModule
  const lang = svgEditor.configObj.pref('lang')
  try {
    translationModule = await import(`./locale/${lang}.js`)
  } catch (_error) {
    console.warn(`Missing translation (${lang}) for ${name} - using 'en'`)
    translationModule = await import('./locale/en.js')
  }
  svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
}

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const {
      BatchCommand, InsertElementCommand, RemoveElementCommand, ChangeElementCommand
    } = svgCanvas.history
    const { $id } = svgCanvas
    await loadExtensionTranslation(svgEditor)

    // elemId → previous filter URL (to restore on shadow removal)
    const prevFilterMap = {}

    // --- Polar/Cartesian helpers ---

    // Angle 0° = 12 o'clock (shadow points up), clockwise; SVG Y-axis is down.
    const toOffset = (angle, length) => {
      const r = angle * Math.PI / 180
      return { dx: length * Math.sin(r), dy: -length * Math.cos(r) }
    }

    // Inverse: dx/dy → { angle: 0–360, length }
    const toPolar = (dx, dy) => {
      const length = Math.sqrt(dx * dx + dy * dy)
      const angle = length > 0
        ? ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360
        : 150 // default to ~5 o'clock when length is zero
      return { angle, length }
    }

    /**
     * Compute filter region in userSpaceOnUse coordinates so long shadows
     * are never clipped. Must be called after the element has layout.
     */
    const setFilterRegion = (filter, elem, length, blur) => {
      const bbox = elem.getBBox()
      const pad = Math.abs(length) + blur * 3
      filter.setAttribute('filterUnits', 'userSpaceOnUse')
      filter.setAttribute('x', String(Math.floor(bbox.x - pad)))
      filter.setAttribute('y', String(Math.floor(bbox.y - pad)))
      filter.setAttribute('width', String(Math.ceil(bbox.width + pad * 2)))
      filter.setAttribute('height', String(Math.ceil(bbox.height + pad * 2)))
    }

    /**
     * Read shadow params from an element's _shadow filter.
     * Returns null if no shadow filter is set.
     */
    const getShadowFromElement = (elem) => {
      if (!elem) return null
      const filterId = `${elem.id}_shadow`
      const filterAttr = elem.getAttribute('filter')
      if (!filterAttr || !filterAttr.includes(filterId)) return null
      const filter = svgCanvas.getElement(filterId)
      if (!filter) return null
      const ds = filter.querySelector('feDropShadow')
      if (!ds) return null
      const dx = Number(ds.getAttribute('dx') ?? 5)
      const dy = Number(ds.getAttribute('dy') ?? 5)
      const { angle, length } = toPolar(dx, dy)
      return {
        angle: Math.round(angle),
        length: Math.round(length * 10) / 10,
        blur: Number(ds.getAttribute('stdDeviation') ?? 4),
        opacity: Number(ds.getAttribute('flood-opacity') ?? 0.5),
        color: ds.getAttribute('flood-color') ?? '#000000'
      }
    }

    /**
     * Read current panel values.
     */
    const getShadowPanelValues = () => ({
      angle: Number($id('shadow_angle').value),
      length: Number($id('shadow_length').value),
      blur: Number($id('shadow_blur').value),
      opacity: Number($id('shadow_opacity').value),
      color: $id('shadow_color').value
    })

    /**
     * Apply, update, or remove the drop shadow on the selected element.
     * All changes are recorded in the undo history.
     * @param {object} params - { angle, length, blur, opacity, color } or { remove: true }
     */
    const setShadow = (params) => {
      const elem = svgCanvas.getSelectedElements()[0]
      if (!elem) return

      const elemId = elem.id
      const batchCmd = new BatchCommand('Set shadow')

      // --- Remove path ---
      if (params.remove) {
        const filter = svgCanvas.getElement(`${elemId}_shadow`)
        const oldFilterAttr = elem.getAttribute('filter')
        if (filter) {
          batchCmd.addSubCommand(new RemoveElementCommand(filter, filter.parentNode))
          filter.remove()
        }
        if (oldFilterAttr) {
          batchCmd.addSubCommand(new ChangeElementCommand(elem, { filter: oldFilterAttr }))
          const saved = prevFilterMap[elemId]
          if (saved) {
            elem.setAttribute('filter', saved)
            delete prevFilterMap[elemId]
          } else {
            elem.removeAttribute('filter')
          }
        }
        if (!batchCmd.isEmpty()) {
          svgCanvas.addCommandToHistory(batchCmd)
        }
        return
      }

      // --- Apply / update path ---
      const { angle, length, blur, opacity, color } = params
      const { dx, dy } = toOffset(angle, length)
      let filter = svgCanvas.getElement(`${elemId}_shadow`)

      if (!filter) {
        // Save any pre-existing non-shadow filter for later restoration
        const existingFilter = elem.getAttribute('filter')
        if (existingFilter && !existingFilter.includes('_shadow')) {
          prevFilterMap[elemId] = existingFilter
        }

        // Record old filter attr for undo
        batchCmd.addSubCommand(
          new ChangeElementCommand(elem, { filter: existingFilter ?? '' })
        )

        // Create <feDropShadow>
        const dropShadowEl = svgCanvas.addSVGElementsFromJson({
          element: 'feDropShadow',
          attr: {
            dx: String(dx),
            dy: String(dy),
            stdDeviation: String(blur),
            'flood-color': color,
            'flood-opacity': String(opacity)
          }
        })

        // Create <filter> and assemble
        filter = svgCanvas.addSVGElementsFromJson({
          element: 'filter',
          attr: { id: `${elemId}_shadow` }
        })
        setFilterRegion(filter, elem, length, blur)
        filter.append(dropShadowEl)
        svgCanvas.findDefs().append(filter)
        batchCmd.addSubCommand(new InsertElementCommand(filter))
        svgCanvas.changeSelectedAttributeNoUndo('filter', `url(#${elemId}_shadow)`)
      } else {
        // Update existing filter in-place
        const ds = filter.querySelector('feDropShadow')
        if (ds) {
          batchCmd.addSubCommand(new ChangeElementCommand(ds, {
            dx: ds.getAttribute('dx'),
            dy: ds.getAttribute('dy'),
            stdDeviation: ds.getAttribute('stdDeviation'),
            'flood-color': ds.getAttribute('flood-color'),
            'flood-opacity': ds.getAttribute('flood-opacity')
          }))
          ds.setAttribute('dx', String(dx))
          ds.setAttribute('dy', String(dy))
          ds.setAttribute('stdDeviation', String(blur))
          ds.setAttribute('flood-color', color)
          ds.setAttribute('flood-opacity', String(opacity))
        }
        setFilterRegion(filter, elem, length, blur)
      }

      if (!batchCmd.isEmpty()) {
        svgCanvas.addCommandToHistory(batchCmd)
      }
    }

    /**
     * Show/hide the shadow panel and populate controls from the element.
     */
    const showPanel = (on, elem) => {
      const panel = $id('shadow_panel')
      if (!panel) return
      panel.style.display = on ? '' : 'none'
      if (on && elem) {
        const p = getShadowFromElement(elem)
        $id('shadow_angle').value = p?.angle ?? 150
        $id('shadow_length').value = p?.length ?? 10
        $id('shadow_blur').value = p?.blur ?? 4
        $id('shadow_opacity').value = p?.opacity ?? 0.5
        $id('shadow_color').value = p?.color ?? '#000000'
      }
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),

      callback () {
        // Inject the shadow panel into the right side panel
        const panelTemplate = document.createElement('template')
        panelTemplate.innerHTML = `
          <div id="shadow_panel" class="sidepanel_section" style="display:none">
            <div class="sidepanel_section_label">${svgEditor.i18next.t(`${name}:name`)}</div>
            <div class="sidepanel_section_grid">
              <se-spin-input id="shadow_angle"  label="∠" min="0" max="359" step="5" value="150"
                title="${svgEditor.i18next.t(`${name}:contextTools.angle.title`)}"></se-spin-input>
              <se-spin-input id="shadow_length" label="L" min="0" max="500" step="1" value="10"
                title="${svgEditor.i18next.t(`${name}:contextTools.length.title`)}"></se-spin-input>
              <se-spin-input id="shadow_blur" label="B" min="0" max="50" step="1" value="4"
                title="${svgEditor.i18next.t(`${name}:contextTools.blur.title`)}"></se-spin-input>
              <se-spin-input id="shadow_opacity" label="%" min="0" max="1" step="0.05" value="0.5"
                title="${svgEditor.i18next.t(`${name}:contextTools.opacity.title`)}"></se-spin-input>
            </div>
            <div class="shadow_panel_footer">
              <input type="color" id="shadow_color" value="#000000"
                title="${svgEditor.i18next.t(`${name}:contextTools.color.title`)}">
              <se-button id="shadow_remove" src="delete.svg"
                title="${svgEditor.i18next.t(`${name}:contextTools.remove.title`)}"></se-button>
            </div>
          </div>
        `
        const host = $id('tab_effects') || $id('sidepanel_content') || $id('tools_top')
        host.appendChild(panelTemplate.content.cloneNode(true))

        // Wire event listeners
        ;['shadow_angle', 'shadow_length', 'shadow_blur', 'shadow_opacity'].forEach((id) => {
          $id(id).addEventListener('change', () => setShadow(getShadowPanelValues()))
        })
        $id('shadow_color').addEventListener('change', () => setShadow(getShadowPanelValues()))
        $id('shadow_remove').addEventListener('click', () => setShadow({ remove: true }))
      },

      selectedChanged (opts) {
        if (!opts.selectedElement || opts.multiselected) {
          showPanel(false)
          return
        }
        const { tagName } = opts.selectedElement
        if (['svg', 'defs'].includes(tagName)) {
          showPanel(false)
          return
        }
        showPanel(true, opts.selectedElement)
      }
    }
  }
}
