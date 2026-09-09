import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('provides LP64 underlying integer type macros without resolving headers', () => {
  const source =
    'typedef __SIZE_TYPE__ size_type; typedef __PTRDIFF_TYPE__ difference; typedef __UINT64_TYPE__ u64;'
  const ast = parse(source)
  expect(ast.errors).toEqual([])
  expect(ast.decls.map((d) => (d.type === 'Declaration' ? d.typeSpec.type : null))).toEqual([
    'UnsignedLongType',
    'LongType',
    'UnsignedLongType',
  ])
  expect(parse(source, { profile: 'none' }).errors.length).toBeGreaterThan(0)
})
