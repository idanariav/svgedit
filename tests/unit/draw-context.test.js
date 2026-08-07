import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as draw from '../../packages/svgcanvas/core/draw.js'
import dataStorage from '../../packages/svgcanvas/core/dataStorage.js'

const NS_SVG = 'http://www.w3.org/2000/svg'

describe('draw context', () => {
  let currentGroup = null
  /** @type {{event: string, arg: any}[]} */
  const calls = []
  let svgContent
  let editGroup
  let sibling

  let clearSelectionCalls
  const canvas = {
    getDataStorage: () => dataStorage,
    getSvgContent: () => svgContent,
    clearSelection: () => {
      clearSelectionCalls.push(true)
    },
    call: (event, arg) => {
      calls.push({ event, arg })
    },
    getCurrentGroup: () => currentGroup,
    setCurrentGroup: (group) => {
      currentGroup = group
    }
  }

  beforeEach(() => {
    draw.init(canvas)
    canvas.leaveContext()

    currentGroup = null
    calls.length = 0
    clearSelectionCalls = []
    document.body.innerHTML = ''

    svgContent = document.createElementNS(NS_SVG, 'svg')
    svgContent.id = 'svgcontent'
    editGroup = document.createElementNS(NS_SVG, 'g')
    editGroup.id = 'edit'
    sibling = document.createElementNS(NS_SVG, 'rect')
    sibling.id = 'sib'
    sibling.setAttribute('opacity', 'inherit')
    svgContent.append(editGroup, sibling)
    document.body.append(svgContent)
  })

  afterEach(() => {
    canvas.leaveContext()
    document.body.innerHTML = ''
  })

  it('ignores unknown element ids', () => {
    expect(() => canvas.setContext('does-not-exist')).not.toThrow()
    expect(currentGroup).toBe(null)
    expect(calls.length).toBe(0)
  })

  it('handles non-numeric opacity and restores it', () => {
    canvas.setContext(editGroup)

    expect(currentGroup).toBe(editGroup)
    expect(calls[0]).toStrictEqual({ event: 'contextset', arg: editGroup })
    expect(sibling.getAttribute('opacity')).toBe('0.33')
    expect(sibling.getAttribute('style')).toBe('pointer-events: none')
    expect(dataStorage.get(sibling, 'orig_opac')).toBe('inherit')

    canvas.leaveContext()

    expect(currentGroup).toBe(null)
    expect(calls[1]).toStrictEqual({ event: 'contextset', arg: null })
    expect(sibling.getAttribute('opacity')).toBe('inherit')
    expect(sibling.getAttribute('style')).toBe('pointer-events: inherit')
    expect(dataStorage.has(sibling, 'orig_opac')).toBe(false)
  })

  it('still clears the selection on leaveContext when the group has no siblings to re-enable', () => {
    // A group that is the only element on its layer has nothing to dim on
    // entry (setContext only disables siblings *outside* the group), so
    // disabledElems stays empty. leaveContext() must not use that as a proxy
    // for "was a context active" -- the selection made inside the group
    // still needs clearing, or its selector box is left stuck on-screen
    // after clicking away.
    sibling.remove()

    canvas.setContext(editGroup)

    expect(currentGroup).toBe(editGroup)
    expect(calls[0]).toStrictEqual({ event: 'contextset', arg: editGroup })

    clearSelectionCalls.length = 0
    canvas.leaveContext()

    expect(currentGroup).toBe(null)
    expect(clearSelectionCalls).toStrictEqual([true])
    expect(calls[1]).toStrictEqual({ event: 'contextset', arg: null })
  })
})
