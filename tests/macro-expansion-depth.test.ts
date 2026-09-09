import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('does not count completed empty expansions as nesting', () => {
  for (const [def, call] of [
    ['#define X', 'X'],
    ['#define X(a,b)', 'X(a,b)'],
  ]) {
    const ast = parse(`${def}\n${Array(2000).fill(call).join(' ')}\nint after;`)
    expect(ast.errors).toEqual([])
    expect(ast.decls).toHaveLength(1)
  }
})
it('still diagnoses actually nested macro replacement chains', () => {
  const defs = Array.from({ length: 600 }, (_, i) => `#define X${i} X${i + 1}`).join('\n')
  expect(parse(`${defs}\nX0`).errors.some((e) => e.message === 'macro expansion too deep')).toBe(
    true,
  )
})
