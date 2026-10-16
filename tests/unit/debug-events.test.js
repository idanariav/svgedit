import { describeElement, redact, describePointer } from '../../packages/svgcanvas/core/debug-events.ts'

describe('debug-events', () => {
  it('names an element tag#id, never its content', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    el.id = 'svg_3'
    el.textContent = 'a secret note'
    expect(describeElement(el)).toBe('text#svg_3')
    el.removeAttribute('id')
    expect(describeElement(el)).toBe('text')
    expect(describeElement(null)).toBeNull()
    expect(describeElement('x')).toBeNull()
  })

  it('cuts long strings, hides data URIs and describes elements inside objects', () => {
    const long = 'x'.repeat(100)
    const el = document.createElement('div')
    el.id = 'd'
    expect(redact(long)).toBe(`${'x'.repeat(80)}…(+20)`)
    expect(redact('data:image/png;base64,AAAA')).toBe('data:…(26 chars)')
    expect(redact({ a: 1, img: 'data:image/png;base64,AAAA', els: [el] })).toEqual({ a: 1, img: 'data:…(26 chars)', els: ['DIV#d'] })
    expect(redact([1, 2, 3])).toEqual([1, 2, 3])
    expect(redact({ a: { b: { c: { d: 1 } } } })).toEqual({ a: { b: { c: '{…}' } } })
  })

  it('describes a pointer event by target, button, modifiers and position', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    el.id = 'r'
    const evt = { target: el, button: 0, shiftKey: true, altKey: false, ctrlKey: false, metaKey: true, clientX: 10.4, clientY: 20.6 }
    expect(describePointer(evt)).toEqual({ target: 'rect#r', button: 0, mods: 'shift+meta', client: [10, 21] })
    expect(describePointer({ ...evt, shiftKey: false, metaKey: false }).mods).toBe('')
  })
})
