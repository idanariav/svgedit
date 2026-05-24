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

### CSS custom properties

Components use CSS custom properties so host environments can control colors.
Always use these variables (with a sensible fallback) rather than hardcoding
colors in shadow DOM templates:

| Variable | Purpose |
|---|---|
| `var(--text-color)` | Input and label text |
| `var(--input-color)` | Input field background |
| `var(--icon-bg-color)` | Toolbar button background |
| `var(--icon-bg-color-hover)` | Toolbar button hover background |
| `var(--border-color)` | Borders and dividers |
| `var(--main-bg-color)` | Top/bottom/left toolbar background |
| `var(--workarea-bg)` | Canvas workarea background |
| `var(--layer-bg)` | Layer panel row background |
| `var(--dropdown-bg)` | Dropdown list background |
| `var(--hover-highlight)` | Menu/list item hover highlight |
| `var(--icon-filter)` | CSS filter applied to toolbar icon `<img>` elements |

### Light / Dark themes

The editor root (`.svg_editor`) accepts one of two theme classes:

- **`theme-light`** — default light palette (white inputs, dark text, light toolbar)
- **`theme-dark`** — dark palette (dark inputs, light text, dark toolbar)

Applying the class updates all CSS variables defined in `svgedit.css`.

**From the editor** — users switch theme via the Preferences dialog
(persisted in `localStorage` as `svg-edit-theme`).

**From a host** — toggle the class directly on `.svg_editor` without going
through the dialog:
```js
editorEl.classList.toggle('theme-dark', isDark)
editorEl.classList.toggle('theme-light', !isDark)
```
The Obsidian plugin can use this instead of `injectThemeGuard()` for full
theme support. The `applyTheme(theme, rootEl)` helper in
`src/editor/themeUtil.js` is the canonical way to do this from JS.

### Icon recoloring

Toolbar icons are loaded via `<img src="...">` inside shadow DOM components
and cannot be recolored by CSS `color`. Instead, `--icon-filter` carries a
CSS `filter` value (e.g. `invert(0.88) hue-rotate(180deg)` for dark mode).
Each `se-*` component that renders icon images applies
`filter: var(--icon-filter, none)` to its `img` rule.

---

## After making changes

```bash
npm run build
# Then in ../obsidian-svgedit-plugin:
npm run sync-svgedit
```

Commit here first, then commit the synced `svgedit-dist/` in the plugin with
a message referencing this repo's commit.
