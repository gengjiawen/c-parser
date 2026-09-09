import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('does not leak block typedefs into later functions or sibling blocks', () => {
  const ast = parse('int f(void){typedef int T;return (T)0;} int T=3; int g(void){return (T)-1;}')
  expect(ast.errors).toEqual([])
  expect(ast.decls[2]).toMatchObject({
    body: { items: [{ expr: { type: 'BinaryExpression', operator: 'Sub' } }] },
  })
  const nested = parse(
    'typedef int T; void f(void){{typedef char U; U x;} {int U; U=2;} T x;} T y;',
  )
  expect(nested.errors).toEqual([])
})
