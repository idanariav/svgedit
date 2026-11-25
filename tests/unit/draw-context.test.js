import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as draw from '../../packages/svgcanvas/core/draw.ts'
import dataStorage from '../../packages/svgcanvas/core/dataStorage.ts'
import { createInteractionStyle } from '../../packages/svgcanvas/core/interaction-style.ts'

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
      canvas.interactionStyle?.refresh() // as the canvas does
    }
  }

  beforeEach(() => {
    currentGroup = null
    document.body.innerHTML = ''

    const svgroot = document.createElementNS(NS_SVG, 'svg')
    svgContent = document.createElementNS(NS_SVG, 'svg')
    svgContent.id = 'svgcontent'
    editGroup = document.createElementNS(NS_SVG, 'g')
    editGroup.id = 'edit'
    sibling = document.createElementNS(NS_SVG, 'rect')
    sibling.id = 'sib'
    sibling.setAttribute('opacity', 'inherit')
    svgContent.append(editGroup, sibling)
    svgroot.append(svgContent)
    document.body.append(svgroot)

    canvas.interactionStyle = createInteractionStyle(svgroot, () => svgContent)
    Object.assign(canvas, draw.createDrawContext(canvas))
    calls.length = 0
    clearSelectionCalls = []
  })

  /** the sheet dims the sibling (the content's second child) */
  const siblingDimmed = () => /context-dim \*\/ [^{]*#svgcontent > :nth-child\(2\) \{ opacity: 0\.33 !important; pointer-events: none !important \}/.test(canvas.interactionStyle.text())

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

  it('dims what lies outside the group in the interaction sheet, writing nothing on the drawing (roadmap R11)', () => {
    canvas.setContext(editGroup)

    expect(currentGroup).toBe(editGroup)
    expect(calls[0]).toStrictEqual({ event: 'contextset', arg: editGroup })
    expect(siblingDimmed()).toBe(true)
    expect(canvas.getDisabledElems()).toStrictEqual([sibling])
    expect(sibling.getAttribute('opacity')).toBe('inherit')
    expect(sibling.hasAttribute('style')).toBe(false)
    expect(dataStorage.has(sibling, 'orig_opac')).toBe(false)

    canvas.leaveContext()

    expect(currentGroup).toBe(null)
    expect(calls[1]).toStrictEqual({ event: 'contextset', arg: null })
    expect(siblingDimmed()).toBe(false)
    expect(canvas.getDisabledElems()).toStrictEqual([])
  })

  it('leaves a dimmed sibling\'s own style alone', () => {
    sibling.setAttribute('style', 'stroke: red')
    canvas.setContext(editGroup)
    expect(sibling.getAttribute('style')).toBe('stroke: red')
    canvas.leaveContext()
    expect(sibling.getAttribute('style')).toBe('stroke: red')
  })

  it('dims a sibling the history re-rendered (a new node in the same place)', () => {
    canvas.setContext(editGroup)
    const fresh = sibling.cloneNode(true)
    sibling.replaceWith(fresh)
    canvas.interactionStyle.refresh() // the observer does this in a browser
    expect(canvas.getDisabledElems()).toStrictEqual([fresh])
    expect(siblingDimmed()).toBe(true)
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
      expect(siblingDimmed()).toBe(false)
      expect(currentGroup).toBe(editGroup)
      resume()
      expect(siblingDimmed()).toBe(true)
      const other = canvas.suspendContextDimming()
      resume() // a second call must not resume the other suspension
      expect(siblingDimmed()).toBe(false)
      other()
      expect(siblingDimmed()).toBe(true)
    })

    it('does not re-dim siblings once the context was left meanwhile', () => {
      canvas.setContext(editGroup)
      const resume = canvas.suspendContextDimming()
      canvas.leaveContext()
      resume()
      expect(siblingDimmed()).toBe(false)
    })

    it('is a no-op outside a group context', () => {
      const resume = canvas.suspendContextDimming()
      resume()
      expect(siblingDimmed()).toBe(false)
      expect(sibling.getAttribute('opacity')).toBe('inherit')
    })
  })
})
