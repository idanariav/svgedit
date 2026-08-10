import { describe, it, expect, afterEach } from 'vitest'
import { ownsKeyEvent } from '../../src/editor/domScope.js'

// ownsKeyEvent() gates the document-level keydown/keyup handlers (EditorStartup.js)
// and the HotkeyManager dispatcher (Hotkeys.js) -- including the Cmd/Ctrl+V
// paste-fallback armer (see pasteFallbackArmer.js). It used to be inlined as a
// bare `target.nodeName === 'BODY'` check in EditorStartup, which broke once
// activate() started moving real DOM focus into `$container` on every
// pointerdown/focusin (needed for isActiveEditor()'s live-focus check) --
// after that, `target` is the container (or a descendant) on essentially
// every keystroke following the first click, not `<body>`.
describe('domScope ownsKeyEvent', () => {
  let container

  afterEach(() => {
    container?.remove()
  })

  const makeContainer = () => {
    const el = document.createElement('div')
    el.setAttribute('data-svgedit-root', '')
    el.setAttribute('tabindex', '-1')
    document.body.append(el)
    return el
  }

  it('owns the event when the target is document.body', () => {
    container = makeContainer()
    expect(ownsKeyEvent(container, document.body)).toBe(true)
  })

  it('owns the event when the target is this editor\'s own container', () => {
    // Regression: activate() focuses $container on click, so a keydown fired
    // right after clicking into the drawing targets the container, not body.
    container = makeContainer()
    expect(ownsKeyEvent(container, container)).toBe(true)
  })

  it('owns the event when the target is a descendant of this editor\'s container', () => {
    container = makeContainer()
    const child = document.createElement('div')
    container.append(child)
    expect(ownsKeyEvent(container, child)).toBe(true)
  })

  it('does not own the event when the target belongs to a different mounted editor', () => {
    container = makeContainer()
    const otherContainer = makeContainer()
    expect(ownsKeyEvent(container, otherContainer)).toBe(false)
    otherContainer.remove()
  })

  it('does not own the event while a text-entry field holds focus, even inside the container', () => {
    container = makeContainer()
    const input = document.createElement('input')
    container.append(input)
    input.focus()
    expect(ownsKeyEvent(container, input)).toBe(false)
  })
})
