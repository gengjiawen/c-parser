import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('processes interleaved visibility and packing pragmas in source order', () => {
  for (const prefix of ['', 'void f(void){\n']) {
    const ast = parse(
      prefix +
        '#pragma GCC visibility push(hidden)\n#pragma pack(push,1)\nstruct S{char c;int i;};\n#pragma GCC visibility pop\n#pragma pack(pop)\n' +
        (prefix ? '}' : ''),
    )
    expect(ast.errors).toEqual([])
    const d = ast.decls[0]
    const decl = d.type === 'FunctionDefinition' ? d.body.items[0] : d
    expect(decl).toMatchObject({ typeSpec: { maxFieldAlign: 1 } })
  }
})
