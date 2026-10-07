/**
 * panelI18n.js — localise the literal English labels in the static panel
 * templates (RightPanel.html / TopPanel.html).
 *
 * Those templates carry plain English for section titles, tab names and some
 * `label`/`title` attributes. Rather than rewriting every one into a key, each
 * string is looked up as `panel.<slug>` (slug = lower-case, non-alphanumerics →
 * `_`, `&` → `and`); when the active locale has that key the text is replaced,
 * otherwise the English original stays. Run on the template content before it
 * is attached, so components read the translated attribute on upgrade.
 *
 * @module panelI18n
 */

const TEXT_SELECTOR = '.sidepanel_section_label, .sub_label, .sidepanel_tab, summary, .sidepanel_hint'
const ATTR_RE = /^[A-Z][^.]*$/

/**
 * @param {string} text
 * @returns {string} locale key under `panel.`
 */
export const panelKey = (text) =>
  'panel.' + text.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

/**
 * @param {ParentNode} root template content (or any subtree)
 * @param {{t: Function, exists: Function}} i18next
 * @returns {void}
 */
export const localizePanelFragment = (root, i18next) => {
  const tr = (text) => {
    const key = panelKey(text)
    return i18next.exists(key) ? i18next.t(key) : text
  }
  root.querySelectorAll(TEXT_SELECTOR).forEach((el) => {
    if (el.children.length || !el.textContent.trim()) return
    el.textContent = tr(el.textContent)
  })
  root.querySelectorAll('[label], [title]').forEach((el) => {
    for (const attr of ['label', 'title']) {
      const v = el.getAttribute(attr)
      if (v && ATTR_RE.test(v)) el.setAttribute(attr, tr(v))
    }
  })
}
