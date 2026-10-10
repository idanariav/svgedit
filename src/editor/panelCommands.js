// @ts-check
/**
 * panelCommands.js — the commands behind the panel / menu buttons, as real
 * registry commands (see commands.js, coreCommands.js). Each one used to be a
 * `$click` binding in a panel that the registry only wrapped as an *adapter*
 * (`run` = click the button). Now the button is a view (`command="<id>"` in the
 * markup) and `run` calls the same panel method directly, so a hotkey, the
 * favorites menu, the tablet shell, `editor.automation` or a host can run it
 * without the button being rendered.
 *
 * Ids are persisted user data (hotkey overrides, favorites): they are the
 * buttons' existing ids and must never be renamed. `enabled` mirrors what the
 * panels already did to the button's `disabled` state; a command without one is
 * always runnable, as its button always was.
 * @module panelCommands
 */

/** @typedef {import('./commands.js').CommandRegistry} CommandRegistry */

/** @param {any} editor @returns {true|string} node editing needs the path editor open */
const inPathEdit = (editor) => editor.svgCanvas.getMode() === 'pathedit' ? true : 'Edit a path’s nodes first'

/** Elements Convert to Path leaves alone: nothing to convert (already a path) or no outline to take (image, text, group, use). */
const NOT_CONVERTIBLE = ['image', 'text', 'path', 'g', 'use']

/**
 * The one selected element, if exactly one is selected.
 * @param {any} editor
 * @returns {?Element}
 */
const soleSelected = (editor) => {
  const list = editor.svgCanvas.getSelectedElements().filter(Boolean)
  return list.length === 1 ? list[0] : null
}

/** @param {any} editor @returns {true|string} Convert to Path needs a shape that is not yet a path */
const convertible = (editor) => {
  const el = soleSelected(editor)
  return el && !NOT_CONVERTIBLE.includes(el.tagName.toLowerCase()) ? true : 'Select one shape (not a path, text, image or group)'
}

/** @param {any} editor @returns {true|string} Stroke to Path needs a visible stroke on a shape that is not a path */
const strokeToPathable = (editor) => {
  const el = soleSelected(editor)
  return el && el.tagName.toLowerCase() !== 'path' && editor.svgCanvas.hasVisibleStroke(el) ? true : 'Select one shape with a visible stroke'
}

/** @param {any} editor @returns {true|string} */
const textSelected = (editor) => editor.topPanel.anyTextSelected ? true : 'Select some text'

/**
 * Both fill and stroke are `none`: nothing a path or text tool draws would be visible.
 * @param {any} editor
 * @returns {boolean}
 */
const bareFillAndStroke = (editor) =>
  editor.svgCanvas.getColor('fill') === 'none' && editor.svgCanvas.getColor('stroke') === 'none'

/** i18n keys of the buttons' titles (the live `title` of the button wins once it is rendered). */
const LABELS = {
  clipmask_release: 'tools.clip_release',
  layer_delete: 'layers.del',
  layer_down: 'layers.move_down',
  layer_new: 'layers.new',
  layer_rename: 'layers.rename',
  layer_up: 'layers.move_up',
  tool_add_subpath: 'tools.add_subpath',
  tool_bold: 'properties.bold',
  tool_clip_set: 'tools.clip_set',
  tool_ellipse: 'tools.mode_ellipse',
  tool_fhpath: 'tools.mode_fhpath',
  tool_flip_h: 'tools.flip_horizontal',
  tool_flip_v: 'tools.flip_vertical',
  tool_frame: 'tools.tool_frame',
  tool_image_crop: 'tools.image_crop',
  tool_image_crop_apply: 'tools.image_crop_apply',
  tool_image_crop_cancel: 'tools.image_crop_cancel',
  tool_italic: 'properties.italic',
  tool_line: 'tools.mode_line',
  tool_make_link: 'tools.make_link',
  tool_make_link_multi: 'tools.make_link',
  tool_mask_set: 'tools.mask_set',
  tool_match_strokes: 'tools.match_strokes',
  tool_node_clone: 'tools.node_clone',
  tool_node_delete: 'tools.node_delete',
  tool_node_link: 'tools.node_link',
  tool_node_smooth: 'tools.node_smooth',
  tool_openclose_path: 'tools.openclose_path',
  tool_path: 'tools.mode_path',
  tool_rect: 'tools.mode_rect',
  tool_select: 'tools.mode_select',
  tool_stroke_to_path: 'tools.stroke_to_path',
  tool_text: 'tools.mode_text',
  tool_text_decoration_linethrough: 'properties.text_decoration_linethrough',
  tool_text_decoration_overline: 'properties.text_decoration_overline',
  tool_text_decoration_underline: 'properties.text_decoration_underline',
  tool_topath: 'tools.to_path',
  tool_unlink_use: 'tools.tool_unlink_use',
  tool_wireframe: 'tools.wireframe_mode'
}

