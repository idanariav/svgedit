/**
 * Editor-level shortcuts (not associated with a toolbar button). Each entry
 * carries `id`/`group`/`label` so the Hotkey Manager (see Hotkeys.js) can
 * list and rebind it. `key` may use the `mod` token (platform command key)
 * and `/` to separate equivalent default keys; the trailing `true` keeps the
 * original preventDefault behaviour.
 * Split out of Editor.js; `buildEditorShortcuts(editor)` returns the table and
 * every handler acts on the given editor instance.
 */

export const buildEditorShortcuts = (editor) => [
  {
    id: 'rotate_ccw_fine',
    group: 'Rotate',
    label: 'hotkeys.rotate_ccw_fine',
    key: ['ctrl+arrowleft', true],
    fn: () => {
      editor.rotateSelected(0, 1)
    }
  },
  {
    id: 'rotate_cw_fine',
    group: 'Rotate',
    label: 'hotkeys.rotate_cw_fine',
    key: 'ctrl+arrowright',
    fn: () => {
      editor.rotateSelected(1, 1)
    }
  },
  {
    id: 'rotate_ccw',
    group: 'Rotate',
    label: 'hotkeys.rotate_ccw',
    key: ['ctrl+shift+arrowleft', true],
    fn: () => {
      editor.rotateSelected(0, 5)
    }
  },
  {
    id: 'rotate_cw',
    group: 'Rotate',
    label: 'hotkeys.rotate_cw',
    key: 'ctrl+shift+arrowright',
    fn: () => {
      editor.rotateSelected(1, 5)
    }
  },
  {
    id: 'cycle_prev',
    group: 'Navigate',
    label: 'hotkeys.cycle_prev',
    key: 'shift+o/shift+tab',
    fn: () => {
      editor.svgCanvas.cycleElement(0)
    }
  },
  {
    id: 'cycle_next',
    group: 'Navigate',
    label: 'hotkeys.cycle_next',
    key: 'shift+p/tab',
    fn: () => {
      editor.svgCanvas.cycleElement(1)
    }
  },
  {
    id: 'zoom_in',
    group: 'Zoom',
    label: 'hotkeys.zoom_in',
    key: ['mod+arrowup', true],
    fn: () => {
      editor.zoomImage(2)
    }
  },
  {
    id: 'zoom_out',
    group: 'Zoom',
    label: 'hotkeys.zoom_out',
    key: ['mod+arrowdown', true],
    fn: () => {
      editor.zoomImage(0.5)
    }
  },
  {
    id: 'raise',
    group: 'Arrange',
    label: 'hotkeys.raise',
    key: ['mod+]', true],
    fn: () => {
      editor.moveUpDownSelected('Up')
    }
  },
  {
    id: 'lower',
    group: 'Arrange',
    label: 'hotkeys.lower',
    key: ['mod+[', true],
    fn: () => {
      editor.moveUpDownSelected('Down')
    }
  },
  {
    id: 'move_up',
    group: 'Move',
    label: 'hotkeys.move_up',
    key: ['arrowup', true],
    fn: () => {
      editor.moveSelected(0, -1)
    }
  },
  {
    id: 'move_down',
    group: 'Move',
    label: 'hotkeys.move_down',
    key: ['arrowdown', true],
    fn: () => {
      editor.moveSelected(0, 1)
    }
  },
  {
    id: 'move_left',
    group: 'Move',
    label: 'hotkeys.move_left',
    key: ['arrowleft', true],
    fn: () => {
      editor.moveSelected(-1, 0)
    }
  },
  {
    id: 'move_right',
    group: 'Move',
    label: 'hotkeys.move_right',
    key: ['arrowright', true],
    fn: () => {
      editor.moveSelected(1, 0)
    }
  },
  {
    id: 'move_up_big',
    group: 'Move',
    label: 'hotkeys.move_up_big',
    key: 'shift+arrowup',
    fn: () => {
      editor.moveSelected(0, -10)
    }
  },
  {
    id: 'move_down_big',
    group: 'Move',
    label: 'hotkeys.move_down_big',
    key: 'shift+arrowdown',
    fn: () => {
      editor.moveSelected(0, 10)
    }
  },
  {
    id: 'move_left_big',
    group: 'Move',
    label: 'hotkeys.move_left_big',
    key: 'shift+arrowleft',
    fn: () => {
      editor.moveSelected(-10, 0)
    }
  },
  {
    id: 'move_right_big',
    group: 'Move',
    label: 'hotkeys.move_right_big',
    key: 'shift+arrowright',
    fn: () => {
      editor.moveSelected(10, 0)
    }
  },
  {
    id: 'clone_up',
    group: 'Clone',
    label: 'hotkeys.clone_up',
    key: ['alt+arrowup', true],
    fn: () => {
      editor.svgCanvas.cloneSelectedElements(0, -1)
    }
  },
  {
    id: 'clone_down',
    group: 'Clone',
    label: 'hotkeys.clone_down',
    key: ['alt+arrowdown', true],
    fn: () => {
      editor.svgCanvas.cloneSelectedElements(0, 1)
    }
  },
  {
    id: 'clone_left',
    group: 'Clone',
    label: 'hotkeys.clone_left',
    key: ['alt+arrowleft', true],
    fn: () => {
      editor.svgCanvas.cloneSelectedElements(-1, 0)
    }
  },
  {
    id: 'clone_right',
    group: 'Clone',
    label: 'hotkeys.clone_right',
    key: ['alt+arrowright', true],
    fn: () => {
      editor.svgCanvas.cloneSelectedElements(1, 0)
    }
  },
  {
    id: 'clone_up_big',
    group: 'Clone',
    label: 'hotkeys.clone_up_big',
    key: ['alt+shift+arrowup', true],
    fn: () => {
      editor.svgCanvas.cloneSelectedElements(0, -10)
    }
  },
  {
    id: 'clone_down_big',
    group: 'Clone',
    label: 'hotkeys.clone_down_big',
    key: ['alt+shift+arrowdown', true],
    fn: () => {
      editor.svgCanvas.cloneSelectedElements(0, 10)
    }
  },
  {
    id: 'clone_left_big',
    group: 'Clone',
    label: 'hotkeys.clone_left_big',
    key: ['alt+shift+arrowleft', true],
    fn: () => {
      editor.svgCanvas.cloneSelectedElements(-10, 0)
    }
  },
  {
    id: 'clone_right_big',
    group: 'Clone',
    label: 'hotkeys.clone_right_big',
    key: ['alt+shift+arrowright', true],
    fn: () => {
      editor.svgCanvas.cloneSelectedElements(10, 0)
    }
  },
  {
    id: 'flip_horizontal',
    group: 'Edit',
    label: 'hotkeys.flip_horizontal',
    key: 'shift+h',
    fn: () => {
      editor.svgCanvas.flipSelectedElements(-1, 1)
    }
  },
  {
    id: 'flip_vertical',
    group: 'Edit',
    label: 'hotkeys.flip_vertical',
    key: 'shift+v',
    fn: () => {
      editor.svgCanvas.flipSelectedElements(1, -1)
    }
  },
  {
    id: 'delete_selected',
    group: 'Edit',
    label: 'hotkeys.delete_selected',
    key: ['delete/backspace', true],
    fn: () => {
      if (editor.svgCanvas.getMode() === 'pathedit') {
        if (editor.svgCanvas.pathActions.canDeleteNodes) {
          editor.svgCanvas.pathActions.deletePathNode()
        }
      } else if (editor.selectedElement || editor.multiselected) {
        editor.svgCanvas.deleteSelectedElements()
      }
    }
  },
  {
    id: 'select_all',
    group: 'Selection',
    label: 'hotkeys.select_all',
    key: ['mod+a', true],
    fn: () => {
      editor.svgCanvas.selectAllInCurrentLayer()
    }
  },
  {
    id: 'cut',
    group: 'Edit',
    label: 'hotkeys.cut',
    key: 'mod+x',
    fn: () => {
      editor.cutSelected()
    }
  },
  {
    id: 'copy',
    group: 'Edit',
    label: 'hotkeys.copy',
    key: 'mod+c',
    fn: () => {
      editor.copySelected()
    }
  },
  {
    id: 'transform_again',
    group: 'Clone',
    label: 'hotkeys.transform_again',
    key: ['mod+d', true],
    fn: () => {
      editor.svgCanvas.transformAgain()
    }
  },
  {
    id: 'escape',
    group: 'Selection',
    label: 'hotkeys.escape',
    key: 'escape',
    fn: () => {
      if (editor.enableToolCancel) {
        editor.cancelTool()
      }
    }
  },
  // Bindable commands that live in dropdowns / the canvas context menu and
  // so have no toolbar button to click. They ship unbound (no `key`); the
  // user can assign one from the Hotkey Manager.
  {
    id: 'move_to_front',
    group: 'Arrange',
    label: 'tools.move_top',
    fn: () => {
      editor.svgCanvas.moveToTopSelectedElement()
    }
  },
  {
    id: 'move_to_back',
    group: 'Arrange',
    label: 'tools.move_bottom',
    fn: () => {
      editor.svgCanvas.moveToBottomSelectedElement()
    }
  },
  {
    id: 'switch_zorder',
    group: 'Arrange',
    label: 'tools.switch_layers',
    fn: () => {
      editor.svgCanvas.switchSelectedZorder()
    }
  },
  {
    id: 'align_left',
    group: 'Align',
    label: 'tools.align_left',
    fn: () => {
      editor.topPanel.clickAlign('l')
    }
  },
  {
    id: 'align_center',
    group: 'Align',
    label: 'tools.align_center',
    fn: () => {
      editor.topPanel.clickAlign('c')
    }
  },
  {
    id: 'align_right',
    group: 'Align',
    label: 'tools.align_right',
    fn: () => {
      editor.topPanel.clickAlign('r')
    }
  },
  {
    id: 'align_top',
    group: 'Align',
    label: 'tools.align_top',
    fn: () => {
      editor.topPanel.clickAlign('t')
    }
  },
  {
    id: 'align_middle',
    group: 'Align',
    label: 'tools.align_middle',
    fn: () => {
      editor.topPanel.clickAlign('m')
    }
  },
  {
    id: 'align_bottom',
    group: 'Align',
    label: 'tools.align_bottom',
    fn: () => {
      editor.topPanel.clickAlign('b')
    }
  },
  {
    id: 'path_average_h',
    group: 'Path',
    label: 'tools.node_average_h',
    fn: () => {
      if (editor.svgCanvas.getMode() === 'pathedit') editor.svgCanvas.pathActions.averageSelectedNodes('h')
    }
  },
  {
    id: 'path_average_v',
    group: 'Path',
    label: 'tools.node_average_v',
    fn: () => {
      if (editor.svgCanvas.getMode() === 'pathedit') editor.svgCanvas.pathActions.averageSelectedNodes('v')
    }
  },
  {
    id: 'path_average_both',
    group: 'Path',
    label: 'tools.node_average_both',
    fn: () => {
      if (editor.svgCanvas.getMode() === 'pathedit') editor.svgCanvas.pathActions.averageSelectedNodes('both')
    }
  },
  {
    id: 'path_add_anchors',
    group: 'Path',
    label: 'tools.node_add_anchors',
    fn: () => {
      if (editor.svgCanvas.getMode() === 'pathedit') editor.svgCanvas.pathActions.addAnchorPoints()
    }
  },
  {
    id: 'path_join',
    group: 'Path',
    label: 'tools.join_paths',
    fn: () => {
      editor.svgCanvas.joinSelectedPaths()
    }
  },
  {
    id: 'bool_union',
    group: 'Boolean',
    label: 'tools.bool_union_label',
    fn: () => {
      editor.topPanel.clickBoolUnion()
    }
  },
  {
    id: 'bool_intersect',
    group: 'Boolean',
    label: 'tools.bool_intersect_label',
    fn: () => {
      editor.topPanel.clickBoolIntersect()
    }
  },
  {
    id: 'bool_subtract',
    group: 'Boolean',
    label: 'tools.bool_subtract_label',
    fn: () => {
      editor.topPanel.clickBoolSubtract()
    }
  },
  {
    id: 'bool_exclude',
    group: 'Boolean',
    label: 'tools.bool_exclude_label',
    fn: () => {
      editor.topPanel.clickBoolExclude()
    }
  },
  {
    id: 'bool_divide',
    group: 'Boolean',
    label: 'tools.bool_divide_label',
    fn: () => {
      editor.topPanel.clickBoolDivide()
    }
  },
  {
    id: 'add_to_shape_library',
    group: 'Edit',
    label: 'hotkeys.add_to_shape_library',
    fn: () => {
      editor._addSelectedToShapeLibrary()
    }
  }
]
