import { describe, it, expect } from 'vitest'
import { countWrites } from '../../scripts/check-dom-writes.mjs'

describe('check-dom-writes countWrites', () => {
  it('counts calls that change the tree or its attributes', () => {
    expect(countWrites("el.setAttribute('x', 1)\nparent.append(a)\nnode.remove()\nel.removeAttribute('y')")).toBe(4)
  })
  it('ignores comments and reads', () => {
    const src = "// el.setAttribute('x', 1)\n/* a.append(b)\n b.remove() */\nconst v = el.getAttribute('x')\nlist.includes(x)"
    expect(countWrites(src)).toBe(0)
  })
  it('does not count Array or Set methods that share a name', () => {
    expect(countWrites('set.delete(a)\narr.push(b)\nstr.replace(a, b)')).toBe(0)
  })
})
