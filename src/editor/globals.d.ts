/// <reference types="vite/client" />

/**
 * What a host's vault picker returns: the image as a data URL (for the preview and for embedding) and the wikilink to record. An unlocked whole-drawing
 * import also carries the source's full SVG (`editableSvg`) to insert as elements rather than a flattened `<image>`.
 */
interface VaultImage {
  dataUrl: string
  link: string
  locked?: boolean
  external?: boolean
  editableSvg?: string
}

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
    pickVaultImage?: () => Promise<VaultImage | null>
    listVaultFiles?: () => { path: string, link: string }[] | Promise<{ path: string, link: string }[]>
    exportDrawing?: () => void
  }
  /** Chromium's colour-picker API. */
  EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> }
}

/** The dialog helpers by their bare names, as `Editor.js` calls them (`window.seAlert` is the same function). */
declare let seAlert: Window['seAlert']
declare let seConfirm: Window['seConfirm']
declare let sePrompt: Window['sePrompt']
declare let seSelect: Window['seSelect']

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
