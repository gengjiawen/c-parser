import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('restores enum values and tag alignments after nested scopes', () => {
  const ast = parse(
    'enum{A=3}; struct S{int x;}; void f(void){ enum{A=8}; struct S{char x;}; _Static_assert(A==8,"inner"); } _Static_assert(A==3,"outer"); _Static_assert(_Alignof(struct S)==4,"tag");',
  )
  expect(ast.errors).toEqual([])
})
