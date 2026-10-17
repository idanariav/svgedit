// ConfigObj.ts — `pref(key)`, `setConfig(obj)`, localStorage persistence
import { mergeDeep } from '@svgedit/svgcanvas/common/util.ts'

/**
* Escapes special characters in a regular expression.
* @function regexEscape
 */
export const regexEscape = function (str: string): string {
  // Originally from: http://phpjs.org/functions
  return String(str).replace(/[.\\+*?[^\]$(){}=!<>|:-]/g, '\\$&')
}

/**
 * Prefs that describe the CURRENT DOCUMENT's canvas background rather than a
 * user's standing editor preference. Unlike `lang`, `grid_color`, etc. — where
 * "remember my last choice across drawings" is the desired behavior — a
 * background color set on one drawing has no business becoming the starting
 * point for a different drawing. Consumers that host multiple documents in one
 * page/process (e.g. several svgedit instances open at once) would otherwise
 * see one drawing's background leak into another's via shared `storage`. These
 * keys are therefore excluded from `pref()`'s persistent-storage read/write;
 * they only ever live in `curPrefs`/`defaultPrefs` for the lifetime of the
 * editor instance that set them, and hosts that want a per-document background
 * persist it themselves (see `Editor#setBackground`'s `recordUndo` param).
 */
export const SESSION_ONLY_PREFS = new Set(['bkgd_color', 'bkgd_url', 'bkgd_gradient'])

/**
 * @class configObj
 */
export default class ConfigObj {
  defaultPrefs: Record<string, any>
  defaultConfig: Record<string, unknown>
  curPrefs: Record<string, any>
  defaultExtensions: string[]
  curConfig: Record<string, any>
  editor: EditorInstance

  /** Whether the preferences dialog is open (the editor sets it). */ preferences: boolean

