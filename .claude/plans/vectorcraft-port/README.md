# Porting VectorCraft features into svgedit — plan index

Survey date: 2026-10-09. Source repo: `/Users/idanariav/GitProjects/vectorcraft`
(Rust, ~221k lines, an open-source Illustrator re-implementation).

This folder holds hand-off plans. Each feature is written so an agent with no
memory of the survey session can pick it up, implement it, and verify it.

| File | Contents |
|---|---|
| [tier-1.md](tier-1.md) | High value, mostly self-contained math. Start here (T1.7 Glow is the quickest win). Includes **T1.0**, the shared live-effect foundation that several later items depend on. |
| [tier-2.md](tier-2.md) | Clear value, more integration work (on-canvas UI, new data models). |
| [tier-3.md](tier-3.md) | Small UX wins and nice-to-haves. |

## Status board

Update the row when you start (`in progress — <agent/session>, <date>`) and
when you finish (`done — <commit sha>`). Pick items in the listed order unless
the user says otherwise; the **Depends on** column is a hard prerequisite.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| T1.0 | Live-effect foundation (`se:fx` stack) | — | done — b99390d0 |
| T1.1 | Distort & Transform effects (Roughen, Zig Zag, Pucker & Bloat, Twist, Tweak, Round Corners, Scribble) | T1.0 | done — 07891b3c |
| T1.2 | Warp effect (15 styles) | T1.0 | done — see git log |
| T1.3 | Live Corners upgrade (per-corner radius + kind) | — | todo |
| T1.4 | Path edits: remove-anchor refit, Average, Join, Add Anchor Points (+ shared Bézier-fit module) | — | todo |
| T1.5 | Shape tools: Spiral, Arc, Rectangular Grid, Polar Grid | — | todo |
| T1.6 | Shaper tool (rough stroke → clean shape) | — | todo |
| T1.7 | Outer Glow, Inner Glow (+ Feather) in the shared filter composer | — | todo |
| T2.1 | Snapping while drawing (smart-guide targets for drawn points) | — | todo |
| T2.2 | Ruler guides | — (T2.1 helps) | todo |
| T2.3 | Pen continues / joins open paths | T1.4 (join helper) | todo |
| T2.4 | Arrowheads with tip-on-end alignment | — | todo |
| T2.5 | Dashes fitted to corners and path ends | — | todo |
| T2.6 | Width profiles + Width tool (generalizes taper) | — | todo |
| T2.7 | Free Distort / Perspective Distort (on-canvas) | T1.0 | todo |
| T2.8 | On-canvas gradient editor | — | todo |
| T2.9 | Eyedropper "Copy style" action | — | todo |
| T2.10 | Magic Wand / Select Same with tolerance | — | todo |
| T2.11 | Recolor Artwork + harmony rules | — | todo |
| T2.12 | Centerline tracing (raster line art → stroked paths) | T1.4 (fit module) | todo |
| T2.13 | Blend tool | — | todo |
| T2.14 | Art / pattern brushes (art bent along a path) | — | todo |
| T2.15 | Corner-keeping simplify (pencil commit + Smooth Path) | T1.4 | todo |
| T2.16 | Smooth tool (brush to smooth part of a path) | T2.15 | todo |
| T2.17 | Layers panel: object rows (tree, hide/lock per object, drag, Locate Object) | — | todo |
| T3.1 | Scrubby labels + wheel stepping on numeric fields | — | todo |
| T3.2 | Measure tool | — | todo |
| T3.3 | Transform Each | — | todo |
| T3.4 | Split Into Grid | — | todo |
| T3.5 | Area text with wrapping | — | todo |
| T3.6 | Layers panel extras (Alt-click hide/lock others, column drag, row drag reorder, template comment layers) | — | todo |
| T3.7 | Pencil continues a selected path + visible smoothing settings | — (T2.15 helps) | todo |

## Rules every agent must follow (from this repo's `CLAUDE.md`)

1. **Read before coding:** `CLAUDE.md`, then `.claude/architecture.md`,
   `.claude/tools.md`, `.claude/extensions.md`, `.claude/css-rules.md` as
   relevant, and `.claude/techdebt.md` for the area you touch.
