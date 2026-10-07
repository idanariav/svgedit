import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installMockSvgEditor, uninstallMockSvgEditor } from '../components/testUtils.js'
import '../../../src/editor/dialogs/exportDialog.js'

vi.mock('../../../src/editor/locale.js', () => ({ t: (key) => key }))

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
}

const mount = () => {
  const el = document.createElement('se-export-dialog')
  document.body.append(el)
  return el
}

describe('se-export-dialog', () => {
  beforeEach(() => installMockSvgEditor())
  afterEach(() => { uninstallMockSvgEditor(); document.body.innerHTML = '' })

  it('shows Quality only for JPEG/WEBP', () => {
    const el = mount()
    el.$exportOption.value = 'PNG'
    el._refresh()
    expect(el.$qualityRow.hidden).toBe(true)
    el.$exportOption.value = 'JPEG'
    el._refresh()
    expect(el.$qualityRow.hidden).toBe(false)
  })

  it('reports the scale in the change event and previews the output size', () => {
    const el = mount()
    el._regionSize = () => ({ w: 100, h: 50 })
    el.$scale.value = '2'
    el._refresh()
    expect(el.$summary.textContent).toBe('200 × 100 px')
    let detail
    el.addEventListener('change', (e) => { detail = e.detail })
    el.$okBtn.click()
    expect(detail.scale).toBe(2)
  })
})
