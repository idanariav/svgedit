# R9 plan: a gesture owns its state

Plan for `.claude/roadmap/rearchitecture.md` › R9 (written 2026-11-24). Status: **steps 0–3 done** (2026-11-24); step 4 (move and marquee) next.

## The problem, measured

- **Per-gesture state lives in 18 of the 21 fields of `GestureState`** (`core/gesture-state.ts`), plus canvas slots:
  - `startTransform`, `started`, `startX/Y`, `rStartX/Y`, `rubberBox`, `justSelected`, `initBbox`, `pendingMoveDelta` and
    `smartSnapTargets`;
  - module `let`s: `event-rotate.ts` `startTransforms` and `event-shape-draw.ts`'s pencil and text-box state.
- **All of it is reset by hand.** The writes are spread over `event.ts`, `event-select.ts`, `event-resize.ts` and
  `event-rotate.ts`. `mouseUpEvent`'s `catch` alone makes ten resets. Two kinds of exit reset some fields and not others:
  - an early `return` (the select / resize cases, a right-button release, `toolPointerUp`);
  - a gesture that never ends, such as a missed mouseup or a mode switch mid-drag.
- **`startTransform` is a shared slot read deep inside the code.** `recalculate.ts:317` reads it as the undo "before" value.
  - `selected-elem.ts` and `scratch-bake.ts` save it, overwrite it and restore it around their own calls.
  - `event-select.ts:498` sets it once per element, inside the multi-select loop.
  - That is how multi-select drags got the wrong undo transform.
- **Built-in gestures have no cancel.** Escape and mode switches roll back only registered tools (`transaction.ts:221` →
  `cancelToolGesture`). A built-in move, resize or rotate in progress is never rolled back.
- **Undo is recorded three ways:**
  - move and rotate build a `BatchCommand` by hand (`event-select.ts:412`, `event-rotate.ts:162`);
  - area-text resize uses a transaction;
  - plain resize uses `recalculateDimensions` commands.
- **Bugs of this class:**
  - e6f50f31: `groupResizeStart` outlived its gesture.
  - 8364dc73, and the background-click fix: a stale tracked path opened node edit.
  - The start-transform slot gave multi-select drags the wrong undo transform.
  - Ghost and stale grips.
- **Readers outside core** (2026-11-24): only `gesture.spaceKey` (EditorStartup) and `gesture.addedNew` (topPanelContext).
  - Neither is per-gesture state.
  - No extension reads a per-gesture field, and `getStartTransform` and `getRubberBox` have no outside caller.
  - So the change stays inside `packages/svgcanvas`.

## Prior art (web search 2026-11-24, VectorCraft)

- **VectorCraft `crates/tools/src/select.rs`.** `SelectionTool { state: State }` is one enum:
  - `Idle`, `Moving { start, began, deselect, key }`, `Scaling { handle, bx, areas }`, `Rotating { center, start }`,
    `Marquee { … }`, `Corner(…)`, …
  - A press assigns one variant, and a release or cancel sets it back to `Idle`.
  - State of another gesture can't be read by accident, because it is not there.
- **tldraw.** Tool states implement `onPointerUp`, `onComplete`, `onCancel` and `onInterrupt` separately: interrupt is a
  focus loss or tool change, cancel is Escape.
- **UIKit gesture recognizers.** `began → changed → ended | cancelled`, with an explicit `reset()`.
- **Ink & Switch.** Per-gesture state is "created when the gesture begins, and cleaned up when the gesture ends". Make that
  automatic, or every gesture pays the setup cost.
- **Pointer Events pitfalls.**
  - A gesture that ends only on `pointerup` gets stuck:
    - the browser can cancel on its own (`pointercancel`, `lostpointercapture`, a native drag start);
    - a release outside the window or iframe never arrives;
    - a context menu swallows the up.
  - End the gesture on all of these, and begin one only on the primary button.
  - svgedit gets mouse events (touch goes through `core/touch.js`), so for us the cases are: a missed mouseup, window `blur`,
    the context menu, a new press while a gesture is active, and a mode switch.

## Target

```ts
// core/gesture-state.ts
type ActiveGesture =
  | { kind: 'move', start: Pt, began: boolean, clone: boolean, plan: DragPlan | null, startTransforms: Map<Element, string>, clickSelect: Element | null, … }
  | { kind: 'resize', grip: string, startBox: BBox, groupStart: Map<Element, SVGMatrix> | null, … }
  | { kind: 'areaResize', … }
  | { kind: 'rotate', center: Pt, groupStart: Map<Element, SVGMatrix> | null, plan: …, … }
  | { kind: 'marquee', start: Pt, box: SVGRectElement, justSelected: Element | null }
  | { kind: 'pathNode', … }   // a node or control-point drag inside pathedit

interface Gesture {
  kind: ActiveGesture['kind']
  state: ActiveGesture        // only the fields of this kind
  tx: Transaction             // opened at the press: one undo step, or none
  pointer: number             // the button that began it
}
svgCanvas.gesture.active: Gesture | null
```

