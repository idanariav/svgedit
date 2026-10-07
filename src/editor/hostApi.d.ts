/**
 * The host API: everything an embedding application (e.g. the Obsidian plugin)
 * may rely on from an `Editor` instance. Anything not listed here is internal
 * and may change without notice.
 *
 * Self-contained (no imports) so a host can vendor this single file.
 * `npm run typecheck` asserts that `Editor` satisfies these declarations (see
 * `hostApi.check.ts`), so a signature change that breaks a host fails the
 * build. Shipped next to the bundle as `dist/editor/hostApi.d.ts`.
 */
/** `level` is the level name (e.g. 'error', 'warn'). */
export type LogSink = (level: string, info: { message: string, data?: unknown }) => void
export type DebugEventSink = (event: string, detail?: Record<string, unknown>) => void
export type CanvasEventHandler = (win: Window, elems: unknown) => void

/** The slice of `SvgCanvas` hosts use. */
export interface HostCanvas {
  getSvgString(): string
  /** Serialise honouring the save options (`apply` embeds fonts/images). */
  svgCanvasToString(): string
  /** The mutable save-options object (`apply`, `images`, `round_digits`, …). */
  getSvgOption(): { apply?: boolean, [key: string]: unknown }
  setSvgOption(key: string, value: unknown): void
  /**
   * Insert raw SVG child markup into the current layer/group as one undoable
   * step (selects it, fires `changed`). Null if the markup can't be parsed.
   */
  insertSvgFragment(xmlFragment: string): Element[] | null
  /** Current mode, e.g. `select`, `path`, `pathedit`. */
  getMode(): string
  /** Whether the active drawing tool stays armed after each object. */
  getToolLocked(): boolean
  /**
   * Attach a handler to a canvas event; returns the previous handler for that
   * event, if any.
   */
  bind(event: string, cb: CanvasEventHandler): CanvasEventHandler | undefined
  /**
   * The single `CustomEvent` this canvas reuses for every `setMode()`
   * dispatch, so hosts can tell their own editor's `modeChange` events apart
   * by identity when several editors are open.
   */
  modeEvent: Event
}

export interface HostConfigObj {
  /** Read (one argument) or write (two) a persisted preference. */
  pref(key: string, val?: unknown): unknown
}

export interface EditorHostApi {
  /** Merge config options; call before `init()`. */
  setConfig(cfg: Record<string, unknown>): void
  init(): Promise<unknown>
  /** Re-read custom palette + saved shapes from the user-data adapter. */
  reloadUserData(): void
  loadFromString(svg: string, opts?: { noAlert?: boolean }): Promise<unknown>
  /**
   * Set the canvas background; pass `'gradient'` with a gradient element to
   * restore a gradient.
   */
  setBackground(color: string, url?: string, gradientElem?: Element, recordUndo?: boolean): void
  /** Root element; carries the `theme-light` / `theme-dark` class. */
  $svgEditor: HTMLElement
  /** Tear down document-level listeners registered by this instance. */
  destroy(): void
  /** Route document-level shortcuts and paste to this instance. */
  activate(): void
  /** Forward the dev-mode visibility snapshot to a sink; `null` stops. */
  setDebugLogger(sink: DebugEventSink | null): void
  /** Forward svgedit's central logger (page-global) to a sink. */
  setLogSink(sink: LogSink | null, level?: number): void
  configObj: HostConfigObj
  svgCanvas: HostCanvas
}

export interface EditorHostConstructor {
  new (container: HTMLElement): EditorHostApi
}
