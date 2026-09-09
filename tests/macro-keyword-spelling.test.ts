import { expect, it } from 'vitest'
import { parse } from '../src/index'
it('preserves keyword aliases through stringification and token pasting', () => {
  const ast = parse(
    '#define S(x) #x\n#define C(a,b) a##b\nchar *s=S(__inline); C(__inline,__) int f(void);',
  )
  expect(ast.errors).toEqual([])
  const d = ast.decls[0]
  if (d.type !== 'Declaration' || d.declarators[0].init?.kind !== 'Expr')
    throw new Error('missing string')
  expect(d.declarators[0].init.expr).toMatchObject({ type: 'StringLiteral', value: '__inline' })
})
it('keeps macro names distinct from their keyword aliases', () => {
  const ast = parse(
    '#define __thread\n_Thread_local int x;\n#define restrict\n#if defined(__restrict)\n#error aliases are different macro names\n#endif',
  )
  expect(ast.errors).toEqual([])
  expect(ast.decls[0]).toMatchObject({ isThreadLocal: true })
})
