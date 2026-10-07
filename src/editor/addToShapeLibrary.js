/**
 * "Add to Shape Library": serialize the selection, ask for a label/category,
 * store it, and tell the shape library component to refresh. Split out of
 * EditorStartup.js, which keeps a thin `_addSelectedToShapeLibrary()` wrapper.
 */

import { addUserShape, getUserCategories, getAllUserShapeLabels, getUserShapesForCategory } from './extensions/ext-shapes/userShapes.js'

/**
 * Handle "Add to Shape Library" context menu action.
 * Serializes the selected SVG element(s), shows a dialog for label + category,
 * saves to localStorage, and notifies the shape library component to refresh.
 * @param {object} editor The owning Editor instance
 * @returns {Promise<void>}
 */
export const addSelectedToShapeLibrary = async (editor) => {
  let elems = editor.svgCanvas.getSelectedElements().filter(Boolean)
  if (!elems.length) return

  // Drop a full-canvas backdrop rect so saved shapes don't bundle the page
  // background (e.g. a colour rect baked into the drawing's content). The
  // backdrop is a filled <rect> that covers the entire selection bounds; when
  // it's stripped the remaining artwork keeps its own (smaller) bbox. Guarded
  // so it never empties the selection and never touches an outline-only frame.
  elems = stripBackdropRects(editor, elems)

  // Determine target element: a single element is serialized as-is, multiple
  // elements are wrapped in a temporary <g>. In every case the serialized
  // content keeps each element's own `transform`, so the bbox must be measured
  // in that same (parent/user) coordinate space — `getStrokedBBox` accounts
  // for the transform, whereas a bare `getBBox()` does not, which would leave
  // the thumbnail off-centre and clipped.
  let targetElem
  if (elems.length === 1) {
    targetElem = elems[0]
  } else {
    const ns = 'http://www.w3.org/2000/svg'
    const tempG = document.createElementNS(ns, 'g')
    elems.forEach(el => tempG.appendChild(el.cloneNode(true)))
    targetElem = tempG
  }
  let bbox
  try {
    bbox = editor.svgCanvas.getStrokedBBox(elems) || elems[0].getBBox()
  } catch {
    bbox = elems[0].getBBox()
  }

  const result = await showAddToLibraryDialog(editor)
  if (!result) return

  const { label, category, linkedFile } = result
  if (!label || !category) return

  // Bundle the referenced paint servers (gradients, filters, markers, …) into
  // the saved markup so the shape stays self-contained — otherwise its
  // url(#…) references dangle when it's inserted into a different drawing.
  const serializer = new XMLSerializer()
  const defEls = editor.svgCanvas.getReferencedDefElements?.(elems) || []
  const defsMarkup = defEls.length
    ? `<defs>${defEls.map(d => serializer.serializeToString(d)).join('')}</defs>`
    : ''
  const svgContent = defsMarkup + serializer.serializeToString(targetElem)

  addUserShape({
    category,
    label,
    svgContent,
    bbox: { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height },
    linkedFile
  })

  // Notify the shape library component to refresh
  const shapeLib = editor.$id('tool_shapelib') // container-scoped (see constructor)
  if (shapeLib) {
    shapeLib.dispatchEvent(new CustomEvent('user-shapes-updated'))
  }
}

/**
 * Remove full-canvas backdrop rect(s) from a selection so shapes saved to the
 * library don't carry the page/canvas background. A backdrop is a *filled*
 * `<rect>` whose stroked bbox covers the whole selection bounds. Only applied
 * when other elements remain (a lone rect, or an outline-only frame, is kept).
 * @param {object} editor The owning Editor instance
 * @param {Element[]} elems - selected, live (in-DOM) elements
 * @returns {Element[]} the elements to serialize (backdrops removed)
 */
const stripBackdropRects = (editor, elems) => {
  if (elems.length < 2) return elems

  let overall
  try {
    overall = editor.svgCanvas.getStrokedBBox(elems)
  } catch {
    return elems
  }
  if (!overall) return elems

  const eps = 1
  const isBackdrop = (el) => {
    if (el.tagName !== 'rect') return false
    const fill = el.getAttribute('fill') ?? el.style?.fill
    if (fill === 'none' || fill === 'transparent') return false
    let b
    try {
      b = editor.svgCanvas.getStrokedBBox([el])
    } catch {
      return false
    }
    if (!b) return false
    return b.x <= overall.x + eps && b.y <= overall.y + eps &&
      b.x + b.width >= overall.x + overall.width - eps &&
      b.y + b.height >= overall.y + overall.height - eps
  }

  const kept = elems.filter(el => !isBackdrop(el))
  // Never empty the selection — if everything looks like a backdrop, keep all.
  return (kept.length && kept.length < elems.length) ? kept : elems
}