2. **LSP over Grep** for symbol lookups in JS (`ToolSearch` → `select:LSP`).
3. **Web search before finalizing your own sub-plan** (the searches done for
   this survey are listed under *Research notes* below; add feature-specific
   ones).
4. **Unit tests are mandatory** for every new or changed behaviour
   (`tests/unit/`, `npx vitest run`). Prefer the e2e suite (`tests/e2e/`) when
   the behaviour spans real DOM wiring.
5. **Every new `se:*` attribute gets a round-trip fixture** in
   `tests/e2e/fixtures/roundtrip/` (the round-trip spec asserts load→save→load
   stabilises).
6. **Docs stay fresh:** update `.claude/tools.md`, `file-map.md`,
   `architecture.md`, `extensions.md`, `attributes.md`, `css-rules.md` as the
   change requires. Anything deferred goes in `.claude/techdebt.md`.
7. **Repo boundary:** everything here is generic svgedit work (belongs in this
   repo). Nothing in these plans is Obsidian-specific.
8. **Testing in the browser:** `packages/svgcanvas` is served from its built
   `dist/` — after any change under `packages/svgcanvas/`, run
   `npx vite build packages/svgcanvas` before reloading. Force desktop mode
   (`tabletMode` off, remove `.ui-tablet`) before driving the UI.
9. **Don't commit unless the user asks.** One feature per commit when they do.

## Porting conventions

### License and attribution
VectorCraft is `MIT OR Apache-2.0`; svgedit is MIT. Porting is allowed. Put
this in the header doc comment of every module that ports VectorCraft logic:

```js
 * Ported from VectorCraft (https://github.com/storytold/vectorcraft),
 * `crates/<crate>/src/<file>.rs`, MIT OR Apache-2.0.
```

Do **not** copy VectorCraft assets (icons, fonts, images). Draw new icons in
`src/editor/images/` following the `stroke="currentColor"` / `fill="none"`
convention.

### Reading the Rust: type mapping
| VectorCraft (kurbo-based) | svgedit equivalent |
|---|---|
| `PathData` → `SubPath` → `Anchor { p, h_in, h_out, kind }` | No direct equivalent. Use a small JS anchor model `{ p:{x,y}, hIn:{x,y}, hOut:{x,y} }` per subpath (T1.0 adds one in `core/anchor-path.js`), converted to/from a `d` string. A handle equal to its anchor means "no handle" (`has_in()`/`has_out()` are `h != p`). |
| `CubicBez`, `.eval(t)`, `.subsegment(a..b)`, arc length | paper.js `Curve` (`getPointAt`, `getNormalAt`, `divideAt`, `length`) via `core/paper-utils.js` `getPaperScope()`; or plain de Casteljau in JS for hot loops. |
| `Rect` (`x0,y0,x1,y1`) | `{x, y, width, height}` from `getBBox()` of the **untransformed** source geometry. |
| `Affine` | `SVGMatrix` / paper `Matrix`. |
| `serde_json::Value` params | A plain JS object parsed from the `se:fx` attribute (T1.0). |
| `noise(seed,a,b,c)` (splitmix64) | JS has no cheap u64 math. Use a 32-bit integer hash (e.g. murmur3 finaliser / `Math.imul`), deterministic per (seed, a, b, c). Bit-exact parity with VectorCraft is **not** a goal. |
| Units: points, 72 per inch | svgedit user units are px (96 per inch). Where VectorCraft uses "per inch" (Roughen `detail`), convert with 96. |

### Reuse VectorCraft's tests
Most Rust modules carry `#[cfg(test)] mod tests` blocks with geometric
invariants (e.g. `geom/src/corners.rs` tests that kinds share their end
points). Translate the *invariants* into vitest cases — they are the best
oracle available.

### Live (re-editable) geometry pattern — already established in svgedit
SVG has no live effects, so svgedit stores the source geometry in an `se:`
attribute and renders the baked result in `d`. Precedents to copy:
- `packages/svgcanvas/core/taper-stroke.js` (`se:taper`, `se:taper-d`,
  `se:taper-style`), UI glue `src/editor/extensions/ext-taper/ext-taper.js`.
