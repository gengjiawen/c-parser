import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('accepts parameter attributes in prototypes, pointers, and definitions', () => {
  for (const source of [
    'void f(int x __attribute__((unused)));',
    'int f(int x __attribute__((unused)),int y){return y;}',
    'void (*f)(int x __attribute__((unused)));',
  ]) {
    const ast = parse(source)
    expect(ast.errors).toEqual([])
    expect(ast.decls).toHaveLength(1)
  }
})