/**
 * Show a native <dialog> prompting for a shape label and category.
 * @param {object} editor The owning Editor instance
 * @returns {Promise<{label: string, category: string, linkedFile: ?string}|null>}
 */
const showAddToLibraryDialog = async (editor) => {
  // An embedding host can expose the linkable files up front so the dialog can
  // offer them inline (a native <datalist>) rather than delegating to a host
  // picker. Delegating opened a second modal that rendered *behind* this
  // top-layer <dialog>; an inline datalist popup shares the top layer instead.
  const hasVault = typeof window.svgEditHost?.listVaultFiles === 'function'
  const vaultFiles = hasVault ? (await window.svgEditHost.listVaultFiles()) || [] : []
  return new Promise((resolve) => {
    const userCats = getUserCategories()
    const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1)
    const inputStyle = 'display:block;width:100%;margin-top:4px;padding:7px 10px;' +
      'border:1px solid var(--field-border,#DDE1E7);border-radius:7px;font-size:13px;' +
      'box-sizing:border-box;background:var(--field-bg,#FFF);color:var(--fg,#1B1F24);' +
      'font-family:inherit;outline:none'

    // Merge user-defined categories with built-in ones (user cats first).
    // Built-in categories are available after the shape library has loaded its index.
    const shapeLibEl = editor.$id('tool_shapelib') // container-scoped (see constructor)
    const builtinOptions = shapeLibEl?.getBuiltinCategoryOptions?.() || []
    const userCatSet = new Set(userCats.map(c => c.toLowerCase()))
    // Only include built-in cats that don't already have a user category by the same name
    const filteredBuiltin = builtinOptions.filter(b => !userCatSet.has(b.id.toLowerCase()))

    // Always show a <select>. Pre-select "Other…" when nothing is available.
    const allCats = [
      ...userCats.map(c => ({ value: c, label: capitalize(c) })),
      ...filteredBuiltin.map(b => ({ value: b.id, label: b.label }))
    ].sort((a, b) => a.label.localeCompare(b.label))
    const noExisting = allCats.length === 0
    const catOptions = [
      ...allCats.map(c =>
        `<option value="${c.value.replace(/"/g, '&quot;')}">${c.label}</option>`
      ),
      '<option value="__new__">Other…</option>'
    ].join('')

    // Optional vault-file link — only when an embedding host provides a file
    // list. A native <datalist> can't be forced to open *below* the input
    // (Chromium decides direction by viewport space), so we render our own
    // suggestion list, absolutely positioned under the field. The chosen path
    // maps back to the host's link on save (see linkByPath below).
    const linkByPath = new Map(vaultFiles.map(f => [f.path, f.link]))
    const vaultControl = hasVault
      ? `
      <div style="margin-bottom:20px;font-size:13px;color:var(--fg,#1B1F24)">
        <span style="display:block;margin-bottom:4px">Linked vault file (optional)</span>
        <div style="position:relative">
          <input id="_asl_vault_link" type="text"
                 placeholder="Type to search files…" autocomplete="off"
                 style="${inputStyle};margin-top:0"/>
          <ul id="_asl_vault_menu" style="position:absolute;top:calc(100% + 2px);
              left:0;right:0;z-index:10;max-height:180px;overflow-y:auto;margin:0;
              padding:4px 0;list-style:none;background:var(--chrome-bg,#FFF);
              border:1px solid var(--field-border,#DDE1E7);border-radius:7px;
              box-shadow:0 6px 20px rgba(0,0,0,.15);display:none"></ul>
        </div>
      </div>`
      : ''

    const dlg = document.createElement('dialog')
    dlg.style.cssText = [
      'padding:24px',
      'border-radius:12px',
      'border:1px solid var(--chrome-border,#E6E8EC)',
      'background:var(--chrome-bg,#FFF)',
      'color:var(--fg,#1B1F24)',
      'font-family:var(--ui-font,system-ui,sans-serif)',
      'min-width:320px',
      'box-shadow:0 8px 30px rgba(0,0,0,.15)',
      'outline:none'
    ].join(';')

    dlg.innerHTML = `
      <h3 style="margin:0 0 16px;font-size:15px;font-weight:600;color:var(--fg,#1B1F24)">
        Add to Shape Library
      </h3>
      <label style="display:block;margin-bottom:12px;font-size:13px;color:var(--fg,#1B1F24)">
        Label
        <div style="position:relative">
          <input id="_asl_label" type="text" placeholder="e.g. My Dog" autocomplete="off"
                 style="${inputStyle}"/>
          <ul id="_asl_label_menu" style="position:absolute;top:calc(100% + 2px);
              left:0;right:0;z-index:10;max-height:180px;overflow-y:auto;margin:0;
              padding:4px 0;list-style:none;background:var(--chrome-bg,#FFF);
              border:1px solid var(--field-border,#DDE1E7);border-radius:7px;
              box-shadow:0 6px 20px rgba(0,0,0,.15);display:none"></ul>
        </div>
      </label>
      <label style="display:block;margin-bottom:20px;font-size:13px;color:var(--fg,#1B1F24)">
        Category
        <select id="_asl_cat_select" style="${inputStyle}">${catOptions}</select>
        <input id="_asl_cat_new" type="text" placeholder="New category name"
               autocomplete="off"
               style="${inputStyle};margin-top:6px;display:${noExisting ? 'block' : 'none'}"/>
      </label>
      ${vaultControl}
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button id="_asl_cancel"
                style="padding:7px 18px;border-radius:7px;border:1px solid var(--chrome-border,#DDE1E7);
                       background:transparent;color:var(--fg,#1B1F24);font-size:13px;
                       cursor:pointer;font-family:inherit">
          Cancel
        </button>
        <button id="_asl_ok"
                style="padding:7px 18px;border-radius:7px;border:none;
                       background:var(--accent,#2962FF);color:#FFF;font-size:13px;
                       font-weight:600;cursor:pointer;font-family:inherit">
          Save
        </button>
      </div>
    `

    document.body.appendChild(dlg)
    dlg.showModal()
    dlg.querySelector('#_asl_label').focus()

    const select = dlg.querySelector('#_asl_cat_select')
    const newInput = dlg.querySelector('#_asl_cat_new')

    // If no existing categories, pre-select "Other…" so the text input is visible immediately
    if (noExisting) select.value = '__new__'

    // Show/hide the text input when "Other…" is selected or deselected
    select.addEventListener('change', () => {
      const isOther = select.value === '__new__'
      newInput.style.display = isOther ? 'block' : 'none'
      if (isOther) newInput.focus()
    })

    // Existing-name suggestions: as the user types a label, list already-saved
    // shape names that contain the typed text so they can reuse a consistent
    // naming scheme (or notice a near-duplicate before saving).
    {
      const labelInput = dlg.querySelector('#_asl_label')
      const labelMenu = dlg.querySelector('#_asl_label_menu')
      const allLabels = getAllUserShapeLabels()
      const escText = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      const optStyle = 'padding:6px 10px;cursor:pointer;white-space:nowrap;' +
        'overflow:hidden;text-overflow:ellipsis;font-size:13px'
      let shownLabels = []
      let labelActiveIdx = -1

      const closeLabelMenu = () => { labelMenu.style.display = 'none'; labelActiveIdx = -1 }
      const highlightLabel = () => {
        [...labelMenu.children].forEach((li, i) => {
          li.style.background = i === labelActiveIdx ? 'var(--accent,#2962FF)' : 'transparent'
          li.style.color = i === labelActiveIdx ? '#FFF' : 'var(--fg,#1B1F24)'
        })
      }
      const renderLabelMenu = () => {
        const q = labelInput.value.trim().toLowerCase()
        shownLabels = q ? allLabels.filter(l => l.toLowerCase().includes(q)) : []
        if (!shownLabels.length) { closeLabelMenu(); return }
        labelMenu.innerHTML = shownLabels
          .map((l, i) => `<li data-idx="${i}" style="${optStyle}">${escText(l)}</li>`)
          .join('')
        labelActiveIdx = -1
        labelMenu.style.display = 'block'
      }
      const chooseLabel = (i) => {
        if (i < 0 || i >= shownLabels.length) return
        labelInput.value = shownLabels[i]
        closeLabelMenu()
      }

      labelInput.addEventListener('input', renderLabelMenu)
      labelInput.addEventListener('focus', renderLabelMenu)
      labelInput.addEventListener('keydown', (e) => {
        if (labelMenu.style.display === 'none') return
        if (e.key === 'ArrowDown') {
          e.preventDefault(); labelActiveIdx = Math.min(labelActiveIdx + 1, shownLabels.length - 1); highlightLabel()
        } else if (e.key === 'ArrowUp') {
          e.preventDefault(); labelActiveIdx = Math.max(labelActiveIdx - 1, 0); highlightLabel()
        } else if (e.key === 'Enter' && labelActiveIdx >= 0) {
          e.preventDefault(); chooseLabel(labelActiveIdx)
        } else if (e.key === 'Escape') {
          e.preventDefault(); e.stopPropagation(); closeLabelMenu()
        }
      })
      labelMenu.addEventListener('mousedown', (e) => {
        const li = e.target.closest('li')
        if (li) { e.preventDefault(); chooseLabel(Number(li.dataset.idx)) }
      })
      labelMenu.addEventListener('mousemove', (e) => {
        const li = e.target.closest('li')
        if (li) { labelActiveIdx = Number(li.dataset.idx); highlightLabel() }
      })
      labelInput.addEventListener('blur', () => setTimeout(closeLabelMenu, 120))
    }

    const getCategory = () =>
      select.value === '__new__' ? newInput.value.trim() : select.value

    // Resolve the chosen file path (from the datalist) back to the host link.
    // Only a path the host actually offered counts; free text is ignored.
    const getLinkedFile = () => {
      if (!hasVault) return null
      const path = dlg.querySelector('#_asl_vault_link').value.trim()
      return path ? (linkByPath.get(path) || null) : null
    }

    // Custom suggestion dropdown that always opens below the input, with the
    // host-provided order preserved (active drawing first). Selecting an entry
    // stamps its path into the input; getLinkedFile() maps it back to a link.
    if (hasVault) {
      const linkInput = dlg.querySelector('#_asl_vault_link')
      const menu = dlg.querySelector('#_asl_vault_menu')
      const escText = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
      const optStyle = 'padding:6px 10px;cursor:pointer;white-space:nowrap;' +
        'overflow:hidden;text-overflow:ellipsis;font-size:13px'
      let shown = []
      let activeIdx = -1

      const closeMenu = () => { menu.style.display = 'none'; activeIdx = -1 }
      const highlight = () => {
        [...menu.children].forEach((li, i) => {
          li.style.background = i === activeIdx ? 'var(--accent,#2962FF)' : 'transparent'
          li.style.color = i === activeIdx ? '#FFF' : 'var(--fg,#1B1F24)'
        })
      }
      const renderMenu = () => {
        const q = linkInput.value.trim().toLowerCase()
        shown = q ? vaultFiles.filter(f => f.path.toLowerCase().includes(q)) : vaultFiles.slice()
        if (!shown.length) { closeMenu(); return }
        menu.innerHTML = shown
          .map((f, i) => `<li data-idx="${i}" style="${optStyle}">${escText(f.path)}</li>`)
          .join('')
        activeIdx = -1
        menu.style.display = 'block'
      }
      const choose = (i) => {
        if (i < 0 || i >= shown.length) return
        linkInput.value = shown[i].path
        closeMenu()
      }

      linkInput.addEventListener('focus', renderMenu)
      linkInput.addEventListener('input', renderMenu)
      linkInput.addEventListener('keydown', (e) => {
        if (menu.style.display === 'none') return
        if (e.key === 'ArrowDown') {
          e.preventDefault(); activeIdx = Math.min(activeIdx + 1, shown.length - 1); highlight()
        } else if (e.key === 'ArrowUp') {
          e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); highlight()
        } else if (e.key === 'Enter' && activeIdx >= 0) {
          e.preventDefault(); choose(activeIdx)
        } else if (e.key === 'Escape') {
          // Close the dropdown without dismissing the whole dialog.
          e.preventDefault(); e.stopPropagation(); closeMenu()
        }
      })
      // mousedown (not click) fires before the input's blur hides the menu.
      menu.addEventListener('mousedown', (e) => {
        const li = e.target.closest('li')
        if (li) { e.preventDefault(); choose(Number(li.dataset.idx)) }
      })
      menu.addEventListener('mousemove', (e) => {
        const li = e.target.closest('li')
        if (li) { activeIdx = Number(li.dataset.idx); highlight() }
      })
      linkInput.addEventListener('blur', () => setTimeout(closeMenu, 120))
    }

    const cleanup = (value) => {
      dlg.close()
      document.body.removeChild(dlg)
      resolve(value)
    }

    dlg.querySelector('#_asl_cancel').addEventListener('click', () => cleanup(null))

    dlg.querySelector('#_asl_ok').addEventListener('click', () => {
      const label = dlg.querySelector('#_asl_label').value.trim()
      const category = getCategory()
      if (!label || !category) return
      const existing = getUserShapesForCategory(category.trim().toLowerCase())
      if (label in existing && !window.confirm(`A shape named "${label}" already exists in "${category}". Overwrite it?`)) {
        return
      }
      cleanup({ label, category, linkedFile: getLinkedFile() })
    })

    // Escape key
    dlg.addEventListener('cancel', () => {
      document.body.removeChild(dlg)
      resolve(null)
    })
  })
}
