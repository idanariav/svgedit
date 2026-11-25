# R11 — The editor's own state stays out of the drawing

Status: done (2026-11-25), previews excepted. Roadmap: `.claude/roadmap/rearchitecture.md` › R11.

## Why

The editor kept interaction state on drawing elements: a `pointer-events` style on every layer and on everything it created
or loaded, `opacity="0.33"` plus a replaced `style` on the siblings of the group being edited, an inline `opacity` on the
layers Layer mode fades. Readers compensated: the serializer and the snapshot model stripped a leading `pointer-events`,
serializing and every snapshot read or patch ran inside `withContextUndimmed`, and a select release wiped `style` off the
selected element and its descendants. Each compensation missed a case (5a3d78d6, the lost mask feather).

## What

1. `core/interaction-style.ts`: one `<style>` per canvas in the svg root, scoped by `data-se-canvas`, holding marks (name,
   element provider, declarations), each element selected by its `:nth-child` path from `#svgcontent`. Rebuilt on structural
   changes (`MutationObserver`), loads, `setCurrentGroup` and `svgedit:layeractivation`.
2. Layers: `Layer.activate()` / `deactivate()` set a flag; `Drawing.refreshLayerPointerEvents` raises the event.
3. Dimming: the `context-dim` mark over `contextSiblings(currentGroup)`; `suspendContextDimming` suspends it;
   `withContextUndimmed`, the snapshot target's `undimmed`, and the `orig_*` bookkeeping go.
4. The stamps, the release's `style` wipe and `withoutEditorState` go; `releasePreviewPointer` takes a drawn shape's
   preview `pointer-events: none` off when it is finished.
5. ext-layer_view's fade becomes the `layer-view-dim` mark.
6. checkDrawing `editor-pointer-events` and the repair entry of the same name.

## Not done

Previews as `data-se-ephemeral` nodes in the layers, a live-effect session's `visibility="hidden"`, Layer mode's locks (see
`techdebt.md`).