  constructor (editor: EditorInstance) {
    /**
      * Preferences.
      * @interface module:SVGEditor.Prefs
      * @property {string} [lang="en"] Two-letter language code. This fork ships English only (see `src/editor/locale/`); non-English codes fall back to "en" via `locale.js`.
      * @property {string} [bkgd_color="#FFF"] Color hex for canvas background color. Defaults to white.
      * @property {string} [bkgd_url=""] Background raster image URL. This image will fill the background of the document; useful for tracing purposes.
      * @property {"embed"|"ref"} [img_save="embed"] Defines whether included raster images should be saved as Data URIs when possible, or as URL references. Settable in the Document Properties dialog.
      * @property {boolean} [save_notice_done=false] Used to track alert status
      * @property {boolean} [export_notice_done=false] Used to track alert status
      * @todo `save_notice_done` and `export_notice_done` should be changed to flags rather than preferences
    */
    this.defaultPrefs = {
      // EDITOR OPTIONS (DIALOG)
      /**
        * Default to "en" if locale.js detection does not detect another language.
        */
      lang: 'en',
      /**
        * Will default to 's' if the window height is smaller than the minimum
        * height and 'm' otherwise.
        */
      bkgd_color: '#FFF',
      bkgd_url: '',
      bkgd_gradient: '',
      /** UI color theme: 'light' | 'dark' */
      theme: 'light',
      /** Touch-first tablet shell on/off (see uiMode.js) */
      tabletMode: false,
      /** Drag a numeric field's label to change its value (seSpinInput.js); a stored 'false' turns it off */
      scrub_numeric_fields: true,
      /** Colour distance (OKLab, black to white = 100) within which "Select same" fill / stroke match; 0 = exact */
      select_same_tolerance: 0,
      /** Pencil stabilisation, 0-95 (%): how much the pen trails the pointer to damp tremor (mirrors `curConfig.pencilStabilization`, 0-0.95) */
      pencil_stabilization: 30,
      /** Pencil fidelity, 0.5-10 screen pixels (user units at 100% zoom): the most the committed curve may stray from the stroke (mirrors `curConfig.pencilFidelity`) */
      pencil_fidelity: 2,
      // DOCUMENT PROPERTIES (DIALOG)
      img_save: 'embed',
      // ALERT NOTICES
      // Only shows in UI as far as alert notices, but useful to remember, so keeping as pref
      save_notice_done: false,
      export_notice_done: false,
      // GRID (persisted mirror of the curConfig grid settings; see seedGridConfigFromPrefs)
      grid_show: false,
      grid_snapping: false,
      grid_color: '#000',
      grid_snapping_step: 10,
      grid_shape: 'square'
    }
    /**
      * @tutorial ConfigOptions
      * @interface module:SVGEditor.Config
      * @property {string} [canvasName="default"] Used to namespace storage provided via `ext-storage.js`; you can use this if you wish to have multiple independent instances of SVG Edit on the same domain
      * @property {boolean} [no_save_warning=false] If `true`, prevents the warning dialog box from appearing when closing/reloading the page. Mostly useful for testing.
      * @property {string} [imgPath="images/"] The path where the SVG icons are located, with trailing slash.
      * @property {boolean} [noDefaultExtensions=false] If set to `true`, prohibits automatic inclusion of default extensions (though "extensions" can still be used to add back any desired default extensions along with any other extensions).
      *   This can only be meaningfully used before `init()`.
      * @property {boolean} [avoidClientSide=false] DEPRECATED (use `avoidClientSideDownload` instead); Used by `ext-server_opensave.js`; set to `true` if you wish to always save to server and not only as fallback when client support is lacking
      * @property {boolean} [avoidClientSideDownload=false] Used by `ext-server_opensave.js`; set to `true` if you wish to always save to server and not only as fallback when client support is lacking
      * @property {boolean} [avoidClientSideOpen=false] Used by `ext-server_opensave.js`; set to `true` if you wish to always open from the server and not only as fallback when FileReader client support is lacking
      * @property {string[]} [extensions=[]] Extensions to load on startup. Use an array in `setConfig`. Extension names must begin with "ext-".
      *   Note that as of version 2.7, paths containing "/", "\", or ":", are disallowed for security reasons.
      *   Although previous versions of this list would entirely override the default list, as of version 2.7, the defaults will always be added to this explicit list unless the configuration `noDefaultExtensions` is included.
      *   See {@link module:SVGEditor~defaultExtensions}.
      * @property {string[]} [disabledFeatures=[]] Built-in features to leave out, by name with or without the `ext-` prefix (`['opensave', 'ext-grid']`). Applies on top of the default list, so a host that wants everything except a few names lists only those, and new built-in tools reach it without a change. Also removes the names from an explicit `extensions` list. Can only be meaningfully set before `init()`.
      * @property {number} [canvas_expansion=3] The minimum area visible outside the canvas, as a multiple of the image dimensions. The larger the number, the more one can scroll outside the canvas.
      * @property {PlainObject} [initFill] Init fill properties
      * @property {string} [initFill.color="FFFFFF"] The initial fill color. Must be a hex code string. Defaults to solid white.
      * @property {number} [initFill.opacity=1] The initial fill opacity. Must be a number between 0 and 1
      * @property {PlainObject} [initStroke] Init stroke properties
      * @property {number} [initStroke.width=5] The initial stroke width. Must be a positive number.
      * @property {string} [initStroke.color="000000"] The initial stroke color. Must be a hex code. Defaults to solid black.
      * @property {number} [initStroke.opacity=1] The initial stroke opacity. Must be a number between 0 and 1.
      * @property {PlainObject} text Text style properties
      * @property {number} [text.stroke_width=0] Text stroke width
      * @property {number} [text.font_size=24] Text font size
      * @property {string} [text.font_family="serif"] Text font family
      * @property {number} [initOpacity=1] Initial opacity (multiplied by 100)
      * @property {module:SVGEditor.XYDimensions} [dimensions=[640, 480]] The default width/height of a new document. Use an array in `setConfig` (e.g., `[800, 600]`).
      * @property {boolean} [gridSnapping=false] Enable snap to grid by default. Set in Editor Options.
      * @property {string} [gridColor="#000"] Accepts hex, e.g., '#000'. Set in Editor Options. Defaults to black.
      * @property {string} [baseUnit="px"] Set in Editor Options.
      * @property {number} [snappingStep=10] Set the default grid snapping value. Set in Editor Options.
      * @property {boolean} [showRulers=true] Initial state of ruler display (v2.6). Set in Editor Options.
      * @property {string} [initTool="select"] The initially selected tool. Must be either the ID of the button for the tool, or the ID without `tool_` prefix (e.g., "select").
      * @property {boolean} [wireframe=false] Start in wireframe mode
      * @property {boolean} [showlayers=false] Open the layers side-panel by default.
      * @property {"new"|"same"} [exportWindowType="new"] Can be "new" or "same" to indicate whether new windows will be generated for each export;
      *   the `window.name` of the export window is namespaced based on the `canvasName` (and incremented if "new" is selected as the type). Introduced 2.8.
      * @property {boolean} [showGrid=false] Set by `ext-grid.js`; determines whether or not to show the grid by default
      * @property {boolean} [show_outside_canvas=true] Defines whether or not elements outside the canvas should be visible. Set and used in `svgcanvas.js`.
      * @property {boolean} [selectNew=true] If true, will replace the selection with the current element and automatically select element objects (when not in "path" mode) after they are created, showing their grips (v2.6).
      * @property {boolean} [layerView=false] Set for 'ext-layer_view.js'; determines whether or not only current layer is shown by default
      *   Set and used in `svgcanvas.js` (`mouseUp`).
      * @property {?module:SVGEditor.UserDataAdapter} [userDataAdapter=null] Optional host storage adapter for persisting user customizations
      *   (custom palette colors, the saved shape library, and custom hotkey bindings) outside the editor's own `localStorage`. When `null`, all fall back to `localStorage`
      *   (keys `svg-edit-custom-palette`, `svg-edit-user-shapes`, `svg-edit-hotkeys`). Reads are synchronous; writes are called with the full current state on every edit
      *   and may be persisted asynchronously by the host. Registered once during `init()`; see `userDataAdapter.js`. Shape:
      *   `{ getPalette(): object, setPalette(overrides: object): void, getUserShapes(): {categories, shapes}, setUserShapes(store): void, getHotkeys(): object, setHotkeys(overrides: object): void }`.
     */
    const defaultExtPath = (() => {
      if (typeof document === 'undefined' || !document.baseURI) return './extensions'
      const url = new URL('./extensions/', document.baseURI).toString()
      return url.endsWith('/') ? url.slice(0, -1) : url
    })()

    this.defaultConfig = {
      canvasName: 'default',
      canvas_expansion: 3,
      initFill: {
        color: 'FFFFFF', // solid white
        opacity: 1
      },
      initStroke: {
        width: 5,
        color: '000000', // solid black
        opacity: 1
      },
      text: {
        stroke_width: 0,
        font_size: 24,
        font_family: 'Serif'
      },
      initOpacity: 1,
      initTool: 'select',
      exportWindowType: 'new', // 'same' (todo: also support 'download')
      wireframe: false,
      showlayers: false,
      no_save_warning: false,
      // PATH CONFIGURATION
      imgPath: './images',
      // Resolve relative to current base URI so deployments outside dist/editor still find extensions.
      extPath: defaultExtPath,
      // DOCUMENT PROPERTIES
      // Change the following to a preference (already in the Document Properties dialog)?
      dimensions: [640, 480],
      // EDITOR OPTIONS
      // Change the following to preferences (already in the Editor Options dialog)?
      gridSnapping: false,
      wireframeSnapping: false, // Synced at runtime by clickWireframe; snap to canvas proportion lines while wireframe is on
      gridColor: '#000',
      baseUnit: 'px',
      snappingStep: 10,
      showRulers: false,
      hideTabletToggle: false, // Hide the main menu's "Tablet mode" toggle; for hosts that choose the UI mode themselves via `tabletMode`
      hideTitle: false, // Hide the drawing-name (e.g. "untitled.svg") panel in the top bar; useful when the host UI already shows the filename

      // SOURCE OUTPUT BEHAVIOR
      dynamicOutput: false,
      // EXTENSION CONFIGURATION
      noDefaultExtensions: false, // can only be meaningfully set before `init()`
      disabledFeatures: [], // built-in `ext-*` names (prefix optional) to leave out; can only be meaningfully set before `init()`
      // EXTENSION-RELATED (GRID)
      showGrid: false, // Set by ext-grid.js
      gridShape: 'square', // 'square' | 'isometric' | 'triangle' | 'perspective1' | 'perspective2'. Set via the grid settings popover.
      // EXTENSION (CLIENT VS. SERVER SAVING/OPENING)
      avoidClientSide: false, // Deprecated in favor of `avoidClientSideDownload`
      avoidClientSideDownload: false,
      avoidClientSideOpen: false,
      layerView: false,
      // PENCIL TOOL
      // EMA low-pass factor applied to raw pointer coords while drawing with
      // the freehand pencil (0 = off/raw input, closer to 1 = more lag/smoothing).
      pencilStabilization: 0.3,
      // How far (user units, about px at 100% zoom) the committed pencil curve may stray from the
      // drawn stroke; sharp turns of the pen stay corners. Replaces `pencilSimplifyTolerance`
      // (paper.js units), which is no longer read. `pencilSimplify: false` keeps the legacy
      // every-3-points smoothing.
      pencilFidelity: 2,
      // USER DATA PERSISTENCE
      userDataAdapter: null // Optional host storage adapter for custom palette + user shapes; see userDataAdapter.js. Falls back to localStorage when null.
    }

    this.curPrefs = {}
    // Note: The difference between Prefs and Config is that Prefs
    //   can be changed in the UI and are stored in the browser,
    //   while config cannot
    /** @name module:SVGEditor~defaultExtensions */
    this.defaultExtensions = [
      'ext-connector',
      'ext-grid',
      'ext-proportion-markers',
      'ext-frame-labels',
      'ext-smart-guides',
      'ext-ruler-guides',
      'ext-corner-radius',
      'ext-repeat',
      'ext-mirror',
      'ext-taper',
      'ext-segment',
      'ext-text-path',
      'ext-shape-builder',
      'ext-markers',
      'ext-panning',
      'ext-brush',
      'ext-shapes',
      'ext-polystar',
      'ext-shape-family',
      'ext-cutter',
      'ext-shaper',
      'ext-smooth-tool',
      'ext-width-tool',
      'ext-distort-tool',
      'ext-gradient-tool',
      'ext-corner-tool',
      'ext-art-brush',
      'ext-blend',
      'ext-curvature',
      'ext-puppet-warp',
      'ext-opensave',
      'ext-layer_view',
      'ext-shadow',
      'ext-live-effects',
      'ext-outline',
      'ext-glow',
      'ext-path-edit',
      'ext-color-shift',
      'ext-recolor',
      'ext-layout-ops',
      'ext-fonts',
      'ext-eyedropper',
      'ext-measure',
      'ext-magic-wand'
    ]
    this.curConfig = {
      // We do not put on defaultConfig to simplify object copying
      //   procedures (we obtain instead from defaultExtensions)
      extensions: [],
      userExtensions: []
    }
    this.editor = editor
  }

