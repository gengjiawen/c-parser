import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('distinguishes unspecified parameter lists from void prototypes', () => {
  const ast = parse(
    'int f(); int g(void); int (*p)(); int (*q)(void); int a(){} int b(void){} int c(x) int x; {return x;}',
  )
  expect(ast.errors).toEqual([])
  for (const [i, expected] of [
    [0, false],
    [1, true],
    [2, false],
    [3, true],
  ] as const) {
    const decl = ast.decls[i]
    if (decl.type !== 'Declaration') throw new Error('declaration expected')
    expect(
      decl.declarators[0].derived.find(
        (d) => d.kind === 'Function' || d.kind === 'FunctionPointer',
      ),
    ).toMatchObject({ hasPrototype: expected })
  }
  expect(ast.decls.slice(4)).toMatchObject([
    { hasPrototype: false },
    { hasPrototype: true },
    { hasPrototype: false },
  ])
})
it('retains prototype status through abstract and parameter function pointers', () => {
  const ast = parse(
    'void f(int (*p)(), int (*q)(void)); int x=sizeof(int (*)()); int y=sizeof(int (*)(void));',
  )
  expect(ast.errors).toEqual([])
  expect(ast.decls[0]).toMatchObject({
    declarators: [
      { derived: [{ params: [{ fptrHasPrototype: false }, { fptrHasPrototype: true }] }] },
    ],
  })
  for (const [i, expected] of [
    [1, false],
    [2, true],
  ] as const) {
    expect(ast.decls[i]).toMatchObject({
      declarators: [
        {
          init: {
            expr: {
              argument: { typeSpec: { type: 'FunctionPointerType', hasPrototype: expected } },
            },
          },
        },
      ],
    })
  }
})