### One lifecycle: `core/gesture-session.ts` (new)

The pattern is lifted out of `tool-registry.ts` (`gesture`, `cancelGesture`, `toolPointerUp`) and used by both the
registry and the built-in gestures:

- **`begin(kind, state, label)`** opens the transaction and sets `active`.
  - If a gesture is already active (a missed mouseup), it cancels that one first, as `toolPointerDown` already does.
- **`commit()`** commits the transaction. **`cancel(why)`** rolls it back and calls the gesture's own `cancel` (grips,
  overlays).
  - Both end by setting `active = null` in a `finally`.
- **The exits that end a gesture:**
  - mouseup (the `finally` of `mouseUpEvent`, before any early `return`);
  - Escape (`transaction.ts` calls `cancelGesture`, now generic);
  - `setMode`;
  - window `blur` or `visibilitychange: hidden`;
  - `contextmenu`;
  - a handler throwing;
  - `destroy`.
- **Debug log.** It logs `gesture { kind, phase: begin | commit | cancel, why }`, so `debug-log.md` can retrace a stuck
  gesture.

The built-in select / resize / rotate / path-edit modes stay in `event.ts`. They are **not** re-registered through
`registerTool`. That would change the dispatch order against the extension hooks (`gestureStarted / Moved / Released`, which
the connector uses) and the legacy `mouseDown` override chain, and R10 will rework that chain anyway. They share the
lifecycle, not the registration.

### Rules after R9 (go into `roadmap.md`'s guidelines)

- A gesture's state lives on its `Gesture` variant and nowhere else: no new `GestureState` field, canvas slot or module
  `let`.
- A gesture records its undo through its session's transaction: no `BatchCommand` or `addCommandToHistory` in an `event-*`
  file.
- Values that belong to a single call are passed as arguments, not parked on the canvas (`startTransform`).

### What is not per-gesture, and stays

- **`spaceKey`:** a key being held.
- **`addedNew`:** the panel's "keep this style" offer, which lasts until the next selection.
- **`pendingNewElement`:** the deferred selection of a just-created element.
- These move to a small `svgCanvas.session` object (or stay on `gesture` and are renamed), so `gesture` holds gesture state
  only.
- **The tracked path of node edit (`pathActions`' `path`)** belongs to a *mode session* that spans many gestures. It is
  created on entering `pathedit` and dropped on leaving it, or when its element leaves the drawing. It becomes the pathedit
  mode's `activate / deactivate`, mirroring `ToolDef.activate / deactivate`.
- **Shape-draw modes** (`started`, `controllPoint`, `freehand`, the pencil `let`s) are **out of scope**: they turn into
  registered tools under R4. They do get the end-of-gesture guarantee, through the session's exits.

## Steps (one commit each, full suite green between)

### 0. The guard first

- **A rest check.** Add `gestureAtRest(canvas)`: no `active` gesture, `started === false`, no rubber box, no pending move,
  and every remaining legacy field at its initial value. `tests/e2e/fixtures.js` asserts it in the automatic `afterEach`,
  next to `checkDrawing`, with an opt-out annotation like `allow-corrupt-drawing`.
  - It is the `pending()` of R8 for this bug class. A test that leaves a gesture half-done fails, whatever the mode.
- **Characterisation e2e** (`tests/e2e/gesture-lifecycle.spec.js`). For each of move, multi-move, alt-clone, resize, group
  resize, area-text resize, rotate, group rotate, marquee and node drag:
  1. Press, move, then Escape. The drawing is unchanged, there is no new undo step, and the gesture is at rest.
  2. Press, move, then switch the mode (`commands.run('tool_rect')`). Same result.
  3. Press, move, then press again without a release. The first gesture is rolled back and the second works.
  4. Press, move, then fire window `blur`. The gesture is rolled back.
  5. Complete the gesture once, then do it again on other elements. The second gesture reads nothing from the first, which is
     the e6f50f31 regression.
  - Most of 1–4 fail today, and they are the acceptance tests. Mark them `test.fail()` until their step lands.
  - The rest check finds which existing tests already leave state behind. Fix the ones that are real bugs, and annotate
    setup-only cases.

**Done (2026-11-24).**
- **The rest check** is `svgCanvas.gestureLeftovers()` (`core/gesture-state.ts`), asserted after every e2e test in
  `tests/e2e/fixtures.js`.
- **Leaks it found in the existing suite** (26 tests), now on the fixture's `KNOWN_GESTURE_LEAKS` list, which only shrinks:
  - `startTransform`, in 17 tests: set on every press, but the select and resize releases return before the reset. Step 5
    removes it.
  - `hasResizeStartTransform` and `resizeStartBox`, in 9 tests: never reset after a resize. Step 3 removes them.
- **Two tests end mid-session on purpose** and carry the opt-out annotation: a pen path still being drawn, and puppet
  warp's cross-gesture transaction.
- **`tests/e2e/gesture-lifecycle.spec.js`** has 52 cases: 15 pass and 37 are `test.fail()` with the step that fixes each.
- **What the first run showed:**
  - no built-in gesture has any exit but its release, so Escape, a mode switch, a second press and a lost focus all leave
    the drag applied, and the release commits it;
  - Alt-drag records the clone and the move as two steps, so one undo leaves the clone hidden on its original (step 4);
  - a mode switch mid-marquee leaves the rubber band on screen (step 4).

### 1. The session (`gesture-session.ts`) and the exits

- `tool-registry.ts` moves onto it, with no behaviour change: the registry tests stay green as they are.
- `mouseUpEvent` gets a `finally` that ends the session. Its `catch` block of ten resets goes. Wire in Escape, `setMode`,
  `blur`, `contextmenu` and destroy.
- Unit tests in `tests/unit/gesture-session.test.js`:
  - begin then commit is one step;
  - cancel rolls back;
  - a second begin cancels the first;
  - a throwing handler cancels;
  - every exit ends the gesture.

**Done (2026-11-24).**
- **`core/gesture-session.ts`** (`beginGesture`, `activeGesture`, `cancelGesture`) carries the registry's gestures:
  - the gesture's kind is `tool:<id>`;
  - its state is the tool and the press;
  - the registry's own blur listener, `NO_TRANSACTION` and `cancelToolGesture` are gone (callers now use
    `cancelGesture(why)`).
