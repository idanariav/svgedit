import { describe, expect, it } from 'vitest'
import { hoistResources } from '../../packages/svgcanvas/core/hoist-resources.ts'
import { readDom } from '../../packages/svgcanvas/core/model-render.ts'
import { findById } from '../../packages/svgcanvas/core/model/edit.ts'

const model = (inner) => readDom(new DOMParser().parseFromString(
  `<svg xmlns="http://www.w3.org/2000/svg"><defs id="d"/><g class="layer" id="L"><g id="g">${inner}</g></g></svg>`, 'image/svg+xml').documentElement)
const names = (el) => el.children.map((n) => n.kind === 'comment' ? '#comment' : n.kind === 'element' ? (n.attrs.find((a) => a.name === 'id') ? `${n.name}#${n.attrs.find((a) => a.name === 'id').value}` : n.name) : null).filter(Boolean)

describe('hoistResources', () => {
  it('moves what shapes refer to into <defs>, drops what nothing can use, keeps the shapes', () => {
    const root = model('<!-- svg-source:excalidraw --><metadata/><defs><style class="style-fonts"/><linearGradient id="lg"/><g id="sym"/><path/></defs>' +
      '<mask id="m1"><rect/></mask><mask/><style>.a{fill:red}</style><style/><rect id="r" mask="url(#m1)"/><g id="inner"><defs><clipPath id="c"/></defs></g>')
    const out = hoistResources(root, 'g')
    expect(names(findById(out, 'g'))).toEqual(['rect#r', 'g#inner'])
    expect(names(findById(out, 'd'))).toEqual(['linearGradient#lg', 'g#sym', 'mask#m1', 'style'])
    // a resource inside a nested group stays with it
    expect(names(findById(out, 'inner'))).toEqual(['defs'])
  })

  it('leaves a group of shapes, or a missing group, as it is (the same root)', () => {
    const root = model('<rect id="a"/><title>t</title><path id="b"/>')
    expect(hoistResources(root, 'g')).toBe(root)
    expect(hoistResources(root, 'nope')).toBe(root)
  })
})
