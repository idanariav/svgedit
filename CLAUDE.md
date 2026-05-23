# CLAUDE.md — svgedit (fork)

## Repo responsibility

This is a **fork of svgedit** used as the editor engine for the
`obsidian-svgedit-plugin`. Changes here are compiled and synced into
the plugin via:

```bash
npm run build                          # in this repo
npm run sync-svgedit                   # in ../obsidian-svgedit-plugin
```

The plugin depends on this repo. This repo does **not** depend on the plugin.

---

## ⚠️ Before touching any file — determine the correct repo

Ask: *"Would this change make sense for any svgedit consumer, not just Obsidian?"*

| Yes → belongs HERE | No → belongs in `../obsidian-svgedit-plugin` |
|---|---|
| Shadow DOM component styles (`src/editor/components/`) | Obsidian CSS overrides (`styles.css`) |
| SVG toolbar icon colors/shapes (`src/editor/images/`) | `injectThemeGuard()` and Obsidian-specific workarounds |
| Editor layout, behavior, extensions | Plugin settings, views, commands |
| CSS variable support in components | Obsidian integration glue |

If the answer is "Obsidian-specific", do **not** make the change here —
switch to the plugin repo instead.

---

## Key source locations

| Path | Purpose |
|---|---|
| `src/editor/components/` | Custom element shadow DOM templates (`se-zoom`, `se-input`, etc.) |
| `src/editor/images/` | SVG toolbar icons (source of truth — `dist/` is gitignored) |
| `src/editor/svgedit.css` | Editor base stylesheet |
| `src/editor/Editor.js` | Main editor entry point |
| `dist/` | **Build output — gitignored, never commit** |

---

## Theming conventions

Components use CSS custom properties so host environments can control colors:

- `var(--text-color, #333333)` — input and label text
- `var(--input-color, #e8e8e8)` — input background
- `var(--icon-bg-color, #f0f0f0)` — toolbar button background
- `var(--border-color, #cccccc)` — borders and dividers

Always use these variables (with a sensible fallback) rather than hardcoding
colors in shadow DOM templates. The Obsidian plugin sets these via
`injectThemeGuard()` scoped to its container.

---

## After making changes

```bash
npm run build
# Then in ../obsidian-svgedit-plugin:
npm run sync-svgedit
```

Commit here first, then commit the synced `svgedit-dist/` in the plugin with
a message referencing this repo's commit.
