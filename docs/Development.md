# Development

## Running the editor

- `npm start` serves the editor at `http://localhost:8000/src/editor/index.html`
  (`npm start -- --port 8001` for another port). The editor and the canvas
  package (`packages/svgcanvas`) are both served from source, so a reload
  picks up any change.
- `npm run build` writes `dist/editor/Editor.js`, one self-contained ES module
  (every icon, stylesheet, locale and extension inlined), plus the entry pages
  and the Playwright harness (`scripts/copy-static.mjs`). `SOURCEMAP=true`
  adds source maps.
- `npm run start:e2e` serves the built `dist/editor` with `vite preview`.

## Tests

`npm test` runs, in order:

1. the `pretest` gates: `standard` lint (`npm run lint`), `check-dom-scope`
   (multi-editor DOM scoping), `check-layers` (the canvas package never imports
   the editor) and `typecheck` (`tsc` over the JSDoc-typed modules and the host
   API);
2. the unit tests: `vitest run --coverage` (`tests/**/*.test.js`, jsdom);
3. `scripts/run-e2e.mjs`: builds `dist/editor` with coverage instrumentation
   when sources are newer than the build, serves it, runs the Playwright suite
   (`tests/e2e/`) and prints the merged coverage (`nyc report`).

Run parts on their own with `npx vitest run <file>` and
`npx playwright test tests/e2e/<name>.spec.js` (a dev server or
`npm run start:e2e` must be up). Outside CI a missing Playwright browser only
skips the e2e step; with `CI=true` it fails.

Coverage is istanbul throughout: vitest's `istanbul` provider for unit tests,
`vite-plugin-istanbul` for the e2e build, `nyc` to merge and report
(`nyc.config.js` holds the thresholds).

## Releases

See [ReleaseInstructions.md](ReleaseInstructions.md). `npm run version-bump`
bumps the root and workspace versions together; `npm run test-build` is the
full check (tests, then build).

## Repairing saved drawings

`node scripts/repair-drawings.mjs <dir>` dry-runs the repairs registered in the
script over `.svg` files and the Obsidian plugin's `.md` drawings;
`--write` applies them.