  /** @function setupCurPrefs */
  setupCurPrefs (): void {
    const curPrefs = { ...this.defaultPrefs, ...this.curPrefs } // Now safe to merge with priority for curPrefs in the event any are already set
    // Export updated prefs
    this.curPrefs = curPrefs
  }

  /** Sets up current config based on defaults. */
  setupCurConfig (): void {
    const curConfig = { ...this.defaultConfig, ...this.curConfig } // Now safe to merge with priority for curConfig in the event any are already set

    // Now deal with extensions and other array config
    if (!curConfig.noDefaultExtensions) {
      curConfig.extensions = [...this.defaultExtensions]
    }
    if (curConfig.disabledFeatures?.length) {
      const off = new Set(curConfig.disabledFeatures.map((name: string) => (name.startsWith('ext-') ? name : `ext-${name}`)))
      curConfig.extensions = curConfig.extensions.filter((name: string) => !off.has(name))
    }
    // Export updated config
    this.curConfig = curConfig
  }

  /**
    * Sets `configObj.defaultPrefs` based on previously persisted storage.
    *  This will not override `setConfig` configuration (unless initial user
    *  overriding is explicitly permitted there via `allowInitialUserOverride`).
    * @function module:SVGEditor.loadContentAndPrefs
   */
  loadContentAndPrefs (): void {
    const { storage } = this.editor
    if (!storage) {
      return
    }

    // LOAD PREFS
    Object.keys(this.defaultPrefs).forEach((key) => {
      if (SESSION_ONLY_PREFS.has(key)) { return }
      const storeKey = 'svg-edit-' + key
      const val = storage.getItem(storeKey)
      if (val) {
        this.defaultPrefs[key] = String(val) // Convert to string for FF (.value fails in Webkit)
      }
    })
  }

