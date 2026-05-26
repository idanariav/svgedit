/**
 * @file ext-shadow.js
 *
 * @license Apache-2.0
 *
 * Adds a drop shadow to any selected shape via a composed SVG filter.
 * Controls: offset X, offset Y, blur radius, opacity, color.
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
      return {
        offsetX: Number(ds.getAttribute('dx') ?? 5),
        offsetY: Number(ds.getAttribute('dy') ?? 5),
        blur: Number(ds.getAttribute('stdDeviation') ?? 4),
        opacity: Number(ds.getAttribute('flood-opacity') ?? 0.5),
        color: ds.getAttribute('flood-color') ?? '#000000'
      }
    }

    /**
     * Read current panel values.
     */
    const getShadowPanelValues = () => ({
      offsetX: Number($id('shadow_offsetX').value),
      offsetY: Number($id('shadow_offsetY').value),
      blur: Number($id('shadow_blur').value),
      opacity: Number($id('shadow_opacity').value),
      color: $id('shadow_color').value
    })

    /**
     * Apply, update, or remove the drop shadow on the selected element.
     * All changes are recorded in the undo history.
     * @param {object} params - { offsetX, offsetY, blur, opacity, color } or { remove: true }
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
      const { offsetX, offsetY, blur, opacity, color } = params
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
            dx: String(offsetX),
            dy: String(offsetY),
            stdDeviation: String(blur),
            'flood-color': color,
            'flood-opacity': String(opacity)
          }
        })

        // Create <filter> and assemble
        filter = svgCanvas.addSVGElementsFromJson({
          element: 'filter',
          attr: {
            id: `${elemId}_shadow`,
            x: '-50%',
            y: '-50%',
            width: '200%',
            height: '200%'
          }
        })
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
          ds.setAttribute('dx', String(offsetX))
          ds.setAttribute('dy', String(offsetY))
          ds.setAttribute('stdDeviation', String(blur))
          ds.setAttribute('flood-color', color)
          ds.setAttribute('flood-opacity', String(opacity))
        }
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
        $id('shadow_offsetX').value = p?.offsetX ?? 5
        $id('shadow_offsetY').value = p?.offsetY ?? 5
        $id('shadow_blur').value = p?.blur ?? 4
        $id('shadow_opacity').value = p?.opacity ?? 0.5
        $id('shadow_color').value = p?.color ?? '#000000'
      }
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),

      callback () {
        // Inject the shadow panel into #tools_top
        const panelTemplate = document.createElement('template')
        panelTemplate.innerHTML = `
          <div id="shadow_panel" style="display:none">
            <div class="tool_sep"></div>
            <se-spin-input id="shadow_offsetX" label="X" min="-100" max="100" step="1" value="5"
              title="${svgEditor.i18next.t(`${name}:contextTools.offsetX.title`)}"></se-spin-input>
            <se-spin-input id="shadow_offsetY" label="Y" min="-100" max="100" step="1" value="5"
              title="${svgEditor.i18next.t(`${name}:contextTools.offsetY.title`)}"></se-spin-input>
            <se-spin-input id="shadow_blur" label="B" min="0" max="50" step="1" value="4"
              title="${svgEditor.i18next.t(`${name}:contextTools.blur.title`)}"></se-spin-input>
            <se-spin-input id="shadow_opacity" label="%" min="0" max="1" step="0.05" value="0.5"
              title="${svgEditor.i18next.t(`${name}:contextTools.opacity.title`)}"></se-spin-input>
            <input type="color" id="shadow_color" value="#000000"
              title="${svgEditor.i18next.t(`${name}:contextTools.color.title`)}"
              style="width:28px;height:28px;padding:1px;border:1px solid var(--chrome-border);border-radius:4px;background:var(--field-bg);cursor:pointer;vertical-align:middle;">
            <se-button id="shadow_remove" src="delete.svg"
              title="${svgEditor.i18next.t(`${name}:contextTools.remove.title`)}"></se-button>
          </div>
        `
        $id('tools_top').appendChild(panelTemplate.content.cloneNode(true))

        // Wire event listeners
        ;['shadow_offsetX', 'shadow_offsetY', 'shadow_blur', 'shadow_opacity'].forEach((id) => {
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
