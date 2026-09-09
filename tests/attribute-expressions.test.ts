import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('evaluates complete alignment and vector-size arguments', () => {
  for (const [argument, alignment] of [
    ['1<<4', 16],
    ['2*8', 16],
    ['sizeof(long)', 8],
    ['N', 32],
  ] as const) {
    const ast = parse(`enum{N=32}; int x __attribute__((aligned(${argument})));`)
    expect(ast.errors).toEqual([])
    expect(ast.decls[1]).toMatchObject({ alignment })
  }
  expect(parse('int x __attribute__((aligned));').decls[0]).toMatchObject({ alignment: 16 })
  expect(parse('int __attribute__((vector_size(4*sizeof(int)))) x;').decls[0]).toMatchObject({
    vectorSize: 16,
  })
})