- **Exits it owns:** Escape, mode switch, undo / redo, a new press, blur and a hidden page, a context menu, destroy, a throw
  in `mouseUpEvent`, and a release that did not commit.
- **What changed in behaviour for registered tools:** a context menu or a hidden page now rolls their gesture back, and so
  does a release whose `pointerUp` never ran.
- **Debug log:** `tool-gesture` is now `gesture { kind, phase, why }`.
- `mouseUpEvent`'s ten hand resets stay until their fields move (steps 2–5); it now also cancels the session.
- The rest check names an active gesture.

### 2. Rotate

- **Why first:** it is the smallest gesture, and it shows the shape of the migration.
- **What moves** into the `rotate` variant:
  - `groupRotateCenter`, `groupRotateStart` and `groupRotateBBox`;
  - `rotationPlan`, `groupRotationPlan` and `rotationShown`;
  - `event-rotate.ts`'s module `startTransforms`.
- The hand-built `BatchCommand` becomes the session's transaction. Keep the undo label.
- Escape mid-rotate now rolls back, so those acceptance tests turn green.

**Done (2026-11-24).**
- **The `rotate` gesture's state** lives on the gesture (`RotateState` in `event-rotate.ts`). Gone from `GestureState`:
  `groupRotateCenter`, `groupRotateStart`, `groupRotateBBox`, `rotationPlan`, `groupRotationPlan`, `rotationShown`, and the
  module's `startTransforms`.
- **Undo:** the session's transaction (`Rotate`) replaces `beginUndoableChange` / `finishUndoableChange` and the
  hand-added batch.
- **`onCancel`** puts the mode back to select, clears `started` and refreshes the selection boxes.
- **`mouseDownEventImpl` now starts with `cancelGesture('new press')`,** so a press that follows a lost release sees the
  drawing as it was.
