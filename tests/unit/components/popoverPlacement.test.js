import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { placeBeside } from '../../../src/editor/components/popoverPlacement.ts'

/** An element whose box is `rect`, and whose `top` style moves it (from `origin`: a containing block's offset). */
const boxed = (rect, origin = 0) => {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => {
    const top = el.style.top ? parseFloat(el.style.top) + origin : rect.top
    return { top, bottom: top + rect.height, height: rect.height, left: 0, right: 0, width: 0 }
  }
  return el
}

describe('placeBeside', () => {
  let innerHeight
  beforeEach(() => { innerHeight = window.innerHeight; window.innerHeight = 800 })
  afterEach(() => { window.innerHeight = innerHeight })

  it('opens level with its button when it fits', () => {
    const menu = boxed({ top: 0, height: 200 })
    placeBeside(menu, boxed({ top: 100, height: 40 }), null)
    expect(menu.style.top).toBe('100px')
  })

  it('moves up to stay inside the editor box, which may be shorter than the window', () => {
    const menu = boxed({ top: 0, height: 200 })
    placeBeside(menu, boxed({ top: 400, height: 40 }), boxed({ top: 50, height: 500 }))
    expect(menu.style.top).toBe(`${550 - 8 - 200}px`)
  })

  it('caps its height to the editor box when asked', () => {
    const menu = boxed({ top: 0, height: 200 })
    placeBeside(menu, boxed({ top: 100, height: 40 }), boxed({ top: 50, height: 500 }), true)
    expect(menu.style.maxHeight).toBe(`${500 - 16}px`)
  })

  it('takes out the offset of a containing block that is not the window', () => {
    // the host pane starts 120px down and makes `position: fixed` relative to itself
    const menu = boxed({ top: 0, height: 100 }, 120)
    placeBeside(menu, boxed({ top: 300, height: 40 }), null)
    expect(parseFloat(menu.style.top) + 120).toBe(300)
  })
})
