import { describe, it, expect } from 'vitest'
import * as history from '../../packages/svgcanvas/core/history.js'

// undo.js decides what to refresh after an undo/redo from `command.type()`. That is `constructor.name`,
// which a minifier renames, so the class names are pinned in history.js; the built editor depends on it.
describe('Command#type()', () => {
  it.each([
    'MoveElementCommand', 'InsertElementCommand', 'RemoveElementCommand', 'ChangeElementCommand',
    'BatchCommand', 'ChildListCommand', 'CharacterDataCommand'
  ])('%s reports its own name', (name) => {
    expect(history[name].name).toBe(name)
    expect(Object.getOwnPropertyDescriptor(history[name], 'name').value).toBe(name)
  })

  it('an instance reports the class name', () => {
    expect(new history.BatchCommand('x').type()).toBe('BatchCommand')
  })
})