- `packages/svgcanvas/core/corner-radius.js` (`se:orig-d`,
  `se:corner-radius`), UI `src/editor/extensions/ext-corner-radius/`.
- Transform bakes keep the source in sync through
  `packages/svgcanvas/core/geometry-remap-registry.js`
  (`registerGeometryRemap(attr, fn)`, called from the module's `init`).
- `se:` attributes bypass the sanitize whitelist
  (`core/sanitize.js`) and get `xmlns:se` declared by `core/se-namespace.js`.
- Node-editing a live path makes the stored source stale; corner-radius
  handles that with a `reconcile()` that drops the attrs when `d` no longer
  equals the regenerated output (`ext-corner-radius.js`). Follow the same
  rule unless a plan says otherwise.

## Research notes (web searches run 2026-10-09)

- **Path warping in JS:** warp.js subdivides segments until they're below a
  size threshold and maps the points — the same approach as VectorCraft's
  `map_nonlinear` (split each cubic into ≤64 pieces, map all control
  points). [warpjs](https://github.com/benjamminf/warpjs),
  [svgpath](https://github.com/fontello/svgpath).
- **Sketch recognition pitfalls:** corner detection misses corners of thin
  rectangles when based on pen speed; curvature-based detection gives false
  vertices from hand jitter; classifiers are sensitive to stroke gaps and
  self-intersections. VectorCraft's recognizer avoids speed bias by
  resampling by distance (256 samples). [Sezgin et al., Early Processing for
  Sketch Understanding](https://dl.acm.org/doi/pdf/10.1145/1185657.1185783),
  [elixpo draw-to-shape triangle/diamond issue](https://github.com/elixpo/sketch.elixpo/issues/148).
- **Arrowheads:** a stroke always shows under a marker unless the path is
  shortened; workarounds are dasharray trimming or geometry trimming. The
  `marker-knockout-*` properties exist only in the SVG Markers draft — do not
  rely on browser support. [SVG Markers draft](https://svgwg.org/specs/markers/),
  [Inkscape bug 170542](https://bugs.launchpad.net/bugs/170542).
- **paper.js** (used by svgedit for booleans/offset/simplify) is at 0.12.18,
  last published July 2024 — stable but unmaintained. Keep new geometry code
  in plain JS where reasonable and use paper.js only through
  `core/paper-utils.js`. [npm: paper](https://www.npmjs.com/package/paper).
- **Centerline tracing:** the standard pipeline is Zhang–Suen thinning →
  graph of skeleton runs → Schneider Bézier fit, exactly VectorCraft's
  `trace/src/centerline.rs`. JS references:
  [skeleton-tracing](https://github.com/LingDong-/skeleton-tracing),
  [lineart-trace](https://github.com/UCB-BioE-Anderson-Lab/lineart-trace).
- **Variable-width strokes:** the hard part is offset self-intersection at
  sharp corners and tight curves; without handling it you get bow-ties.
  VectorCraft fills the outline with the non-zero rule and joins corners on
  the outer side only. [Wesnoth variable-width strokes](https://wiki.wesnoth.org/Variable-width_strokes).
- **Bézier fitting:** `fit-curve` (npm) implements Schneider's algorithm and
  exposes `fitCubic(points, leftTangent, rightTangent, error)`.
  [fit-curve](https://github.com/soswow/fit-curve).
- **Guide storage:** Inkscape stores guides as `sodipodi:guide` elements with
  `position` and `orientation`; svgedit should use its own `se:` namespace
  instead. [Inkscape SVG vs plain SVG](https://wiki.inkscape.org/wiki/Inkscape_SVG_vs._plain_SVG).

## Explicitly out of scope
3D, raster effect gallery, gradient mesh (browsers can't render mesh
gradients), Perspective Grid, Live Paint, Liquify, envelope *mesh* distort,
all non-SVG file formats (PDF/EPS/DXF/EMF/Affinity), CMYK/ICC/print, graphs,
the MCP server.
