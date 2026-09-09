import { expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
it('provides declarations to both ESM and CommonJS Node consumers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'c11-consumer-'))
  try {
    mkdirSync(join(dir, 'node_modules'))
    symlinkSync(resolve('.'), join(dir, 'node_modules/c11-parser'), 'dir')
    const source =
      'import { parse, type TokenKind } from "c11-parser"; import adapter from "c11-parser/adapter"; const ast=parse("int x;"); adapter.parse({parse}, "int x;"); let kind: TokenKind; void ast;'
    for (const ext of ['mts', 'cts']) writeFileSync(join(dir, 'main.' + ext), source)
    const result = spawnSync(
      resolve('node_modules/.bin/tsc'),
      [
        '--noEmit',
        '--strict',
        '--target',
        'es2020',
        '--module',
        'node16',
        '--moduleResolution',
        'node16',
        'main.mts',
        'main.cts',
      ],
      { cwd: dir, encoding: 'utf8' },
    )
    expect(result.stdout + result.stderr).toBe('')
    expect(result.status).toBe(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
