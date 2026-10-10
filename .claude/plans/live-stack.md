# Live stack: corners → effects → width (roadmap item 15)

Status: built (corners + width, effects + width). Written after T2.6 (width profiles), which made `se:taper-d` the one
centerline of the whole stroke-outline family.

## Today

Three features each cache the geometry they started from in an `se:` attribute, write their result to `d`, and
refuse to run when another one's attribute is present (`canRoundCorners`, `canApplyLiveEffect`, `canTaperStroke`,
`canWidthStroke`):

| Stage | Source attr | Params | Output |
|---|---|---|---|
| Corners | `se:orig-d` | `se:corner-radius` | `d` (SVG arcs at the cut corners) |
| Effects | `se:fx-d` | `se:fx` | `d` (`M/L/C/Z`) |
| Width | `se:taper-d` | `se:width-profile` / `se:taper`, `se:taper-style` | `d` (filled outline), `fill` = the paint, `stroke="none"` |

Arrow alignment (`se:arrow-d`) is a fourth, separate source; `LIVE_ATTRS` lists all four so pen/smooth/join skip them.

## What is worth stacking

VectorCraft and Illustrator order these as geometry first, stroke last: **corners → effects → stroke width**.
Not every pair is worth building:

- **corners + width**: yes, but only for unfilled shapes (the width stage turns the stroke into the fill; it already
  refuses a filled path). A rounded rectangle outline with a variable stroke.
- **effects + width**: yes (Roughen / Zig Zag / Tweak with a tapered brush look). Not with Scribble: it already
  paints its output as a stroke (`se:fx-style`), which collides with the width stage's own paint juggling.
- **corners + effects**: low value. The Round Corners *effect* covers it, and the cut corners are SVG arcs that
  effects would first have to convert. Allowed by the model, but not a reason to build.
- **arrow alignment + width**: no. Markers are drawn at the vertices of the element's own `d`; a filled outline
  polygon would put them on its outline, not on the stroke's ends. Stays exclusive (a width profile drops the
  alignment, as now).

## Model

One ordered chain; each active stage is the one whose source attribute is present.

1. The **root** is the earliest active stage; its source attribute is the only authoritative geometry.
2. Every later stage's source attribute is a **mirror**: the previous stage's output, written by the rebuild.
   Mirrors exist so everything that already reads `se:taper-d` as "the centerline" (dash fit, the Width tool,
   arrow code, hit-testing) keeps working unchanged, and so a drawing with a single stage is byte-identical to
   today's.
3. `rebuildStack(elem)` runs the stages in order from the root, writes each mirror and finally `d`. Every
   feature's apply/remove becomes "change my params / my attribute, call `rebuildStack`".
4. Adding a stage in front of the root: its source := the old root's source. Removing the root: the next stage's
   source := the removed root's source. Removing a middle stage: just rebuild.
5. **Stale check** (`d` edited outside, e.g. node editing): the whole chain is stale; drop every stage attribute
   and keep `d`, as each feature does alone today.
6. **Transform bake**: one hook for a stacked element maps only the root (and scales every stage's size-like
   params: radii, stroke width), then rebuilds. The three per-feature hooks keep handling the single-stage case.
7. **Invariant** (`checkDrawing`): a stacked element's mirrors equal the chain's output within the saver's
   rounding, and a stage attribute never appears without its params.

Stage registration (`registerLiveStage({id, order, srcAttr, active(elem), run(elem, inputD) → d})`) avoids the
import cycles the three modules already dance around with string literals.

## Cost and what could go wrong

- Touches `corner-radius.js`, `live-effects.js` (apply, preview, remove, expand, reconcile), `taper-stroke.js`
  (apply, remove, width draw, remap), `ext-corner-radius`, `ext-live-effects`, `path-join.js`, the invariants,
  plus a fixture per pair and sweep coverage. Size M–L.
- Preview of effects while a width stage is on top must run the downstream stage on the preview clone too.
- Data volume: a three-stage element carries `orig-d` + `fx-d` + `taper-d` + `d`.
- Existing drawings are untouched (single-stage elements keep their exact attributes); no repair script needed.
- A fixture saved by the old editor with two stage attributes present cannot exist (they were exclusive).

## Built (v1)

Build the chain with **corners → width** and **effects → width** (non-Scribble) as the supported pairs; keep
corners + effects and anything with arrow alignment exclusive until someone needs them. The model above does not
change if they are added later: it is one more entry in the stage list.
