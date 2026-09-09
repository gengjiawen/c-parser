import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('retains packed attributes before field types and after type specifiers', () => {
  for (const field of [
    '__attribute__((packed)) int x',
    'int __attribute__((packed)) x',
    'int x __attribute__((packed))',
  ]) {
    const ast = parse(`struct S{${field};}; _Static_assert(_Alignof(struct S)==1,"packed");`)
    expect(ast.errors).toEqual([])
    expect(ast.decls[0]).toMatchObject({ typeSpec: { fields: [{ isPacked: true }] } })
  }
})
it('preserves field vector and mode types without leaking them to other fields or objects', () => {
  const ast = parse(
    'struct S{int x __attribute__((vector_size(16))); int y; int z __attribute__((mode(HI)));} object;',
  )
  expect(ast.errors).toEqual([])
  expect(ast.decls[0]).toMatchObject({
    vectorSize: null,
    typeSpec: {
      fields: [
        { typeSpec: { type: 'VectorType', totalBytes: 16 } },
        { typeSpec: { type: 'IntType' } },
        { typeSpec: { type: 'ShortType' } },
      ],
    },
  })
})
