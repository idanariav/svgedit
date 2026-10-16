# Introduction

SVG-edit has several options that are set in JavaScript with
`svgEditor.setConfig()`. (The page URL's query string no longer configures
the editor or loads content; pass options and drawings programmatically.)

Options may be divided into "config" (which is not meant to be customized
via UI by the user) and "preferences" (which are meant to be customized
by UI).

See the API definition of
[Config]{@link module:SVGEditor.Config}
for the allowable values, defaults, and uses of config.

See the API definition of [Preferences]{@link module:SVGEditor.Prefs}
for their information.

One may preload a file. See "Preloading a file" below.

One may also configure stylesheets expected by the default HTML
(`svgedit-custom.css` (v3.0+) or `custom.css` (v2.8))).

One may also add stylesheets programmatically (since v3.0).
See "Customizing stylesheets" below.

## How to set the options

### Setting options programmatically

Options of either type can be set using `svgEditor.setConfig(options)`,
where `options` is an object literal of keys and values. This must be
run before the actual page or DOM is loaded, otherwise it will have no
effect.

Note that one may create a `svgedit-config-iife.js` file within the project
root directory as of v3.0 (or for v2.8, within `editor/config.js`) and
add such configuration directives to it without needing to modify the
repository editor code

```js
svgEditor.setConfig({
  dimensions: [ 320, 240 ],
  canvas_expansion: 5,
  initFill: {
    color: '0000FF'
  }
})
```

This will set the default width/height of the image, the size of the outside
canvas, and the default "fill" color.

#### Letting stored preferences win

For programmatic config setting, one may optionally pass (another)
object to `.setConfig()` as the second argument.

If an `allowInitialUserOverride` boolean is set to `true`, the value you
supply becomes a default that previously stored user preferences can
override (e.g., if you want the user to have the option to change one of
your `.setConfig()` values via the UI while still providing them with
your own default value, you should add this property).

## Note to developers of SVGEdit on preferences vs. configuration

Those items marked as preferences are intended to be configuration items
which can also be set via the UI (and specifically via Editor Options
except where mentioned). Config and preferences should therefore not
share the same name.

There are, however, some items set in the UI which are currently
stored as config, whereas a few "preferences" are not meant to be set
by the user. A future version may adjust these types.

## Preloading a file

It is possible to start the editor with a preloaded SVG file.

One should bear in mind that if one wishes to immediately set a
particular string regardless of previous saves by the user, especially when
from the config file (`svgedit-config-iife.js` in v3.0 or `editor/config.js`
in v2.8) which runs early, one should first set the config option
`noStorageOnLoad` to `true` or otherwise any
previous local storage that is found will overwrite your own string.
Bear in mind that if this option is set, the user will be prevented thereby
from saving their own text locally.

If you wish to store a one-time default and let the user subsequently save
locally, you do not need to set `noStorageOnLoad` as storage will only be
set if storage is found.

```js
// Serialized string:
svgEditor.loadFromString('<svg xmlns="...">...</svg>')

// Data URI:
svgEditor.loadFromDataURI('data:image/svg+xml;base64,...')

// Local URL:
svgEditor.loadFromURL('images/logo.svg')
```

## Persisting user data in a host store (`userDataAdapter`)

By default the editor stores two pieces of user customization in its own
`localStorage`: the **custom palette colors** (key `svg-edit-custom-palette`)
and the **saved shape library** (key `svg-edit-user-shapes`).

An embedding application that wants this data kept in *its own* store (so it
survives updates or syncs with the host) can supply a `userDataAdapter` via
`setConfig` before the editor initializes:

```js
svgEditor.setConfig({
  userDataAdapter: {
    getPalette () { return overridesMap },          // sync; { [index]: '#rrggbb' }
    setPalette (overrides) { /* persist full map */ },
    getUserShapes () { return store },              // sync; { categories, shapes }
    setUserShapes (store) { /* persist full store */ }
  }
})
```

- **Reads are synchronous** — the palette and shape library render synchronously,
  so the host should hydrate the adapter from its data file *before* constructing
  the editor and keep an in-memory copy.
- **Writes are fire-and-forget** — `setPalette` / `setUserShapes` are called with
  the *full* current state on every edit (palette change/reset, shape add/remove);
  the host may persist asynchronously.
- When `userDataAdapter` is omitted or `null`, both fall back to the original
  `localStorage` behavior described above — standalone SVG-Edit is unchanged.

## Choosing built-in features

The editor loads its built-in features (the `ext-*` modules) by default. To leave some out, name them in
`disabledFeatures` (the `ext-` prefix is optional):

```js
svgEditor.setConfig({ disabledFeatures: ['opensave', 'ext-grid'] })
```

This is the recommended way for a host to trim the editor: it lists only what it does *not* want, so tools added in
later versions reach the host without a change. `noDefaultExtensions: true` plus an explicit `extensions` list still
works for a host that wants to name every feature itself; `disabledFeatures` is applied to that list too. Set it
before `init()`.

## Customizing stylesheets

As of version 3.0, stylesheets can be indicated dynamically (and
asynchronously loaded though applied serially) via
`svgEditor.setConfig({stylesheets: [...]})`.

To add your own stylesheets along with the default stylesheets, ensure
`"@default"` is present in the array along with your own. For example:

```js
svgEditor.setConfig({ stylesheets: [ '@default', 'myStylesheet.css' ] })
```

(In version 2.8, the CSS file `editor/custom.css` was included by default,
whether the file existed or not. With version 3.0, the move was made to
be fully modular and let plugins add their default stylesheets to
`$.loadingStylesheets` which SVGEdit would load dynamically, so that HTML
would not need to indicate such style-information in a non-modular fashion.)