  /**
  * Allows setting of preferences or configuration (including extensions).
  * @function module:SVGEditor.setConfig
 * @param opts The preferences or configuration (including extensions). See the tutorial on {@tutorial ConfigOptions} for info on config and preferences.
 * @param cfgCfg Describes configuration which applies to the
particular batch of supplied options; `allowInitialUserOverride` (default `false`): set to true if you wish
to let previously stored preferences (and the user) override the value
you supply as the default; note that it will be too late if you make
such calls in extension code because preference storage will already
have been read.
   */
  setConfig (opts: Record<string, any>, cfgCfg: { allowInitialUserOverride?: boolean } = {}): void {
    /** @param val See {@link module :SVGEditor.Config} or {@link module :SVGEditor.Prefs} */
    const extendOrAdd = (cfgObj: Record<string, unknown>, key: string, val: any): void => {
      if (cfgObj[key] && typeof cfgObj[key] === 'object' && !Array.isArray(cfgObj[key])) {
        cfgObj[key] = mergeDeep(cfgObj[key], val)
      } else {
        cfgObj[key] = val
      }
    }
    Object.entries(opts).forEach(([key, val]) => {
      // Only allow prefs defined in configObj.defaultPrefs or...
      // Membership test (`key in`), not truthiness: prefs whose default is falsy
      // (e.g. `tabletMode: false`, `bkgd_url: ''`) must still be settable here.
      if (key in this.defaultPrefs) {
        if (cfgCfg.allowInitialUserOverride === true) {
          this.defaultPrefs[key] = val
        } else {
          // mayBeEmpty=true so an explicit falsy value (false/'') is written
          // rather than treated as a getter (see pref()).
          this.pref(key, val, true)
        }
      } else if (['extensions', 'userExtensions'].includes(key)) {
        this.curConfig[key] = this.curConfig[key].concat(val) // We will handle any dupes later
      // Only allow other configObj.curConfig if defined in configObj.defaultConfig
      } else if ({}.hasOwnProperty.call(this.defaultConfig, key)) {
        // Potentially overwriting of previously set config
        if ({}.hasOwnProperty.call(this.curConfig, key)) {
          extendOrAdd(this.curConfig, key, val)
        } else if (cfgCfg.allowInitialUserOverride === true) {
          extendOrAdd(this.defaultConfig, key, val)
        } else if (this.defaultConfig[key] && typeof this.defaultConfig[key] === 'object' && !Array.isArray(this.defaultConfig[key])) {
          this.curConfig[key] = {}
          this.curConfig[key] = mergeDeep(this.curConfig[key], val)
        } else {
          this.curConfig[key] = val
        }
      }
    })
  }

