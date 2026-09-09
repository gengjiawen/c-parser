import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('consumes enumerator attributes without adding phantom enumerators', () => {
  const ast = parse('enum E{A __attribute__((deprecated))=5,B}; _Static_assert(B==6,"B");')
  expect(ast.errors).toEqual([])
  expect(ast.decls[0]).toMatchObject({ typeSpec: { variants: [{ name: 'A' }, { name: 'B' }] } })
})
