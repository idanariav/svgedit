# Tier 0 — architecture borrowed from VectorCraft

Read [README.md](README.md) first (rules, porting conventions). VectorCraft
paths below are relative to `/Users/idanariav/GitProjects/vectorcraft/`;
svgedit paths are relative to this repo.

Tiers 1–3 port **features**. This tier ports **structure**: the ways
VectorCraft's engine is organised that make features cheap to add, safe to
undo, and easy to test and automate. Nothing here is user-visible on its own.
The pay-off is that later items get smaller (see the "Unblocks" line on each).

Survey date: 2026-10-10. Line numbers below were correct then; re-check them
with LSP before relying on them.

## Order and dependencies

| ID | Item | Depends on | Unblocks / makes cheaper |
|---|---|---|---|
| T0.1 | Command registry ("everything is a command") | — | T0.4 sweep, T0.5, plugin command palette, T2.9, T2.10 |
| T0.2 | Undo transactions (begin → preview → commit / cancel) | — | T0.3, T3.1, T2.6, T2.7, T2.8, T2.16, all on-canvas editors |
| T0.3 | Tool contract (`registerTool`) | T0.2 | T1.6, T2.6, T2.13, T2.16, T3.2, any new drawing tool |
| T0.4 | Drawing invariants + command sweep | checker: —; sweep: T0.1 | every future data-corruption fix |
| T0.5 | Automation API (inspect + doc-space pointer) | T0.1 | e2e specs, agent-driven verification |
| T0.6 | Layering guard (`check-layers.mjs`) | — | — (keeps the canvas/editor boundary from eroding) |

Suggested order: **T0.6** (an hour, warm-up) → **T0.2** → **T0.1** → **T0.4**
→ **T0.3** → **T0.5**. T0.2 and T0.1 are independent and could run in
parallel in separate worktrees; they touch different files except
`hostApi.d.ts`.

**Do not migrate everything in one go.** Every item below gets a *seam* plus
one or two pilot users. Existing code moves over opportunistically when it's
touched anyway. A big-bang conversion of `event.js` or every toolbar button is
explicitly out of scope.

## Explicitly not borrowed (decided 2026-10-10, don't reopen without a new reason)

- **Immutable document + snapshot undo** (`Arc<Document>`, structural
  sharing). In svgedit the live SVG DOM *is* the document; replacing it is a
  rewrite. T0.2 gets most of the benefit (one-step undo, cancel) on top of
  the DOM instead.
- **Appearance stack** (several fills/strokes per object). That's a feature,
  and SVG can't express it without wrapper groups.
- **WASM plugin sandbox** (`crates/plugins`). Extensions are already JS.
- **No-panic lints.** The JS analogue is strict typing, tracked separately in
  `roadmap.md` › "Convert `packages/svgcanvas` core modules to TypeScript".
- **Crash recovery / Data Recovery copies** (`ui-egui/src/recovery.rs`). The
  Obsidian plugin already autosaves (`autosaveSeconds` in
  `../obsidian-svgedit-plugin/src/main.ts`), and the standalone editor has a
  `beforeunload` warning (`EditorStartup.js` ≈ line 883). Not worth it here.
- **The TCP control channel / MCP server.** T0.5 provides an in-page API
  instead. No network listener, so there's no attack surface.

## Research notes (web searches run 2026-10-10)

