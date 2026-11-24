# R10 plan: one entry point per user intent

Plan for `.claude/roadmap/rearchitecture.md` › R10 (written 2026-11-24). Status: **steps 0–1 done** (2026-11-24); step 2 (pointer intent) next.

## The problem, measured (2026-11-24)

### Clipboard: one intent, four paths, three placements

| Source | What runs | Reads | Places at |
|---|---|---|---|
| `paste` command (menu, palette) | `svgCanvas.pasteElements()` | the stored copy only | the last **right-click** point (stale) |
| Context menu Paste | `pasteElements()` (`EditorStartup` `se-cmenu_canvas` switch) | the stored copy only | the right-click point |
| Cmd/Ctrl+V, native `paste` event | `applyClipboardText` → `pasteInCenter`, else `pasteInCenter()` | the system clipboard, then the stored copy | the centre of the view |
| Cmd/Ctrl+V when the host swallows `paste` | the keydown fallback: `navigator.clipboard.readText` → `applyClipboardText`, else `pasteElements()` | the system clipboard, then the stored copy | centre, or the last right-click point |

- `mod+v` is not a command, so it bypasses the registry: there is no undo label, debug-log `action` or palette entry for it.
- The context menu calls canvas methods directly for cut, copy, paste, paste in place and delete. A host's menu Copy calls
  `copySelectedElements()` directly.

### Click versus drag, in eleven places

| Site | Threshold | Metric |
|---|---|---|
| select move, Alt-clone (`event-select.ts`) | `4 / zoom` document units | per axis |
| marquee (`multiselectMove`) | 4 screen px | per axis |
| layers panel (`layerGestures.ts`, `layerTree.ts`) | 4 px | straight-line |
| text box drag (`event-shape-draw.ts` `TEXT_DRAG_PX`) | 5 px | straight-line |
| path tool curve-on-drag (`path-actions.ts`) | `6 / zoom` | straight-line |
| distort, rotate3d, width, gradient, corner tools (`CLICK_PX`) | 3 px | straight-line |
| shape family (`DRAG_THRESHOLD`, on `ev.dragDistance`) | 3 px | straight-line |
| curvature (`getMoveThreshold`) | `3 / zoom` | straight-line |

### Tolerances

- **"A path that closes a hair short of its start is closed":** `parseAnchors(d, closeTol)`. There are 25 call sites:
  - `0.1` written as a literal at most of them;
  - the same value as `TOL` in live-stack and `ROUNDING_TOL` in live-effects;
  - the exact default elsewhere.
- 184f99ae: two sides of one comparison folded with different tolerances, and a distortion compounded on every move.

### Press target

- The chain in `event.ts` `mouseDownEventImpl` runs these overrides in order, each reading what the earlier ones decided:
  1. unwrap a link with one child;
  2. Ctrl/Cmd drill into a group;
  3. leave the entered group;
  4. prefer a selected element underneath, and set `clickSelect`;
  5. a stroke within 8 px;
  6. an area text's empty box;
  7. the selection box as a move handle;
  8. a grip switches the mode.
- Two of them interacting was the 2026-11-24 selection bug (34a8b370).

### Already gone

- The extension hook "defined and never dispatched" is no longer in `EXTENSION_HOOKS`; only `keyDown` and `IDsUpdated` remain,
  and both are dispatched.
- **Curvature still finishes two ways:**
  - a gesture hands `{ created }` to the registry;
  - a tool switch finishes in a `modeChange` listener that adds an `InsertElementCommand` by hand.

## Prior art (web search 2026-11-24)

- **Click versus drag:**
  - Libraries put the threshold at 5–10 px: Babylon 10, ImGui / Fret 6, Azul 5. They measure straight-line distance,
    count reaching the threshold as crossing it, keep a crossed threshold crossed, and treat invalid coordinates as never
    a drag.
  - A per-axis check (Babylon) behaves differently on diagonals.
  - A pending press only becomes a drag past the threshold. Below it the gesture is a click.
