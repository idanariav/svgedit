import { describe, expect, it, vi } from 'vitest'
import { defineFeature, addFeatureLocale } from '../../src/editor/extensions/defineFeature.ts'

const editorWith = (lang) => ({
  configObj: { pref: vi.fn(() => lang) },
  i18next: { addResourceBundle: vi.fn() }
})

describe('defineFeature', () => {
  it('hands the feature back unchanged', () => {
    const feature = { name: 'x', init: () => ({}) }
    expect(defineFeature(feature)).toBe(feature)
  })
})

describe('addFeatureLocale', () => {
  const locales = { './locale/en.js': { default: { a: 1 } }, './locale/fr.js': { default: { a: 2 } } }

  it("adds the editor's language under the feature's name", () => {
    const editor = editorWith('fr')
    addFeatureLocale(editor, 'grid', locales)
    expect(editor.i18next.addResourceBundle).toHaveBeenCalledWith('fr', 'grid', { a: 2 })
  })

  it('falls back to English when the feature has no such file', () => {
    const editor = editorWith('de')
    addFeatureLocale(editor, 'grid', locales)
    expect(editor.i18next.addResourceBundle).toHaveBeenCalledWith('de', 'grid', { a: 1 })
  })

  it("merges into i18next's default namespace with overwrite when asked", () => {
    const editor = editorWith('en')
    addFeatureLocale(editor, 'opensave', locales, 'translation')
    expect(editor.i18next.addResourceBundle).toHaveBeenCalledWith('en', 'translation', { a: 1 }, true, true)
  })

  it('does nothing without any locale file', () => {
    const editor = editorWith('en')
    addFeatureLocale(editor, 'grid', {})
    expect(editor.i18next.addResourceBundle).not.toHaveBeenCalled()
  })
})