- **Command registries:** key every command by a stable id, never the
  label, so persisted user data (recents, rebinds) survives renames. Let
  features register their own commands when they load instead of keeping one
  hard-coded list. Express enablement as a precondition on the command, not
  as UI code that toggles `disabled`. VS Code's `Action2` puts command +
  menu + keybinding + precondition in one declaration, which is the model
  for T0.1. [VS Code actions](https://www.mintlify.com/microsoft/vscode/api/platform/actions),
  [Theia commands/keybindings](https://theia-ide.org/docs/commands_keybindings/),
  [app-model registries](https://app-model.readthedocs.io/en/latest/reference/registries/).
- **MutationObserver for undo:** feasible and has been done (Addy Osmani's
  write-up). Pitfalls: `childList` records carry no old value, so the
  previous child order has to be reconstructed by replaying the records in
  reverse. Records arrive asynchronously, so call `takeRecords()` to flush
  them synchronously at commit. Several overlapping observers can yield
  duplicate records, so use exactly one observer.
  [Osmani: Detect, undo and redo DOM changes with mutation observers](https://addyosmani.com/blog/mutation-observers/),
  [W3C bug 19402 (duplicate records / oldValue)](https://www.w3.org/Bugs/Public/show_bug.cgi?id=19402).
- **Tool architecture:** tldraw and Grida model each tool as a state machine
  fed by *normalised* pointer events in canvas space, emitting mutation
  batches through the editor's dispatch. Each tool owns its own state, so
  there's no central mode `switch`. Same shape as VectorCraft's `Tool` trait.
  [tldraw tools](https://tldraw.dev/sdk-features/tools),
  [Grida canvas tool](https://grida.co/docs/wg/canvas/tool).
- **Property-based testing:** fast-check (4.10.2 on npm as of 2026-10-10)
  plus `@fast-check/vitest` (0.5.0) integrates with vitest's `test`. Its
  `fc.commands` / model-based testing fits a command registry.
  [fast-check + vitest](https://fast-check.dev/docs/tutorials/setting-up-your-test-environment/property-based-testing-with-vitest/),
  [@fast-check/vitest](https://npmjs.com/package/@fast-check/vitest).

---

## T0.1 — Command registry ("everything is a command")

### Goal
One per-editor registry where every user-visible action is declared once:
stable id, label, group, default keys, params, an `enabled` check that gives
a *reason*, and `run(params)`. Hotkeys, the toolbar buttons, the
quick-action/favorites menu, the tablet shell and the host API all become
views over it.

### VectorCraft source
- `crates/engine/src/cmd/mod.rs` ≈ line 95: `CommandSpec { id, label, menu,
  shortcut, params (doc string), enabled: fn(&Session) -> Result<(), String>,
  run, journal }` and `CommandInfo` (serialised list with `enabled` +
  `disabled_reason`).
- `crates/engine/src/lib.rs`: `Session::execute(id, params)` is the only way
  anything mutates the document. `EngineError::{UnknownCommand, Disabled(id,
  reason), BadParams{cmd,msg}, Internal{…}}`.
- `crates/ui-egui/src/menus.rs` `UI_COMMANDS`: UI-only commands (open a
  panel, toggle rulers) live in the same namespace as document commands.

### svgedit today: three overlapping partial catalogs
1. **`src/editor/editorShortcuts.js`**: `buildEditorShortcuts(editor)`, 88
   keyboard-only entries `{id, group, label, key, fn}`.
2. **`se-button` / `se-menu-item` self-registration**:
   `components/seButton.js` ≈ line 226 and `seMenuItem.js` ≈ line 170 call
   `hotkeys.registerEl({id, el, label, rawKey})`. These actions run by
   **`el.click()`** (`Hotkeys.js` `register()` ≈ line 501).
3. **`src/editor/favoriteActions.js`**: `EXTRA_TRIGGERS` (paste, paste in
   place, zoom fit, which the hotkey registry lacks) and `VALUE_CONTROLS`
   (stroke width / fill / stroke colour widgets). `runFavoriteTrigger`
   duplicates the hotkey dispatch (`a.run` else `a.el.click()`).

`HotkeyManager` (`src/editor/Hotkeys.js`) already merges 1 and 2 into
`this.actions: Map<id, {id, group, defaultKeys, pd, run, el, labelKey,
decorative}>`. **That map is the seed of the registry.** Don't build a
second, parallel one.

The same action is wired three different ways. Example, Duplicate:
- the toolbar button runs `TopPanel.clickClone()` (`TopPanel.js` ≈ line
  532, bound ≈ line 1031)
- the hotkey runs the button's `el.click()`
- the tablet shell calls `svgCanvas.cloneSelectedElements(20, 20)` directly
  (`TabletShell.js` ≈ line 365)

Enablement is imperative DOM toggling spread through
`panels/topPanelContext.js` (e.g. `$id('tool_node_delete').disabled = …` ≈
line 150, undo/redo ≈ line 363), so no surface can ask "why is this
disabled?".

The host API (`src/editor/hostApi.d.ts`) has no way to run an editor action.
The plugin's Obsidian commands (`../obsidian-svgedit-plugin/src/commands.ts`)
are all file-level (new, export, versions). None of the ~150 editing actions
reach Obsidian's command palette.

### What to build

**New module `src/editor/commands.js`** (editor layer: commands may touch
panels/dialogs, so it doesn't belong in `packages/svgcanvas`):

```js
/**
 * @typedef {object} CommandSpec
 * @property {string} id            stable, persisted (see pitfalls) — never rename
 * @property {string} label         i18n key
 * @property {string} group         one of GROUP_ORDER (Hotkeys.js)
 * @property {string|string[]} [keys]  default binding(s), authoring form ('mod+d')
 * @property {string} [icon]        images/ filename for menus without a button
 * @property {Object<string, ParamSpec>} [params]
 *           ParamSpec = {type:'number'|'string'|'boolean'|'enum', default?, min?, max?, values?, required?}
 * @property {(editor) => true|string} [enabled]  true, or a human-readable reason (i18n key) it's unavailable
 * @property {(editor, params) => any} run
 * @property {boolean} [interactive]  opens a dialog / file picker / prompt (excluded from sweeps, see T0.4)
 * @property {boolean} [palette=true] list in host command palettes
 */
export class CommandRegistry {
  constructor (editor)
  register (spec)        // throws on duplicate id (dev) — logs + ignores in prod
  unregister (id)
  get (id)
  list ()                // [{id, label (translated), group, keys (effective), enabled, disabledReason, params, interactive}]
  isEnabled (id)         // → true | reason
  run (id, params = {})  // validates params, checks enabled, runs; see errors below
}
```

- **Per editor instance**, created in `Editor`'s constructor next to
  `this.hotkeys`. The Obsidian plugin mounts one editor per pane. A module
  singleton would run commands on the wrong drawing, the same bug class
  `domScope.js` / `check-dom-scope.mjs` exist to prevent.
- **Errors:** `run` returns the command's result or throws a `CommandError
  {code: 'unknown'|'disabled'|'badParams'|'internal', id, message}`. Wrap
  `spec.run` in try/catch. On an unexpected throw, log through
  `common/logger.js` and rethrow as `internal`. Once T0.2 lands, run every
  command inside `svgCanvas.transact(label, …)` so a throw rolls the drawing
  back. That's the analogue of VectorCraft's `guard.rs`. Callers that ignore
  errors (keyboard dispatch) catch and log.
- **Param validation:** coerce/clamp per `ParamSpec`; unknown keys →
  `badParams`; missing `required` → `badParams`. Keep it this small. Don't
  pull in a JSON-schema library.

**Make `HotkeyManager` a view over the registry:**
- `ingestEditorShortcuts` becomes "register each `editorShortcuts.js` entry
  as a command". The table's shape barely changes: `fn` → `run`, `key` →
  `keys`. Keep the `pd` (preventDefault) flag on the hotkey side.
- Keydown dispatch calls `editor.commands.run(id)` instead of `a.run()` /
  `a.el.click()`. If the command is disabled, do nothing and don't
  `preventDefault`. Today a hotkey on a disabled button still calls
  `el.click()`, and only the button's own guard stops it. Check this
  doesn't change behaviour for any key: run the shortcuts e2e spec.
- Rebinding, conflict detection, persistence (`svg-edit-hotkeys`,
  `userDataAdapter.getHotkeys`) stay in `HotkeyManager`, keyed by the same
  ids.

**Buttons become views (incrementally):**
- Add a `command="<id>"` attribute to `se-button` / `se-menu-item`. When
  present, the component's click handler calls `editor.commands.run(id)`
  and the component sets its own `disabled` + `title` (with the reason) from
  `isEnabled(id)` on refresh.
- **Transitional adapter (critical for completeness):** a button that hasn't
  migrated yet still self-registers through `registerEl`. Register it as a
  command whose `run` is `() => el.click()` and whose `enabled` reads
  `el.disabled`. Then `commands.list()` is complete from day one, and
  migration is per-button with no flag day.
- **Enablement refresh:** one `refreshEnablement()` on the editor, called
  from the existing `selectedChanged` / `elementChanged` / `changed` /
  undo-stack-change paths. Move logic out of `topPanelContext.js` into
  `enabled` functions only for commands you migrate. Don't rewrite that file
  wholesale.

**Favorites become a view:** `runFavoriteTrigger` → `editor.commands.run`.
Move `EXTRA_TRIGGERS` (paste, paste_in_place, zoom_fit) into the registry as
real commands with the **same ids**. `VALUE_CONTROLS` stay widgets (they
render an input), but their change handlers should call a command with a
param, e.g. `style.strokeWidth {value}` → `bottomPanel.changeStrokeWidth`.
That gives the host and the sweep a way to set them too.

**Extensions register their own commands:** expose `editor.commands` to
extensions (they already receive `svgEditor`). Extensions that add buttons
pass `command=`.

**Host API:** add to `EditorHostApi` in `src/editor/hostApi.d.ts`:
```ts
commands: {
  list(): Array<{ id: string, label: string, group: string, keys: string[],
                  enabled: boolean, disabledReason?: string,
                  params?: Record<string, unknown>, interactive?: boolean }>
  run(id: string, params?: Record<string, unknown>): unknown
}
```
`npm run typecheck` asserts `Editor` satisfies it (`hostApi.check.ts`).
Using it from the plugin (registering palette entries, possibly with
Obsidian hotkeys) is **plugin-repo work**. Note it in
`../obsidian-svgedit-plugin`'s techdebt/plan, not here.

**Pilot migration in this item:** Duplicate (`tool_clone`), Delete, Group,
Ungroup, Undo, Redo, Paste, Zoom fit, plus the tablet shell's buttons for
those, so one action has exactly one implementation across hotkey, button,
favorites menu, tablet shell and host. Everything else rides the
transitional adapter.

### Implementation notes (T0.1, done 2026-10-10)

- `src/editor/commands.js` (`CommandRegistry`, `CommandError`), `coreCommands.js` (9 pilot commands),
  `components/commandBinding.js`. `HotkeyManager.actions` **is** `editor.commands.table`; there is no second catalogue.
- Registration order is irrelevant: a real command declared before or after its button's adapter keeps the button
  as `el` and takes its key from the command, falling back to the button's `shortcut`.
- **`atomic` is opt-in per command**, not "wrap every command in `transact`" as the plan suggested: a blanket
  wrap would swallow the history of async/modal commands and tool switches. Used by clone, delete, group,
  ungroup, the arrow-key nudges, `delete_selected` and `cut` (the sweep showed their hand-recorded undo missed
  `se:*` attributes). `refreshEnablement()` runs after **every** command, because an atomic command's selection
  events fire before its undo step is recorded and left the undo button stale.
- The disabled reason is in `list()` / `isEnabled()`; the button's `title` does not show it (would need a
  restore step for the tooltip). `interactive` adapters were flagged by id (`INTERACTIVE_IDS`, since removed: commands declare `interactive` themselves, an adapter's element via an `interactive` attribute).
- `paste`, `paste_in_place`, `zoom_fit` are now real commands, so they also appear in the Hotkey Manager list.
- Not done: the plugin-side palette (plugin repo), migrating the remaining ~130 buttons.

### Pitfalls
- **Ids are persisted user data. Never rename one.** Hotkey overrides
  (`svg-edit-hotkeys` / `userDataAdapter.getHotkeys`) and favorites
  (`svg-edit-favorites` / `getFavorites`) store action ids. Existing ids
  (`tool_clone`, `tool_rect`, `paste`, `zoom_fit`, every `editorShortcuts.js`
  id) **are** the command ids. New commands may use dotted ids
  (`style.strokeWidth`), but no existing id changes. Add a unit test that
  snapshots the id set, so a removal or rename fails loudly.
- **Tool buttons are commands too** (`tool_rect` → `svgCanvas.setMode('rect')`
  plus left-panel state). Keep them as adapter commands. T0.3 doesn't
  change their ids.
- **Decorative shortcuts** (`"Z / Ctrl + wheel"`, `HotkeyManager.decorative`)
  are display-only. Keep that field; don't try to bind them.
- **`interactive` commands** (open/save/export dialogs, `sePrompt`, file
  pickers) must be flagged. T0.4's sweep and T0.5's automation would hang
  on them.
- **Disabled-hotkey behaviour change** (see above). `tool_undo` /
  `tool_redo` are disabled via DOM today. Make sure their `enabled` mirrors
  `undoMgr.getUndoStackSize()` / `getRedoStackSize()` exactly, or undo
  hotkeys break.
- **Multiple editors on a page:** keydown already routes through
  `isActiveEditor` / `ownsKeyEvent` (`domScope.js`). Keep that check *in
  front of* `commands.run`, not inside it: host calls must work on an
  inactive pane.

### Tests
- `tests/unit/commands.test.js`: register / duplicate id / unregister;
  `run` on unknown → `unknown`; disabled → `disabled` with reason; param
  coercion, clamping, `badParams`; a throwing `run` → `internal` + logged;
  `list()` shape; translated labels.
- `tests/unit/hotkeys.test.js` (**new**: there is no HotkeyManager unit test
  yet; `shortcut-format.test.js` / `ownsKeyEvent.test.js` cover only helpers):
  dispatch goes through the registry;
  disabled command → no `preventDefault`; adapter commands from `registerEl`.
- Id-stability snapshot test (see pitfalls).
- e2e (`tests/e2e/shortcuts-panel.spec.js` or a new `commands.spec.js`):
  Duplicate via hotkey, button, favorites menu, and
  `svgEditor.commands.run('tool_clone')` all produce the same drawing and
  one undo step each. `commands.list()` contains every visible `se-button`
  id (sweep the DOM).

### Docs
`architecture.md` (new Commands subsystem row; HotkeyManager / Favorites rows
now say "view over the command registry"), `file-map.md` (`commands.js`),
`extensions.md` (how an extension registers a command / `command=`
attribute), `tools.md` (adding a toolbar control now means registering a
command), `hostApi.d.ts` doc comments, CLAUDE.md Playwright section (prefer
`svgEditor.commands.run(id)` over `.click()` on off-screen buttons).

### Acceptance
- `editor.commands.list()` returns every action reachable by hotkey, button,
  or favorites menu, with correct `enabled` / `disabledReason`.
- The pilot actions have a single implementation; grep shows no remaining
  direct `cloneSelectedElements(20, 20)` outside the command.
- All existing hotkey overrides and favorites from a pre-change
  `localStorage` still work (e2e: seed storage, reload, assert).

---

## T0.2 — Undo transactions (begin → preview → commit / cancel)

### Goal
`svgCanvas.transact(label, fn)` and `beginTransaction(label)` record
**every** DOM change to the drawing in between as one undo step, without
hand-building `BatchCommand`s. Cancel restores the drawing (and selection)
exactly. Gestures, scrubbed fields and multi-step operations get
"one gesture = one undo step" and "Escape restores" for free, and
"forgot to record the undo" bugs can't happen inside a transaction.

### VectorCraft source
- `crates/engine/src/lib.rs`: `Interaction { label, doc (snapshot),
  selection, preview, … }`. A drag snapshots the document, previews are
  applied *against the snapshot*, cancel restores it, commit records one
  history entry. `UndoGroup { first, journal }` /
  `Session::begin_undo_group`: edits made while it's open are one step
  (used by scrubbed numeric fields).
- `crates/engine/src/guard.rs`: on a panic, roll the document back to the
  pre-command state.

### svgedit today
- `packages/svgcanvas/core/history.js`: `Command` base (`apply(handler,
  fn)` / `unapply` fire `BEFORE_/AFTER_(UN)APPLY` around the change),
  `MoveElementCommand`, `InsertElementCommand` (captures `parent` /
  `nextSibling` **at construction**), `RemoveElementCommand`,
  `ChangeElementCommand(elem, oldAttrs)` (reads *new* values from the DOM at
  construction; `#text` and `#href` are pseudo-attributes), `BatchCommand`,
  `UndoManager` (`addCommandToHistory`, `beginUndoableChange(attr, elems)` /
  `finishUndoableChange()`, a single-attribute precursor of this idea).
- `historyrecording.js`: `HistoryRecordingService` (start/end batch helper).
- `core/undo.js` `init` → `handleHistoryEvent(eventType, cmd)`: the side
  effects of undo/redo, **keyed on `cmd.type()`**:
  - BEFORE: `clearSelection()`.
  - AFTER: svgcontent width/height → `contentW/H`; pathedit refresh-in-place
    vs `pathActions.clear()`; `call('changed', elems)`;
    Move/Insert/Remove whose parent is svgcontent → `identifyLayers()`;
    Insert (apply) / Remove (unapply) → `restoreRefElements`; `use` →
    `setUseData`; `<title>` of a layer → `identifyLayers`; `stdDeviation` →
    `setBlurOffsets`; **`<text>` x/y change → shifts every child tspan by
    the same dx/dy** (≈ lines 115–135).
- Every feature builds its own batch. Previews are hand-rolled per feature
  (`live-effects.js` `previewLiveEffects` / `cancelLiveEffectsPreview` ≈
  line 441; ext-curvature; ext-cutter). `architecture.md` records at least
  one past bug where a move inside a group was never recorded.

### What to build

**New module `packages/svgcanvas/core/transaction.js`**, initialised from
`svgcanvas.js` with `runGuardedInit` like the other modules. API on
`svgCanvas`:

```js
const tx = svgCanvas.beginTransaction(label, { selection: true })
tx.commit()   // → BatchCommand | null (null when nothing net-changed); pushed to undoMgr
tx.cancel()   // reverts the drawing, restores the selection captured at begin
svgCanvas.transact(label, fn)   // begin; fn(); commit — on throw: cancel, rethrow
svgCanvas.inTransaction()       // → boolean
```

**Recording (superseded by snapshot-and-diff, see the implementation notes below):** exactly one `MutationObserver` on `svgCanvas.getSvgContent()`
with `{ attributes: true, attributeOldValue: true, childList: true,
subtree: true, characterData: true, characterDataOldValue: true }`, created
at `begin` and disconnected at commit/cancel. At commit, call
`observer.takeRecords()` first: records are delivered asynchronously
(microtask), so without it the last mutations of a synchronous `fn` are
lost.

Fold records into compact state as they arrive (in the callback *and* the
final `takeRecords()` batch). Don't keep the raw list: a drag produces
thousands.
- **Attributes:** `Map<Element, Map<qualifiedName, firstOldValue>>`. Keep
  only the *first* old value per (element, attribute). At commit, emit one
  `ChangeElementCommand(elem, {attr: oldValue})` per element (it reads new
  values from the DOM itself). Skip attributes whose old value equals the
  current value. `setAttribute` with an identical value still queues a
  record.
- **Attribute names:** a record gives `attributeName` (*local* name) and
  `attributeNamespace`, not the prefix. `ChangeElementCommand` uses
  `getAttribute(qualifiedName)`. So:
  - XLink/plain `href` → the `'#href'` pseudo-attribute (`ChangeElementCommand`
    handles it).
  - any other namespaced attribute (`se:fx`, `se:fx-d`, `se:taper`, …) →
    look up the prefix from the namespace using `core/namespaces.js` (`NS`)
    and the `se` prefix in `core/se-namespace.js`.
  - Test with an `se:` attribute that is *removed* during the transaction:
    the element no longer has it, so the prefix must come from the
    namespace map, not from `elem.attributes`.
- **childList:** records carry no "before" child order. For each parent
  touched, reconstruct the original `childNodes` by **replaying that
  parent's records in reverse** on an array copy of the current children:
  remove `addedNodes`, then re-insert `removedNodes` before `nextSibling`
  (fall back to after `previousSibling`, then to the end). Emit one new
  command per parent whose before/after differ:

  ```js
  // history.js
  export class ChildListCommand extends Command {
    constructor (parent, before /* Node[] */, after /* Node[] */, text)
    apply   → parent.replaceChildren(...this.after)
    unapply → parent.replaceChildren(...this.before)
    elements () → Elements in the symmetric difference of before/after (+ moved ones)
  }
  ```
  A node moved between parents appears in two `ChildListCommand`s. That's
  fine: `replaceChildren` adopts it, and the end state is the same in any
  order. Nodes added *and* removed inside the transaction cancel out
  naturally.
- **Teach `handleHistoryEvent` (`core/undo.js`) about `ChildListCommand`**,
  mirroring Insert/Remove/Move:
  - `identifyLayers()` when `cmd.parent === getSvgContent()`
  - `restoreRefElements(el)` for each element that becomes attached
  - `setUseData` for `use` elements
  - `call('changed', …)` is already generic

  Without this, layer lists and `<use>` references go stale after undo.
- **characterData / text-node childList** (typing inside `<text>`,
  `<title>`, tspans): **not supported in v1.** Text editing keeps its
  existing hand-recorded path. If such a record arrives inside a transaction,
  `logger.warn` with the transaction label and leave that mutation
  unrecorded. A test asserts that no existing caller triggers the warning.
  Proper support would map the change to a `'#text'` change on the owning
  `<text>`, which needs the pre-change text captured at begin. Add a
  techdebt entry.

**Nesting and existing recording code:**
- Nested `begin`/`transact` calls increment a depth counter. Only the
  outermost one observes and commits. An inner `cancel` marks the whole
  transaction for cancel (VectorCraft's cancelled undo group drops
  everything after it).
- **While a transaction is open, `undoMgr.addCommandToHistory` swallows
  incoming commands** (debug-log their text). The observer already captured
  their mutations, so pushing them as well would double-record. Wrap
  `UndoManager.addCommandToHistory` at init. Don't edit every caller. Then
  existing canvas methods (`cloneSelectedElements`, `groupSelectedElements`,
  `moveSelectedElements`, …) can be called inside a transaction unchanged.
- `undo()` / `redo()` while a transaction is open: **cancel it first**,
  then undo. Same rule as VectorCraft's `Interaction`.

**Commit / cancel side effects:**
- Commit pushes the batch with `addCommandToHistory`. Don't call
  `apply`: the DOM is already in the "after" state.
- Cancel calls `batch.unapply(null)`, passing **null as the handler** so
  undo's `clearSelection` / `changed` side effects don't fire mid-cancel.
  It then restores the selection captured at begin (`selectOnly`) and fires
  `call('changed', affectedElems)` once.
- Order of commands inside the batch: all `ChildListCommand`s first, then
  `ChangeElementCommand`s. `BatchCommand.unapply` runs in reverse, so
  attribute values are restored while elements are still attached, then
  structure is restored.

**Ephemeral nodes inside svgcontent:** anything the canvas appends *into
`#svgcontent`* that isn't document content (temporary preview shapes,
in-progress draw elements, overlays) would be recorded. Do an inventory
first. The selector group / path grips live in `#svgroot` outside
svgcontent (good). Candidates to check are smart-guide and frame-label
overlays (`ext-frame-labels` observes `svgroot`), live-effect previews, and
the shape-family draft element. Rule: ephemeral nodes go outside
`#svgcontent`, or carry `data-se-ephemeral` and the recorder skips any
record whose target or added/removed node has it (or has an ancestor with
it).

**The `<text>` x/y trap:** `handleHistoryEvent` shifts child tspans by the
text's x/y delta on undo/redo. If a transaction moves a `<text>` by
changing its `x`/`y` **and** its tspans' x/y (what `moveSelectedElements`
does), the recorder records both, and undo shifts the tspans twice. At
commit, when a `ChangeElementCommand` on a `<text>` includes `x` or `y`,
drop `x`/`y` from the commands on its direct tspan children (the handler
re-derives them). Cover this with a test: move text in a transaction, undo,
redo; tspan positions must match.

**Pilot users in this item:**
- Re-implement `live-effects.js` preview/cancel (`previewLiveEffects` /
  `cancelLiveEffectsPreview` ≈ line 441) on a transaction. Keep the
  exported API; only the internals change.
- Wrap `CommandRegistry.run` (T0.1) in `transact` if T0.1 has landed;
  otherwise leave a TODO in T0.1's row.

### Implementation notes (T0.2, done 2026-10-10)

Differences from the design above, found while building it:

- **`BatchCommand` fixed, not just bypassed** (added at the user's request).
  The legacy `BatchCommand` notified the history handler once per subcommand,
  so undoing N edits dispatched `changed` and cleared the selection N times:
  5,000 moved elements took **12.1 s** to undo, ≈99 % of it `call('changed')`.
  `BatchCommand.apply/unapply` now bracket their loop with the handler's
  optional `beginBatch()`/`endBatch()` (`BatchCommand.runBatched`); `undo.js`
  clears the selection once and fires **one** `changed` with the union of
  touched elements (**0.46 s** for the same case). Per-command structural side
  effects (`identifyLayers`, `restoreRefElements`, text shift, …) still run per
  command. `BatchCommand` stays as the container type (transactions produce
  one); *hand-built* batches are migrated to `transact()` opportunistically —
  see `roadmap.md` (standing guidelines).
- **Recording is snapshot-and-diff, not a MutationObserver** (the design above was built first and replaced).
  Two holes made the observer unfit: (1) Chromium never reports edits made through the SVG list APIs
  (`elem.transform.baseVal.appendItem(…)` — how the canvas moves things — not even after the attribute is read);
  (2) edits made to an element while it is *detached* (remove → modify → re-attach) are invisible, so undo
  restored the modified state (the fast-check property test found this). `begin` now snapshots every element's
  attributes, every text node's data and every parent's child list; `commit`/`cancel` diff that against the live
  drawing. No async record delivery, `takeRecords()`, replay or namespace-prefix lookup needed (`attr.name` is
  already qualified), and nothing is paid while the user drags. Cost: O(elements) at begin and commit
  (measured: ≈14 ms begin, ≈22 ms commit, 2 ms to mutate 5,000 elements; undo/redo ≈0.46 s).
- **`ChildListCommand` holds all parents' before/after lists in one command**
  (not one command per parent) and applies them in two phases (detach, then
  fill) so re-nesting groups can't hit a transient "insert ancestor into
  descendant" error. Text-node child changes *and* in-place text edits
  (`CharacterDataCommand`) are supported, so the "characterData not supported
  in v1" limitation in the design is gone.
- **Elements created during the transaction are recorded whole** with their parent's child list (their own
  attribute/text edits need no command), which also makes "add then remove" net out to `null`. A new container
  that adopted existing nodes (grouping) records its child list too, so redo refills it.
- **Pre-existing bug fixed on the way:** undoing/redoing *any* attribute change
  on a `<text>` with tspans wrote `x="NaN" y="NaN"` into the tspans
  (`undo.js` shifted them by `undefined - undefined`). Prevention is fixed and
  tested; already-saved drawings are repaired in the files by
  `scripts/repair-drawings.mjs` (no load-time sanitizer, by decision).
- **Live-effects pilot:** `apply/remove/expandLiveEffects` now run in
  `transact()`; the preview keeps its hidden-original + throwaway-clone design
  (the clone is marked `data-se-ephemeral`). Moving the preview onto
  begin/cancel would mutate the real element and re-select it on every param
  tick, which would rebuild the effects panel mid-edit.

### Performance
- A drag of a 5,000-element selection must not lag. Profile with the
  observer folding inline; one `Map` lookup per record is fine. Don't
  `takeRecords()` per move.
- `replaceChildren` on a layer with thousands of children re-attaches all of
  them on undo. Acceptable for v1. If profiling shows it's slow, add a
  minimal-diff apply (LIS-based move set) inside `ChildListCommand` with
  the same before/after contract.

### Tests
- `tests/unit/transaction.test.js` (jsdom supports MutationObserver):
  - Attribute change → one `ChangeElementCommand`; undo/redo restore.
    First-old-value wins across many changes. A no-op change produces no
    command, and commit returns `null`.
  - Namespaced attrs: `se:fx` set / changed / removed; `xlink:href` → `#href`.
  - Insert, remove, reorder, move between parents, add-then-remove (net
    zero): reverse-replay correctness, undo/redo exact (compare
    `outerHTML`).
  - Nesting, inner cancel, `transact` rethrow + rollback,
    `addCommandToHistory` swallowed inside, undo-while-open cancels.
  - Cancel restores DOM and selection and records nothing.
  - The `<text>` tspan double-shift case.
  - `ChildListCommand` side effects: layer added/removed →
    `identifyLayers`; `<use>` restored.
  - Ephemeral-node filter.
  - Property test (fast-check, see T0.4): a random sequence of DOM ops
    inside a transaction, then undo, gives byte-identical `outerHTML`; redo
    gives the post state.
- e2e: Escape during a pilot gesture restores the drawing; Ctrl+Z after
  commit is one step (`tests/e2e/undo-baseline.spec.js` style).

### Docs
`architecture.md` (core-module table: `transaction.js`; history notes:
`ChildListCommand`), `file-map.md`. Add a short "Recording undo" section to
`extensions.md`: new code should prefer `transact()` over hand-built
`BatchCommand`s. `techdebt.md`: characterData support, and the list of
remaining hand-rolled preview code to migrate.

### Acceptance
- Live-effects preview/cancel works on the transaction with no behaviour
  change (existing tests green).
- All `tests/unit` and e2e green. The property test runs ≥ 200 cases in CI
  in under 5 s.

---

## T0.3 — Tool contract (`registerTool`)

### Goal
New drawing/editing tools plug into the canvas through one interface, with
normalised doc-space pointer events and automatic undo transactions,
instead of adding cases to `event.js`'s mode `switch` or juggling
`runExtensions('mouseDown')` return values.

### VectorCraft source
`crates/tools/src/lib.rs` ≈ line 502: `trait Tool { id, pointer(cx, ev) →
actions, key(cx, key, mods), overlays(cx), cursor(cx, p, mods), options() →
JSON, set_option(k, v), busy(), transforming(), claims_key(cx, key),
wants_text(), text_input, ime_* }`. Tools emit Begin / Preview / Commit
actions. The engine turns those into an `Interaction` (T0.2's analogue). The
Control bar renders `options()` generically.

### svgedit today
- `packages/svgcanvas/core/event.js` (≈ 1,050 lines): `mouseMoveEvent`,
  `mouseUpEvent`, `mouseDownEvent`, each with a `switch
  (svgCanvas.getCurrentMode())` (≈ lines 90, 264, 859) delegating to
  `event-select.js`, `event-shape-draw.js`, `event-resize.js`,
  `event-rotate.js`, `event-path-edit.js`, `event-text-edit.js`,
  `event-zoom.js`. Both handlers are wrapped so a throw resets drag state
  (≈ lines 199, 629).
- Extension tools hook in through `svgCanvas.runExtensions('mouseDown' |
  'mouseMove' | 'mouseUp' | 'keyDown', payload, true)`. Hook names and
  payload typedefs are in `core/extension-hooks.js`; the dispatcher is
  `runExtensionsMethod` in `core/selection.js` ≈ line 269. Extension
  protocol: mouseDown returns `{started: true}` to claim the gesture;
  mouseUp returns `{keep, element, started}`, and if `!keep && element` the
  canvas removes the element and releases its id.
- **Inconsistent coordinate spaces in the payloads:** `mouseDown`'s
  `start_x/start_y` are **content units** (unzoomed, grid-snapped,
  `event.js` ≈ line 796), while `mouseMove`/`mouseUp`'s `mouse_x/mouse_y`
  are **zoomed** (`pt.x * zoom`, ≈ lines 69, 237, 673). Every extension
  tool divides by zoom in move/up but not in down; see
  `ext-shape-family.js` `mouseDown` / `mouseMove` ≈ lines 361–404. This is
  exactly the bug class a normalised contract removes.
- Touch is converted to synthetic `MouseEvent`s by `core/touch.js`, so the
  mouse pipeline is the single entry point. Keep it that way.

### What to build

**New module `packages/svgcanvas/core/tool-registry.js`**, initialised from
`svgcanvas.js`:

```js
svgCanvas.registerTool({
  id: 'spiral',                    // == the mode name passed to setMode()
  activate (ctx) {}, deactivate (ctx) {},         // on setMode in/out
  pointerDown (ctx, ev) {},        // return false to decline (falls through to the legacy pipeline)
  pointerMove (ctx, ev) {},        // also called with no button down (hover) if wantsHover: true
  pointerUp (ctx, ev) {},          // return 'cancel' to roll back instead of commit
  keyDown (ctx, ev) {},            // return true if handled (Escape is handled by the registry: cancel)
  cursor (ctx, ev) {},             // CSS cursor string
  options () {}, setOption (key, value) {},       // JSON tool options (future generic options bar)
  undoLabel: 'Draw spiral',
  wantsHover: false
})
svgCanvas.unregisterTool(id)
```

- `ev` (normalised): `{ x, y }` in **content (document) units, unzoomed**;
  `{ rawX, rawY }` before grid snap; `{ screenX, screenY }`; `mods: { shift,
  alt, ctrl, meta, mod }` (`mod` = platform command key); `button`;
  `event` (the original, for edge cases). One coordinate convention, the
  same as `start_x`.
- `ctx`: `{ canvas: svgCanvas, zoom, snap (pt) → pt` (grid + smart-guides
  snapping, so T2.1 lands in one place)`, addOverlay (el) /
  clearOverlays ()` (an overlay group **outside `#svgcontent`**, so T0.2
  never records it)`, transaction }`.
- **Dispatch:** in `mouseDownEventImpl` / `mouseMove…` / `mouseUpEventImpl`,
  *before* the mode `switch` and the `runExtensions` call: if a registered
  tool's id equals the current mode, call it and return. When `pointerDown`
  returns `false`, fall through to the existing code. Keep the existing
  try/catch reset behaviour. Also cancel the tool's open transaction when
  a handler throws.
- **Undo is automatic:** `pointerDown` (when not declined) opens
  `beginTransaction(undoLabel)`; `pointerUp` commits, or cancels on
  `'cancel'`. Escape during a gesture cancels it. `setMode()` to another
  mode mid-gesture cancels. Tools never touch `addCommandToHistory`.
- **Click vs drag:** provide `ev.dragDistance` (screen px from down) so
  tools stop re-implementing `DRAG_THRESHOLD`.
- **Ids/modes:** a registered tool's id is a mode string like `rect`.
  `setMode(id)` must accept it. The left-panel button stays a T0.1 command
  (`tool_<id>` → `setMode(id)`), and its id doesn't change.

**Pilot:** port **ext-shape-family** (T1.5) to `registerTool`. **But T1.5
is in progress with uncommitted work** (`git status`: `core/shape-family.js`,
`ext-shape-family/`). Don't start the port until T1.5 is committed and
its row says done. If T0.3 lands first, port `ext-polystar` instead. Either
way the pilot must keep behaviour identical. For shape-family the oracle is
`tests/unit/shape-family.test.js`, `ext-shape-family.test.js` and the
round-trip fixture `shape-family.svg`. **ext-polystar has no tests today**, so
if it's the pilot, write characterisation tests (unit + an e2e draw) against
the current behaviour *before* porting it.

**Not in scope:** converting `select`, `path`, `pathedit`, `textedit`,
`resize`, `rotate`, `zoom` or the built-in shape modes. They stay in the
`switch`. The legacy `mouseDown`/`mouseUp` extension hooks stay supported
(other consumers may use them); document `registerTool` as preferred for
new tools.

### Implementation notes (T0.3, done 2026-10-10)

- `core/tool-registry.js` as designed, minus `cursor()` and `options()/setOption()` (no consumer; see roadmap.md).
  Dispatch sites: `event.js` mouseDown (after the shared prelude, before the mode `switch`), mouseMove
  (before the `switch`; hover at the top), mouseUp (before the `switch`), `EditorStartup`'s keydown (before the
  extension `keyDown` hook), and `svgcanvas.js` `setMode` (cancels an open gesture, fires `activate/deactivate`).
- A tool that returns `{ created }` is finished by the registry like a drawn shape (opacity, `elementInserted`,
  `changed`, select it and leave the tool unless locked/Alt) minus the history entry, which the transaction
  already holds. `svgCanvas.finishCreatedElement(el)` does the same for shapes created outside a drag.
- `pointerDown` opens the transaction *before* calling the tool and cancels it if the tool declines, so a tool
  may mutate the drawing in `pointerDown`.
- Pilot ext-shape-family ported (T1.5 had been committed). Its unit test was rewritten against the tool
  contract; an e2e draws at 200 % zoom and checks one undo step / Escape. With grid snapping on, both drag ends
  now snap (before, only the start did).
- The overlay is an `<svg id="toolOverlay">` in `#svgroot` that copies `#svgcontent`'s box and viewBox, so
  overlay children are in document units.

### Pitfalls
- Grid snapping: today `start_x` is snapped but `realX` isn't (≈ lines
  794–806). Expose both (`x` snapped, `rawX` not). Tools like the pencil
  want raw input.
- `getStarted()` / `setStarted()` gate other behaviour (e.g. rubber-band).
  Set them exactly as an extension returning `{started: true}` would, or the
  legacy code below the dispatch misbehaves on the next event.
- When `mouseUp` follows an extension-drawn element, the canvas may
  auto-switch to select mode (≈ lines 340–360). A registered tool returns
  before that, so it decides itself whether to stay armed. Honour
  `getToolLocked()` (`hostApi.d.ts`) the way the built-in tools do.
- Multi-touch pinch: `touch.js` only synthesises single-pointer events.
  Don't add pointer-capture assumptions.

### Tests
- `tests/unit/tool-registry.test.js`: dispatch order (registered tool
  before switch/extension hooks), decline/fall-through, coordinates
  normalised at zoom ≠ 1 (assert `ev.x` identical across down/move/up for a
  stationary pointer at zoom 2), automatic transaction (one undo step per
  gesture), Escape cancels, mode switch mid-gesture cancels, throw cancels +
  resets.
- Pilot extension: existing unit tests unchanged plus an e2e draw at zoom
  200% (the old down/move coordinate mismatch would show up there).

### Docs
`tools.md` (new "Adding a canvas tool" section; `registerTool` preferred),
`extensions.md`, `architecture.md` (`tool-registry.js`; note on the event
dispatch order), `file-map.md`.

---

## T0.4 — Drawing invariants + command sweep (+ property tests)

### Goal
Catch corrupted drawings **before** they ship, not after users have saved
them. That's cheaper than repairing the saved files afterwards
(`scripts/repair-drawings.mjs`, per CLAUDE.md).

### VectorCraft source
- `crates/testkit/src/invariants.rs`: `check_document(doc)` (unique ids,
  tree-shape rules) and round-trip checks.
- `crates/engine/tests/command_sweep.rs`: runs commands with junk params
  and asserts no panic plus invariants.
- `crates/format/tests/prop_format.rs`: property tests.

### svgedit today
- (At the time of writing) load-time repairs in `core/legacy-repairs.js`
  (`sanitizeLegacyUndefinedDefs`, `sanitizeStackedTranslateTransforms`), called from `svg-exec.js`.
  Since moved into `scripts/repair-drawings.mjs`, run over the vault and deleted (2026-10-10).
- `tests/e2e/roundtrip.spec.js` asserts that load → save → load stabilises,
  for the fixtures in `tests/e2e/fixtures/roundtrip/`.
- No structural check runs after edits, and no test runs every action.

### What to build

**1. `packages/svgcanvas/core/drawing-invariants.js`**: pure DOM,
`checkDrawing(svgContent) → Array<{ code, message, id? }>`, empty when
healthy. Checks, each with its own `code`:
- `duplicate-id`: every `id` unique within svgcontent.
- `dangling-ref`: every `url(#x)` in `fill`, `stroke`, `filter`,
  `clip-path`, `mask`, `marker-start|mid|end` (attributes **and** inline
  `style`), and every `href` / `xlink:href="#x"` resolves to an element in
  the drawing.
- `stray-text-in-defs`: no non-whitespace text nodes directly in `<defs>`
  (the `undefined` corruption, see `sanitizeLegacyUndefinedDefs`).
- `layer-shape`: top-level children of svgcontent are layer `<g
  class="layer">` (plus `<defs>`, `<title>`, metadata), and each layer
  has its `<title>`.
- `bad-number`: no `NaN` / `undefined` / `Infinity` in geometry
  attributes (`x y width height cx cy r rx ry x1 y1 x2 y2 points d
  transform`).
- `se-attr-parse`: every `se:*` attribute owned by a registered live module
  parses with that module's parser (`se:fx` via live-effects, `se:taper`,
  `se:corner-radius`, …). Expose a small registry: modules call
  `registerAttrValidator(name, fn)` from their `init`, like
  `registerGeometryRemap`.
- `closed-subpath`: closed subpaths carry an explicit closing segment
  (techdebt.md › "Closed subpaths must carry an explicit closing lineto").
  Run it only on paths that have one of the live `se:` source attributes,
  where it matters.

**Baseline first:** run `checkDrawing` on every round-trip fixture before
wiring it into tests. Each finding is either (a) a real corruption, which
gets a narrow entry in `scripts/repair-drawings.mjs` + tests per
the CLAUDE.md rule, or (b) the check being wrong, so fix the check. Don't
add an allowlist to make findings go away.

**2. Wire it into e2e:** in `tests/e2e/fixtures.js`, an automatic
`afterEach` that evaluates `checkDrawing` on the page's svgcontent and fails
the test on findings. Opt-out per test via an annotation (e.g. a test that
deliberately loads a corrupt drawing *and* asserts on the corruption). After
a legacy-repair load, the drawing should be clean, so most repair tests
won't need the opt-out.

**3. Command sweep** (needs T0.1): `tests/e2e/command-sweep.spec.js`. For
each round-trip fixture × each command where `interactive !== true` and
there are no required params, enabled in that state:
1. Load the fixture, select a representative element (first element of each
   distinct tag, capped), and run the command.
2. Assert: no `CommandError` other than `disabled`, no logger `error`
   (attach a sink via `setLogSink`), `checkDrawing` clean.
3. Undo and assert `getSvgString()` equals the pre-command string. Redo,
   then undo again. Same string.

Cap runtime: shard by fixture, run with `test.describe.configure({ mode:
'parallel' })`. If the full product of fixtures × commands is too slow for
every CI run, run a deterministic subset in CI and the full sweep behind
an env flag (`SWEEP=full`).

**4. Property tests for pure geometry** (unit, fast): add `fast-check` and
`@fast-check/vitest` as devDependencies (check the current versions; 4.10.2
/ 0.5.0 on 2026-10-10). Start with invariants that already exist as
examples:
- `anchor-path.js`: `parseAnchors(anchorsToD(x))` ≡ x;
  `splitCubic` endpoints continuity.
- `bezier-fit.js`: fitted curve passes through the first/last sample;
  error ≤ tolerance.
- `warp.js`: bend 0 + distortion 0 is the identity.
- `corner-radius.js`: all kinds share their end points (VectorCraft
  `geom/src/corners.rs` tests).
- T0.2's undo property test lives here too.

Keep `numRuns` modest (100–200). Seed from an env var so a failure
reproduces.

### Implementation notes (T0.4, done 2026-10-10)

- `core/drawing-invariants.js` as designed, except: no `closed-subpath` rule (the node editor repairs `Z`-only
  subpaths on entry — it is not corruption) and a layer without `<title>` is **not** flagged (external SVGs have
  unnamed layers and load fine; found when the rule failed ten e2e specs that load hand-written SVG).
  All 18 round-trip fixtures are clean; the e2e `afterEach` flagged one genuine test bug (a hand-assigned
  duplicate id in `scenarios.spec.js`). `svgCanvas.checkDrawing()` exposes it.
- `tests/e2e/command-sweep.spec.js`: per fixture × representative element × every enabled non-interactive command:
  no error, healthy drawing, undo/redo exact. It compares a *canonical* snapshot (attribute order, layer
  `pointer-events`, `data-fx` filter regions ignored) and never calls `getSvgString()` (which purges `<defs>`).
  ~12 s for all 18 fixtures; `SWEEP=full` runs up to 8 elements each. `KNOWN_ISSUES` lists tolerated, documented
  failures and fails when one stops reproducing.
- What the sweep found and what was fixed is in `techdebt.md` › Tier 0 follow-ups.
- Property tests: `tests/unit/properties/` (anchor-path, bezier-fit, warp, corner-radius, transaction undo) with
  plain `fast-check` (`@fast-check/vitest` needs vitest ≥ 4.1). One generator bug and one real finding came out of
  them: the transaction recorder initially used a MutationObserver and lost edits made to a *detached* element.

### Pitfalls
- Some drawings legitimately reference ids outside the drawing (an
  `<image href="https://…">`, or an Obsidian vault link). Only `#fragment`
  refs are checked.
- Elements in `<defs>` referenced only by other defs (gradient `href`
  chains) are fine. Don't flag "unused defs"; that isn't corruption.
- Running the checker inside `setSvgString()` in production is **not**
  part of this item (cost and noise). If a check proves cheap and the
  corruption it catches is common, add a narrow repair for it instead.

### Docs
`architecture.md` / `file-map.md` (`drawing-invariants.js`). CLAUDE.md
"Data-corruption bug fixes" section: add "add a `checkDrawing` rule for the
pattern too". README rule 5 gains "and `checkDrawing` must stay clean".

### Acceptance
- Every e2e spec runs the invariant `afterEach`, with zero opt-outs except
  documented ones.
- The command sweep runs in CI (subset at least) and is green.
- At least 4 property-test files, green and fast (< 5 s total).

---

## T0.5 — Automation API (inspect + doc-space pointer)

### Goal
Agents and e2e specs drive the editor through a stable, documented in-page
API in **document coordinates**, instead of the workarounds documented in
CLAUDE.md:
- "derive the content origin from `#svgroot` + `#svgcontent` x/y"
- "toolbar buttons are off-screen, use JS clicks"
- "drawing via mouse drag is fragile"

### VectorCraft source
`docs/control-protocol.md` and `crates/ui-egui/src/control.rs`:
`engine.commands`, `document.inspect {depth?, childLimit?}`, `ui.inspect`
(tool, view, canvas rect, …), `ui.pointer {events: [{kind:
down|drag|up|move|doubleclick, x, y, space: "doc"|"screen", mods}]}`,
`ui.key`, `ui.text`, `ui.dialog.*`.

### What to build
`src/editor/automation.js`, exposed as `editor.automation` (and so as
`window.svgEditor.automation` for Playwright):

```js
automation.inspect ({ depth = 2 } = {}) → {
  mode, zoom, toolLocked,
  selection: [{ id, tag, bbox }],               // bbox in doc units
  layers: [{ name, visible, locked, current, childCount }],
  undo: { size, redo, next: getNextUndoCommandText() },
  canvas: { width, height }, viewport: { scrollX, scrollY },
  openDialog: <tag name or null>
}
automation.pointer ([{ kind: 'down'|'move'|'up'|'click'|'dblclick'|'drag',
                       x, y, to?: {x, y}, steps?: 10,
                       space: 'doc'|'screen', mods? }])
automation.key (combo)                          // 'mod+d', 'escape' — through the HotkeyManager path
automation.commands                             // === editor.commands (T0.1)
```

- `pointer` with `space: 'doc'` maps through the **same** formula CLAUDE.md
  documents. Put that formula in one helper and call it from here; don't
  duplicate it: `#svgroot` rect + `#svgcontent` x/y attrs, `client =
  origin + doc * zoom`. Dispatch real `MouseEvent`s
  (`mousedown`/`mousemove`/`mouseup`, `bubbles: true`, correct `buttons`)
  on the element under the point (`elementFromPoint`, falling back to
  `#svgcanvas`). Scroll the workarea so the point is visible first (the
  "off-screen" problem).
- `drag` expands into down + `steps` moves + up.
- Read-only `inspect` and the pointer driver are safe to ship in
  production builds: in-page only, no network.

**Then:** rewrite `tests/e2e/helpers.js` `clickCanvas` / `dragOnCanvas` on
top of `automation.pointer`, and update CLAUDE.md's Playwright sections
(Coordinate mapping, Toolbar tools off-screen, Creating elements) to point
at the API, keeping the raw formula as background.

### Implementation notes (T0.5, done 2026-10-10)

`src/editor/automation.js` as designed. `pointer` resolves coordinates once per gesture (the canvas keeps the
root CTM from `mousedown`, so scrolling mid-drag would skew the move events) and scrolls the point into view
first. `tests/e2e/helpers.js` `clickCanvas`/`dragOnCanvas` are rebuilt on it (same svgroot-relative screen
coordinates), plus a new document-space `dragInDocument`; CLAUDE.md's Playwright section points at the API.
Note `ctrl+z` in the editor means the *platform* command key (⌘ on macOS): use `ControlOrMeta+z` in Playwright.
`hostApi.d.ts` does not expose `automation` (only `commands`).

### Tests
- Unit: doc → client mapping at zoom 0.5/1/2 with scroll offsets
  (jsdom-mocked rects).
- e2e (`tests/e2e/automation.spec.js`): draw a rect with `pointer` drag at
  zoom 1 and 2 and assert its doc-space bbox; `inspect()` reflects
  selection/undo; `key('mod+d')` duplicates.

### Docs
CLAUDE.md (Playwright sections), `architecture.md`, `file-map.md`.
Optional: `hostApi.d.ts` gains `automation` if the plugin wants it for its
own tests.

---

## T0.6 — Layering guard (`scripts/check-layers.mjs`)

### Goal
Keep the canvas engine independent of the editor UI, the way `cargo xtask
layers` enforces VectorCraft's crate layering. Today the boundary holds
(verified 2026-10-10: nothing under `packages/svgcanvas/` imports from
`src/editor`; the only `svgEditor` mention is a comment in `core/undo.js`).
This item keeps it that way.

### Implementation notes (T0.6, done 2026-10-10)

As designed; `findLayerViolations()` is exported so the unit test exercises the matcher. Also handles
`import()`/`require()` and block comments. Wired into `pretest`.

### What to build
- `scripts/check-layers.mjs`, same style as `scripts/check-dom-scope.mjs`
  (the project lints with `standard`, which has no pluggable rules, so a
  grep-based script is the convention). Fail on:
  - any `import … from` under `packages/svgcanvas/**` that resolves into
    `src/editor/**`
  - `window.svgEditor` / `svgEditor.` / `/* globals svgEditor */` in
    `packages/svgcanvas/**` (comments excluded)
  - `customElements.define` or `se-` element creation inside
    `packages/svgcanvas/**`
- Add it to `package.json` → `pretest` next to `check-dom-scope`.
- Allowlist with documented reasons only (start empty).

### Tests
A unit test that runs the checker's matcher on small fixture strings (a
violating import, a comment mentioning svgEditor, a clean file).

### Docs
`architecture.md` (one line under the packages/editor split), CLAUDE.md
"Key source locations" or the Playwright/test section where `npm test`'s
gates are listed.


## Status update (2026-10-10)
- T0.1: complete for commands - panel, main-menu and extension buttons register real commands (`panelCommands.js`, `registerModeCommand`); `layer_moreopts` remains an adapter (menu anchor). Enablement now reflects context (path editor open, text selected, stroke/fill gating); calling handlers directly exposed errors that click listeners had been swallowing.
- T0.3: complete for standalone tools - shape-family, brush (new `keepOpacity` flag), panning, eyedropper, cutter (`wantsHover`, `deactivate`), polystar, shapes, curvature and shape-builder run on `registerTool`. Puppet-warp (session across gestures) and connector (augments built-in modes) stay on the legacy hooks on purpose; see `.claude/techdebt.md`.
- Known issues from T0.4: all fixed; the sweep's `KNOWN_ISSUES` is empty.
