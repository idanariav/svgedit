/// <reference types="vite/client" />

// HTML templates are imported as plain strings via rollup-plugin-string
// (see `htmlStringPlugin` in vite.config.mjs). Declare them so the editor
// tooling resolves these imports instead of flagging "Cannot find module".
declare module '*.html' {
  const content: string
  export default content
}
