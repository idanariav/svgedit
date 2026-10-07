# Creating a new release (this fork)

This fork (`svgedit-milani`) is **not published to npm**. A release is a GitHub
release whose asset is the self-contained editor bundle `Editor.js`;
`obsidian-svgedit-plugin` downloads that asset (see its
`scripts/fetch-svgedit-dist.mjs`).

1. Land your changes; `npm run lint` and `npx vitest run` must pass.
1. Bump `version` in `package.json` to `7.4.1-milani.N` (and the two matching
   lines at the top of `package-lock.json`) and add a `CHANGES.md` entry.
1. Commit, then tag and push: `git tag v7.4.1-milani.N && git push origin master v7.4.1-milani.N`.
   `.github/workflows/release.yml` verifies the tag matches `package.json`,
   builds, and attaches `dist/editor/Editor.js` to a new GitHub release.
1. In the plugin repo, bump `SVGEDIT_RELEASE` in `scripts/fetch-svgedit-dist.mjs`
   to the new tag and run `npm run sync-svgedit`.

The upstream npm-based instructions below are kept for reference only.

---

# Creating a new svg-edit release

## Prepare
1. `npm test` - Must pass before version bump (accessibility tests are currently failing; address or accept the known failure before proceeding).
1. `npm run build` - Must pass before version bump; builds all workspaces and the main editor from the root.

## Update the main project

1. Run `npm run version-bump` (after tests/builds are green) to bump the root and all workspace package versions together and refresh `package-lock.json`.
1. Update the `CHANGES.md` file with a summary of all changes (adding the version of the new release).

## Publish to npm

1. From the repo root, run `npm run publish`. The script will:
    - Confirm the version bump is already done.
    - Confirm `CHANGES.md` has been updated.
    - Run the full release checks (`npm run test-build` → tests, docs, and build); it exits on failure.
    - Ask before creating a release commit and tag (defaults to `v<version>`); declining aborts the publish.
    - Publish all workspaces first, then the root package.

You will need to be a member of the npm group to do this step.
