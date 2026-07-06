import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadImage } from '../../packages/svgcanvas/core/load-image.js'

describe('load-image', () => {
  let originalImage

  beforeEach(() => {
    originalImage = globalThis.Image
  })

  afterEach(() => {
    globalThis.Image = originalImage
  })

  it('sets crossOrigin before assigning src (required for Safari/mobile CORS handling)', () => {
    const order = []
    globalThis.Image = class FakeImage {
      set crossOrigin (value) {
        order.push(['crossOrigin', value])
      }

      set src (value) {
        order.push(['src', value])
      }

      addEventListener () {}
    }

    loadImage('data:image/png;base64,AAA')
    expect(order).toEqual([
      ['crossOrigin', 'anonymous'],
      ['src', 'data:image/png;base64,AAA']
    ])
  })

  it('resolves with the loaded image on `load`', async () => {
    globalThis.Image = class FakeImage {
      set src (_value) {
        setTimeout(() => this.onload && this.onload(), 0)
      }

      addEventListener (type, cb) {
        if (type === 'load') this.onload = cb
        if (type === 'error') this.onerror = cb
      }
    }

    const img = await loadImage('data:image/png;base64,AAA')
    expect(img).toBeInstanceOf(globalThis.Image)
  })

  it('rejects with a friendly message on `error`', async () => {
    globalThis.Image = class FakeImage {
      set src (_value) {
        setTimeout(() => this.onerror && this.onerror(new Event('error')), 0)
      }

      addEventListener (type, cb) {
        if (type === 'load') this.onload = cb
        if (type === 'error') this.onerror = cb
      }
    }

    await expect(loadImage('bad-url')).rejects.toThrow('Could not load the image.')
  })
})
