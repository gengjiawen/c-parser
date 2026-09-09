import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('folds long array type chains without recursive type traversal', () => {
  const dimensions = '[1]'.repeat(16000)
  for (const operator of ['sizeof', '_Alignof', '__alignof__']) {
    const ast = parse(`_Static_assert(${operator}(int${dimensions})==4,"deep arrays"); int after;`)
    expect(ast.errors).toEqual([])
    expect(ast.decls.at(-1)).toMatchObject({ declarators: [{ name: 'after' }] })
  }
})
