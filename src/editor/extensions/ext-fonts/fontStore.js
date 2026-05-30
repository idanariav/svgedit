/* globals svgEditor */
/**
 * @file fontStore.js
 *
 * Persistent custom-font cache + live registration for the ext-fonts feature.
 *
 * Responsibilities:
 *   - Download a Google Font's WOFF2 once (`downloadGoogleFont`).
 *   - Persist it in IndexedDB so it works offline on subsequent loads.
 *   - Register it with the live document via the `FontFace` API so text renders
 *     with it on the canvas.
 *   - Mirror it into the canvas' encodable-font registry so it gets embedded as
 *     a base64 `@font-face` in `<defs>` on export (see core/svg-exec.js).
 *
 * @license MIT
 */

const DB_NAME = 'svgedit-fonts'
const STORE = 'fonts'
// Bump when the stored payload's meaning changes so stale entries are refreshed.
// v2: download the Latin subset (v1 grabbed the first/wrong subset → no glyphs).
const REC_VERSION = 2

// In-memory mirror of cached fonts (family -> base64 woff2) for fast sync checks.
const _cache = new Map()
let _dbPromise = null

const openDB = () => {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'family' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return _dbPromise
}

const putRecord = async (record) => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

const getRecord = async (family) => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(family)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

const getAllRecords = async () => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

const arrayBufferToBase64 = (buf) => {
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Fetch a Google Font and return its WOFF2 payload as a base64 string.
 * Uses the CSS2 API to resolve the (browser-negotiated) woff2 URL, then fetches
 * the binary. Requires a network connection — this is the one-time download.
 * @param {string} family
 * @returns {Promise<string>} base64 woff2
 */
export const downloadGoogleFont = async (family) => {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`
  const cssResp = await fetch(cssUrl)
  if (!cssResp.ok) throw new Error(`Google Fonts CSS request failed (${cssResp.status})`)
  const css = await cssResp.text()
  const woff2Url = pickLatinWoff2(css)
  if (!woff2Url) throw new Error(`No woff2 source found for "${family}"`)
  const fontResp = await fetch(woff2Url)
  if (!fontResp.ok) throw new Error(`Font file request failed (${fontResp.status})`)
  const buf = await fontResp.arrayBuffer()
  return arrayBufferToBase64(buf)
}

/**
 * The CSS2 API splits a font into per-subset @font-face blocks (latin, latin-ext,
 * cyrillic, …) — and the Latin block (the one covering basic ASCII) is usually
 * NOT first. Picking the wrong subset yields a font with no English glyphs that
 * silently falls back to serif. Select the Latin block (by its subset comment
 * annotation, or a unicode-range covering U+0000-00FF), falling back to the
 * first available woff2.
 * @param {string} css
 * @returns {string|null} woff2 URL
 */
const pickLatinWoff2 = (css) => {
  const faceRe = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([\s\S]*?)\}/g
  const candidates = []
  let m
  while ((m = faceRe.exec(css))) {
    const url = m[2].match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1]
    if (url) candidates.push({ subset: m[1], url, block: m[2] })
  }
  if (candidates.length) {
    const latin = candidates.find(c => c.subset === 'latin') ||
      candidates.find(c => /U\+0000/i.test(c.block))
    return (latin || candidates[0]).url
  }
  // No subset annotations (single-face response): take the first woff2
  return css.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1] || null
}

/**
 * Register a font with the live document (FontFace) and the exporter registry.
 * Safe to call repeatedly.
 * @param {string} family
 * @param {string} base64 woff2
 * @returns {Promise<void>}
 */
export const registerFont = async (family, base64) => {
  _cache.set(family, base64)
  // Expose to the export-time @font-face embedder
  svgEditor?.svgCanvas?.setEncodableFont(family, base64)
  // Add to document.fonts so the canvas renders it live (skip if already present)
  const already = Array.from(document.fonts).some(f => f.family === family)
  if (!already) {
    const face = new FontFace(family, `url(data:font/woff2;base64,${base64})`)
    await face.load()
    document.fonts.add(face)
  }
}

/**
 * Ensure a font is available: downloading + persisting it on first use, then
 * registering it. After the first call (online) the font works offline forever.
 * @param {string} family
 * @returns {Promise<void>}
 */
export const ensureFont = async (family) => {
  if (_cache.has(family)) {
    await registerFont(family, _cache.get(family))
    return
  }
  let record = await getRecord(family)
  // Re-download entries saved by an older version (e.g. v1's wrong-subset font)
  if (record && record.v !== REC_VERSION) record = null
  if (!record) {
    const woff2Base64 = await downloadGoogleFont(family)
    record = { family, woff2Base64, v: REC_VERSION }
    await putRecord(record)
  }
  await registerFont(family, record.woff2Base64)
}

/**
 * Re-register every previously downloaded font. Call once on editor startup so
 * cached fonts render and export without any network access.
 * @returns {Promise<string[]>} families restored
 */
export const restoreAll = async () => {
  let records = []
  try {
    records = await getAllRecords()
  } catch (e) {
    console.warn('fontStore: failed to read cached fonts', e)
    return []
  }
  // Ignore stale-version entries; they get re-downloaded (and overwritten) when
  // the user next picks that font.
  const fresh = records.filter(r => r.v === REC_VERSION)
  await Promise.all(fresh.map(r =>
    registerFont(r.family, r.woff2Base64).catch(e =>
      console.warn(`fontStore: failed to restore "${r.family}"`, e))
  ))
  return fresh.map(r => r.family)
}

/**
 * @param {string} family
 * @returns {boolean} whether the font is already cached this session
 */
export const isCached = (family) => _cache.has(family)
