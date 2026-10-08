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

  it('refuses to enter context on an element outside #svgcontent', () => {
    // Regression guard: a mis-resolved double-click (or any other caller)
    // handing setContext() something outside the drawing -- e.g. the svg
    // root itself, or any editor-chrome element -- must not enter a group
    // context. getParentsUntil(elem, '#svgcontent') only terminates when
    // '#svgcontent' is an actual ancestor of elem; for anything outside the
    // drawing it climbs out into the editor's own DOM and would dim
    // arbitrary UI (toolbars, dialogs, rulers) instead of drawing siblings.
    const chrome = document.createElement('div')
    chrome.id = 'tools_left'
    document.body.append(chrome)

    canvas.setContext(chrome)

    expect(currentGroup).toBe(null)
    expect(calls.length).toBe(0)
    expect(sibling.getAttribute('opacity')).toBe('inherit')
  })

  it('refuses to enter context on svgcontent itself', () => {
    canvas.setContext(svgContent)

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
  describe('suspendContextDimming', () => {
    it('undims until resumed, across async gaps, and resume is idempotent', () => {
      canvas.setContext(editGroup)
      const resume = canvas.suspendContextDimming()
      expect(sibling.getAttribute('opacity')).toBe('inherit')
      expect(currentGroup).toBe(editGroup)
      resume()
      expect(sibling.getAttribute('opacity')).toBe('0.33')
      sibling.setAttribute('opacity', '0.5')
      resume() // second call must not touch anything
      expect(sibling.getAttribute('opacity')).toBe('0.5')
    })

    it('does not re-dim siblings once the context was left meanwhile', () => {
      canvas.setContext(editGroup)
      const resume = canvas.suspendContextDimming()
      canvas.leaveContext()
      resume()
      expect(sibling.getAttribute('opacity')).toBe('inherit')
    })

    it('is a no-op outside a group context', () => {
      const resume = canvas.suspendContextDimming()
      expect(sibling.getAttribute('opacity')).toBe('inherit')
      resume()
      expect(sibling.getAttribute('opacity')).toBe('inherit')
    })
  })

  describe('withContextUndimmed', () => {
    it('un-dims siblings only for the duration of fn, staying inside the group', () => {
      canvas.setContext(editGroup)
      clearSelectionCalls.length = 0
      calls.length = 0
      let seenInside = 'unset'

      const result = canvas.withContextUndimmed(() => {
        seenInside = sibling.getAttribute('opacity')
        return 'out'
      })

      expect(result).toBe('out')
      expect(seenInside).toBe('inherit')
      // Back to dimmed, still inside the group, nothing cleared/announced.
      expect(sibling.getAttribute('opacity')).toBe('0.33')
      expect(sibling.getAttribute('style')).toBe('pointer-events: none')
      expect(currentGroup).toBe(editGroup)
      expect(clearSelectionCalls).toStrictEqual([])
      expect(calls).toStrictEqual([])
      // ...and a later real leaveContext() still restores the true original.
      canvas.leaveContext()
      expect(sibling.getAttribute('opacity')).toBe('inherit')
    })

    it('removes the synthetic opacity for siblings that had none, then re-dims', () => {
      sibling.removeAttribute('opacity')
      canvas.setContext(editGroup)
      let seenInside = 'unset'

      canvas.withContextUndimmed(() => { seenInside = sibling.getAttribute('opacity') })

      expect(seenInside).toBe(null)
      expect(sibling.getAttribute('opacity')).toBe('0.33')
    })

    it('re-dims even when fn throws', () => {
      canvas.setContext(editGroup)

      expect(() => canvas.withContextUndimmed(() => { throw new Error('boom') })).toThrow('boom')

      expect(sibling.getAttribute('opacity')).toBe('0.33')
      expect(currentGroup).toBe(editGroup)
    })

    it('just runs fn when no context is active', () => {
      expect(canvas.withContextUndimmed(() => 42)).toBe(42)
      expect(sibling.getAttribute('opacity')).toBe('inherit')
    })
  })
})
