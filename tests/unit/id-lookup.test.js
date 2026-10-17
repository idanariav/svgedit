import { afterEach, describe, expect, it } from 'vitest'
import { $id, $req, scopedId, scopedReq } from '../../packages/svgcanvas/core/dom-utils.ts'

// `$id` returns the element or null; `$req` is for code that only runs once the element exists and throws an error that names the id.
// Each is also available scoped to one editor's container, so editors sharing a document do not see each other's ids.

describe('id lookups', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('$id returns the element, or null', () => {
    document.body.innerHTML = '<div id="here"></div>'
    expect($id('here')).toBe(document.getElementById('here'))
    expect($id('gone')).toBeNull()
  })

  it('$req returns the element, or throws naming the id', () => {
    document.body.innerHTML = '<div id="here"></div>'
    expect($req('here')).toBe(document.getElementById('here'))
    expect(() => $req('gone')).toThrow('No element #gone')
  })

  it('the scoped variants only see their own container', () => {
    document.body.innerHTML = '<div id="a"><span id="x"></span></div><div id="b"><span id="y"></span></div>'
    const a = document.getElementById('a')
    expect(scopedId(a)('x')).toBe(document.getElementById('x'))
    expect(scopedId(a)('y')).toBeNull()
    expect(scopedReq(a)('x')).toBe(document.getElementById('x'))
    expect(() => scopedReq(a)('y')).toThrow('No element #y')
  })
})
