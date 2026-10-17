import { describe, it, expect } from 'vitest'
import * as history from '../../packages/svgcanvas/core/history.js'

// The debug log reports a command by `command.type()`, which is `constructor.name`, which a minifier renames,
// so the class names are pinned in history.js.
describe('Command#type()', () => {
  it.each([
    'MoveElementCommand', 'InsertElementCommand', 'RemoveElementCommand', 'ChangeElementCommand',
    'BatchCommand'
  ])('%s reports its own name', (name) => {
    expect(history[name].name).toBe(name)
    expect(Object.getOwnPropertyDescriptor(history[name], 'name').value).toBe(name)
  })

  it('an instance reports the class name', () => {
    expect(new history.BatchCommand('x').type()).toBe('BatchCommand')
  })
})
