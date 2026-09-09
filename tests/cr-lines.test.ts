import { expect, it } from 'vitest'
import { parse } from '../src/index'
it.each(['\r', '\n', '\r\n'])(
  'uses %j consistently for comments, locations, and __LINE__',
  (newline) => {
    const ast = parse(`int a;// comment${newline}int b;${newline}int line=__LINE__;`, { loc: true })
    expect(ast.errors).toEqual([])
    expect(ast.decls).toHaveLength(3)
    expect(ast.decls.map((d) => d.loc?.start.line)).toEqual([1, 2, 3])
    const d = ast.decls[2]
    if (d.type !== 'Declaration') throw new Error('missing declaration')
    expect(d.declarators[0].init).toMatchObject({ kind: 'Expr', expr: { value: 3 } })
  },
)
