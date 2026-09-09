import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('isolates function and parameter attributes from other declarations', () => {
  const ast = parse('__attribute__((weak)) void f(void){int x;} void g(volatile int a);')
  expect(ast.errors).toEqual([])
  expect(ast.decls[0]).toMatchObject({
    body: { items: [{ declarators: [{ attrs: { isWeak: false } }] }] },
  })
  expect(ast.decls[1]).toMatchObject({ isVolatile: false })
})
it('does not leak numeric or string attributes from nested type names and locals', () => {
  const ast = parse(
    'void f(void){ typedef int V __attribute__((vector_size(16))); int x; int y=sizeof(int __attribute__((aligned(32)))); int z=_Generic(0,int __attribute__((vector_size(16))):1,default:2); int after; }',
  )
  expect(ast.errors).toEqual([])
  const d = ast.decls[0]
  if (d.type !== 'FunctionDefinition') throw Error('missing function')
  for (const item of d.body.items.slice(1))
    expect(item).toMatchObject({ vectorSize: null, alignment: null })
})
