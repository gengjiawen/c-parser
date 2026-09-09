import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('reads pack operands as tokens including comments, bases and suffixes', () => {
  for (const arg of ['/*comment*/1', '0x1', '01', '1u', '1UL', '1 /*comment*/']) {
    const ast = parse(`#pragma pack(${arg})\nstruct S{char c;int i;};`)
    expect(ast.errors, arg).toEqual([])
    expect(ast.decls[0]).toMatchObject({ typeSpec: { maxFieldAlign: 1 } })
  }
})
it('retains push/pop/reset semantics and accepts GCC trailing pack tokens', () => {
  const ast = parse(
    '#pragma pack(push, /* c */ 0x2u)\nstruct S{int i;};\n#pragma pack(pop)\nstruct T{int i;};\n#pragma pack(1) extra\nstruct U{int i;};',
  )
  expect(ast.errors).toEqual([])
  expect(
    ast.decls.map((d) =>
      d.type === 'Declaration' && 'maxFieldAlign' in d.typeSpec ? d.typeSpec.maxFieldAlign : null,
    ),
  ).toEqual([2, null, 1])
})
