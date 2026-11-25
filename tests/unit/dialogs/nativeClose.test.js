import { describe, it, expect, vi } from 'vitest'
import { onNativeClose } from '../../../src/editor/dialogs/nativeClose.ts'

describe('onNativeClose', () => {
  const dialog = () => document.createElement('dialog')

  it('runs the handler for a close that leaves the dialog closed (Escape, close())', () => {
    const d = dialog()
    const handler = vi.fn()
    onNativeClose(d, handler)
    d.dispatchEvent(new Event('close'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('drops a stale close that arrives after the dialog was reopened', () => {
    const d = dialog()
    const handler = vi.fn()
    onNativeClose(d, handler)
    d.setAttribute('open', '') // reopened before the queued close task ran
    d.dispatchEvent(new Event('close'))
    expect(handler).not.toHaveBeenCalled()
  })
})
