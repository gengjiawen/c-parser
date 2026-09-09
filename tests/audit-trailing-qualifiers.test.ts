import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('retains trailing const and volatile for every base type family', () => {
  for (const type of [
    'char',
    'float',
    'double',
    'void *',
    '_Bool',
    'struct S',
    'enum E',
    'T',
    'typeof(1)',
  ]) {
    for (const q of ['const', 'volatile']) {
      const base = type === 'void *' ? 'void' : type
      const star = type === 'void *' ? '*' : ''
      const ast = parse(`typedef int T; struct S{int x;}; enum E{A}; ${base} ${q} ${star}x;`)
      expect(ast.errors).toEqual([])
      expect(ast.decls.at(-1)).toMatchObject({ [q === 'const' ? 'isConst' : 'isVolatile']: true })
    }
  }
})
