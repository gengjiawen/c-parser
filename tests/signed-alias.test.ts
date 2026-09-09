import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('recognizes both GNU signed aliases in declarations and type names', () => {
  for (const keyword of ['__signed', '__signed__']) {
    const ast = parse(
      `${keyword} int x; struct S{${keyword} char c;}; int y=sizeof(${keyword} short);`,
      { gnuExtensions: false },
    )
    expect(ast.errors).toEqual([])
    expect(ast.decls[0]).toMatchObject({ typeSpec: { type: 'IntType' } })
    expect(ast.decls[1]).toMatchObject({
      typeSpec: { fields: [{ name: 'c', typeSpec: { type: 'CharType' } }] },
    })
  }
})
