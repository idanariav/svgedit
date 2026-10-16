# Commands

> **Generated** from `editor.commands.list({ includeHidden: true })` by `tests/e2e/commands-doc.spec.js`
> (`UPDATE_COMMANDS_DOC=1 npx playwright test tests/e2e/commands-doc.spec.js` rewrites it; the plain e2e run fails
> when it is stale). Every user-visible action is a command with a stable id: never rename one, hotkey overrides
> and favorites store them. Keys are the defaults, in the registry's authoring form (`mod` = Ctrl / Cmd).
> *dialog* = opens a dialog / file picker / prompt; *hidden* = not listed in palettes and the shortcut manager.

## Align

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `align_bottom` | Align Bottom |  |  |  |
| `align_center` | Align Center |  |  |  |
| `align_left` | Align Left |  |  |  |
| `align_middle` | Align Middle |  |  |  |
| `align_right` | Align Right |  |  |  |
| `align_top` | Align Top |  |  |  |

## Arrange

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `lower` | Lower | `meta+[` |  |  |
| `move_to_back` | Send to Back |  |  |  |
| `move_to_front` | Bring to Front |  |  |  |
| `raise` | Raise | `meta+]` |  |  |
| `switch_zorder` | Switch Layers |  |  |  |

## Boolean

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `bool_divide` | Divide |  |  |  |
| `bool_exclude` | Exclude |  |  |  |
| `bool_intersect` | Intersect |  |  |  |
| `bool_subtract` | Subtract |  |  |  |
| `bool_union` | Union |  |  |  |

## Canvas

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `canvas_apply_layout` | Apply canvas layout |  | `name!: ` |  |
| `canvas_delete_layout` | Delete canvas layout |  | `name!: ` |  |
| `canvas_save_layout` | Save canvas as layout |  | `name!: string` |  |
| `canvas_set_background` | Set canvas background colour |  | `color!: string` |  |
| `canvas_set_size` | Set canvas size |  | `width!: number 1..20000`<br>`height!: number 1..20000` |  |

## Clone

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `clone_down` | Clone down | `alt+arrowdown` |  |  |
| `clone_down_big` | Clone down | `alt+shift+arrowdown` |  |  |
| `clone_left` | Clone left | `alt+arrowleft` |  |  |
| `clone_left_big` | Clone left | `alt+shift+arrowleft` |  |  |
| `clone_right` | Clone right | `alt+arrowright` |  |  |
| `clone_right_big` | Clone right | `alt+shift+arrowright` |  |  |
| `clone_up` | Clone up | `alt+arrowup` |  |  |
| `clone_up_big` | Clone up | `alt+shift+arrowup` |  |  |
| `transform_again` | Transform again | `meta+d` |  |  |

## Edit

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `add_to_shape_library` | Add to shape library |  |  |  |
| `copy` | Copy | `meta+c` |  |  |
| `cut` | Cut | `meta+x` |  |  |
| `delete_selected` | Delete selection | `delete` `backspace` |  |  |
| `flip_horizontal` | Flip horizontally | `shift+h` |  |  |
| `flip_vertical` | Flip vertically | `shift+v` |  |  |
| `object_hide_selection` | Hide Selection | `meta+3` |  |  |
| `object_lock_selection` | Lock Selection | `meta+2` |  |  |
| `object_show_all` | Show All | `alt+meta+3` |  |  |
| `object_unlock_all` | Unlock All | `alt+meta+2` |  |  |
| `paste` | Paste |  |  |  |
| `paste_in_place` | Paste in Place |  |  |  |
| `tool_clone` | Duplicate Element(s) | `d` |  |  |
| `tool_clone_multi` | Duplicate Element(s) |  |  | hidden |
| `tool_delete` | Delete Element(s) |  |  |  |
| `tool_delete_multi` | Delete Element(s) |  |  | hidden |
| `tool_recolor` | Recolor artwork: change the colours of the selection together |  |  | dialog |
| `tool_redo` | Redo | `meta+y` |  |  |
| `tool_undo` | Undo | `meta+z` |  |  |

## File

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `tool_clear` | New Image | `n` |  |  |
| `tool_save` | Save SVG | `s` |  |  |

## Group

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `tool_group_elements` | Group Elements | `g` |  |  |
| `tool_make_link` | Make |  |  |  |
| `tool_make_link_multi` | Make |  |  |  |
| `tool_ungroup` | Ungroup Elements |  |  |  |
| `tool_unlink_use` | Break link to reference element |  |  |  |

## Layers

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `layer_delete` | Delete Layer |  |  |  |
| `layer_down` | Move Layer Down |  |  |  |
| `layer_locate` | Locate Object in Layers |  |  |  |
| `layer_moreopts` | More options |  |  |  |
| `layer_new` | New Layer |  |  |  |
| `layer_rename` | Rename Layer |  |  |  |
| `layer_template` | Toggle Tracing Template Layer |  |  |  |
| `layer_up` | Move Layer Up |  |  |  |