  /**
  * Store and retrieve preferences. With only a key it reads the preference (the stored one, else the default); with a
  * value it stores it (an empty value is ignored unless `mayBeEmpty` is set, and then reads, as before).
  * @overload
  * @param {string} key The preference name to be read
  * @returns {string}
  */
  /**
  * @overload
  * @param {string} key The preference name to be set
  * @param {string|boolean|number} val The value
  * @param {boolean} [mayBeEmpty] If value may be falsey.
  * @returns {void}
  * @todo Review whether any remaining existing direct references to
  *  getting `curPrefs` can be changed to use `svgEditor.configObj.pref()` getting to ensure
  *  `defaultPrefs` fallback (also for sake of `allowInitialUserOverride`);
  *  specifically, `bkgd_color` could be changed so that the pref dialog has a
  *  button to auto-calculate background, but otherwise uses `svgEditor.configObj.pref()` to
  *  be able to get default prefs or overridable settings
  */
  pref (key: string): string
  pref (key: string, val: string | boolean | number | undefined, mayBeEmpty?: boolean): void
  pref (key: string, val?: string | boolean | number, mayBeEmpty?: boolean): string | void {
    if (mayBeEmpty || val) {
      this.curPrefs[key] = val
      if (!SESSION_ONLY_PREFS.has(key)) {
        this.editor.storage?.setItem('svg-edit-' + key, String(val))
      }
      return undefined
    }
    return (key in this.curPrefs) ? this.curPrefs[key] : this.defaultPrefs[key]
  }

  /** @function load load Config */
  load (): void {
    this.setupCurConfig()
    this.loadContentAndPrefs()
    this.setupCurPrefs()
    this.seedGridConfigFromPrefs()
    this.seedPencilConfigFromPrefs()
  }

  /**
   * Copy the persisted `grid_*` preferences (loaded from storage as strings)
   * into their runtime `curConfig` counterparts, coercing types. The grid
   * settings are read at runtime from `curConfig` (by `ext-grid` and the
   * snapping helpers), but persisted through the consent-gated prefs storage.
   */
  seedGridConfigFromPrefs (): void {
    const asBool = (v: string | boolean | void) => v === true || v === 'true'
    this.curConfig.showGrid = asBool(this.pref('grid_show'))
    this.curConfig.gridSnapping = asBool(this.pref('grid_snapping'))
    this.curConfig.gridColor = this.pref('grid_color') || this.curConfig.gridColor
    const step = parseFloat(this.pref('grid_snapping_step'))
    if (Number.isFinite(step) && step > 0) this.curConfig.snappingStep = step
    this.curConfig.gridShape = this.pref('grid_shape') || this.curConfig.gridShape
  }

  /**
   * Copy the persisted pencil preferences (percent and user units, as strings from storage) into the
   * `curConfig` values the pencil reads (a 0-0.95 factor and user units). A missing or unusable value keeps the default.
   */
  seedPencilConfigFromPrefs (): void {
    const stabilization = parseFloat(this.pref('pencil_stabilization'))
    if (Number.isFinite(stabilization)) this.curConfig.pencilStabilization = Math.min(95, Math.max(0, stabilization)) / 100
    const fidelity = parseFloat(this.pref('pencil_fidelity'))
    if (Number.isFinite(fidelity)) this.curConfig.pencilFidelity = Math.min(10, Math.max(0.5, fidelity))
  }
}
