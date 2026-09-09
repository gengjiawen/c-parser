import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('concatenates adjacent strings in GNU string attributes', () => {
  const ast = parse(
    'int x __attribute__((section("a" "b"))); extern int f(void) __attribute__((alias("ta" "rget"))); int y __attribute__((visibility("hid" "den")));',
  )
  expect(ast.errors).toEqual([])
  expect(ast.decls[0]).toMatchObject({ declarators: [{ attrs: { section: 'ab' } }] })
  expect(ast.decls[1]).toMatchObject({ declarators: [{ attrs: { aliasTarget: 'target' } }] })
  expect(ast.decls[2]).toMatchObject({ declarators: [{ attrs: { visibility: 'hidden' } }] })
})