## Mask

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `clipmask_release` | Release Clip/Mask: drop the clip/mask from the selected shape |  |  |  |
| `tool_clip_set` | Set Clip: trim the top shape to the bottom shape’s silhouette |  |  |  |
| `tool_mask_set` | Set Mask: mask the top shape with the bottom shape’s silhouette |  |  |  |

## Move

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `move_down` | Nudge down | `arrowdown` |  |  |
| `move_down_big` | Nudge down | `shift+arrowdown` |  |  |
| `move_left` | Nudge left | `arrowleft` |  |  |
| `move_left_big` | Nudge left | `shift+arrowleft` |  |  |
| `move_right` | Nudge right | `arrowright` |  |  |
| `move_right_big` | Nudge right | `shift+arrowright` |  |  |
| `move_up` | Nudge up | `arrowup` |  |  |
| `move_up_big` | Nudge up | `shift+arrowup` |  |  |

## Navigate

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `cycle_next` | Cycle to next element | `shift+p` `tab` |  |  |
| `cycle_prev` | Cycle to previous element | `shift+o` `shift+tab` |  |  |

## Path

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `path_add_anchors` | Add Anchor Points |  |  |  |
| `path_average_both` | Average Nodes: Both |  |  |  |
| `path_average_h` | Average Nodes: Horizontal |  |  |  |
| `path_average_v` | Average Nodes: Vertical |  |  |  |
| `path_join` | Join Paths |  |  |  |
| `tool_add_subpath` | Add sub-path |  |  |  |
| `tool_node_clone` | Clone Node |  |  |  |
| `tool_node_delete` | Delete Node |  |  |  |
| `tool_node_link` | Link Control Points |  |  |  |
| `tool_node_smooth` | Smooth Node |  |  |  |
| `tool_openclose_path` | Open/close sub-path |  |  |  |
| `tool_stroke_to_path` | Stroke to Path |  |  |  |
| `tool_topath` | Convert to Path |  |  |  |

## Rotate

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `rotate_ccw` | Rotate −5° | `shift+ctrl+arrowleft` |  |  |
| `rotate_ccw_fine` | Rotate −0.1° | `ctrl+arrowleft` |  |  |
| `rotate_cw` | Rotate +5° | `shift+ctrl+arrowright` |  |  |
| `rotate_cw_fine` | Rotate +0.1° | `ctrl+arrowright` |  |  |

## Select

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `select_same_fill` | Select same fill |  |  |  |
| `select_same_fillstroke` | Select same fill & stroke |  |  |  |
| `select_same_opacity` | Select same opacity |  |  |  |
| `select_same_stroke` | Select same stroke |  |  |  |
| `select_same_strokeweight` | Select same stroke weight |  |  |  |
| `select_same_type` | Select same type |  |  |  |

## Selection

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `escape` | Cancel / deselect | `escape` |  |  |
| `select_all` | Select all | `meta+a` |  |  |

## Text

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `tool_bold` | Bold Text | `b` |  |  |
| `tool_italic` | Italic Text | `i` |  |  |
| `tool_text_area` | Area text |  |  |  |
| `tool_text_decoration_linethrough` | Line-Through |  |  |  |
| `tool_text_decoration_overline` | Overline |  |  |  |
| `tool_text_decoration_underline` | Underline |  |  |  |

