import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor, mountElement } from './testUtils.js'
import '../../../src/editor/components/seSpinInput.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

describe('se-spin-input', () => {
  beforeEach(() => installMockSvgEditor())
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('renders a shadow root with the input and spin buttons', () => {
    const el = mountElement('se-spin-input')
    expect(el.shadowRoot).toBeTruthy()
    expect(el.$input.tagName).toBe('INPUT')
    expect(el.$upBtn.tagName).toBe('BUTTON')
    expect(el.$downBtn.tagName).toBe('BUTTON')
  })

  it('defaults min=1, step=1 and disables the down button at/below the default min', () => {
    const el = mountElement('se-spin-input')
    el.value = '2'
    expect(el.$downBtn.disabled).toBe(false)
    el.value = '1'
    expect(el.$downBtn.disabled).toBe(true)
    el.value = '0'
    expect(el.$downBtn.disabled).toBe(true)
  })

  it('reflects the value attribute onto the input', () => {
    const el = mountElement('se-spin-input')
    el.setAttribute('value', '5')
    expect(el.$input.value).toBe('5')
    expect(el.value).toBe('5')
  })

  it('sets the value property directly on the input', () => {
    const el = mountElement('se-spin-input')
    el.value = '7'
    expect(el.$input.value).toBe('7')
  })

  it('shows/hides the top label based on the label attribute and hides the fallback icon', () => {
    const el = mountElement('se-spin-input')
    el.setAttribute('label', 'Width')
    expect(el.$label.textContent).toBe('Width')
    expect(el.$label.style.display).toBe('block')
    expect(el.$iconWrap.style.display).toBe('none')

    el.setAttribute('label', '')
    expect(el.$label.style.display).toBe('none')
  })

  it('reflects the title attribute (with translated shortcut) onto the field div', () => {
    const el = mountElement('se-spin-input', { shortcut: 'ctrl+w' })
    el.setAttribute('title', 'width_title')
    expect(el.$div.getAttribute('title')).toBe('width_title [Ctrl+W]')
  })

  it('forwards the size attribute to the inner input', () => {
    const el = mountElement('se-spin-input')
    el.setAttribute('size', '4')
    expect(el.$input.size).toBe(4)
    expect(el.$input.style.width).toBe('unset')
  })

  it('reads/writes title, label, src, size properties via attributes', () => {
    const el = mountElement('se-spin-input')
    el.title = 't'
    expect(el.getAttribute('title')).toBe('t')
    expect(el.title).toBe('t')

    el.label = 'l'
    expect(el.getAttribute('label')).toBe('l')
    expect(el.label).toBe('l')

    el.src = 'icon.svg'
    expect(el.getAttribute('src')).toBe('icon.svg')
    expect(el.src).toBe('icon.svg')

    el.size = '3'
    expect(el.getAttribute('size')).toBe('3')
    expect(el.size).toBe('3')
  })

  it('clamps stepping at min/max', () => {
    const el = mountElement('se-spin-input')
    el.setAttribute('min', '0')
    el.setAttribute('max', '10')
    el.setAttribute('step', '1')
    el.value = '10'

    el.$upBtn.dispatchEvent(new Event('mousedown'))
    expect(el.value).toBe('10') // clamped at max
    // sitting exactly at the bound disables further stepping in that direction
    expect(el.$upBtn.disabled).toBe(true)

    el.value = '0'
    el.$downBtn.dispatchEvent(new Event('mousedown'))
    expect(el.value).toBe('0') // clamped at min
    expect(el.$downBtn.disabled).toBe(true)
  })

  it('disables the up/down button once the current value reaches or exceeds max/min', () => {
    const el = mountElement('se-spin-input')
    el.setAttribute('min', '0')
    el.setAttribute('max', '10')
    el.value = '10'
    expect(el.$upBtn.disabled).toBe(true)
    expect(el.$downBtn.disabled).toBe(false)

    el.value = '11'
    expect(el.$upBtn.disabled).toBe(true)
    expect(el.$downBtn.disabled).toBe(false)

    el.value = '0'
    expect(el.$downBtn.disabled).toBe(true)

    el.value = '-1'
    expect(el.$downBtn.disabled).toBe(true)
  })

  it('steps up/down by the step value and dispatches change', () => {
    const el = mountElement('se-spin-input')
    el.setAttribute('min', '')
    el.setAttribute('max', '')
    el.setAttribute('step', '2')
    el.value = '4'
    const handler = vi.fn()
    el.addEventListener('change', handler)

    el.$upBtn.dispatchEvent(new Event('mousedown'))
    expect(el.value).toBe('6')
    expect(handler).toHaveBeenCalledTimes(1)

    el.$downBtn.dispatchEvent(new Event('mousedown'))
    expect(el.value).toBe('4')
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('formats stepped values at the step decimal precision', () => {
    const el = mountElement('se-spin-input')
    el.setAttribute('min', '')
    el.setAttribute('max', '')
    el.setAttribute('step', '0.5')
    el.value = '1'

    el.$upBtn.dispatchEvent(new Event('mousedown'))
    expect(el.value).toBe('1.5')
  })

  it('steps down past the first decimal place with a two-decimal step (regression: was stuck at 0.8)', () => {
    const el = mountElement('se-spin-input')
    el.setAttribute('min', '0')
    el.setAttribute('max', '1')
    el.setAttribute('step', '0.05')
    el.value = '1'

    for (let i = 0; i < 5; i++) {
      el.$downBtn.dispatchEvent(new Event('mousedown'))
    }
    expect(el.value).toBe('0.75')
  })

  describe('press-and-hold auto-repeat', () => {
    const setup = () => {
      vi.useFakeTimers()
      const el = mountElement('se-spin-input')
      el.setAttribute('min', '0')
      el.setAttribute('max', '10')
      el.setAttribute('step', '1')
      el.value = '5'
      return el
    }

    it('steps once immediately, then repeats while held, and stops on mouseup', () => {
      const el = setup()
      const handler = vi.fn()
      el.addEventListener('change', handler)

      el.$upBtn.dispatchEvent(new Event('mousedown'))
      expect(el.value).toBe('6') // immediate step
      vi.advanceTimersByTime(300)
      expect(el.value).toBe('6') // still inside the initial hold delay

      vi.advanceTimersByTime(100 + 60 * 2) // delay elapsed + two repeat ticks
      expect(el.value).toBe('9')
      expect(handler).toHaveBeenCalledTimes(4)

      window.dispatchEvent(new Event('mouseup'))
      vi.advanceTimersByTime(1000)
      expect(el.value).toBe('9') // no further stepping after release
    })

    it('repeats downward and stops by itself at the min limit', () => {
      const el = setup()
      el.$downBtn.dispatchEvent(new Event('mousedown'))
      vi.advanceTimersByTime(5000)
      expect(el.value).toBe('0')
      expect(el.$downBtn.disabled).toBe(true)
      expect(vi.getTimerCount()).toBe(0) // repeat loop ended on its own
    })

    it('stops repeating when removed from the DOM', () => {
      const el = setup()
      el.$upBtn.dispatchEvent(new Event('mousedown'))
      el.remove()
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('steps via ArrowUp/ArrowDown keydown on the input', () => {
    const el = mountElement('se-spin-input')
    el.setAttribute('min', '')
    el.setAttribute('max', '')
    el.setAttribute('step', '1')
    el.value = '5'

    el.$input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(el.value).toBe('6')

    el.$input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(el.value).toBe('5')
  })

  it('updates value and dispatches change on keyup with a numeric value', () => {
    const el = mountElement('se-spin-input')
    const handler = vi.fn()
    el.addEventListener('change', handler)
    el.$input.value = '42'

    el.$input.dispatchEvent(new Event('keyup'))

    expect(el.value).toBe('42')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('updates value and dispatches change on the input change event', () => {
    const el = mountElement('se-spin-input')
    const handler = vi.fn()
    el.addEventListener('change', handler)
    el.$input.value = '99'

    el.$input.dispatchEvent(new Event('change'))

    expect(el.value).toBe('99')
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('se-spin-input scrubby labels and wheel stepping', () => {
  let mock
  let tx
  let changes

  // jsdom has no PointerEvent: a MouseEvent with the pointer fields added is enough for the handlers.
  const pointer = (type, clientX, extra = {}) => {
    const e = new MouseEvent(type, { clientX, button: 0, bubbles: true, cancelable: true, ...extra })
    Object.assign(e, { pointerId: 1, pointerType: extra.pointerType ?? 'mouse' })
    return e
  }
  const field = (attrs = {}) => {
    const el = mountElement('se-spin-input', { label: 'Width', value: '5', min: '0', max: '100', step: '1', ...attrs })
    el.addEventListener('change', () => changes.push(el.value))
    return el
  }
  const drag = (el, from, to, extra = {}) => {
    el.$label.dispatchEvent(pointer('pointerdown', from))
    el.$label.dispatchEvent(pointer('pointermove', to, extra))
  }
  const release = (el, x) => el.$label.dispatchEvent(pointer('pointerup', x))

  beforeEach(() => {
    tx = { commit: vi.fn(), cancel: vi.fn() }
    mock = installMockSvgEditor({
      configObj: { curConfig: { imgPath: 'images' }, pref: vi.fn(() => true) },
      svgCanvas: { beginTransaction: vi.fn(() => tx) }
    })
    mock.topPanel.updateContextPanel = vi.fn()
    changes = []
  })
  afterEach(() => {
    uninstallMockSvgEditor()
    document.body.innerHTML = ''
  })

  it('a drag of +20 px with step 1 adds 10, as one transaction and one change event per value', () => {
    const el = field()
    drag(el, 100, 120)
    expect(el.value).toBe('15')
    expect(mock.svgCanvas.beginTransaction).toHaveBeenCalledTimes(1)
    release(el, 120)
    expect(tx.commit).toHaveBeenCalledTimes(1)
    expect(tx.cancel).not.toHaveBeenCalled()
    expect(changes).toEqual(['15'])
  })

  it('works left as well as right, and honours the step size and its precision', () => {
    const el = field({ step: '0.5', value: '10' })
    drag(el, 100, 80)
    expect(el.value).toBe('5.0')
    release(el, 80)
  })

  it('Shift multiplies the step by 10 and Ctrl or Cmd by 0.1', () => {
    const shift = field({ value: '0', max: '1000' })
    drag(shift, 0, 20, { shiftKey: true })
    expect(shift.value).toBe('100')
    release(shift, 20)
    const fine = field({ value: '5' })
    drag(fine, 0, 20, { ctrlKey: true })
    expect(fine.value).toBe('6.0')
    release(fine, 20)
    const cmd = field({ value: '5' })
    drag(cmd, 0, 20, { metaKey: true })
    expect(cmd.value).toBe('6.0')
    release(cmd, 20)
  })

  it('stays within min and max', () => {
    const el = field({ value: '95', max: '100' })
    drag(el, 0, 200)
    expect(el.value).toBe('100')
    el.$label.dispatchEvent(pointer('pointermove', -400))
    expect(el.value).toBe('0')
    release(el, -400)
  })

  it('Escape during the drag restores the value, rolls the drawing back and refreshes the panels', () => {
    const el = field()
    drag(el, 100, 130)
    expect(el.value).toBe('20')
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    window.dispatchEvent(esc)
    expect(esc.defaultPrevented).toBe(true)
    expect(el.value).toBe('5')
    expect(tx.cancel).toHaveBeenCalledTimes(1)
    expect(tx.commit).not.toHaveBeenCalled()
    expect(mock.topPanel.updateContextPanel).toHaveBeenCalled()
    // the drag is over: further moves change nothing
    el.$label.dispatchEvent(pointer('pointermove', 300))
    expect(el.value).toBe('5')
  })

  it('a press that does not move past the threshold is a click: it focuses the field and changes nothing', () => {
    const el = field()
    drag(el, 100, 101)
    release(el, 101)
    el.$label.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el.value).toBe('5')
    expect(mock.svgCanvas.beginTransaction).not.toHaveBeenCalled()
    expect(el.shadowRoot.activeElement).toBe(el.$input)
  })

  it('the click that ends a drag does not focus the field', () => {
    const el = field()
    drag(el, 100, 120)
    release(el, 120)
    el.$label.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(el.shadowRoot.activeElement).toBeNull()
  })

  it('ignores touch pointers and the text box itself', () => {
    const el = field()
    el.$label.dispatchEvent(pointer('pointerdown', 0, { pointerType: 'touch' }))
    el.$label.dispatchEvent(pointer('pointermove', 50))
    expect(el.value).toBe('5')
    el.$input.dispatchEvent(pointer('pointerdown', 0))
    el.$input.dispatchEvent(pointer('pointermove', 50))
    expect(el.value).toBe('5')
    expect(mock.svgCanvas.beginTransaction).not.toHaveBeenCalled()
  })

  it('the preference turns scrubbing off and takes the resize cursor away', () => {
    const el = field()
    el.$label.dispatchEvent(new MouseEvent('pointerenter'))
    expect(el.$label.classList.contains('scrubbable')).toBe(true)
    mock.configObj.pref.mockReturnValue('false')
    el.$label.dispatchEvent(new MouseEvent('pointerenter'))
    expect(el.$label.classList.contains('scrubbable')).toBe(false)
    drag(el, 0, 40)
    expect(el.value).toBe('5')
    expect(mock.svgCanvas.beginTransaction).not.toHaveBeenCalled()
  })

  it('works without a canvas (a field in a dialog): the value still changes', () => {
    mock.svgCanvas = {}
    const el = field()
    drag(el, 0, 10)
    expect(el.value).toBe('10')
    expect(() => release(el, 10)).not.toThrow()
  })

  it('the wheel steps a focused field, with the same modifiers, and leaves an unfocused one to the page', () => {
    const el = field({ value: '5', max: '1000' })
    const wheel = (deltaY, extra = {}) => {
      const e = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true, ...extra })
      el.$input.dispatchEvent(e)
      return e
    }
    const unfocused = wheel(-100)
    expect(unfocused.defaultPrevented).toBe(false)
    expect(el.value).toBe('5')
    el.$input.focus()
    const up = wheel(-100)
    expect(up.defaultPrevented).toBe(true)
    expect(el.value).toBe('6')
    wheel(100)
    wheel(100)
    expect(el.value).toBe('4')
    wheel(-100, { shiftKey: true })
    expect(el.value).toBe('14')
    wheel(-100, { ctrlKey: true })
    expect(el.value).toBe('14.1')
    expect(changes.at(-1)).toBe('14.1')
  })
})
