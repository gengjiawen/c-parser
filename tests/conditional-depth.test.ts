import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('diagnoses deep preprocessor expressions without throwing or losing following code', () => {
  for (const expr of [
    '('.repeat(4000) + '1' + ')'.repeat(4000),
    '!'.repeat(16000) + '1',
    '1?'.repeat(2000) + '1' + ':0'.repeat(2000),
  ]) {
    const ast = parse(`#if ${expr}\nint skipped;\n#endif\nint after;`)
    expect(ast.errors.some((e) => e.message === 'nesting too deep in #if expression')).toBe(true)
    expect(ast.decls).toHaveLength(1)
  }
})
it('accepts ordinary deeply parenthesized conditions', () => {
  expect(parse(`#if ${'('.repeat(100)}1${')'.repeat(100)}\nint x;\n#endif`).errors).toEqual([])
})
