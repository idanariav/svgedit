// defineFeature.ts — the typed shape of a built-in feature (`ext-*`): `defineFeature({ name, init(editor) })`, and the one-line locale loader every feature shares
import type { ExtensionHookPayloads } from '@svgedit/svgcanvas/core/extension-hooks.ts'

/** A feature's hooks by name, each typed with the payload `svgCanvas.runExtensions` hands it (see `core/extension-hooks.ts`). */
export type FeatureHooks = { [K in keyof ExtensionHookPayloads]?: (payload: ExtensionHookPayloads[K]) => unknown }

/** What a feature's `init()` returns: its hooks, and `callback()`, which runs once every extension is added. */
export type FeatureObject = FeatureHooks & {
  name?: string
  callback?: () => unknown
}

export interface Feature {
  /** Used internally; no need for i18n. Defaults to the directory name without `ext-`. */
  name?: string
  /** Called with the editor once, at startup, before the first document opens. */
  init (editor: EditorInstance): FeatureObject | void | Promise<FeatureObject | void>
}

/** Types a feature module's default export (an identity function: it costs nothing at run time). */
export const defineFeature = <T extends Feature>(feature: T): T => feature

/**
 * Adds a feature's strings to i18next, in the editor's language (English when the feature has no such file).
 * @param locales the feature's own `import.meta.glob('./locale/*.js', { eager: true })` (a glob resolves next to the file that writes it)
 * @param namespace the i18next namespace; defaults to the feature's name
 */
export const addFeatureLocale = (
  editor: EditorInstance,
  name: string,
  locales: Record<string, { default: object }>,
  namespace = name
): void => {
  const lang = editor.configObj.pref('lang')
  const translationModule = locales[`./locale/${lang}.js`] || locales['./locale/en.js']
  if (!translationModule) return
  // 'translation' is i18next's default namespace: its keys are merged into the editor's own, so they overwrite
  if (namespace === 'translation') editor.i18next.addResourceBundle(lang, namespace, translationModule.default, true, true)
  else editor.i18next.addResourceBundle(lang, namespace, translationModule.default)
}
