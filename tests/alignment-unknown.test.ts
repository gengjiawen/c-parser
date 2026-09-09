import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('does not invent alignment for unresolved typedefs, incomplete tags or wide enums', () => {
  for (const source of [
    'typedef char T; struct S{T c;}; _Static_assert(_Alignof(struct S)==1,"T");',
    'struct S; int a[_Alignof(struct S)];',
    'enum E{A=0x100000000}; _Static_assert(_Alignof(enum E)==8,"wide enum");',
    'enum __attribute__((packed)) E{A}; _Static_assert(_Alignof(enum E)==1,"packed enum");',
  ])
    expect(parse(source).errors, source).toEqual([])
})
it('still diagnoses provably false assertions for known aggregate alignment', () => {
  expect(
    parse('struct S{int x;}; _Static_assert(_Alignof(struct S)==1,"known");').errors.some((e) =>
      e.message.includes('static assertion failed'),
    ),
  ).toBe(true)
})
it('folds small vector type alignment from its complete byte size', () => {
  expect(
    parse('_Static_assert(_Alignof(int __attribute__((vector_size(16))))==16,"vector");').errors,
  ).toEqual([])
})
