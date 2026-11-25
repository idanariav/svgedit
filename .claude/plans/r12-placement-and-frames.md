# R12 — One placement policy, one set of coordinate frames

Status: steps 1–3 done (2026-11-25); resize on the policy is the follow-up. Roadmap: `.claude/roadmap/rearchitecture.md` › R12.

## Why

Where an element's placement lives (its attributes, or its `transform`; a group only in its transform; a rotation kept as
`rotate(a cx cy)` or collapsed into a matrix) is decided in copies: the drag's model plan (`dragPlan` / `previewDrag` in
`model-commands.ts`), nudge (`translationEdit`, then a DOM fallback through `recalculateDimensions` with a group
consolidation copied from the drag release in `event-select.ts`), `recalculateDimensions` itself, and `affineEdit`. Bugs
came from the copies disagreeing (efd2f3be, a font size going to ~0 after a rotation was collapsed). The press prelude in
`event.ts` collapses the transform list of whatever is pressed into one matrix, in every mode, view-only included, outside
any gesture's step. Coordinate frames are numbers each tool converts on its own (61569a3b, a2101f3b, 478dd235), in three
matrix types (the model's `Matrix6`, `gradient-edit`'s `{a…f}`, the browser's `SVGMatrix`).

## Web search (2026-11-25)

- Keep a rotation as a value rather than baking or collapsing it; a bake leaves parent transforms in place (Blender's Apply
  and delta transforms, Babylon's bake leaving the pivot): the policy bakes only what is axis-aligned and keeps
  `rotate(a cx cy)` as a term.
- `getScreenCTM` differs across nested `<svg>` / `viewBox` and transformed ancestors: convert relative to the content
  root's matrix (as `toolSpace.ts` already does), and test every conversion with a round trip of a known point.

## Steps

1. **`core/placement.ts`, the policy.** `planPlacement(el)` says how an element's placement is written (`own`: an
   axis-aligned map baked into its geometry; `turned`: `rotate(a cx cy)` kept as a term, the geometry or a group's rest
   moved; `matrix`: one matrix in front, geometry untouched; `scratch`: baked on a copy at the end) and `moveEdit(node,
   placement, dx, dy)` the attributes a move writes. `dragPlan` and `previewDrag` become calls of it; **nudge** states every
   planned element's move on the model through it, so its DOM fallback (and the consolidation copied from the drag release)
   is left only for what has no plan. → unit tests of the policy table, the drag and nudge specs.
2. **No consolidation at the press.** The prelude's collapse moves to where a DOM drag or a resize actually begins (the
   dummy translate is inserted), so a click, a pan or a press in view-only writes nothing. → an e2e press in each mode
   leaves the `transform` attribute as it was; the techdebt entry goes.
3. **`core/frames.ts`, the frames.** `toolSpace.ts` moves into the engine on `Matrix6` (`rootMatrix`, `screenToDoc`,
   `docToScreen`, `localToDoc`, `docToLocal`, `parentToDoc`), and the tools and `framedTarget.ts` use it; `toolSpace.ts`
   re-exports for the editor. → round-trip unit tests, the tool specs.
4. Docs: `architecture.md`, `rearchitecture.md` status, `techdebt.md`, `extensions.md` / `tools.md` for the tool guidance.

## Out of scope

`recalculateDimensions`' own resize decisions (a 576-line DOM path behind the grid-snapped drag and resize): step 1 leaves
it as the fallback; moving resize onto the policy is the follow-up, with grid snapping stated on the model.