/** Mode buttons: pressing one highlights it in the left panel and switches the canvas mode. */
const MODE_BUTTONS = [
  ['tool_select', 'clickSelect'],
  ['tool_fhpath', 'clickFHPath'],
  ['tool_text', 'clickText'],
  ['tool_path', 'clickPath'],
  ['tool_line', 'clickLine'],
  ['tool_rect', 'clickRect'],
  ['tool_ellipse', 'clickEllipse']
]

/** [id, group, TopPanel method, extra spec] */
const TOP_PANEL = [
  ['tool_frame', 'View', 'clickFrame'],
  ['tool_wireframe', 'View', 'clickWireframe'],
  ['tool_topath', 'Path', 'convertToPath', { enabled: convertible }],
  ['tool_stroke_to_path', 'Path', 'strokeToPath', { enabled: strokeToPathable }],
  ['tool_match_strokes', 'Tools', 'clickMatchStrokes'],
  ['tool_make_link', 'Group', 'makeHyperlink'],
  ['tool_make_link_multi', 'Group', 'makeHyperlink'],
  ['tool_flip_h', 'Transform', 'clickFlipHorizontal'],
  ['tool_flip_v', 'Transform', 'clickFlipVertical'],
  ['tool_clip_set', 'Mask', 'clickClipSet'],
  ['tool_mask_set', 'Mask', 'clickMaskSet'],
  ['clipmask_release', 'Mask', 'clickClipRelease'],
  ['tool_node_smooth', 'Path', 'smoothPathNode', { enabled: inPathEdit }],
  ['tool_node_clone', 'Path', 'clonePathNode', { enabled: inPathEdit }],
  ['tool_node_delete', 'Path', 'deletePathNode', {
    enabled: (/** @type {any} */ editor) => {
      const open = inPathEdit(editor)
      if (open !== true) return open
      return editor.topPanel.path?.canDeleteNodes ? true : 'A path needs at least two nodes'
    }
  }],
  ['tool_openclose_path', 'Path', 'opencloseSubPath', { enabled: inPathEdit }],
  ['tool_add_subpath', 'Path', 'addSubPath', { enabled: inPathEdit }],
  ['tool_node_link', 'Path', 'linkControlPoints', { enabled: inPathEdit }],
  ['tool_bold', 'Text', 'clickBold', { enabled: textSelected }],
  ['tool_italic', 'Text', 'clickItalic', { enabled: textSelected }],
  ['tool_unlink_use', 'Group', 'clickGroup'],
  ['tool_image_crop', 'Tools', 'clickImageCrop', { interactive: true }],
  ['tool_image_crop_apply', 'Tools', 'applyImageCrop']
]

/** Text-decoration toggles: [id, CSS value]. */
const TEXT_DECORATIONS = [
  ['tool_text_decoration_underline', 'underline'],
  ['tool_text_decoration_linethrough', 'line-through'],
  ['tool_text_decoration_overline', 'overline']
]

/**
 * Register the command of a drawing-tool button: press the button in the left
 * panel, switch the canvas mode, then run `onEnter`. The button itself carries
 * `command="<id>"`, so a click, its hotkey, the favorites menu and `commands.run(id)`
 * share this one path (the same behaviour as `LeftPanel.clickRect()` & co.).
 * @param {any} editor
 * @param {string} id the button's id (a persisted command id: never rename)
 * @param {string} mode the canvas mode the tool uses
 * @param {{label?: string, group?: string, onEnter?: () => void, enabled?: (editor: any) => true|string}} [opts]
 * @returns {void}
 */
export const registerModeCommand = (editor, id, mode, { label = id, group = 'Tools', onEnter, enabled } = {}) => {
  editor.commands.register({
    id,
    label,
    group,
    pd: true,
    enabled,
    run: () => {
      if (editor.leftPanel.updateLeftPanel(id)) {
        editor.svgCanvas.setMode(mode)
        onEnter?.()
      }
    }
  })
}

/**
 * @param {CommandRegistry} commands
 * @returns {void}
 */