- **Paste:**
  - The OS shortcut and a host's Edit > Paste both arrive as one `paste` event, so shortcut, menu and context menu should
    reach one implementation that picks the format.
  - A clipboard read must come from the user's own action (transient activation), so the native event supplies the text
    and the command does the rest.
  - Electron's main-process `clipboard` module is not for the renderer: use `navigator.clipboard`.
- **VectorCraft** has a single action registry for clipboard actions, which svgedit's command registry was ported from.

## Target

### 1. Clipboard: the registry owns every source

- **`paste` (and `paste_in_place`)** takes optional params `{ text?: string, at?: 'center' | 'pointer' }`. One implementation:
  1. classify `text` (the system clipboard's content, when the source has it): the editor's shapes JSON, an external SVG, or
     nothing;
  2. otherwise use the stored copy;
  3. place it at the centre of the view, or at the right-click point for `at: 'pointer'`.
- **The sources:**
  - **the native `paste` event:** `commands.run('paste', { text })`;
  - **the keydown fallback:** `commands.run('paste', { text: await readText() })`;
  - **the context menu:** `commands.run('paste', { at: 'pointer' })`;
  - **the menu and the palette:** `commands.run('paste')`.
- **Cmd+V stays the OS's key, not a registry hotkey.** The browser must deliver the clipboard on the native event, and
  rebinding it would mean nothing. (Listing it as a display-only key was left out: the registry has no such notion, and the
  shortcuts panel would offer to rebind it.)
- **Copy, cut and delete in the context menu** run their commands. A host's menu Copy runs `commands.run('copy')`.

### 2. One pointer-intent classifier

- **`core/pointer-intent.ts`:**
  - `DRAG_PX = 4`: the 4 px users already know from select, the marquee and the layers panel;
  - `isDrag(dxScreen, dyScreen)`: straight-line distance, inclusive, false for invalid coordinates;
  - `createDragIntent(pressClient)`: `.update(client) → boolean`, sticky once a drag.
- **`ToolEvent.dragging`** (`tool-registry.ts`): sticky, from the same classifier.
- **The sites listed above use it:**
  - the extension tools drop their own `CLICK_PX` / `DRAG_THRESHOLD`;
  - Curvature drops `getMoveThreshold`;
  - the layers panel imports the constant (editor layer, so a re-export through the canvas API or a shared module under
    `packages/svgcanvas/common/`).
- **Behaviour change:** tools move from 3 px to 4 px, the text box from 5 px to 4 px, and select's per-axis check becomes
  straight-line distance (a 3 × 3 px diagonal is now a drag).
  - The path tool's curve-on-drag (6 px) is the risky one: an accidental curve is worse than an accidental move. Test it at
    4 px. If the e2e or a manual check shows stray curves, it keeps its own named intent (`CURVE_DRAG_PX`) with the
    reason written down, rather than a magic number.

### 3. Shared tolerances

- `anchor-path.ts` exports `CLOSE_TOL = 0.1`, documented: "a closing anchor this near its start is the start: drawn paths
  often end a hair short".
- Every `parseAnchors(…, 0.1)`, live-stack's `TOL` and live-effects' `ROUNDING_TOL` (where used as the close tolerance) use
  it. The exact-default callers stay exact: changing them would change behaviour.
- **A unit test** fails on a new numeric literal as `parseAnchors`' tolerance, so the next caller picks the constant.
- `HIT_PX = 8` (stroke proximity, `event.ts`) moves next to `DRAG_PX` as a named pointer tolerance.

### 4. One ranked target resolver

- **`core/press-target.ts`:** `resolvePressTarget(ctx) → { target, clickSelect, rule }`.
  - The rules are an ordered array in one place: native hit, then prefer selected, stroke proximity, area text, selection
    box.
  - Each rule is `(ctx, current) → Partial<result> | null`.
  - The DOM probes are injected (`elementsAt`, `strokeNear`, `areaTextAt`, `selectionBox`), so the rules are unit-testable
    together.
- **Context changes stay in `event.ts`, before the resolver.** The link unwrap, Ctrl-drill and leaving the group change the
  editing context; they are not choices of target.
- **The debug log's `pointer-down`** records `targetRule`, so a wrong pick says which rule made it.
- **Tests:** a table of combinations: a covered selection plus a stroke nearby, an area text under a selection box, a
  multi-selection member, a shift-click, a right-click, and more. This is the 34a8b370 class.

### 5. Curvature finishes one way

- Its `deactivate` (the registry's mode-change hook) finishes the session with the same `finish()` the gesture uses, inside
  a `transact`, with `finishCreatedElement`.
- The `modeChange` listener and the hand-added `InsertElementCommand` go.

## Steps (one commit each, full suite green between)

0. **Characterisation e2e** (`tests/e2e/entry-points.spec.js`):
   - paste from each source (command, context menu, native `paste` with shapes / external SVG / empty, the fallback): one
     undo step each, the documented placement;
   - copy from each source writes the same clipboard;
   - click versus drag at 3, 4 and 5 px for select, the marquee and a registered tool;
   - Curvature finished by a click and by a tool switch: same result, one step.
   - Cases that fail today are `test.fail()`, each marked with its step.
   **Done (2026-11-24).** `tests/e2e/entry-points.spec.js` has 9 cases; 3 are `test.fail()`:
   - the Paste command pastes at the last right-click point (step 1);
   - a native paste does not run the command (step 1);
   - select measures each axis on its own (step 2).
   The rest pass today:
   - The context menu, and a native paste of shapes or of unrelated text, place as documented.
   - Curvature finished by a tool switch already ends up with the same attributes and one step as one closed by a click,
     so step 5 is a code-path cleanup: one finish, not a hand-added command.
   - "The centre of the view" is `Editor.pasteInCenter`'s, which measures the workarea's CSS content width (not its client
     width with the padding).
1. **Clipboard** (target 1). Unit tests for the paste classification and placement; the plugin's clipboard double (R13) later
   covers the host quirks.
   **Done (2026-11-24).**
   - **`Editor.paste({ text, at, inPlace })`** behind atomic `paste` / `paste_in_place`. The native event, the fallback,
     the context menu (`at: 'pointer'`), the menu and the palette all run the command. Cut, copy and delete in the context
     menu, and a host's menu Copy, run theirs.
   - **The registry** passes the run's params to `enabled` (`isEnabled(id, params)`), so `canPaste` takes a source's
     text when the drawing can take it.
   - **Fixed:** the menu's Paste no longer lands at the last right-click point, and an external SVG paste is one undo step
     (it was import, ungroup and two aligns).
2. **Pointer intent** (target 2): core sites first, then the registry's `dragging`, then the extensions and the panels.
3. **Tolerances** (target 3), with the literal guard.
4. **Press target resolver** (target 4).
5. **Curvature** (target 5).
6. **Docs:**
   - `roadmap.md` guideline: an intent is a command, every source runs it; thresholds and tolerances come from
     `pointer-intent.ts` / `anchor-path.ts`;
   - `architecture.md`, `tools.md`, `extensions.md` (`ev.dragging` instead of a tool's own `CLICK_PX`);
   - `debug-log.md` (`targetRule`);
   - `commands.md` regenerated;
   - R10's status.

## Risks

- **Paste placement changes:** the menu's Paste now goes to the centre, not the last right-click point. That is the bug,
  but anyone used to it will notice. The context menu keeps the click point.
- **Threshold changes:** 3 → 4 px in tools, straight-line distance in select. Cover them in the characterisation spec and
  in the tool specs that drag a few pixels.
- **The press target resolver** is the highest-traffic code in the editor. Keep the rule order exactly, prove it with the
  table test before moving any rule, and run click-select / area-text / selection specs after each move.
- **Size:** M, about 7 commits.
