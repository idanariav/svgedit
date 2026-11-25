import { describe, expect, it } from 'vitest'
import { hoistResources } from '../../packages/svgcanvas/core/hoist-resources.ts'

const NS = 'http://www.w3.org/2000/svg'
const parse = (inner) => new DOMParser().parseFromString(`<svg xmlns="${NS}"><defs id="d"/><g id="g">${inner}</g></svg>`, 'image/svg+xml')
const tags = (el) => Array.from(el.childNodes).map((n) => n.nodeType === 8 ? '#comment' : n.nodeType === 1 ? (n.id ? `${n.localName}#${n.id}` : n.localName) : null).filter(Boolean)

describe('hoistResources', () => {
  it('moves what shapes refer to into <defs>, drops what nothing can use, keeps the shapes', () => {
    const doc = parse('<!-- svg-source:excalidraw --><metadata/><defs><style class="style-fonts"/><linearGradient id="lg"/><g id="sym"/><path/></defs>' +
      '<mask id="m1"><rect/></mask><mask/><style>.a{fill:red}</style><style/><rect id="r" mask="url(#m1)"/><g id="inner"><defs><clipPath id="c"/></defs></g>')
    const g = doc.getElementById('g')
    const defs = doc.getElementById('d')
    const moved = hoistResources(g, defs)
    expect(tags(g)).toEqual(['rect#r', 'g#inner'])
    expect(tags(defs)).toEqual(['linearGradient#lg', 'g#sym', 'mask#m1', 'style'])
    expect(moved.map((el) => el.localName)).toEqual(['linearGradient', 'g', 'mask', 'style'])
    // a resource inside a nested group stays with it
    expect(tags(doc.getElementById('inner'))).toEqual(['defs'])
  })

  it('leaves a group of shapes untouched', () => {
    const doc = parse('<rect id="a"/><title>t</title><path id="b"/>')
    expect(hoistResources(doc.getElementById('g'), doc.getElementById('d'))).toEqual([])
    expect(tags(doc.getElementById('g'))).toEqual(['rect#a', 'title', 'path#b'])
  })
})
