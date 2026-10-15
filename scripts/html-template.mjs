/**
 * Compaction for the editor's HTML templates (panels, dialogs, editor shell),
 * applied by the `svgedit-html-templates` plugin in `vite.config.mjs` when a
 * template is imported as a string.
 *
 * The templates are indented for reading; parsed as-is, that indentation would
 * become whitespace text nodes between elements (gaps between inline-block
 * controls, extra `childNodes`, a leading space in a label). So each line is
 * trimmed, whitespace between two tags is dropped, and so is a line break right
 * after or before a tag. Nothing else changes: text, attribute values,
 * entities, comments and `<style>` contents keep their characters, a space on
 * the same line as a tag stays, and a line break inside text stays a line
 * break (one space when rendered).
 *
 * This replaced vite-plugin-string's compressor, a GLSL minifier that stripped
 * whitespace around `-`, `+`, `,`, `/`, `!`, `&`… and joined lines without a
 * separator: it turned `calc(100vw - 32px)` into invalid CSS and glued
 * attributes on consecutive lines together.
 *
 * @param {string} html
 * @returns {string}
 */
export function compactHtmlTemplate (html) {
  return html
    .split(/\r?\n/)
    .map(line => line.trim())
    .join('\n')
    .replace(/>\s+</g, '><')
    .replace(/>\n+/g, '>')
    .replace(/\n+</g, '<')
    .trim()
}
