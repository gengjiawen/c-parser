import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('accepts zero in GNU markers while retaining standard line validation', () => {
  const ast = parse('# 0 "file.c"\n# 0 "<built-in>"\n# 1 "file.c"\nint line=__LINE__;')
  expect(ast.errors).toEqual([])
  expect(ast.decls[0]).toMatchObject({ declarators: [{ init: { expr: { value: 1 } } }] })
  expect(parse('#line 0\nint x;').errors.some((e) => e.severity === 'error')).toBe(true)
})
