import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('accepts GNU empty external declarations without placeholder nodes', () => {
  const ast = parse(';;; void f(void) {}; int x;;')
  expect(ast.errors).toEqual([])
  expect(ast.decls).toHaveLength(2)
  expect(ast.decls[1]).toMatchObject({ declarators: [{ name: 'x' }] })
  expect(parse(';;;').decls).toEqual([])
})
