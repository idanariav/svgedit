/**
 * TypeScript definitions for @svgedit/svgcanvas
 * @module @svgedit/svgcanvas
 */

import type { AttachedMembers } from './svgcanvas-members.js'
import type { InternalMembers } from './svgcanvas-internal.js'

// Core types
export interface SVGElementJSON {
  /** Set on the clipboard's copies of referenced defs (gradients, filters, …). */
  _defs?: boolean
  element: string
  attr: Record<string, string | number>
  curStyles?: boolean
  children?: SVGElementJSON[]
  namespace?: string
}

export interface Config {
  /** Object-to-object / drawing snapping guides; only `false` turns them off. */
  smartSnapping?: boolean
  /** Ruler guides are drawn; only `false` hides them. */
  showGuides?: boolean
  showRulers?: boolean
  /** Output viewBox + xmlns instead of fixed width / height. */
  dynamicOutput?: boolean
  /** Snap a dragged selection's bbox to the grid in wireframe mode. */
  wireframeSnapping?: boolean
  pencilStabilization?: number
  pencilFidelity?: number
  /** Only `false` keeps the legacy every-3-points smoothing. */
  pencilSimplify?: boolean
  canvasName?: string
  canvas_expansion?: number
  initFill?: {
    color?: string
    opacity?: number
  }
  initStroke?: {
    width?: number
    color?: string
    opacity?: number
  }
  text?: {
    stroke_width?: number
    font_size?: number
    font_family?: string
  }
  selectionColor?: string
  imgPath?: string
  extensions?: string[]
  initTool?: string
  wireframe?: boolean
  showlayers?: boolean
  no_save_warning?: boolean
  imgImport?: boolean
  baseUnit?: string
  snappingStep?: number
  gridSnapping?: boolean
  gridColor?: string
  dimensions?: [number, number]
  initOpacity?: number
  colorPickerCSS?: string | null
  initRight?: string
  initBottom?: string
  show_outside_canvas?: boolean
  selectNew?: boolean
}

export interface Resolution {
  w: number
  h: number
  zoom?: number
}

export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

export interface EditorContext {
  getSvgContent(): SVGSVGElement
  addSVGElementsFromJson(data: SVGElementJSON): Element
  getSelectedElements(): Element[]
  getDOMDocument(): HTMLDocument
  getDOMContainer(): HTMLElement
  getSvgRoot(): SVGSVGElement
  getBaseUnit(): string
  getSnappingStep(): number | string
}

// Paint types
export interface PaintOptions {
  alpha?: number
  solidColor?: string
  type?: 'solidColor' | 'linearGradient' | 'radialGradient' | 'none'
}

// History command types
export interface HistoryCommand {
  apply(handler: HistoryEventHandler): void | true
  unapply(handler: HistoryEventHandler): void | true
  elements(): Element[]
  type(): string
  getText(): string
}

export interface HistoryEventHandler {
  handleHistoryEvent(eventType: string, cmd: HistoryCommand): void
  /** Optional: called around a BatchCommand's (un)apply so global notifications fire once per batch. */
  beginBatch?(): void
  endBatch?(): void
}

export interface UndoManager {
  addCommandToHistory(cmd: HistoryCommand): void
  /** Debug hook, called after every command lands on the stack. */
  onPush: ((cmd: HistoryCommand) => void) | null
  undo(): void
  redo(): void
  getUndoStackSize(): number
  getRedoStackSize(): number
  getNextUndoCommandText(): string
  getNextRedoCommandText(): string
  resetUndoStack(): void
  beginUndoableChange(attrName: string, elems: Element[]): void
  finishUndoableChange(): HistoryCommand & { isEmpty(): boolean }
}

// Logger types
export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4
}

export interface Logger {
  LogLevel: typeof LogLevel
  setLogLevel(level: LogLevel): void
  setLoggingEnabled(enabled: boolean): void
  setLogPrefix(prefix: string): void
  error(message: string, error?: Error | any, context?: string): void
  warn(message: string, data?: any, context?: string): void
  info(message: string, data?: any, context?: string): void
  debug(message: string, data?: any, context?: string): void
  getConfig(): { currentLevel: LogLevel; enabled: boolean; prefix: string }
}

// Main SvgCanvas class
declare class SvgCanvas {
  constructor (container: HTMLElement, config?: Partial<Config>)

  // Core methods
  getSvgContent (): SVGSVGElement
  getSvgRoot (): SVGSVGElement
  getSvgString (): string
  selectOnly (elements: Element[], showGrips?: boolean): void
  getZoom (): number
  setZoom (zoomLevel: number): void
  cutSelectedElements (): void

  // Layer operations
  getCurrentDrawing (): any

  // Drawing modes
  setMode (name: string): void
  getMode (): string

  // Events
  call (event: string, args?: any): void
  bind (event: string, callback: Function): void

  // Extensions
  addExtension (name: string, extInitFunc: (arg: any) => any, options: { importLocale: any }): Promise<any>

  // Export
  getSvgString (): string

  // Extensions
  getExtensions (): Record<string, any>

  // Selection
  getSelectedElements (): Element[]
  removeFromSelection (elemsToRemove: Element[]): void
  getNextId (elemType?: Element | string | null): string
  addCommandToHistory (cmd: HistoryCommand): void
  getDataStorage (): typeof import('./core/dataStorage.ts').default

  // Paint
  getColor (type: 'fill' | 'stroke' | string): any
  getStrokeWidth (): number

  // Config / options
  getCurConfig (): Config
  getSvgOption (): Record<string, any>
  setSvgOption (key: string, value: any): void
  getToolLocked (): boolean
  setToolLocked (locked: boolean): void
  getOpacity (): number
  setOpacity (val: number): void
  setConfig (opts: Partial<Config>): void
  convertToPath (elem: Element, getBBox?: boolean): unknown
  clear (): void

  // Selection / transforms
  selectAllInCurrentLayer (): void

  // Effects
  getBlur (elem: Element): number | string
  getDocumentTitle (): string
  getDOMDocument (): Document
  getCurrentGroup (): Element | null
  getContentW (): number
  randomizeIds (enableRandomization: boolean): void

  // Debugging
  /** Forward discrete debug events `(event, detail)` to a host; null stops. */
  setDebugEventSink (sink: ((event: string, detail?: object) => void) | null): void
  logDebugEvent (event: string, detail?: object): void
  /** The host's debug-event sink, or null while the debug log is off. */
  _debugEventSink: ((event: string, detail?: object) => void) | null
  /** Read-only snapshot of visibility state that can desync from the model. */
  getDebugSnapshot (): object
}

interface SvgCanvas extends AttachedMembers, InternalMembers {}
export default SvgCanvas