## Tools

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `blend_align_path` | Align to path |  |  |  |
| `blend_detach_spine` | Detach spine |  |  |  |
| `blend_expand` | Expand |  |  |  |
| `blend_make` | Make blend |  |  |  |
| `blend_release` | Release |  |  |  |
| `blend_replace_spine` | Replace spine |  |  |  |
| `blend_reverse_spine` | Reverse spine |  |  |  |
| `brush_delete` | Delete brush |  |  |  |
| `brush_edit_path` | Edit path |  |  |  |
| `brush_expand` | Expand |  |  |  |
| `brush_new_art` | New art brush |  |  |  |
| `brush_new_pattern` | New pattern brush |  |  |  |
| `brush_release` | Release |  |  |  |
| `corner_kind_c` | Chamfered corners |  |  |  |
| `corner_kind_i` | Inverted round corners |  |  |  |
| `corner_kind_r` | Round corners |  |  |  |
| `ext-panning` | Panning [Space / mouse wheel + drag] |  |  |  |
| `glow_remove` | Remove glow and feather |  |  |  |
| `outline_remove` | Remove outline |  |  |  |
| `tool_arc` | Arc Tool |  |  |  |
| `tool_blend` | Blend tool: click one shape, then another, to blend them. More clicks add more keys |  |  |  |
| `tool_brush` | Brush | `w` |  |  |
| `tool_command_search` | Command search | `meta+k` |  | dialog |
| `tool_corners` | Corners tool: drag the widget inside a corner to round it |  |  |  |
| `tool_curvature` | Curvature | `y` |  |  |
| `tool_cutter` | Cutter | `c` |  |  |
| `tool_dash_fit` | Fit dashes to the stroke |  |  |  |
| `tool_distort` | Distort tool: drag a corner of the selected shape |  |  |  |
| `tool_editor_prefs` | Editor Preferences |  |  | dialog |
| `tool_ellipse` | Ellipse | `e` |  |  |
| `tool_export` | Export |  |  | dialog |
| `tool_eyedropper` | Eye Dropper Tool | `meta+i` |  |  |
| `tool_favorites` | Favorites |  |  | dialog |
| `tool_fhpath` | Pencil Tool | `q` |  |  |
| `tool_gradient` | Gradient tool: edit the gradient of the selected shape |  |  |  |
| `tool_hotkeys` | Keyboard shortcuts |  |  | dialog |
| `tool_image` | Image Tool | `m` |  | dialog |
| `tool_image_crop` | Crop Image |  |  | dialog |
| `tool_image_crop_apply` | Apply Crop |  |  |  |
| `tool_image_crop_cancel` | Cancel Crop |  |  |  |
| `tool_import` | Import SVG |  |  | dialog |
| `tool_join_paths` | Close path |  |  |  |
| `tool_join_paths_multi` | Join paths |  |  |  |
| `tool_layerView` | Layer Focus |  |  |  |
| `tool_line` | Line Tool | `l` |  |  |
| `tool_match_strokes` | Match strokes |  |  |  |
| `tool_measure` | Measure tool: drag between two points to read distance, angle and offsets |  |  |  |
| `tool_mirror_copy` | Mirror-copy selection across the canvas axis |  |  |  |
| `tool_mirror_copy_multi` | Mirror-copy selection across the canvas axis |  |  |  |
| `tool_node_add_anchors` | Add anchor points |  |  |  |
| `tool_open` | Open SVG |  |  | dialog |
| `tool_path` | Path Tool | `p` |  |  |
| `tool_polargrid` | Polar Grid Tool |  |  |  |
| `tool_polygon` | Polygon Tool |  |  |  |
| `tool_puppet_warp` | Puppet Warp | `x` |  | dialog |
| `tool_rect` | Rectangle Tool | `r` |  |  |
| `tool_rectgrid` | Rectangular Grid Tool |  |  |  |
| `tool_save_as` | Save as SVG |  |  |  |
| `tool_select` | Select Tool | `v` |  |  |
| `tool_shape_builder` | Shape builder |  |  |  |
| `tool_shapelib` | Shape library |  |  | dialog |
| `tool_shaper` | Shaper | `shift+n` |  |  |
| `tool_smart_snap` | Smart snapping |  |  |  |
| `tool_smooth` | Smooth tool |  |  |  |
| `tool_spiral` | Spiral Tool |  |  |  |
| `tool_split_grid` | Split into grid: replace a shape with rows × columns of rectangles |  |  | dialog |
| `tool_star` | Star Tool |  |  |  |
| `tool_tablet_mode` | Tablet mode |  |  |  |
| `tool_text` | Text Tool | `t` |  |  |
| `tool_text_on_path` | Put text on path |  |  |  |
| `tool_text_path_release` | Detach text from path |  |  |  |
| `tool_trace_image` | Convert to editable SVG |  |  | dialog |
| `tool_wand` | Magic Wand: click a shape to select every shape that looks like it |  |  |  |
| `tool_width` | Width tool |  |  |  |
| `tools_shapes` | Shapes Tool |  |  |  |

## Transform

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `tool_flip_h` | Flip Horizontally |  |  |  |
| `tool_flip_v` | Flip Vertically |  |  |  |
| `tool_transform_each` | Transform each: scale, move, rotate or reflect every selected object about its own point |  |  | dialog |

## View

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `guides_clear` | Clear all guides |  |  |  |
| `guides_toggle_lock` | Lock / unlock guides |  |  |  |
| `guides_toggle_show` | Show / hide guides | `meta+;` |  |  |
| `tool_frame` | Frame | `u` |  |  |
| `tool_wireframe` | Wireframe Mode | `f` |  |  |
| `zoom_fit` | Fit to canvas |  |  |  |

## Zoom

| Id | Label | Keys | Params | |
|---|---|---|---|---|
| `zoom_in` | Zoom in | `meta+arrowup` |  |  |
| `zoom_out` | Zoom out | `meta+arrowdown` |  |  |
