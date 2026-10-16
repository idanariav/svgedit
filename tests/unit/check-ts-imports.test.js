import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { findStaleImports } from '../../scripts/check-ts-imports.mjs'

describe('check-ts-imports', () => {
  it('finds no import of a .js file that exists only as .ts in the repo', () => {
    expect(findStaleImports()).toEqual([])
  })

  it('a module converted to .ts is imported with its .ts extension and still runs in plain Node', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-imports-'))
    fs.writeFileSync(path.join(dir, 'leaf.ts'), 'export const twice = (n: number): number => n * 2\n')
    fs.writeFileSync(path.join(dir, 'ok.mjs'), "import { twice } from './leaf.ts'\nconsole.log(twice(21))\n")
    fs.writeFileSync(path.join(dir, 'bad.mjs'), "import { twice } from './leaf.js'\nconsole.log(twice(21))\n")
    const run = (f) => execFileSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    expect(run('ok.mjs')).toBe('42')
    expect(() => run('bad.mjs')).toThrow(/ERR_MODULE_NOT_FOUND|Cannot find module/)
  })
})
