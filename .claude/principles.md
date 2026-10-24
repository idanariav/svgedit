# Guiding principles

What this editor is for, who it is for, and the values that decide a design question when the code and the roadmap do
not. `roadmap.md` says *what* to build next and the rules for new code; this file says *why*, and which way to lean
when two good ideas pull apart. Read it before designing a feature, a UI change or a refactor.

## What it is

A vector illustration editor that lives inside your notes. This fork of svgedit is the editor engine of the
**Sketch Editor** Obsidian plugin (`../obsidian-svgedit-plugin`): a drawing is a Markdown note, the plugin writes an
`.svg` and a `.png` beside it on every save, and an embed opens straight back into the editor. The engine itself stays
a general svgedit: any host can embed it through `hostApi.d.ts`, and nothing Obsidian-specific lives here.

## Why people choose it

- **It makes real vector art, not just diagrams.** Pen, shape builder, live corners, tapered and width-profiled strokes,
  gradients, glow, text on a path: the tools of an illustration app, aimed at clean flat illustration (consistent
  outlines, rounded corners, smooth curves, a limited palette).
- **It never takes you out of your notes.** Drawing, linking, embedding and exporting happen in the vault, with
  backlinks, search, sync and version history working as they do for any note.
- **The result is yours and portable.** Standard SVG that opens anywhere, a PNG for everything else, all stored
  locally, offline, with nothing sent off the device.
- **It is quick to pick up.** Opening a blank canvas and drawing something that looks good takes seconds; the depth is
  there when you reach for it.

## Core values

### 1. Your drawing is safe

The drawing is the user's work, and losing or damaging it is the one failure that cannot be made up for by anything
else. A saved file must open again exactly as it was, today and after every future release.

- Saved files are **standard SVG first**: a drawing renders correctly in a browser that has never heard of svgedit.
  `se:` attributes are an additive layer that adds editability (live corners, repeats, guides); a viewer that ignores
  them still sees the right picture.
- The file format, the command ids and the host API are contracts. Change them only additively.
- A corruption bug is fixed three ways (prevention, a `checkDrawing` rule, a repair script), never by a growing pile of
  load-time cleanups (`CLAUDE.md` › Data-corruption bug fixes).
- Every gesture is one undo step, and every undo puts back exactly what was there.
- Local only: no network calls at runtime, no telemetry, no account.

### 2. Creating with ease

The shortest path from an idea to a drawing on the page. Every extra click, dialog, mode or setting is a cost the
user pays every time.

- **Defaults that look good.** A new shape, stroke or text should already look like something worth keeping; the user
  adjusts rather than builds up from ugly.
- **Direct manipulation over dialogs.** Handles, grips and live previews on the canvas first, the tool options bar
  second, a dialog only for what truly is a form (export, preferences).
- **No traps.** Escape always gets you out of a tool or a mode, the current mode is always visible, and nothing
  important happens on a gesture the user could not have predicted.
- **Discoverable, then fast.** Every action is a command: it has a label, a tooltip showing its shortcut, a place in
  the command picker, and a key binding the user can change. Beginners find it by looking; regulars reach it without
  looking.
- **Every input counts.** Mouse and keyboard, tablet (stylus and touch) and phone (view first, then edit). A feature is
  not finished until it has a touch story, or a `roadmap/ui-polish.md` entry saying what is missing.

### 3. Beauty in simplicity

Simplicity in the interface and in the output.

- **The canvas is the star.** Chrome recedes: quiet colours, consistent stroke icons, design tokens, light and dark
  themes that both feel native. Toolbars fold into "…" rather than wrap or overflow, and panels show only what applies
  to the selection.
- **One way to do a thing, done well,** over three half-ways. Prefer improving an existing tool to adding a sibling;
  prefer a sensible default to a new preference.
- **Non-destructive where it is cheap.** Live corners, live effects and linked repeats keep the original editable;
  bake only when the user asks or the format requires it.
- **Simple code is part of it.** The smallest change that solves the problem, matching what is around it (the user's
  global coding principles apply in full).

### 4. At home in Obsidian, welcome anywhere

Obsidian is the primary host and shapes the priorities: drawings as notes, vault links and backlinks, frames you can
embed on their own, theme that follows the app, a pane that can be any size. But the engine earns that by being a good
general component, not by knowing about Obsidian.

- Ask the repo question before every change (`CLAUDE.md` › determine the correct repo): Obsidian glue goes in the
  plugin.
- Hosts talk to the editor through seams (`hostApi.d.ts`, the command registry, theme classes and tokens), never by
  reaching into internals; a need a host has becomes a seam here.
- Design for an editor that is one pane among several: it must work at any width, coexist with a second editor
  instance, and start fast (one self-contained bundle, a startup budget: R6).

### 5. Built to be worked on

The editor is developed mostly by agents, so its structure has to make the right change easy and the wrong one fail
loudly.

- **Name things.** Every action is a command with a stable id and typed params; every tool goes through
  `registerTool`; every mutation through `transact`. What happened can then be named, logged, swept, replayed and,
  later, driven from a CLI.
- **Check, don't hope.** Invariants (`checkDrawing`), the command sweep, round-trip fixtures, layering and typing gates
  run on every test. A new kind of mistake becomes a new check.
- **Clear layers.** The canvas engine knows nothing of the editor UI; the editor knows nothing of Obsidian. The
  direction is a document model as the source of truth with the DOM as its view (R1).
- **Learn from mature editors.** VectorCraft is the reference for structure and geometry: port the idea, adapted to
  svgedit's conventions, with attribution, never its assets.
- **Docs are part of the change.** The `.claude/` docs say what a thing is and why, and are updated in the same task.

## When values conflict

Lean in this order:

1. **Safety of the user's drawing** beats everything, including a nicer feature or a faster UI.
2. **Ease of creating** beats completeness: a feature that is hard to find or slow to use is worth less than a smaller
   one that is obvious.
3. **Simplicity** beats configurability: before adding a setting, look for the default that makes it unnecessary.
4. **The general engine** beats an Obsidian shortcut: if only Obsidian needs it, it belongs in the plugin, or as a seam
   here that any host could use.
5. **Long-term structure** beats a quick patch, unless the patch protects a drawing now; then take the patch and record
   the proper fix in `techdebt.md`.

## What it is not

- **Not a whiteboard or diagramming canvas.** No hand-drawn styling, infinite boards or connectors-first workflow;
  other tools do that, and the output here is meant to be finished illustration.
- **Not a raster painting app.** Images can be placed and traced, but pixels are not edited.
- **Not a collaboration or cloud service.** Sync and sharing are the vault's job.
- **Not an Illustrator clone panel by panel.** Borrow the best ideas from professional editors, and leave out what
  only matters to print production or a power user's hundredth hour.
