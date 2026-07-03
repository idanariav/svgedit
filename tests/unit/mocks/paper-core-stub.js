// Stub for 'paper/dist/paper-core.js', aliased in vitest only (see vite.config.mjs
// test.alias). The real module constructs a PaperScope at import time, which needs
// a working 2D canvas context — unavailable under jsdom without the native `canvas`
// package. No current test exercises real paper.js geometry ops (boolean-ops, cutter,
// path-offset, shape-builder, taper-stroke, path-simplify all lack unit tests), so this
// stub only needs to prevent the crash on import.
class PaperScope {
  setup () {}
}

export default { PaperScope }
