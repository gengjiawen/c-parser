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

it('folds explicit type-name alignment and keeps it out of enclosing declarations', () => {
  for (const op of ['_Alignof', '__alignof__']) {
    for (const n of [1, 2, 4, 64]) {
      expect(
        parse(`_Static_assert(${op}(int __attribute__((aligned(${n})))) == ${n}, "alignment");`)
          .errors,
      ).toEqual([])
      expect(
        parse(`_Static_assert(${op}(int __attribute__((aligned(${n})))) != ${n}, "alignment");`)
          .errors,
      ).toHaveLength(1)
    }
    const ast = parse(
      `void f(void){_Alignas(16) int x=${op}(int __attribute__((aligned(32)))); int y;}`,
    )
    expect(ast.errors).toEqual([])
    expect(ast.decls[0]).toMatchObject({
      body: { items: [{ alignment: 16 }, { alignment: null }] },
    })
    expect(parse(`_Alignas(16) int x; _Static_assert(${op}(int)==4,"natural");`).errors).toEqual([])
  }
})