export const registerPanelCommands = (commands) => {
  // Left panel tools. The stroke / fill gating is what BottomPanel.updateToolButtonState
  // does to the buttons.
  /** @type {Object<string, (editor: any) => true|string>} */
  const modeGate = {
    tool_fhpath: (editor) => editor.svgCanvas.getColor('stroke') === 'none' ? 'Needs a stroke' : true,
    tool_line: (editor) => editor.svgCanvas.getColor('stroke') === 'none' ? 'Needs a stroke' : true,
    tool_text: (editor) => bareFillAndStroke(editor) ? 'Needs a fill or a stroke' : true,
    tool_path: (editor) => bareFillAndStroke(editor) ? 'Needs a fill or a stroke' : true
  }
  for (const [id, method] of MODE_BUTTONS) {
    commands.register({
      id,
      label: LABELS[id] ?? id,
      group: 'Tools',
      pd: true,
      enabled: modeGate[id],
      run: (/** @type {any} */ editor) => editor.leftPanel[method]()
    })
  }
  commands.register({
    id: 'tool_image',
    label: 'tools.mode_image',
    group: 'Tools',
    pd: true,
    interactive: true,
    run: (editor) => editor.leftPanel.clickImage()
  })

  for (const [id, group, method, extra] of /** @type {any[]} */ (TOP_PANEL)) {
    commands.register({
      id,
      label: LABELS[id] ?? id,
      group,
      pd: true,
      run: (/** @type {any} */ editor) => editor.topPanel[method](),
      ...extra
    })
  }
  commands.register({
    id: 'tool_image_crop_cancel',
    label: LABELS.tool_image_crop_cancel,
    group: 'Tools',
    pd: true,
    run: (editor) => editor.svgCanvas.cancelImageCrop()
  })
  for (const [id, value] of TEXT_DECORATIONS) {
    commands.register({
      id,
      label: LABELS[id] ?? id,
      group: 'Text',
      pd: true,
      enabled: textSelected,
      run: (editor) => editor.topPanel.clickTextDecoration(value)
    })
  }

  // The "multi-selection" toolbar twins of clone / delete have ids of their own (persisted), but they are
  // aliases: the keys belong to tool_clone / tool_delete alone.
  for (const [id, target] of [['tool_clone_multi', 'tool_clone'], ['tool_delete_multi', 'tool_delete']]) {
    commands.register({
      id,
      label: target === 'tool_clone' ? 'tools.clone' : 'tools.del',
      group: 'Edit',
      pd: true,
      alias: true,
      enabled: (/** @type {any} */ editor) => commands.isEnabled(target),
      run: (editor) => commands.run(target)
    })
  }

  // Layers panel.
  for (const [id, run] of /** @type {Array<[string, (editor: any) => any]>} */ ([
    ['layer_new', (editor) => editor.rightPanel.newLayer()],
    ['layer_delete', (editor) => editor.rightPanel.deleteLayer()],
    ['layer_up', (editor) => editor.rightPanel.moveLayer(-1)],
    ['layer_down', (editor) => editor.rightPanel.moveLayer(1)],
    ['layer_rename', (editor) => editor.rightPanel.layerRename()]
  ])) {
    commands.register({ id, label: LABELS[id] ?? id, group: 'Layers', pd: true, run })
  }

  // Main menu.
  commands.register({
    id: 'tool_export',
    label: 'tools.export_img',
    group: 'Tools',
    pd: true,
    interactive: true,
    run: (editor) => {
      // A host that owns exporting (window.svgEditHost.exportDrawing) takes over;
      // standalone svgedit keeps its own dialog.
      const host = /** @type {any} */ (window).svgEditHost
      if (typeof host?.exportDrawing === 'function') {
        host.exportDrawing()
        return
      }
      editor.$id('se-export-dialog').setAttribute('dialog', 'open')
    }
  })
  commands.register({
    id: 'tool_tablet_mode',
    label: 'tools.tablet_mode',
    group: 'Tools',
    pd: true,
    run: (editor) => editor.mainMenu.clickTabletMode()
  })
  commands.register({
    id: 'tool_command_search',
    label: 'tools.command_search',
    group: 'Tools',
    pd: true,
    interactive: true,
    run: (editor) => editor.$id('se-command-search-dialog').open()
  })
  commands.register({
    id: 'tool_hotkeys',
    label: 'tools.hotkey_manager',
    group: 'Tools',
    pd: true,
    interactive: true,
    run: (editor) => editor.$id('se-hotkey-dialog').setAttribute('dialog', 'open')
  })
  commands.register({
    id: 'tool_favorites',
    label: 'tools.favorites_manager',
    group: 'Tools',
    pd: true,
    interactive: true,
    run: (editor) => editor.$id('se-favorites-dialog').setAttribute('dialog', 'open')
  })
  commands.register({
    id: 'tool_editor_prefs',
    label: 'config.editor_prefs',
    group: 'Tools',
    pd: true,
    interactive: true,
    run: (editor) => editor.mainMenu.showPreferences()
  })

  // "Convert to editable SVG" (image trace) on the selected <image>.
  commands.register({
    id: 'tool_trace_image',
    label: 'tools.trace_image',
    group: 'Tools',
    pd: true,
    interactive: true,
    run: (editor) => editor.rightPanel.openTraceDialog()
  })
}
