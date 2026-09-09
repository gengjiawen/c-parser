import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('collects storage classes and attributes throughout a type specifier sequence', () => {
  for (const [source, type] of [
    ['char typedef signed T;', 'CharType'],
    ['double typedef long T;', 'LongDoubleType'],
    ['double __attribute__((unused)) long x;', 'LongDoubleType'],
    ['float typedef _Complex T;', 'ComplexFloatType'],
    ['__int128 signed x;', 'Int128Type'],
    ['__int128 unsigned x;', 'UnsignedInt128Type'],
    ['unsigned __int128 _Alignas(16) x;', 'UnsignedInt128Type'],
  ]) {
    const ast = parse(source)
    expect(ast.errors, source).toEqual([])
    expect(ast.decls[0]).toMatchObject({ typeSpec: { type } })
  }
})
