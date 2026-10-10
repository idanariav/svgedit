/**
 * Canvas members that exist at runtime but are deliberately NOT part of the
 * typed public API: internal state accessors and module plumbing that `core/*`
 * attaches to the instance (nothing in the editor or extensions calls them).
 * Typed `any` and tagged `@internal`. To make one public, give it a real
 * declaration in `svgcanvas-members.d.ts` / `svgcanvas.d.ts` and delete it here.
 * `tests/unit/svgcanvas-dts-drift.test.js` requires every runtime member to be
 * declared either there or here.
 */
export interface InternalMembers {
  /** @internal */
  '$click': any
  /** @internal */
  '$qq': any
  /** @internal */
  PathClass: any
  /** @internal */
  SegmentClass: any
  /** @internal */
  SelectorManagerClass: any
  /** @internal */
  addCtrlGrip: any
  /** @internal */
  addEventListener: any
  /** @internal */
  addPointGrip: any
  /** @internal */
  addPtsToSelection(...args: any[]): any
  /** @internal */
  assignAttributes: any
  /** @internal */
  changeSvgContent(...args: any[]): any
  /** @internal */
  cleanupElement: any
  /** @internal */
  clearData: any
  /** @internal */
  container: any
  /** @internal */
  convertDropShadowFilters: any
  /** @internal */
  convertGradients: any
  /** @internal */
  createSVGElement(...args: any[]): any
  /** @internal */
  current_drawing_: any
  /** @internal */
  decode64: any
  /** @internal */
  destroy(...args: any[]): any
  /** @internal */
  destroyAbort: any
  /** @internal */
  dispatchEvent: any
  /** @internal */
  encodableFonts: any
  /** @internal */
  encodableImages: any
  /** @internal */
  endChanges(...args: any[]): any
  /** @internal */
  extensions: any
  /** @internal */
  flashStorage(...args: any[]): any
  /** @internal */
  getAllLayersMode: any
  /** @internal */
  getBBox: any
  /** @internal */
  getBaseUnit(...args: any[]): any
  /** @internal */
  getCanvas(...args: any[]): any
  /** @internal */
  getClipboardID(...args: any[]): any
  /** @internal */
  getClosest: any
  /** @internal */
  getContainer(...args: any[]): any
  /** @internal */
  getControllPoint1(...args: any[]): any
  /** @internal */
  getControllPoint2(...args: any[]): any
  /** @internal */
  getCtrlLine: any
  /** @internal */
  getCurBBoxes(...args: any[]): any
  /** @internal */
  getCurCommand(...args: any[]): any
  /** @internal */
  getCurProperties(...args: any[]): any
  /** @internal */
  getCurText(...args: any[]): any
  /** @internal */
  getCurrentMode(...args: any[]): any
  /** @internal */
  getCurrentResizeMode(...args: any[]): any
  /** @internal */
  getDAttr(...args: any[]): any
  /** @internal */
  getDOMContainer(...args: any[]): any
  /** @internal */
  getDrawing(...args: any[]): any
  /** @internal */
  getDrawnPath(...args: any[]): any
  /** @internal */
  getEncodableFonts(...args: any[]): any
  /** @internal */
  getEncodableImages(...args: any[]): any
  /** @internal */
  getEnd(...args: any[]): any
  /** @internal */
  getFillOpacity(...args: any[]): any
  /** @internal */
  getFilter(...args: any[]): any
  /** @internal */
  getFilterHidden(...args: any[]): any
  /** @internal */
  getFontColor: any
  /** @internal */
  getFontFamily: any
  /** @internal */
  getFontSize: any
  /** @internal */
  getFreehand(...args: any[]): any
  /** @internal */
  getGridShape(...args: any[]): any
  /** @internal */
  getGridSnapping(...args: any[]): any
  /** @internal */
  getGripPt: any
  /** @internal */
  getHeight(...args: any[]): any
  /** @internal */
  getId(...args: any[]): any
  /** @internal */
  getIdPrefix(...args: any[]): any
  /** @internal */
  getImportIds(...args: any[]): any
  /** @internal */
  getInitBbox(...args: any[]): any
  /** @internal */
  getIntersectionList: any
  /** @internal */
  getJustSelected(...args: any[]): any
  /** @internal */
  getLastClickPoint(...args: any[]): any
  /** @internal */
  getLastGoodImgUrl(...args: any[]): any
  /** @internal */
  getLayerComment: any
  /** @internal */
  getLayerLocked: any
  /** @internal */
  getLinkControlPts: any
  /** @internal */
  getMouseTarget: any
  /** @internal */
  getMouseTargetFromNode: any
  /** @internal */
  getNextIdWithPrefix(...args: any[]): any
  /** @internal */
  getNextParameter(...args: any[]): any
  /** @internal */
  getNextPos(...args: any[]): any
  /** @internal */
  getNsMap(...args: any[]): any
  /** @internal */
  getOffset(...args: any[]): any
  /** @internal */
  getOpacAni(...args: any[]): any
  /** @internal */
  getPaintOpacity(...args: any[]): any
  /** @internal */
  getParameter(...args: any[]): any
  /** @internal */
  getPathFuncs: any
  /** @internal */
  getPath_: any
  /** @internal */
  getPointFromGrip: any
  /** @internal */
  getRStartX(...args: any[]): any
  /** @internal */
  getRStartY(...args: any[]): any
  /** @internal */
  getRoundDigits(...args: any[]): any
  /** @internal */
  getRubberBox(...args: any[]): any
  /** @internal */
  getSegData: any
  /** @internal */
  getSelector(...args: any[]): any
  /** @internal */
  getSelectorManager: any
  /** @internal */
  getSnapToGrid(...args: any[]): any
  /** @internal */
  getSnappingStep(...args: any[]): any
  /** @internal */
  getStart(...args: any[]): any
  /** @internal */
  getStartTransform(...args: any[]): any
  /** @internal */
  getStartX(...args: any[]): any
  /** @internal */
  getStartY(...args: any[]): any
  /** @internal */
  getStarted(...args: any[]): any
  /** @internal */
  getStepCount(...args: any[]): any
  /** @internal */
  getStrokeOpacity(...args: any[]): any
  /** @internal */
  getStrokedBBoxDefaultVisible: any
  /** @internal */
  getStyle(...args: any[]): any
  /** @internal */
  getSumDistance(...args: any[]): any
  /** @internal */
  getSvgOptionApply(...args: any[]): any
  /** @internal */
  getSvgOptionImages(...args: any[]): any
  /** @internal */
  getText: any
  /** @internal */
  getTextFreshCreate(...args: any[]): any
  /** @internal */
  getThreSholdDist(...args: any[]): any
  /** @internal */
  getUIStrings(...args: any[]): any
  /** @internal */
  getUrlFromAttr: any
  /** @internal */
  getVersion(...args: any[]): any
  /** @internal */
  getVisElems(...args: any[]): any
  /** @internal */
  getWidth(...args: any[]): any
  /** @internal */
  getbSpline(...args: any[]): any
  /** @internal */
  getrefAttrs(...args: any[]): any
  /** @internal */
  getrootSctm(...args: any[]): any
  /** @internal */
  gettingSelectorManager(...args: any[]): any
  /** @internal */
  groupSvgElem: any
  /** @internal */
  hasMatrixTransform: any
  /** @internal */
  identifyLayers: any
  /** @internal */
  idprefix: any
  /** @internal */
  importIds: any
  /** @internal */
  initializeSvgCanvasMethods(...args: any[]): any
  /** @internal */
  lastGoodImgUrl: any
  /** @internal */
  linkControlPoints: any
  /** @internal */
  matrixMultiply: any
  /** @internal */
  modeChangeEvent(...args: any[]): any
  /** @internal */
  nsMap: any
  /** @internal */
  opacAni: any
  /** @internal */
  prepareSvg: any
  /** @internal */
  pushGroupProperties: any
  /** @internal */
  randIdsMode: any
  /** @internal */
  recalcRotatedPath: any
  /** @internal */
  recalculateAllSelectedDimensions: any
  /** @internal */
  remapElement: any
  /** @internal */
  removeEventListener: any
  /** @internal */
  removePath_: any
  /** @internal */
  removeUnusedDefElems: any
  /** @internal */
  removedElements: any
  /** @internal */
  reorientGrads: any
  /** @internal */
  replacePathSeg: any
  /** @internal */
  restoreRefElements(...args: any[]): any
  /** @internal */
  round(...args: any[]): any
  /** @internal */
  saveOptions: any
  /** @internal */
  scopeRoot: any
  /** @internal */
  setBlurNoUndo: any
  /** @internal */
  setBlurOffsets: any
  /** @internal */
  setCanvas(...args: any[]): any
  /** @internal */
  setControllPoint1(...args: any[]): any
  /** @internal */
  setControllPoint2(...args: any[]): any
  /** @internal */
  setCurBBoxes(...args: any[]): any
  /** @internal */
  setCurCommand(...args: any[]): any
  /** @internal */
  setCurProperties(...args: any[]): any
  /** @internal */
  setCurShape(...args: any[]): any
  /** @internal */
  setCurText(...args: any[]): any
  /** @internal */
  setCurrentGroup(...args: any[]): any
  /** @internal */
  setCurrentMode(...args: any[]): any
  /** @internal */
  setCurrentResizeMode(...args: any[]): any
  /** @internal */
  setDAttr(...args: any[]): any
  /** @internal */
  setDocumentTitle: any
  /** @internal */
  setDrawnPath(...args: any[]): any
  /** @internal */
  setEmptySelectedElements(...args: any[]): any
  /** @internal */
  setEncodableFont(...args: any[]): any
  /** @internal */
  setEncodableImages(...args: any[]): any
  /** @internal */
  setEnd(...args: any[]): any
  /** @internal */
  setFillPaint(...args: any[]): any
  /** @internal */
  setFilter(...args: any[]): any
  /** @internal */
  setFilterHidden(...args: any[]): any
  /** @internal */
  setFontColor: any
  /** @internal */
  setFreehand(...args: any[]): any
  /** @internal */
  setGoodImage(...args: any[]): any
  /** @internal */
  setGradient: any
  /** @internal */
  setIdPrefix(...args: any[]): any
  /** @internal */
  setImportIds(...args: any[]): any
  /** @internal */
  setInitBbox(...args: any[]): any
  /** @internal */
  setJustSelected(...args: any[]): any
  /** @internal */
  setLastClickPoint(...args: any[]): any
  /** @internal */
  setLinkControlPoints: any
  /** @internal */
  setMultilineText: any
  /** @internal */
  setNextParameter(...args: any[]): any
  /** @internal */
  setNextPos(...args: any[]): any
  /** @internal */
  setPaintOpacity(...args: any[]): any
  /** @internal */
  setParameter(...args: any[]): any
  /** @internal */
  setPathObj: any
  /** @internal */
  setRStartX(...args: any[]): any
  /** @internal */
  setRStartY(...args: any[]): any
  /** @internal */
  setRemovedElements(...args: any[]): any
  /** @internal */
  setRootSctm(...args: any[]): any
  /** @internal */
  setRubberBox(...args: any[]): any
  /** @internal */
  setSelectedElements(...args: any[]): any
  /** @internal */
  setStart(...args: any[]): any
  /** @internal */
  setStartTransform(...args: any[]): any
  /** @internal */
  setStartX(...args: any[]): any
  /** @internal */
  setStartY(...args: any[]): any
  /** @internal */
  setStarted(...args: any[]): any
  /** @internal */
  setStrokePaint(...args: any[]): any
  /** @internal */
  setSumDistance(...args: any[]): any
  /** @internal */
  setSvgContent(...args: any[]): any
  /** @internal */
  setTextFreshCreate(...args: any[]): any
  /** @internal */
  setUiStrings(...args: any[]): any
  /** @internal */
  setUseData: any
  /** @internal */
  setbSpline(...args: any[]): any
  /** @internal */
  simplifyFreehand: any
  /** @internal */
  smoothControlPoints: any
  /** @internal */
  snapPointToGrid: any
  /** @internal */
  snapToGrid: any
  /** @internal */
  state: any
  /** @internal */
  stringToHTML: any
  /** @internal */
  svgContent: any
  /** @internal */
  svgToString: any
  /** @internal */
  svgdoc: any
  /** @internal */
  transformListToTransform: any
  /** @internal */
  uiStrings: any
  /** @internal */
  units: any
  /** @internal */
  updateClipPath: any
  /** @internal */
  withContextUndimmed: any
  /** @internal */
  cancelToolGesture(...args: any[]): any
  /** @internal */
  toolHover(...args: any[]): any
  /** @internal */
  toolKeyDown(...args: any[]): any
  /** @internal */
  toolModeChanged(...args: any[]): any
  /** @internal */
  toolPointerDown(...args: any[]): any
  /** @internal */
  toolPointerMove(...args: any[]): any
  /** @internal */
  toolPointerUp(...args: any[]): any
}
