/**
 * Document model: SVG/XML text -> persistent tree (see `node.ts`).
 *
 * Uses `saxes` (strict XML, pure JS, no DOM) with namespace processing off, so a qualified name is kept as written
 * and an undeclared prefix (older drawings used `se:` without declaring it) parses instead of failing.
 * Lossless at the infoset level: element and attribute order, text, CDATA, comments, PIs, the declaration and the
 * doctype are all kept. Entity spelling (`&#x27;` vs `'`), quote style and the spacing inside a tag are not, since
 * the parser reports decoded values; `serialize.ts` writes one canonical spelling.
 * @module model/parse
 * @license MIT
 */
import { SaxesParser } from 'saxes'
import { cdata, comment, decl, doctype, element, pi, text } from './node.ts'

import type { ModelNode, ModelElement, ModelMisc, ModelDocument, ModelComment, ModelPI } from './node.ts'

/** Thrown for text that is not well-formed XML; `line` / `column` are 1-based. */
export class SvgParseError extends Error {
  line: number
  column: number

  constructor (message: string, line: number, column: number) {
    super(message)
    this.name = 'SvgParseError'
    this.line = line
    this.column = column
  }
}

interface Open {
  name: string
  attrs: { name: string, value: string }[]
  children: ModelNode[]
}

/** Throws a SvgParseError when `source` is not well-formed, or has no root element. */
export const parseSvg = (source: string): ModelDocument => {
  const parser = new SaxesParser({ xmlns: false, position: true, fileName: 'drawing.svg' })
  const prolog: ModelMisc[] = []
  const epilog: (ModelComment | ModelPI)[] = []
  const stack: Open[] = []
  let root: ModelElement | null = null
  let failure: SvgParseError | null = null

  const addChild = (node: ModelNode) => {
    const top = stack[stack.length - 1]
    // saxes may split one run of character data into several events
    const last = top.children[top.children.length - 1]
    if (node.kind === 'text' && last?.kind === 'text') top.children[top.children.length - 1] = text(last.value + node.value)
    else top.children.push(node)
  }
  const addMisc = (node: ModelComment | ModelPI) => {
    if (stack.length) addChild(node)
    else (root ? epilog : prolog).push(node)
  }

  parser.on('error', (err) => {
    failure ??= new SvgParseError(err.message.replace(/^drawing\.svg:\d+:\d+:\s*/, ''), parser.line, parser.column)
  })
  parser.on('xmldecl', (d) => {
    prolog.push(decl(d.version ?? '1.0', d.encoding, d.standalone))
  })
  parser.on('doctype', (d) => { prolog.push(doctype(d)) })
  parser.on('processinginstruction', (p) => { addMisc(pi(p.target, p.body)) })
  parser.on('comment', (c) => { addMisc(comment(c)) })
  parser.on('opentag', (tag) => {
    const attrs = Object.entries(tag.attributes as Record<string, string>).map(([name, value]) => ({ name, value }))
    stack.push({ name: tag.name, attrs, children: [] })
  })
  parser.on('text', (t) => {
    if (stack.length) addChild(text(t))
  })
  parser.on('cdata', (t) => { if (stack.length) addChild(cdata(t)) })
  parser.on('closetag', () => {
    const open = stack.pop()
    if (!open) return
    const el = element(open.name, open.attrs, open.children)
    if (stack.length) addChild(el)
    else root = el
  })

  parser.write(source).close()
  if (failure) throw failure
  if (!root) throw new SvgParseError('no root element', parser.line, parser.column)
  return { prolog, root, epilog }
}
