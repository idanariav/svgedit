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
colors in shadow DOM templates.

**Primary design tokens (preferred — use these for new code):**

| Variable | Purpose |
|---|---|
| `var(--fg)` | Primary text / foreground |
| `var(--muted)` | Secondary/muted labels |
| `var(--icon)` | Toolbar icon default color |
| `var(--icon-hover)` | Toolbar icon hover color |
| `var(--icon-hover-bg)` | Toolbar button hover background |
| `var(--accent)` | Active/selected accent (blue in light, amber in dark) |
| `var(--accent-soft)` | Active button background (tint of accent) |
| `var(--accent-border)` | Active button border |
| `var(--chrome-bg)` | Toolbar / panel background |
| `var(--chrome-border)` | Toolbar / panel border |
| `var(--field-bg)` | Input field background |
| `var(--field-border)` | Input field border |
| `var(--group-bg)` | Control-group tray background |
| `var(--group-border)` | Control-group tray border |
| `var(--workarea-bg)` | Canvas workarea background |

**Legacy aliases (kept for backward compatibility, map to tokens above):**

| Variable | Alias for |
|---|---|
| `var(--main-bg-color)` | `--chrome-bg` |
| `var(--text-color)` | `--fg` |
| `var(--input-color)` | `--field-bg` |
| `var(--border-color)` | `--chrome-border` |
| `var(--icon-bg-color-hover)` | `--icon-hover-bg` |
| `var(--hover-highlight)` | `--icon-hover-bg` |
| `var(--dropdown-bg)` | `--chrome-bg` |

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

All toolbar icons in `src/editor/images/` are stroke-based SVGs using
`stroke="currentColor"` and `fill="none"`. They are injected inline into the
shadow DOM by each `se-*` component via the shared
`src/editor/components/svgIconLoader.js` utility, which fetches, normalises,
and caches each SVG.

Because the icons use `currentColor`, they respond directly to the CSS `color`
property on the host element — **no CSS `filter` is needed**. The
`--icon-filter` variable is no longer defined or used.

To recolor icons from outside a component, set `color:` on the `se-button` (or
other `se-*` host) in a CSS rule that pierces the shadow boundary:
```css
se-button { color: var(--icon); }
se-button[pressed] { color: var(--accent); }
```

Do **not** add `filter: var(--icon-filter)` to any `img` or `svg` rule — that
pattern is retired.

---

## Agent reference docs (`.claude/`)

The `.claude/` folder contains structured docs for fast codebase orientation.
Read the relevant ones **at the start of any task** — they replace line-by-line
code exploration.

| Doc | When to read it |
|-----|-----------------|
| [`architecture.md`](.claude/architecture.md) | Understanding init flow, subsystems, or where code lives |
| [`tools.md`](.claude/tools.md) | Adding/modifying any toolbar tool or panel control |
| [`attributes.md`](.claude/attributes.md) | Working with shape attribute panels or the `attrChanger` handler |
| [`css-rules.md`](.claude/css-rules.md) | Styling anything — tokens, layout grid, shadow DOM component CSS |
| [`extensions.md`](.claude/extensions.md) | Creating or modifying an extension |
| [`file-map.md`](.claude/file-map.md) | Quick file-to-purpose lookup |

### Keeping the docs fresh

At the **end of any task** that modifies files covered by these docs, update
the relevant doc(s) to reflect the change. Specifically:

- Added, removed, or renamed a file → update `file-map.md` and `architecture.md`
- Added or removed a toolbar tool / panel control → update `tools.md`
- Changed which attributes are editable for a shape → update `attributes.md`
- Added, removed, or renamed a CSS variable / layout rule → update `css-rules.md`
- Created or changed an extension → update `extensions.md`

Update the **"Last verified"** date at the top of any doc you touch.
Changes to the docs should be included in the same commit as the code change.

---

## After making changes

```bash
npm run build
# Then in ../obsidian-svgedit-plugin:
npm run sync-svgedit
```

Commit here first, then commit the synced `svgedit-dist/` in the plugin with
a message referencing this repo's commit.
