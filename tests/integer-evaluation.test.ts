import { expect, it } from 'vitest'
import { parse } from '../src/index'
import { evalConstIntExpr } from '../src/parser/declarations'
it('folds casts, unsigned arithmetic and LP64 conversions exactly', () => {
  const cases: [string, number][] = [
    ['(int)5', 5],
    ['(unsigned)-1', 4294967295],
    ['(_Bool)2', 1],
    ['(1L<<40)', 1099511627776],
    ['1u<<31', 2147483648],
    ['-1u', 4294967295],
    ['-1L<0u', 1],
    ['(0?2u:-1)>0', 1],
    ['(1L<<32)==4294967296L', 1],
    ['2147483647+1L', 2147483648],
    ["'\\377'", -1],
    ['~0u == 0u-1', 1],
    ['0xffffffffffffffffULL / 0xffffffffffffffffULL', 1],
  ]
  for (const [expr, expected] of cases) {
    const ast = parse(`int x=${expr};`)
    expect(ast.errors, expr).toEqual([])
    const d = ast.decls[0]
    if (d.type !== 'Declaration' || d.declarators[0].init?.kind !== 'Expr')
      throw Error('missing initializer')
    expect(evalConstIntExpr(d.declarators[0].init.expr), expr).toBe(expected)
  }
})
it('propagates correct casts to enum successors, alignas and range bounds', () => {
  const ast = parse(
    'enum{A=(int)5,B}; _Static_assert(B==6,"B"); _Alignas((int)16) int x; int a[]={[(int)1 ... (int)3]=5};',
  )
  expect(ast.errors).toEqual([])
  expect(ast.decls[2]).toMatchObject({ alignment: 16 })
  expect(ast.decls[3]).toMatchObject({
    declarators: [
      {
        init: {
          items: [
            { designators: [{ index: { value: 1 } }] },
            { designators: [{ index: { value: 2 } }] },
            { designators: [{ index: { value: 3 } }] },
          ],
        },
      },
    ],
  })
})
it('evaluates long flat arithmetic trees without recursion', () => {
  const sum = Array(15000).fill('1').join('+')
  expect(parse(`enum{A=${sum}};_Static_assert(A==15000,"sum");`).errors).toEqual([])
})
