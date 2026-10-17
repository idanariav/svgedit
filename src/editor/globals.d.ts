/// <reference types="vite/client" />

/** The globals the editor puts on `window` (`dialogs/se*Dialog.js`, `Editor.js`), used across the UI and by extensions, and the ones a host adds. */
interface Window {
  seAlert: (text: string) => void
  seConfirm: (text: string, choices?: string[]) => Promise<string | undefined>
  seSelect: (text: string, choices: string[]) => Promise<string | undefined>
  sePrompt: (message: string, value?: string, opts?: { title?: string, okText?: string, cancelText?: string }, scopeEl?: Element) => Promise<string | null>
  /** The most recent editor, for standalone pages. */
  svgEditor?: import('./Editor.js').default
  /** Set by a host that picks vault files and owns exporting (the Obsidian plugin's `installHostBridge`). */
  svgEditHost?: {
    pickVaultImage?: () => Promise<unknown>
    listVaultFiles?: () => { path: string, link: string }[] | Promise<{ path: string, link: string }[]>
    exportDrawing?: () => void
  }
  /** Chromium's colour-picker API. */
  EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> }
}

/** An editor instance (`Editor.js`), as the UI modules receive it. */
type EditorInstance = import('./Editor.js').default

/** Untyped packages. */
declare module 'imagetracerjs'
declare module 'culori'
/** `.html` files import as their text (a Vite loader, `vite.config.mjs`). */
declare module '*.html' {
  const html: string
  export default html
}
