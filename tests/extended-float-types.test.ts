import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('preserves extended floating types in declarations, fields, parameters and casts', () => {
  const names = [
    '_Float16',
    '_Float32',
    '_Float64',
    '_Float128',
    '_Float32x',
    '_Float64x',
    '__bf16',
    '_Decimal32',
    '_Decimal64',
    '_Decimal128',
  ]
  for (const name of names) {
    const ast = parse(
      `${name} x; struct S{${name} y;}; ${name} f(${name} a); void g(void){x=(${name})0;}`,
    )
    expect(ast.errors, name).toEqual([])
    expect(ast.decls[0]).toMatchObject({ typeSpec: { type: 'ExtendedFloatType' } })
    expect(ast.decls[1]).toMatchObject({
      typeSpec: { fields: [{ name: 'y', typeSpec: { type: 'ExtendedFloatType' } }] },
    })
  }
})