- **Found on the way:**
  - The shared press prelude merges an element's transform list into one matrix *before* the gesture begins, so that DOM
    write is outside the gesture's transaction (it folds into the previous state). It doesn't change how the element looks
    and it isn't new. Step 4 begins the gesture at the press, before the prelude.
  - A preview open at cancel time is closed by the session (step 1's last change).

### 3. Resize, plain and area text

- **What moves** into the `resize` and `areaResize` variants: `resizeStartBox`, `hasResizeStartTransform`,
  `groupResizeStart`, `areaResize` (its own transaction folds into the session's) and `initBbox`.
- `bakeStrokeScale` stays an argument-like value. It becomes a parameter of `recalculateDimensions` in step 5.

**Done (2026-11-24).**
- **The `resize` gesture's state** lives on the gesture (`ResizeState` in `event-resize.ts`). Gone from `GestureState` and
  the canvas:
  - `resizeStartBox`, `hasResizeStartTransform`, `groupResizeStart`, `areaResize` (and its `AreaResize` type);
  - the canvas `initBbox` slot (`getInitBbox` / `setInitBbox`).
- **Area text:** its own transaction is gone. It is the gesture's, labelled `Resize text box`, and decided at the press.
- **Labels:** the gesture is relabelled `Stretch` when an Alt-stretch begins (`gesture.relabel`, a new
  `Transaction.relabel`). A plain resize keeps today's label, `position`.
- **The release** (`event.ts`) detaches the gesture, runs the shared release body (`event-select.ts` `up`), then commits it,
  so the body's bake is the gesture's one step. The stale-session guards in `down` are gone, because a new press now rolls
  the stale gesture back.
- **Still on the legacy fields:** `dragPlan` and `dragStartTransforms`, which the shared release body reads, and which move
  with step 4. `onCancel` resets them by hand until then.
- The fixture's two resize leak entries are gone.

### 4. Move and marquee: the biggest step

- **`move` takes:** `dragStartTransforms`, `hasDragStartTransform`, `dragPlan`, `dragStartBBox`, `altCloneArmed`,
  `moveSelectionThresholdReached`, `clickSelect`, `pendingMoveDelta` and `smartSnapTargets`.
- **`marquee` takes:** `rubberBox` (the element stays, hidden; the gesture holds the live state), `rStartX/Y` and
  `justSelected`.
- **Undo:** `BatchCommand('position')` becomes the session's transaction.
- **Click versus drag.** Moving `moveSelectionThresholdReached` onto the gesture is where R10's single click-versus-drag
  classifier will later plug in. Here only the field moves; the thresholds stay as they are.
- **Re-check** the R8 sweep guard and the `drag that went nowhere` cases. A move that changes nothing must still record no
  step: the transaction commits nothing.

### 5. `startTransform` becomes an argument

- `recalculateDimensions(elem, { startTransform, bakeStrokeScale })`.
- The save, overwrite and restore dance in `selected-elem.ts:115` and `scratch-bake.ts:29` goes, as does the per-element
  `setStartTransform` in the multi-select loop.
- `getStartTransform` and `setStartTransform` are removed from `SvgCanvas`.
  - Check `hostApi.d.ts` and the plugin first: no outside caller today.
  - `check-canvas-calls` catches any that remain.

### 6. Path edit

- **`pathNode` gesture:** a node or control-point drag. Its `startX/Y` and the drag flag move into it.
- **The tracked path:** `pathActions`' `path` becomes the pathedit mode session's.
  - It is set on `pathedit`'s activate and cleared on deactivate.
  - It is also dropped when its element leaves the drawing, by a `documentChanged` check that the element is still
    connected. This is 8364dc73 and the background-click fix, structurally.

### 7. Cleanup and docs

- **Delete the emptied fields.** `GestureState` keeps `active` plus the non-gesture fields, or the non-gesture fields move to
  `session`. Deleting the fields is the ratchet: no write site can compile.
- **Docs:**
  - `architecture.md`: the gesture lifecycle, next to the undo rules;
  - `tools.md`;
  - `debug-log.md`: the `gesture` event;
  - `roadmap.md`: the guideline above;
  - `rearchitecture.md` › R9 status;
  - `techdebt.md`: remove the entries this closes.
- `npm run file-map` for the new file.

### Plugin side (separate, small)

The double teardown on close (`onClose` + `onunload`) is the same bug at the view level. Give the view an idempotent
`dispose()` that both call. It goes in `../obsidian-svgedit-plugin`, with its own test, and is independent of the steps above.

## Risks and how each step checks them

- **Undo shape changes** (a `BatchCommand` becoming a transaction, which is a snapshot step).
  - Labels must stay. A gesture that changes nothing must record nothing.
  - The command sweep and `undo-*.spec` cover it. Add an assertion per migrated gesture: one step, the right label,
    undo restores the drawing exactly.
- **The connector and other `gestureStarted / Moved / Released` listeners** must still see the same events in the same order.
  Keep the event calls where they are; only state moves. `ext-connector` tests must pass unchanged.
- **Live preview through the model** (`dragPlan`, `rotationPlan`). The plans move with their gesture, unchanged. A cancel must
  also clear the preview the renderer shows; rolling back the transaction already does this for registered tools.
- **Tablet mode / touch** (`core/touch.js`). The synthetic events go through the same handlers. Run the touch e2e specs at
  each step.
- **Size:** L, about 8 commits. Each step is shippable on its own: the remaining legacy fields keep working until their step.

## Out of scope (later items)

- **R10:** one click-versus-drag classifier, shared tolerance constants, one ranked target resolver for `mouseDown`.
- **R4:** the shape-draw modes as registered tools.
- **R12:** the placement and frame math inside the gestures.
