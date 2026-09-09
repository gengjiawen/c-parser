import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('diagnoses malformed aggregate members instead of silently discarding tokens', () => {
  for (const source of [
    'struct S{int a; ) int b;};',
    'struct S{foo b;};',
    'enum E{A B};',
    'enum E{A, */ B};',
  ])
    expect(parse(source).errors.length, source).toBeGreaterThan(0)
})
it('preserves following declarations after a missing enum closing brace', () => {
  const ast = parse('enum E{A,B; struct S{int x;}; int after;')
  expect(ast.errors.length).toBeGreaterThan(0)
  expect(ast.decls).toHaveLength(3)
  expect(ast.decls[2]).toMatchObject({ declarators: [{ name: 'after' }] })
})
