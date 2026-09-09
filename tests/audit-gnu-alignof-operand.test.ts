import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('accepts GNU alignof on unparenthesized unary operands', () => {
  for (const op of ['__alignof__', '_Alignof']) {
    const ast = parse(`int f(void){return ${op} -x + 1;}`)
    expect(ast.errors).toEqual([])
    expect(ast.decls[0]).toMatchObject({
      body: {
        items: [
          {
            expr: {
              type: 'BinaryExpression',
              operator: 'Add',
              left: { expr: { type: 'UnaryExpression', operator: 'Neg' } },
            },
          },
        ],
      },
    })
  }
})
